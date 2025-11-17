package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// Logger interface for handlers
type Logger interface {
	Info(message string, fields map[string]interface{})
	Error(message string, fields map[string]interface{})
	Warn(message string, fields map[string]interface{})
}

// Handler holds dependencies for HTTP handlers
type Handler struct {
	logger        Logger
	openSearchURL string
	httpClient    *http.Client
}

// New creates a new Handler instance
func New(logger Logger, openSearchURL string) *Handler {
	return &Handler{
		logger:        logger,
		openSearchURL: openSearchURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// HealthCheck responds with the service's health status
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	span := trace.SpanFromContext(r.Context())
	span.SetAttributes(attribute.String("handler", "healthCheck"))

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"status":    "healthy",
		"service":   "telyx-backend",
		"message":   "TelyX Backend is running!",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"version":   "1.0.0",
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		h.logger.Error("Failed to encode health response", map[string]interface{}{
			"error": err.Error(),
		})
		span.RecordError(err)
		span.SetAttributes(attribute.Bool("error", true))
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}

	h.logger.Info("Health check successful", nil)
}

// LogIngestion processes log data and sends it to OpenSearch
func (h *Handler) LogIngestion(w http.ResponseWriter, r *http.Request) {
	span := trace.SpanFromContext(r.Context())
	span.SetAttributes(attribute.String("handler", "logIngestion"))

	w.Header().Set("Content-Type", "application/json")
	defer r.Body.Close()

	// Decode log data
	var logData map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&logData); err != nil {
		h.logger.Warn("Invalid log format received", map[string]interface{}{
			"error": err.Error(),
		})
		span.RecordError(err)
		span.SetAttributes(
			attribute.Bool("error", true),
			attribute.String("error.type", "invalid_format"),
		)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid log format",
		})
		return
	}

	// Enrich log data with metadata
	logData["ingested_at"] = time.Now().UTC().Format(time.RFC3339)
	if _, exists := logData["timestamp"]; !exists {
		logData["timestamp"] = logData["ingested_at"]
	}
	logData["source"] = "telyx-backend"

	// Add trace context if available
	if span.SpanContext().IsValid() {
		logData["trace_id"] = span.SpanContext().TraceID().String()
		logData["span_id"] = span.SpanContext().SpanID().String()
	}

	span.SetAttributes(attribute.Int("log.fields_count", len(logData)))

	// Marshal log data
	jsonData, err := json.Marshal(logData)
	if err != nil {
		h.logger.Error("Failed to marshal log data", map[string]interface{}{
			"error": err.Error(),
		})
		span.RecordError(err)
		span.SetAttributes(attribute.Bool("error", true))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Internal server error",
		})
		return
	}

	// Send to OpenSearch
	if err := h.sendToOpenSearch(r.Context(), jsonData); err != nil {
		h.logger.Error("Failed to send log to OpenSearch", map[string]interface{}{
			"error": err.Error(),
		})
		span.RecordError(err)
		span.SetAttributes(
			attribute.Bool("error", true),
			attribute.String("error.type", "opensearch_error"),
		)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to send log to OpenSearch",
		})
		return
	}

	// Success response
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"message": "Log successfully ingested",
		"log_id":  logData["trace_id"],
	})

	h.logger.Info("Log ingested successfully", map[string]interface{}{
		"log_fields": len(logData),
	})
}

// sendToOpenSearch sends log data to OpenSearch
func (h *Handler) sendToOpenSearch(ctx context.Context, data []byte) error {
	req, err := http.NewRequestWithContext(ctx, "POST", h.openSearchURL, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("opensearch returned status %d", resp.StatusCode)
	}

	return nil
}

// MetricsInfo provides information about available metrics
func (h *Handler) MetricsInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	info := map[string]interface{}{
		"message": "Prometheus metrics available at /metrics",
		"metrics": []string{
			"http_requests_total",
			"http_request_duration_seconds",
			"http_request_size_bytes",
			"http_response_size_bytes",
		},
	}

	json.NewEncoder(w).Encode(info)
}
