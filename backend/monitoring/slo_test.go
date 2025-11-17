package monitoring

import (
	"testing"
	"time"
)

func TestNewSLOManager(t *testing.T) {
	sm := NewSLOManager()

	if sm == nil {
		t.Fatal("Expected non-nil SLO manager")
	}

	if sm.slos == nil {
		t.Error("Expected slos map to be initialized")
	}
}

func TestSLOManager_RegisterSLO(t *testing.T) {
	sm := NewSLOManager()

	sm.RegisterSLO("test-slo", "Test SLO", 99.9, 24*time.Hour)

	status := sm.GetSLOStatus("test-slo")
	if status == nil {
		t.Fatal("Expected SLO to be registered")
	}

	if status.Name != "test-slo" {
		t.Errorf("Expected name 'test-slo', got '%s'", status.Name)
	}

	if status.Target != 99.9 {
		t.Errorf("Expected target 99.9, got %f", status.Target)
	}
}

func TestSLOManager_RecordEvent(t *testing.T) {
	sm := NewSLOManager()
	sm.RegisterSLO("test-slo", "Test", 99.0, 1*time.Hour)

	// Record some events
	sm.RecordEvent("test-slo", true, 100*time.Millisecond)
	sm.RecordEvent("test-slo", true, 200*time.Millisecond)
	sm.RecordEvent("test-slo", false, 500*time.Millisecond)

	status := sm.GetSLOStatus("test-slo")
	if status.TotalEvents != 3 {
		t.Errorf("Expected 3 total events, got %d", status.TotalEvents)
	}

	if status.SuccessfulEvents != 2 {
		t.Errorf("Expected 2 successful events, got %d", status.SuccessfulEvents)
	}

	if status.FailedEvents != 1 {
		t.Errorf("Expected 1 failed event, got %d", status.FailedEvents)
	}
}

func TestSLOManager_GetSLOStatus(t *testing.T) {
	sm := NewSLOManager()
	sm.RegisterSLO("test-slo", "Test", 95.0, 1*time.Hour)

	// Record 95 successful and 5 failed (95% success rate)
	for i := 0; i < 95; i++ {
		sm.RecordEvent("test-slo", true, 100*time.Millisecond)
	}
	for i := 0; i < 5; i++ {
		sm.RecordEvent("test-slo", false, 100*time.Millisecond)
	}

	status := sm.GetSLOStatus("test-slo")

	if status.Current < 94.9 || status.Current > 95.1 {
		t.Errorf("Expected current ~95%%, got %f", status.Current)
	}

	if !status.Compliant {
		t.Error("Expected SLO to be compliant at 95%")
	}
}

func TestSLOManager_GetSLOStatus_NonCompliant(t *testing.T) {
	sm := NewSLOManager()
	sm.RegisterSLO("test-slo", "Test", 99.0, 1*time.Hour)

	// Record 90 successful and 10 failed (90% success rate)
	for i := 0; i < 90; i++ {
		sm.RecordEvent("test-slo", true, 100*time.Millisecond)
	}
	for i := 0; i < 10; i++ {
		sm.RecordEvent("test-slo", false, 100*time.Millisecond)
	}

	status := sm.GetSLOStatus("test-slo")

	if status.Compliant {
		t.Error("Expected SLO to be non-compliant (90% < 99%)")
	}
}

func TestSLOManager_GetSLOStatus_NoEvents(t *testing.T) {
	sm := NewSLOManager()
	sm.RegisterSLO("test-slo", "Test", 99.9, 1*time.Hour)

	status := sm.GetSLOStatus("test-slo")

	if status.Current != 100.0 {
		t.Errorf("Expected current 100%% with no events, got %f", status.Current)
	}

	if !status.Compliant {
		t.Error("Expected compliant with no events")
	}

	if status.TotalEvents != 0 {
		t.Errorf("Expected 0 total events, got %d", status.TotalEvents)
	}
}

func TestSLOManager_GetSLOStatus_NotFound(t *testing.T) {
	sm := NewSLOManager()

	status := sm.GetSLOStatus("non-existent")

	if status != nil {
		t.Error("Expected nil status for non-existent SLO")
	}
}

func TestSLOManager_GetAllSLOStatuses(t *testing.T) {
	sm := NewSLOManager()

	sm.RegisterSLO("slo1", "SLO 1", 99.9, 1*time.Hour)
	sm.RegisterSLO("slo2", "SLO 2", 99.0, 1*time.Hour)
	sm.RegisterSLO("slo3", "SLO 3", 95.0, 1*time.Hour)

	statuses := sm.GetAllSLOStatuses()

	if len(statuses) != 3 {
		t.Errorf("Expected 3 SLO statuses, got %d", len(statuses))
	}

	if statuses["slo1"] == nil {
		t.Error("Expected slo1 to be in statuses")
	}
}

func TestSLOManager_EventWindowCleanup(t *testing.T) {
	sm := NewSLOManager()
	sm.RegisterSLO("test-slo", "Test", 99.0, 100*time.Millisecond)

	// Record events
	sm.RecordEvent("test-slo", true, 10*time.Millisecond)
	sm.RecordEvent("test-slo", true, 10*time.Millisecond)

	// Check initial count
	status := sm.GetSLOStatus("test-slo")
	if status.TotalEvents != 2 {
		t.Errorf("Expected 2 events initially, got %d", status.TotalEvents)
	}

	// Wait for window to expire
	time.Sleep(150 * time.Millisecond)

	// Record new event (should trigger cleanup)
	sm.RecordEvent("test-slo", true, 10*time.Millisecond)

	// Old events should be cleaned up
	status = sm.GetSLOStatus("test-slo")
	if status.TotalEvents != 1 {
		t.Errorf("Expected 1 event after cleanup, got %d", status.TotalEvents)
	}
}

