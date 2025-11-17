package resilience

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestNewCircuitBreaker(t *testing.T) {
	cb := NewCircuitBreaker(5, 10*time.Second, 3)

	if cb == nil {
		t.Fatal("Expected non-nil circuit breaker")
	}

	if cb.maxFailures != 5 {
		t.Errorf("Expected maxFailures 5, got %d", cb.maxFailures)
	}

	if cb.state != StateClosed {
		t.Errorf("Expected initial state Closed, got %s", cb.state)
	}
}

func TestCircuitBreaker_Execute_Success(t *testing.T) {
	cb := NewCircuitBreaker(3, 10*time.Second, 2)

	err := cb.Execute(func() error {
		return nil
	})

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if cb.State() != StateClosed {
		t.Errorf("Expected state Closed after success, got %s", cb.State())
	}
}

func TestCircuitBreaker_Execute_Failure(t *testing.T) {
	cb := NewCircuitBreaker(3, 10*time.Second, 2)

	testErr := errors.New("test error")

	err := cb.Execute(func() error {
		return testErr
	})

	if err != testErr {
		t.Errorf("Expected error %v, got %v", testErr, err)
	}

	if cb.failures != 1 {
		t.Errorf("Expected failures count 1, got %d", cb.failures)
	}
}

func TestCircuitBreaker_OpenState(t *testing.T) {
	cb := NewCircuitBreaker(2, 5*time.Second, 1)

	testErr := errors.New("test error")

	// Trigger failures to open the circuit
	cb.Execute(func() error { return testErr })
	cb.Execute(func() error { return testErr })

	if cb.State() != StateOpen {
		t.Errorf("Expected state Open after max failures, got %s", cb.State())
	}

	// Next execution should fail immediately
	err := cb.Execute(func() error { return nil })
	if err != ErrCircuitOpen {
		t.Errorf("Expected ErrCircuitOpen, got %v", err)
	}
}

func TestCircuitBreaker_HalfOpen(t *testing.T) {
	cb := NewCircuitBreaker(1, 500*time.Millisecond, 2)

	// Open the circuit
	cb.Execute(func() error { return errors.New("error") })

	if cb.State() != StateOpen {
		t.Fatal("Circuit should be open")
	}

	// Wait for reset timeout
	time.Sleep(600 * time.Millisecond)

	// Next execution should transition to half-open
	cb.Execute(func() error { return nil })

	if cb.State() != StateHalfOpen {
		t.Errorf("Expected state HalfOpen, got %s", cb.State())
	}
}

func TestCircuitBreaker_HalfOpenToClose(t *testing.T) {
	cb := NewCircuitBreaker(1, 500*time.Millisecond, 2)

	// Open the circuit
	cb.Execute(func() error { return errors.New("error") })

	// Wait for reset
	time.Sleep(600 * time.Millisecond)

	// Succeed in half-open state (2 times to close)
	cb.Execute(func() error { return nil })
	cb.Execute(func() error { return nil })

	if cb.State() != StateClosed {
		t.Errorf("Expected state Closed after successful half-open, got %s", cb.State())
	}
}

func TestCircuitBreaker_HalfOpenToOpen(t *testing.T) {
	cb := NewCircuitBreaker(1, 500*time.Millisecond, 2)

	// Open the circuit
	cb.Execute(func() error { return errors.New("error") })

	// Wait for reset
	time.Sleep(600 * time.Millisecond)

	// Fail in half-open state
	cb.Execute(func() error { return errors.New("error again") })

	if cb.State() != StateOpen {
		t.Errorf("Expected state Open after half-open failure, got %s", cb.State())
	}
}

func TestCircuitBreaker_ExecuteWithTimeout(t *testing.T) {
	cb := NewCircuitBreaker(3, 10*time.Second, 2)
	ctx := context.Background()

	// Fast function should succeed
	err := cb.ExecuteWithTimeout(ctx, 1*time.Second, func() error {
		return nil
	})

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
}

func TestCircuitBreaker_ExecuteWithTimeout_Timeout(t *testing.T) {
	cb := NewCircuitBreaker(3, 10*time.Second, 2)
	ctx := context.Background()

	// Slow function should timeout
	err := cb.ExecuteWithTimeout(ctx, 100*time.Millisecond, func() error {
		time.Sleep(200 * time.Millisecond)
		return nil
	})

	if err != ErrTimeout {
		t.Errorf("Expected ErrTimeout, got %v", err)
	}
}

func TestCircuitBreaker_Metrics(t *testing.T) {
	cb := NewCircuitBreaker(3, 10*time.Second, 2)

	// Execute some functions
	cb.Execute(func() error { return nil })
	cb.Execute(func() error { return errors.New("error") })

	metrics := cb.Metrics()

	if metrics["state"] != "closed" {
		t.Errorf("Expected state 'closed', got %v", metrics["state"])
	}

	if metrics["failures"] != uint32(1) {
		t.Errorf("Expected failures 1, got %v", metrics["failures"])
	}
}

