package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/time/rate"

	"telyx-backend/auth"
	"telyx-backend/config"
	"telyx-backend/handlers"
	"telyx-backend/logger"
	"telyx-backend/middleware"
	"telyx-backend/ratelimit"
	"telyx-backend/telemetry"
)

func main() {
	// Load configuration
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "Invalid configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize structured logger
	log := logger.New(cfg.LogLevel, true)
	log.Info("Starting TelyX Backend v2.0", map[string]interface{}{
		"version": "2.0.0",
		"port":    cfg.ServerPort,
	})

	// Initialize telemetry
	metrics := telemetry.InitMetrics(log)

	tp, err := telemetry.InitTracer(
		log,
		"telyx-backend",
		cfg.OTELEndpoint,
		cfg.SamplingRate,
	)
	if err != nil {
		log.Fatal("Failed to initialize tracer", map[string]interface{}{
			"error": err.Error(),
		})
	}

	// Initialize authentication (optional - for v2.0 features)
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "change-this-secret-in-production"
		log.Warn("Using default JWT secret - change in production!", nil)
	}
	authMgr := auth.NewAuthManager(jwtSecret)

	// Initialize rate limiter (100 requests per second, burst of 200)
	rateLimiter := ratelimit.NewLimiter(rate.Limit(100), 200, time.Minute)

	// Initialize handlers
	h := handlers.New(log, cfg.OpenSearchURL)

	// Create router
	mux := http.NewServeMux()

	// Public routes (no auth required)
	mux.HandleFunc("/health", h.HealthCheck)
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/api/metrics-info", h.MetricsInfo)

	// Protected routes (optional auth - logs work with or without auth)
	// Wrap with optional authentication to add user context if provided
	optionalAuth := middleware.OptionalAuthentication(authMgr)
	mux.Handle("/logs", optionalAuth(http.HandlerFunc(h.LogIngestion)))

	// Apply middleware chain
	handler := middleware.Chain(
		middleware.Recovery(log),
		middleware.RequestLogger(log),
		middleware.RateLimit(rateLimiter),
		middleware.Tracing,
		middleware.Metrics(metrics.RequestCount, metrics.RequestDuration),
		middleware.SecurityHeaders,
		middleware.ContentSecurityPolicy,
		middleware.RequestSizeLimit(10*1024*1024), // 10MB max request size
	)(mux)

	// Apply CORS if enabled
	if cfg.EnableCORS {
		handler = middleware.CORS(handler)
		log.Info("CORS enabled", nil)
	}

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Channel to listen for errors from server
	serverErrors := make(chan error, 1)

	// Start HTTP server in a goroutine
	go func() {
		log.Info("HTTP server starting", map[string]interface{}{
			"address": srv.Addr,
		})
		serverErrors <- srv.ListenAndServe()
	}()

	// Channel to listen for interrupt signals
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Block until we receive a signal or an error
	select {
	case err := <-serverErrors:
		log.Fatal("Server error", map[string]interface{}{
			"error": err.Error(),
		})

	case sig := <-shutdown:
		log.Info("Shutdown signal received", map[string]interface{}{
			"signal": sig.String(),
		})

		// Create context with timeout for graceful shutdown
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.ShutdownTimeout)*time.Second)
		defer cancel()

		// Shutdown HTTP server
		if err := srv.Shutdown(ctx); err != nil {
			log.Error("HTTP server shutdown error", map[string]interface{}{
				"error": err.Error(),
			})
			// Force close if graceful shutdown fails
			srv.Close()
		}

		// Shutdown telemetry
		if err := telemetry.Shutdown(ctx, tp, log); err != nil {
			log.Error("Telemetry shutdown error", map[string]interface{}{
				"error": err.Error(),
			})
		}

		log.Info("Shutdown complete", nil)
	}
}
