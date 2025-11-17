package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear any environment variables
	os.Clearenv()

	cfg := Load()

	if cfg.ServerPort != "8080" {
		t.Errorf("Expected default ServerPort '8080', got '%s'", cfg.ServerPort)
	}

	if cfg.LogLevel != "info" {
		t.Errorf("Expected default LogLevel 'info', got '%s'", cfg.LogLevel)
	}

	if cfg.SamplingRate != 0.1 {
		t.Errorf("Expected default SamplingRate 0.1, got %f", cfg.SamplingRate)
	}

	if !cfg.EnableCORS {
		t.Error("Expected default EnableCORS to be true")
	}

	if cfg.ShutdownTimeout != 30 {
		t.Errorf("Expected default ShutdownTimeout 30, got %d", cfg.ShutdownTimeout)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	os.Clearenv()
	os.Setenv("SERVER_PORT", "9000")
	os.Setenv("LOG_LEVEL", "debug")
	os.Setenv("SAMPLING_RATE", "0.5")
	os.Setenv("ENABLE_CORS", "false")
	os.Setenv("SHUTDOWN_TIMEOUT", "60")

	cfg := Load()

	if cfg.ServerPort != "9000" {
		t.Errorf("Expected ServerPort '9000', got '%s'", cfg.ServerPort)
	}

	if cfg.LogLevel != "debug" {
		t.Errorf("Expected LogLevel 'debug', got '%s'", cfg.LogLevel)
	}

	if cfg.SamplingRate != 0.5 {
		t.Errorf("Expected SamplingRate 0.5, got %f", cfg.SamplingRate)
	}

	if cfg.EnableCORS {
		t.Error("Expected EnableCORS to be false")
	}

	if cfg.ShutdownTimeout != 60 {
		t.Errorf("Expected ShutdownTimeout 60, got %d", cfg.ShutdownTimeout)
	}

	os.Clearenv()
}

func TestValidate_Valid(t *testing.T) {
	cfg := &Config{
		ServerPort:      "8080",
		OpenSearchURL:   "http://opensearch:9200",
		OTELEndpoint:    "http://otel:4318",
		LogLevel:        "info",
		SamplingRate:    0.1,
		EnableCORS:      true,
		ShutdownTimeout: 30,
	}

	if err := cfg.Validate(); err != nil {
		t.Errorf("Expected valid config, got error: %v", err)
	}
}

func TestValidate_EmptyServerPort(t *testing.T) {
	cfg := &Config{
		ServerPort:    "",
		OpenSearchURL: "http://opensearch:9200",
		SamplingRate:  0.1,
	}

	if err := cfg.Validate(); err == nil {
		t.Error("Expected validation error for empty ServerPort")
	}
}

func TestValidate_EmptyOpenSearchURL(t *testing.T) {
	cfg := &Config{
		ServerPort:    "8080",
		OpenSearchURL: "",
		SamplingRate:  0.1,
	}

	if err := cfg.Validate(); err == nil {
		t.Error("Expected validation error for empty OpenSearchURL")
	}
}

func TestValidate_InvalidSamplingRate(t *testing.T) {
	tests := []float64{-0.1, 1.5, 2.0}

	for _, rate := range tests {
		cfg := &Config{
			ServerPort:    "8080",
			OpenSearchURL: "http://opensearch:9200",
			SamplingRate:  rate,
		}

		if err := cfg.Validate(); err == nil {
			t.Errorf("Expected validation error for SamplingRate %f", rate)
		}
	}
}
