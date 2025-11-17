package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"telyx-backend/validation"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// Validator interface
type Validator interface {
	ValidateLogData(data map[string]interface{}) error
	SanitizeString(s string) string
}

// EnhancedHandler extends Handler with validation
type EnhancedHandler struct {
	*Handler
	validator Validator
}

// NewEnhanced creates a new enhanced handler with validation
func NewEnhanced(logger Logger, openSearchURL string) *EnhancedHandler {
	return &EnhancedHandler{
		Handler:   New(logger, openSearchURL),
		validator: validation.NewValidator(),
	}
}

// ValidatedLogIngestion processes log data with validation
func (h *EnhancedHandler) ValidatedLogIngestion(w http.ResponseWriter, r *http.Request) {
	span := trace.SpanFromContext(r.Context())
	span.SetAttributes(attribute.String("handler", "validatedLogIngestion"))

	w.Header().Set("Content-Type", "application/json")
	defer r.Body.Close()

	// Check content length
	if r.ContentLength > 1024*1024 { // 1MB max
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Request body too large",
		})
		return
	}

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

	// Validate log data
	if err := h.validator.ValidateLogData(logData); err != nil {
		h.logger.Warn("Log validation failed", map[string]interface{}{
			"error": err.Error(),
		})
		span.RecordError(err)
		span.SetAttributes(
			attribute.Bool("error", true),
			attribute.String("error.type", "validation_error"),
		)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Validation failed",
			"details": err.Error(),
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

	// Add user context if available
	if user := r.Context().Value("user"); user != nil {
		logData["user"] = user
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
		"message": "Log successfully ingested and validated",
		"log_id":  logData["trace_id"],
	})

	h.logger.Info("Log ingested and validated successfully", map[string]interface{}{
		"log_fields": len(logData),
	})
}

// BatchLogIngestion handles batch log ingestion
func (h *EnhancedHandler) BatchLogIngestion(w http.ResponseWriter, r *http.Request) {
	span := trace.SpanFromContext(r.Context())
	span.SetAttributes(attribute.String("handler", "batchLogIngestion"))

	w.Header().Set("Content-Type", "application/json")
	defer r.Body.Close()

	// Decode batch
	var logBatch []map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&logBatch); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid batch format",
		})
		return
	}

	if len(logBatch) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Empty batch",
		})
		return
	}

	if len(logBatch) > 1000 {
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Batch too large (max 1000 logs)",
		})
		return
	}

	span.SetAttributes(attribute.Int("batch.size", len(logBatch)))

	successCount := 0
	failureCount := 0
	errors := []string{}

	for i, logData := range logBatch {
		// Validate
		if err := h.validator.ValidateLogData(logData); err != nil {
			failureCount++
			errors = append(errors, err.Error())
			continue
		}

		// Enrich
		logData["ingested_at"] = time.Now().UTC().Format(time.RFC3339)
		if _, exists := logData["timestamp"]; !exists {
			logData["timestamp"] = logData["ingested_at"]
		}
		logData["source"] = "telyx-backend"
		logData["batch_index"] = i

		// Marshal and send
		jsonData, err := json.Marshal(logData)
		if err != nil {
			failureCount++
			errors = append(errors, err.Error())
			continue
		}

		if err := h.sendToOpenSearch(r.Context(), jsonData); err != nil {
			failureCount++
			errors = append(errors, err.Error())
			continue
		}

		successCount++
	}

	response := map[string]interface{}{
		"success_count": successCount,
		"failure_count": failureCount,
		"total":         len(logBatch),
	}

	if len(errors) > 0 {
		response["errors"] = errors
	}

	statusCode := http.StatusOK
	if successCount == 0 {
		statusCode = http.StatusInternalServerError
	} else if failureCount > 0 {
		statusCode = http.StatusMultiStatus
	}

	h.logger.Info("Batch ingestion completed", map[string]interface{}{
		"success_count": successCount,
		"failure_count": failureCount,
		"total":         len(logBatch),
	})

	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}