func TestNewRetry(t *testing.T) {
	retry := NewRetry(3, 100*time.Millisecond, 1*time.Second, 2.0)

	if retry == nil {
		t.Fatal("Expected non-nil retry")
	}

	if retry.maxAttempts != 3 {
		t.Errorf("Expected maxAttempts 3, got %d", retry.maxAttempts)
	}
}

func TestRetry_Execute_Success(t *testing.T) {
	retry := NewRetry(3, 100*time.Millisecond, 1*time.Second, 2.0)

	attempts := 0
	err := retry.Execute(func() error {
		attempts++
		if attempts < 2 {
			return errors.New("error")
		}
		return nil
	})

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if attempts != 2 {
		t.Errorf("Expected 2 attempts, got %d", attempts)
	}
}

func TestRetry_Execute_AllFailed(t *testing.T) {
	retry := NewRetry(3, 10*time.Millisecond, 100*time.Millisecond, 2.0)

	attempts := 0
	testErr := errors.New("persistent error")

	err := retry.Execute(func() error {
		attempts++
		return testErr
	})

	if err != testErr {
		t.Errorf("Expected error %v, got %v", testErr, err)
	}

	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
}

func TestNewBulkhead(t *testing.T) {
	bulkhead := NewBulkhead(10)

	if bulkhead == nil {
		t.Fatal("Expected non-nil bulkhead")
	}

	if bulkhead.maxConcurrent != 10 {
		t.Errorf("Expected maxConcurrent 10, got %d", bulkhead.maxConcurrent)
	}
}

func TestBulkhead_Execute(t *testing.T) {
	bulkhead := NewBulkhead(2)

	executed := make(chan bool, 3)

	// Start 2 concurrent tasks (should succeed)
	for i := 0; i < 2; i++ {
		go bulkhead.Execute(func() error {
			time.Sleep(100 * time.Millisecond)
			executed <- true
			return nil
		})
	}

	// Allow time for tasks to start
	time.Sleep(10 * time.Millisecond)

	// Try third task (should be rejected)
	err := bulkhead.Execute(func() error {
		executed <- true
		return nil
	})

	if err != ErrTooManyRequests {
		t.Errorf("Expected ErrTooManyRequests, got %v", err)
	}

	// Wait for first two to complete
	<-executed
	<-executed

	// Now should be able to execute
	err = bulkhead.Execute(func() error {
		executed <- true
		return nil
	})

	if err != nil {
		t.Errorf("Expected no error after slots freed, got %v", err)
	}
}

func TestBulkhead_Available(t *testing.T) {
	bulkhead := NewBulkhead(5)

	if bulkhead.Available() != 5 {
		t.Errorf("Expected 5 available slots, got %d", bulkhead.Available())
	}

	done := make(chan bool)

	go bulkhead.Execute(func() error {
		time.Sleep(100 * time.Millisecond)
		done <- true
		return nil
	})

	time.Sleep(10 * time.Millisecond)

	if bulkhead.Available() != 4 {
		t.Errorf("Expected 4 available slots, got %d", bulkhead.Available())
	}

	<-done

	// Should return to 5 after completion
	time.Sleep(10 * time.Millisecond)
	if bulkhead.Available() != 5 {
		t.Errorf("Expected 5 available slots after completion, got %d", bulkhead.Available())
	}
}

func TestBulkhead_ExecuteWithTimeout(t *testing.T) {
	bulkhead := NewBulkhead(1)
	ctx := context.Background()

	err := bulkhead.ExecuteWithTimeout(ctx, 1*time.Second, func() error {
		return nil
	})

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
}

func TestBulkhead_ExecuteWithTimeout_Timeout(t *testing.T) {
	bulkhead := NewBulkhead(1)
	ctx := context.Background()

	// Fill the bulkhead
	go bulkhead.Execute(func() error {
		time.Sleep(500 * time.Millisecond)
		return nil
	})

	time.Sleep(10 * time.Millisecond)

	// Try to execute with short timeout
	err := bulkhead.ExecuteWithTimeout(ctx, 50*time.Millisecond, func() error {
		return nil
	})

	if err != ErrTooManyRequests {
		t.Errorf("Expected ErrTooManyRequests, got %v", err)
	}
}

func TestStateString(t *testing.T) {
	tests := []struct {
		state    State
		expected string
	}{
		{StateClosed, "closed"},
		{StateHalfOpen, "half-open"},
		{StateOpen, "open"},
	}

	for _, tt := range tests {
		result := tt.state.String()
		if result != tt.expected {
			t.Errorf("State.String() = %s, expected %s", result, tt.expected)
		}
	}
}
