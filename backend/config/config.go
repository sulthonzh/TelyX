package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds application configuration
type Config struct {
	ServerPort      string
	OpenSearchURL   string
	OTELEndpoint    string
	LogLevel        string
	SamplingRate    float64
	EnableCORS      bool
	ShutdownTimeout int
}

// Load reads configuration from environment variables with defaults
func Load() *Config {
	return &Config{
		ServerPort:      getEnv("SERVER_PORT", "8080"),
		OpenSearchURL:   getEnv("OPENSEARCH_URL", "http://opensearch:9200/logs/_doc"),
		OTELEndpoint:    getEnv("OTEL_ENDPOINT", "http://otel-collector:4318"),
		LogLevel:        getEnv("LOG_LEVEL", "info"),
		SamplingRate:    getEnvFloat("SAMPLING_RATE", 0.1),
		EnableCORS:      getEnvBool("ENABLE_CORS", true),
		ShutdownTimeout: getEnvInt("SHUTDOWN_TIMEOUT", 30),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

// Validate checks if the configuration is valid
func (c *Config) Validate() error {
	if c.ServerPort == "" {
		return fmt.Errorf("SERVER_PORT cannot be empty")
	}
	if c.OpenSearchURL == "" {
		return fmt.Errorf("OPENSEARCH_URL cannot be empty")
	}
	if c.SamplingRate < 0 || c.SamplingRate > 1 {
		return fmt.Errorf("SAMPLING_RATE must be between 0 and 1")
	}
	return nil
}
