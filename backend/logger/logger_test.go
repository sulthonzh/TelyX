package logger

import (
	"bytes"
	"encoding/json"
	"log"
	"strings"
	"testing"
)

func TestNew(t *testing.T) {
	logger := New("info", true)
	if logger == nil {
		t.Error("Expected non-nil logger")
	}

	if logger.level != INFO {
		t.Errorf("Expected INFO level, got %v", logger.level)
	}

	if !logger.jsonFormat {
		t.Error("Expected JSON format to be true")
	}
}

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected Level
	}{
		{"debug", DEBUG},
		{"info", INFO},
		{"warn", WARN},
		{"error", ERROR},
		{"fatal", FATAL},
		{"unknown", INFO}, // default
	}

	for _, tt := range tests {
		result := parseLevel(tt.input)
		if result != tt.expected {
			t.Errorf("parseLevel(%q) = %v, expected %v", tt.input, result, tt.expected)
		}
	}
}

func TestLogger_JSONFormat(t *testing.T) {
	var buf bytes.Buffer
	logger := &Logger{
		level:      INFO,
		output:     log.New(&buf, "", 0),
		jsonFormat: true,
	}

	logger.Info("test message", map[string]interface{}{
		"key": "value",
	})

	output := buf.String()
	var entry LogEntry
	if err := json.Unmarshal([]byte(output), &entry); err != nil {
		t.Fatalf("Failed to parse JSON output: %v", err)
	}

	if entry.Level != "INFO" {
		t.Errorf("Expected level 'INFO', got '%s'", entry.Level)
	}

	if entry.Message != "test message" {
		t.Errorf("Expected message 'test message', got '%s'", entry.Message)
	}

	if entry.Fields["key"] != "value" {
		t.Errorf("Expected field key='value', got %v", entry.Fields["key"])
	}
}

func TestLogger_TextFormat(t *testing.T) {
	var buf bytes.Buffer
	logger := &Logger{
		level:      INFO,
		output:     log.New(&buf, "", 0),
		jsonFormat: false,
	}

	logger.Info("test message", nil)

	output := buf.String()
	if !strings.Contains(output, "INFO") {
		t.Error("Expected output to contain 'INFO'")
	}

	if !strings.Contains(output, "test message") {
		t.Error("Expected output to contain 'test message'")
	}
}

func TestLogger_LevelFiltering(t *testing.T) {
	var buf bytes.Buffer
	logger := &Logger{
		level:      WARN,
		output:     log.New(&buf, "", 0),
		jsonFormat: true,
	}

	// These should be filtered out
	logger.Debug("debug message", nil)
	logger.Info("info message", nil)

	// These should pass through
	logger.Warn("warn message", nil)
	logger.Error("error message", nil)

	output := buf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")

	// Should only have 2 lines (warn and error)
	if len(lines) != 2 {
		t.Errorf("Expected 2 log lines, got %d", len(lines))
	}
}

func TestLogger_AllLevels(t *testing.T) {
	tests := []struct {
		level    Level
		logFunc  func(*Logger, string, map[string]interface{})
		expected string
	}{
		{DEBUG, (*Logger).Debug, "DEBUG"},
		{INFO, (*Logger).Info, "INFO"},
		{WARN, (*Logger).Warn, "WARN"},
		{ERROR, (*Logger).Error, "ERROR"},
	}

	for _, tt := range tests {
		var buf bytes.Buffer
		logger := &Logger{
			level:      DEBUG, // Allow all levels
			output:     log.New(&buf, "", 0),
			jsonFormat: true,
		}

		tt.logFunc(logger, "test message", nil)

		output := buf.String()
		var entry LogEntry
		if err := json.Unmarshal([]byte(output), &entry); err != nil {
			t.Fatalf("Failed to parse JSON output: %v", err)
		}

		if entry.Level != tt.expected {
			t.Errorf("Expected level '%s', got '%s'", tt.expected, entry.Level)
		}
	}
}
