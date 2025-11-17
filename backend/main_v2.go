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
	"telyx-backend/monitoring"
	"telyx-backend/ratelimit"
	"telyx-backend/resilience"
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
		"env":     os.Getenv("ENV"),
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

	// Initialize authentication manager
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "change-this-secret-in-production" // Default for development
		log.Warn("Using default JWT secret - change in production!", nil)
	}
	authMgr := auth.NewAuthManager(jwtSecret)

	// Create a default admin API key for development
	adminKey, err := authMgr.GenerateAPIKey("admin", []string{"admin"}, 1000, nil)
	if err != nil {
		log.Warn("Failed to create admin API key", map[string]interface{}{
			"error": err.Error(),
		})
	} else {
		log.Info("Admin API Key created (save this!)", map[string]interface{}{
			"api_key": adminKey.Key,
			"roles":   adminKey.Roles,
		})
	}

	// Initialize rate limiter
	rateLimiter := ratelimit.NewLimiter(rate.Limit(100), 200, time.Minute)

	// Initialize circuit breakers
	osCircuitBreaker := resilience.NewCircuitBreaker(5, 30*time.Second, 3)

	// Initialize bulkhead (max 100 concurrent requests)
	bulkhead := resilience.NewBulkhead(100)

	// Initialize SLO manager
	sloManager := monitoring.NewSLOManager()
	sloManager.RegisterSLO("api_availability", "API Availability SLO", 99.9, 24*time.Hour)
	sloManager.RegisterSLO("api_latency", "API Latency SLO (< 500ms)", 95.0, 24*time.Hour)

	// Initialize alert manager
	alertManager := monitoring.NewAlertManager()
	alertManager.RegisterAlert("high_error_rate", "Error rate above 5%", 5.0, "above")
	alertManager.RegisterAlert("low_availability", "Availability below 99%", 99.0, "below")

	// Initialize handlers
	baseHandler := handlers.New(log, cfg.OpenSearchURL)
	h := handlers.NewEnhanced(log, cfg.OpenSearchURL)

	// Create router
	mux := http.NewServeMux()

	// Public endpoints (no auth required)
	mux.HandleFunc("/health", baseHandler.HealthCheck)
	mux.Handle("/metrics", promhttp.Handler())

	// Protected endpoints (auth required)
	authMiddleware := middleware.Authentication(authMgr)

	// Log ingestion endpoints
	mux.Handle("/logs", authMiddleware(http.HandlerFunc(h.ValidatedLogIngestion)))
	mux.Handle("/api/logs/batch", authMiddleware(http.HandlerFunc(h.BatchLogIngestion)))

	// Query endpoints
	mux.Handle("/api/logs/query", authMiddleware(http.HandlerFunc(h.QueryLogs)))
	mux.Handle("/api/logs/aggregations", authMiddleware(http.HandlerFunc(h.GetLogAggregations)))

	// Metrics and stats endpoints
	mux.Handle("/api/metrics-info", authMiddleware(http.HandlerFunc(baseHandler.MetricsInfo)))
	mux.Handle("/api/metrics/stats", authMiddleware(http.HandlerFunc(h.GetMetricsStats)))
	mux.Handle("/api/system/stats", authMiddleware(http.HandlerFunc(h.GetSystemStats)))

	// SLO and monitoring endpoints (admin only)
	adminMiddleware := middleware.Chain(
		authMiddleware,
		middleware.RequireRole("admin"),
	)

	mux.Handle("/api/slo/status", adminMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		statuses := sloManager.GetAllSLOStatuses()
		json.NewEncoder(w).Encode(statuses)
	})))

	mux.Handle("/api/alerts", adminMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		alerts := alertManager.GetAllAlerts()
		json.NewEncoder(w).Encode(alerts)
	})))

	// Apply global middleware chain
	handler := middleware.Chain(
		middleware.Recovery(log),
		middleware.RequestLogger(log),
		middleware.RateLimit(rateLimiter),
		middleware.Tracing,
		middleware.Metrics(metrics.RequestCount, metrics.RequestDuration),
		middleware.SecurityHeaders,
		middleware.ContentSecurityPolicy,
		middleware.RequestSizeLimit(10*1024*1024), // 10MB max
	)(mux)

	// Apply CORS if enabled
	if cfg.EnableCORS {
		handler = middleware.CORS(handler)
		log.Info("CORS enabled", nil)
	}

	// Wrap with bulkhead
	bulkheadHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		err := bulkhead.Execute(func() error {
			handler.ServeHTTP(w, r)
			return nil
		})

		if err != nil {
			http.Error(w, `{"error": "Service overloaded"}`, http.StatusServiceUnavailable)
		}
	})

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      bulkheadHandler,
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
			"tls":     false,
		})
		serverErrors <- srv.ListenAndServe()
	}()

	// Start background monitoring
	go startMonitoring(log, sloManager, alertManager)

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

func startMonitoring(log logger.Logger, sloManager *monitoring.SLOManager, alertManager *monitoring.AlertManager) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		// Check SLOs
		statuses := sloManager.GetAllSLOStatuses()
		for name, status := range statuses {
			log.Info("SLO status", map[string]interface{}{
				"slo_name":    name,
				"current":     status.Current,
				"target":      status.Target,
				"compliant":   status.Compliant,
				"error_budget": status.ErrorBudget,
			})

			// Check alerts
			if alertManager.CheckAlert("low_availability", status.Current) {
				log.Error("ALERT: Low availability detected", map[string]interface{}{
					"slo_name": name,
					"current":  status.Current,
					"target":   status.Target,
				})
			}
		}
	}
}
