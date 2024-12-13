package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.12.0"
)

const osURL = "http://opensearch:9200/logs/_doc"

// Prometheus metrics
var (
	requestCount = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"path"},
	)
	requestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Histogram of response time for HTTP requests",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"path"},
	)
)

func initMetrics() {
	prometheus.MustRegister(requestCount)
	prometheus.MustRegister(requestDuration)
	log.Println("Prometheus metrics initialized")
}

// initTracer initializes the OpenTelemetry TracerProvider
func initTracer() (*trace.TracerProvider, error) {
	exporter, err := otlptracehttp.New(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP trace exporter: %w", err)
	}

	tp := trace.NewTracerProvider(
		trace.WithSampler(trace.ParentBased(trace.TraceIDRatioBased(0.1))),
		trace.WithBatcher(exporter),
		trace.WithBatcher(exporter),
		trace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String("telyx-backend"),
		)),
	)

	otel.SetTracerProvider(tp)
	return tp, nil
}

// logHandler processes log data and sends it to OpenSearch
func logHandler(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		duration := time.Since(start).Seconds()
		requestDuration.WithLabelValues("/logs").Observe(duration)
	}()

	_, span := otel.Tracer("telyx-backend").Start(r.Context(), "logHandler")
	defer span.End()

	w.Header().Set("Content-Type", "application/json")
	defer r.Body.Close()

	var logData map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&logData); err != nil {
		http.Error(w, `{"error": "Invalid log format"}`, http.StatusBadRequest)
		requestCount.WithLabelValues("/logs").Inc()
		span.RecordError(err)
		span.SetAttributes(semconv.ExceptionMessageKey.String("Invalid log format"))
		return
	}

	// Add a timestamp if not provided
	if _, exists := logData["timestamp"]; !exists {
		logData["timestamp"] = time.Now().Format(time.RFC3339)
	}

	// Convert log data to JSON
	jsonData, err := json.Marshal(logData)
	if err != nil {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		span.RecordError(err)
		span.SetAttributes(semconv.ExceptionMessageKey.String("Failed to marshal log data"))
		return
	}

	// Send log data to OpenSearch
	res, err := http.Post(osURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil || res.StatusCode >= 400 {
		http.Error(w, `{"error": "Failed to send log to OpenSearch"}`, http.StatusInternalServerError)
		span.RecordError(err)
		span.SetAttributes(semconv.ExceptionMessageKey.String("Failed to send log to OpenSearch"))
		return
	}
	defer res.Body.Close()

	// Respond to the client
	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"status": "Log successfully ingested"}`))
	requestCount.WithLabelValues("/logs").Inc()
}

// healthCheck responds with the service's health status
func healthCheck(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		duration := time.Since(start).Seconds()
		requestDuration.WithLabelValues("/health").Observe(duration)
	}()

	_, span := otel.Tracer("telyx-backend").Start(r.Context(), "healthCheck")
	defer span.End()

	w.Header().Set("Content-Type", "application/json")
	response := map[string]string{
		"status":  "healthy",
		"message": "TelyX Backend is running!",
		"time":    time.Now().Format(time.RFC3339),
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		span.RecordError(err)
		span.SetAttributes(semconv.ExceptionMessageKey.String("Failed to encode health response"))
		return
	}
	requestCount.WithLabelValues("/health").Inc()
}

func main() {
	// Configure logging
	logFile := "backend.log"
	file, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0666)
	if err != nil {
		log.Fatalf("Failed to open log file: %v", err)
	}
	defer file.Close()
	log.SetOutput(file)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("Logger initialized")

	// Initialize Prometheus metrics
	initMetrics()

	// Initialize OpenTelemetry
	tp, err := initTracer()
	if err != nil {
		log.Fatalf("Failed to initialize tracer: %v", err)
	}
	defer func() { _ = tp.Shutdown(context.Background()) }()

	http.Handle("/metrics", promhttp.Handler())
	http.HandleFunc("/health", healthCheck)
	http.HandleFunc("/logs", logHandler)

	port := ":8080"
	log.Printf("Server is running on port %s...", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
