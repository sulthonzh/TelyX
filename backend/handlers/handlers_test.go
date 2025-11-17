package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// mockLogger implements the Logger interface for testing
type mockLogger struct {
	logs []string
}

func (m *mockLogger) Info(message string, fields map[string]interface{}) {
	m.logs = append(m.logs, "INFO: "+message)
}

func (m *mockLogger) Error(message string, fields map[string]interface{}) {
	m.logs = append(m.logs, "ERROR: "+message)
}

func (m *mockLogger) Warn(message string, fields map[string]interface{}) {
	m.logs = append(m.logs, "WARN: "+message)
}

func TestHealthCheck(t *testing.T) {
	logger := &mockLogger{}
	h := New(logger, "http://test-opensearch:9200")

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	h.HealthCheck(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got '%v'", response["status"])
	}

	if response["service"] != "telyx-backend" {
		t.Errorf("Expected service 'telyx-backend', got '%v'", response["service"])
	}
}

func TestLogIngestion_Success(t *testing.T) {
	// Create a test server to mock OpenSearch
	mockOS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"_id":"123","result":"created"}`))
	}))
	defer mockOS.Close()

	logger := &mockLogger{}
	h := New(logger, mockOS.URL)

	logData := map[string]interface{}{
		"level":   "info",
		"message": "Test log message",
	}
	body, _ := json.Marshal(logData)

	req := httptest.NewRequest("POST", "/logs", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.LogIngestion(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status Created, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response["status"] != "success" {
		t.Errorf("Expected status 'success', got '%v'", response["status"])
	}
}

func TestLogIngestion_InvalidJSON(t *testing.T) {
	logger := &mockLogger{}
	h := New(logger, "http://test-opensearch:9200")

	req := httptest.NewRequest("POST", "/logs", bytes.NewBufferString("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.LogIngestion(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status BadRequest, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response["error"] != "Invalid log format" {
		t.Errorf("Expected error 'Invalid log format', got '%v'", response["error"])
	}
}

func TestLogIngestion_OpenSearchFailure(t *testing.T) {
	// Create a test server that returns an error
	mockOS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"Internal error"}`))
	}))
	defer mockOS.Close()

	logger := &mockLogger{}
	h := New(logger, mockOS.URL)

	logData := map[string]interface{}{
		"level":   "info",
		"message": "Test log message",
	}
	body, _ := json.Marshal(logData)

	req := httptest.NewRequest("POST", "/logs", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.LogIngestion(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status InternalServerError, got %d", w.Code)
	}
}

func TestMetricsInfo(t *testing.T) {
	logger := &mockLogger{}
	h := New(logger, "http://test-opensearch:9200")

	req := httptest.NewRequest("GET", "/api/metrics-info", nil)
	w := httptest.NewRecorder()

	h.MetricsInfo(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if _, ok := response["metrics"]; !ok {
		t.Error("Expected 'metrics' field in response")
	}
}
