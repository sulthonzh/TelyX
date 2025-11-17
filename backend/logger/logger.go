package logger

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"
)

// Level represents log severity
type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
	FATAL
)

func (l Level) String() string {
	return [...]string{"DEBUG", "INFO", "WARN", "ERROR", "FATAL"}[l]
}

// Logger provides structured logging
type Logger struct {
	level      Level
	output     *log.Logger
	jsonFormat bool
}

// New creates a new logger instance
func New(levelStr string, jsonFormat bool) *Logger {
	level := parseLevel(levelStr)

	output := log.New(os.Stdout, "", 0)

	return &Logger{
		level:      level,
		output:     output,
		jsonFormat: jsonFormat,
	}
}

func parseLevel(levelStr string) Level {
	switch levelStr {
	case "debug":
		return DEBUG
	case "info":
		return INFO
	case "warn":
		return WARN
	case "error":
		return ERROR
	case "fatal":
		return FATAL
	default:
		return INFO
	}
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Level     string                 `json:"level"`
	Message   string                 `json:"message"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

func (l *Logger) log(level Level, message string, fields map[string]interface{}) {
	if level < l.level {
		return
	}

	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level.String(),
		Message:   message,
		Fields:    fields,
	}

	if l.jsonFormat {
		jsonData, _ := json.Marshal(entry)
		l.output.Println(string(jsonData))
	} else {
		fieldsStr := ""
		if len(fields) > 0 {
			fieldsData, _ := json.Marshal(fields)
			fieldsStr = fmt.Sprintf(" %s", string(fieldsData))
		}
		l.output.Printf("[%s] %s: %s%s\n", entry.Timestamp, entry.Level, message, fieldsStr)
	}
}

// Debug logs a debug message
func (l *Logger) Debug(message string, fields map[string]interface{}) {
	l.log(DEBUG, message, fields)
}

// Info logs an info message
func (l *Logger) Info(message string, fields map[string]interface{}) {
	l.log(INFO, message, fields)
}

// Warn logs a warning message
func (l *Logger) Warn(message string, fields map[string]interface{}) {
	l.log(WARN, message, fields)
}

// Error logs an error message
func (l *Logger) Error(message string, fields map[string]interface{}) {
	l.log(ERROR, message, fields)
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(message string, fields map[string]interface{}) {
	l.log(FATAL, message, fields)
	os.Exit(1)
}
