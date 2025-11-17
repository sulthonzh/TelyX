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

	"telyx-backend/config"
	"telyx-backend/handlers"
	"telyx-backend/logger"
	"telyx-backend/middleware"
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
	log.Info("Starting TelyX Backend", map[string]interface{}{
		"version": "1.0.0",
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

	// Initialize handlers
	h := handlers.New(log, cfg.OpenSearchURL)

	// Create router
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/health", h.HealthCheck)
	mux.HandleFunc("/logs", h.LogIngestion)
	mux.HandleFunc("/api/metrics-info", h.MetricsInfo)
	mux.Handle("/metrics", promhttp.Handler())

	// Apply middleware chain
	handler := middleware.Chain(
		middleware.Recovery(log),
		middleware.RequestLogger(log),
		middleware.Tracing,
		middleware.Metrics(metrics.RequestCount, metrics.RequestDuration),
		middleware.SecurityHeaders,
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