func TestSLOManager_AverageDuration(t *testing.T) {
	sm := NewSLOManager()
	sm.RegisterSLO("test-slo", "Test", 99.0, 1*time.Hour)

	sm.RecordEvent("test-slo", true, 100*time.Millisecond)
	sm.RecordEvent("test-slo", true, 200*time.Millisecond)
	sm.RecordEvent("test-slo", true, 300*time.Millisecond)

	status := sm.GetSLOStatus("test-slo")

	expected := 200 * time.Millisecond
	if status.AverageDuration != expected {
		t.Errorf("Expected average duration %v, got %v", expected, status.AverageDuration)
	}
}

func TestNewAlertManager(t *testing.T) {
	am := NewAlertManager()

	if am == nil {
		t.Fatal("Expected non-nil alert manager")
	}

	if am.alerts == nil {
		t.Error("Expected alerts map to be initialized")
	}
}

func TestAlertManager_RegisterAlert(t *testing.T) {
	am := NewAlertManager()

	am.RegisterAlert("test-alert", "Test Alert", 50.0, "above")

	alert := am.GetAlertStatus("test-alert")
	if alert == nil {
		t.Fatal("Expected alert to be registered")
	}

	if alert.Name != "test-alert" {
		t.Errorf("Expected name 'test-alert', got '%s'", alert.Name)
	}

	if alert.Threshold != 50.0 {
		t.Errorf("Expected threshold 50.0, got %f", alert.Threshold)
	}

	if alert.Condition != "above" {
		t.Errorf("Expected condition 'above', got '%s'", alert.Condition)
	}
}

func TestAlertManager_CheckAlert_Above(t *testing.T) {
	am := NewAlertManager()
	am.RegisterAlert("test-alert", "Test", 50.0, "above")

	// Value below threshold - should not trigger
	triggered := am.CheckAlert("test-alert", 40.0)
	if triggered {
		t.Error("Alert should not trigger when value is below threshold")
	}

	// Value above threshold - should trigger
	triggered = am.CheckAlert("test-alert", 60.0)
	if !triggered {
		t.Error("Alert should trigger when value is above threshold")
	}

	// Second time above threshold - should not trigger again
	triggered = am.CheckAlert("test-alert", 70.0)
	if triggered {
		t.Error("Alert should not trigger twice in a row")
	}
}

func TestAlertManager_CheckAlert_Below(t *testing.T) {
	am := NewAlertManager()
	am.RegisterAlert("test-alert", "Test", 50.0, "below")

	// Value above threshold - should not trigger
	triggered := am.CheckAlert("test-alert", 60.0)
	if triggered {
		t.Error("Alert should not trigger when value is above threshold")
	}

	// Value below threshold - should trigger
	triggered = am.CheckAlert("test-alert", 40.0)
	if !triggered {
		t.Error("Alert should trigger when value is below threshold")
	}
}

func TestAlertManager_GetAlertStatus(t *testing.T) {
	am := NewAlertManager()
	am.RegisterAlert("test-alert", "Test", 50.0, "above")

	alert := am.GetAlertStatus("test-alert")

	if alert == nil {
		t.Fatal("Expected alert status")
	}

	if alert.Triggered {
		t.Error("Expected alert to not be triggered initially")
	}
}

func TestAlertManager_GetAlertStatus_NotFound(t *testing.T) {
	am := NewAlertManager()

	alert := am.GetAlertStatus("non-existent")

	if alert != nil {
		t.Error("Expected nil for non-existent alert")
	}
}

func TestAlertManager_GetAllAlerts(t *testing.T) {
	am := NewAlertManager()

	am.RegisterAlert("alert1", "Alert 1", 50.0, "above")
	am.RegisterAlert("alert2", "Alert 2", 30.0, "below")
	am.RegisterAlert("alert3", "Alert 3", 80.0, "above")

	alerts := am.GetAllAlerts()

	if len(alerts) != 3 {
		t.Errorf("Expected 3 alerts, got %d", len(alerts))
	}

	if alerts["alert1"] == nil {
		t.Error("Expected alert1 to be in alerts")
	}
}

func TestAlertManager_AlertToggle(t *testing.T) {
	am := NewAlertManager()
	am.RegisterAlert("test-alert", "Test", 50.0, "above")

	// Trigger alert
	am.CheckAlert("test-alert", 60.0)
	alert := am.GetAlertStatus("test-alert")
	if !alert.Triggered {
		t.Error("Expected alert to be triggered")
	}

	// Go back below threshold
	am.CheckAlert("test-alert", 40.0)
	alert = am.GetAlertStatus("test-alert")
	if alert.Triggered {
		t.Error("Expected alert to not be triggered")
	}

	// Trigger again
	triggered := am.CheckAlert("test-alert", 70.0)
	if !triggered {
		t.Error("Alert should trigger again after being reset")
	}
}
