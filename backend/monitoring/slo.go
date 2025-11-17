package monitoring

import (
	"sync"
	"time"
)

// SLO represents a Service Level Objective
type SLO struct {
	Name        string
	Description string
	Target      float64 // Target percentage (e.g., 99.9)
	Window      time.Duration
	mu          sync.RWMutex
	events      []SLOEvent
}

// SLOEvent represents an SLO measurement event
type SLOEvent struct {
	Timestamp time.Time
	Success   bool
	Duration  time.Duration
}

// SLOManager manages SLOs
type SLOManager struct {
	slos map[string]*SLO
	mu   sync.RWMutex
}

// NewSLOManager creates a new SLO manager
func NewSLOManager() *SLOManager {
	return &SLOManager{
		slos: make(map[string]*SLO),
	}
}

// RegisterSLO registers a new SLO
func (sm *SLOManager) RegisterSLO(name, description string, target float64, window time.Duration) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sm.slos[name] = &SLO{
		Name:        name,
		Description: description,
		Target:      target,
		Window:      window,
		events:      make([]SLOEvent, 0),
	}
}

// RecordEvent records an SLO event
func (sm *SLOManager) RecordEvent(sloName string, success bool, duration time.Duration) {
	sm.mu.RLock()
	slo, exists := sm.slos[sloName]
	sm.mu.RUnlock()

	if !exists {
		return
	}

	slo.mu.Lock()
	defer slo.mu.Unlock()

	event := SLOEvent{
		Timestamp: time.Now(),
		Success:   success,
		Duration:  duration,
	}

	slo.events = append(slo.events, event)

	// Clean up old events outside the window
	cutoff := time.Now().Add(-slo.Window)
	validEvents := make([]SLOEvent, 0)
	for _, e := range slo.events {
		if e.Timestamp.After(cutoff) {
			validEvents = append(validEvents, e)
		}
	}
	slo.events = validEvents
}

// GetSLOStatus returns the current SLO status
func (sm *SLOManager) GetSLOStatus(sloName string) *SLOStatus {
	sm.mu.RLock()
	slo, exists := sm.slos[sloName]
	sm.mu.RUnlock()

	if !exists {
		return nil
	}

	slo.mu.RLock()
	defer slo.mu.RUnlock()

	totalEvents := len(slo.events)
	if totalEvents == 0 {
		return &SLOStatus{
			Name:             slo.Name,
			Description:      slo.Description,
			Target:           slo.Target,
			Current:          100.0,
			TotalEvents:      0,
			SuccessfulEvents: 0,
			FailedEvents:     0,
			Compliant:        true,
			ErrorBudget:      100.0,
		}
	}

	successCount := 0
	var totalDuration time.Duration

	for _, event := range slo.events {
		if event.Success {
			successCount++
		}
		totalDuration += event.Duration
	}

	current := (float64(successCount) / float64(totalEvents)) * 100
	compliant := current >= slo.Target
	errorBudget := ((current - slo.Target) / (100 - slo.Target)) * 100

	avgDuration := time.Duration(0)
	if totalEvents > 0 {
		avgDuration = totalDuration / time.Duration(totalEvents)
	}

	return &SLOStatus{
		Name:             slo.Name,
		Description:      slo.Description,
		Target:           slo.Target,
		Current:          current,
		TotalEvents:      totalEvents,
		SuccessfulEvents: successCount,
		FailedEvents:     totalEvents - successCount,
		Compliant:        compliant,
		ErrorBudget:      errorBudget,
		AverageDuration:  avgDuration,
	}
}

// GetAllSLOStatuses returns all SLO statuses
func (sm *SLOManager) GetAllSLOStatuses() map[string]*SLOStatus {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	statuses := make(map[string]*SLOStatus)
	for name := range sm.slos {
		status := sm.GetSLOStatus(name)
		if status != nil {
			statuses[name] = status
		}
	}

	return statuses
}

// SLOStatus represents the current status of an SLO
type SLOStatus struct {
	Name             string        `json:"name"`
	Description      string        `json:"description"`
	Target           float64       `json:"target"`
	Current          float64       `json:"current"`
	TotalEvents      int           `json:"total_events"`
	SuccessfulEvents int           `json:"successful_events"`
	FailedEvents     int           `json:"failed_events"`
	Compliant        bool          `json:"compliant"`
	ErrorBudget      float64       `json:"error_budget"`
	AverageDuration  time.Duration `json:"average_duration"`
}

// Alert represents a threshold-based alert
type Alert struct {
	Name        string
	Description string
	Threshold   float64
	Condition   string // "above" or "below"
	Triggered   bool
	LastCheck   time.Time
}

// AlertManager manages alerts
type AlertManager struct {
	alerts map[string]*Alert
	mu     sync.RWMutex
}

// NewAlertManager creates a new alert manager
func NewAlertManager() *AlertManager {
	return &AlertManager{
		alerts: make(map[string]*Alert),
	}
}

// RegisterAlert registers a new alert
func (am *AlertManager) RegisterAlert(name, description string, threshold float64, condition string) {
	am.mu.Lock()
	defer am.mu.Unlock()

	am.alerts[name] = &Alert{
		Name:        name,
		Description: description,
		Threshold:   threshold,
		Condition:   condition,
		Triggered:   false,
		LastCheck:   time.Now(),
	}
}

// CheckAlert checks if an alert should be triggered
func (am *AlertManager) CheckAlert(name string, value float64) bool {
	am.mu.Lock()
	defer am.mu.Unlock()

	alert, exists := am.alerts[name]
	if !exists {
		return false
	}

	alert.LastCheck = time.Now()

	shouldTrigger := false
	if alert.Condition == "above" {
		shouldTrigger = value > alert.Threshold
	} else if alert.Condition == "below" {
		shouldTrigger = value < alert.Threshold
	}

	wasTriggered := alert.Triggered
	alert.Triggered = shouldTrigger

	// Return true if alert just triggered (transition from false to true)
	return shouldTrigger && !wasTriggered
}

// GetAlertStatus returns the status of an alert
func (am *AlertManager) GetAlertStatus(name string) *Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	if alert, exists := am.alerts[name]; exists {
		return alert
	}
	return nil
}

// GetAllAlerts returns all alerts
func (am *AlertManager) GetAllAlerts() map[string]*Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	alerts := make(map[string]*Alert)
	for name, alert := range am.alerts {
		alerts[name] = alert
	}
	return alerts
}
