package e2e

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

const (
	baseURL = "http://localhost:8080"
	apiKey  = "tlx_test_key" // Replace with actual test API key
)

func TestHealthEndpoint(t *testing.T) {
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		t.Fatalf("Failed to call health endpoint: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var health map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		t.Fatalf("Failed to decode health response: %v", err)
	}

	if health["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got %v", health["status"])
	}
}

func TestLogIngestion(t *testing.T) {
	logData := map[string]interface{}{
		"level":   "info",
		"message": "E2E test log",
		"service": "e2e-test",
	}

	jsonData, err := json.Marshal(logData)
	if err != nil {
		t.Fatalf("Failed to marshal log data: %v", err)
	}

	req, err := http.NewRequest("POST", baseURL+"/logs", bytes.NewBuffer(jsonData))
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to send log: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 201 or 200, got %d", resp.StatusCode)
	}
}

func TestBatchLogIngestion(t *testing.T) {
	batch := []map[string]interface{}{
		{"level": "info", "message": "Batch log 1"},
		{"level": "warn", "message": "Batch log 2"},
		{"level": "error", "message": "Batch log 3"},
	}

	jsonData, err := json.Marshal(batch)
	if err != nil {
		t.Fatalf("Failed to marshal batch: %v", err)
	}

	req, err := http.NewRequest("POST", baseURL+"/api/logs/batch", bytes.NewBuffer(jsonData))
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to send batch: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if result["success_count"].(float64) != 3 {
		t.Errorf("Expected 3 successful ingestions, got %v", result["success_count"])
	}
}

func TestQueryLogs(t *testing.T) {
	query := map[string]interface{}{
		"query": "*",
		"size":  10,
	}

	jsonData, err := json.Marshal(query)
	if err != nil {
		t.Fatalf("Failed to marshal query: %v", err)
	}

	req, err := http.NewRequest("POST", baseURL+"/api/logs/query", bytes.NewBuffer(jsonData))
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to query logs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}

func TestRateLimit(t *testing.T) {
	client := &http.Client{Timeout: 10 * time.Second}

	// Send requests until rate limited
	for i := 0; i < 150; i++ {
		resp, err := client.Get(baseURL + "/health")
		if err != nil {
			t.Fatalf("Request %d failed: %v", i, err)
		}
		resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			t.Logf("Rate limited after %d requests", i)
			return
		}
	}

	t.Log("Rate limiting not triggered (may need higher request count)")
}

func TestAuthenticationRequired(t *testing.T) {
	// Try to access protected endpoint without auth
	resp, err := http.Get(baseURL + "/api/logs/query")
	if err != nil {
		t.Fatalf("Failed to call endpoint: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", resp.StatusCode)
	}
}

func TestMetricsEndpoint(t *testing.T) {
	resp, err := http.Get(baseURL + "/metrics")
	if err != nil {
		t.Fatalf("Failed to call metrics endpoint: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}
