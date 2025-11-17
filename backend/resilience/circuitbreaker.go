package resilience

import (
	"context"
	"errors"
	"sync"
	"time"
)

var (
	ErrCircuitOpen     = errors.New("circuit breaker is open")
	ErrTooManyRequests = errors.New("too many requests")
	ErrTimeout         = errors.New("operation timed out")
)

// State represents the circuit breaker state
type State int

const (
	StateClosed State = iota
	StateHalfOpen
	StateOpen
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateHalfOpen:
		return "half-open"
	case StateOpen:
		return "open"
	default:
		return "unknown"
	}
}

// CircuitBreaker implements the circuit breaker pattern
type CircuitBreaker struct {
	maxFailures  uint32
	resetTimeout time.Duration
	halfOpenMax  uint32

	mu           sync.RWMutex
	state        State
	failures     uint32
	successes    uint32
	lastFailTime time.Time
	lastStateChange time.Time
}

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(maxFailures uint32, resetTimeout time.Duration, halfOpenMax uint32) *CircuitBreaker {
	return &CircuitBreaker{
		maxFailures:  maxFailures,
		resetTimeout: resetTimeout,
		halfOpenMax:  halfOpenMax,
		state:        StateClosed,
		lastStateChange: time.Now(),
	}
}

// Execute executes a function with circuit breaker protection
func (cb *CircuitBreaker) Execute(fn func() error) error {
	if !cb.allowRequest() {
		return ErrCircuitOpen
	}

	err := fn()

	if err != nil {
		cb.recordFailure()
		return err
	}

	cb.recordSuccess()
	return nil
}

// ExecuteWithTimeout executes a function with timeout and circuit breaker
func (cb *CircuitBreaker) ExecuteWithTimeout(ctx context.Context, timeout time.Duration, fn func() error) error {
	if !cb.allowRequest() {
		return ErrCircuitOpen
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	errChan := make(chan error, 1)
	go func() {
		errChan <- fn()
	}()

	select {
	case err := <-errChan:
		if err != nil {
			cb.recordFailure()
			return err
		}
		cb.recordSuccess()
		return nil
	case <-ctx.Done():
		cb.recordFailure()
		return ErrTimeout
	}
}

func (cb *CircuitBreaker) allowRequest() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()

	switch cb.state {
	case StateClosed:
		return true
	case StateOpen:
		if now.Sub(cb.lastFailTime) > cb.resetTimeout {
			cb.state = StateHalfOpen
			cb.failures = 0
			cb.successes = 0
			cb.lastStateChange = now
			return true
		}
		return false
	case StateHalfOpen:
		return cb.successes < cb.halfOpenMax
	default:
		return false
	}
}

func (cb *CircuitBreaker) recordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()

	if cb.state == StateHalfOpen {
		cb.successes++
		if cb.successes >= cb.halfOpenMax {
			cb.state = StateClosed
			cb.failures = 0
			cb.lastStateChange = now
		}
	} else if cb.state == StateClosed {
		cb.failures = 0
	}
}

func (cb *CircuitBreaker) recordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()
	cb.failures++
	cb.lastFailTime = now

	if cb.state == StateHalfOpen {
		cb.state = StateOpen
		cb.lastStateChange = now
	} else if cb.failures >= cb.maxFailures {
		cb.state = StateOpen
		cb.lastStateChange = now
	}
}

// State returns the current state
func (cb *CircuitBreaker) State() State {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}

// Metrics returns circuit breaker metrics
func (cb *CircuitBreaker) Metrics() map[string]interface{} {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	return map[string]interface{}{
		"state":             cb.state.String(),
		"failures":          cb.failures,
		"successes":         cb.successes,
		"last_fail_time":    cb.lastFailTime,
		"last_state_change": cb.lastStateChange,
	}
}

// Retry implements retry with exponential backoff
type Retry struct {
	maxAttempts uint
	initialDelay time.Duration
	maxDelay     time.Duration
	multiplier   float64
}

// NewRetry creates a new retry policy
func NewRetry(maxAttempts uint, initialDelay, maxDelay time.Duration, multiplier float64) *Retry {
	return &Retry{
		maxAttempts:  maxAttempts,
		initialDelay: initialDelay,
		maxDelay:     maxDelay,
		multiplier:   multiplier,
	}
}

// Execute executes a function with retry logic
func (r *Retry) Execute(fn func() error) error {
	var err error
	delay := r.initialDelay

	for attempt := uint(0); attempt < r.maxAttempts; attempt++ {
		err = fn()
		if err == nil {
			return nil
		}

		if attempt < r.maxAttempts-1 {
			time.Sleep(delay)
			delay = time.Duration(float64(delay) * r.multiplier)
			if delay > r.maxDelay {
				delay = r.maxDelay
			}
		}
	}

	return err
}

// Bulkhead implements the bulkhead pattern
type Bulkhead struct {
	maxConcurrent int
	sem           chan struct{}
}

// NewBulkhead creates a new bulkhead
func NewBulkhead(maxConcurrent int) *Bulkhead {
	return &Bulkhead{
		maxConcurrent: maxConcurrent,
		sem:           make(chan struct{}, maxConcurrent),
	}
}

// Execute executes a function with bulkhead protection
func (b *Bulkhead) Execute(fn func() error) error {
	select {
	case b.sem <- struct{}{}:
		defer func() { <-b.sem }()
		return fn()
	default:
		return ErrTooManyRequests
	}
}

// ExecuteWithTimeout executes a function with timeout and bulkhead
func (b *Bulkhead) ExecuteWithTimeout(ctx context.Context, timeout time.Duration, fn func() error) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	select {
	case b.sem <- struct{}{}:
		defer func() { <-b.sem }()

		errChan := make(chan error, 1)
		go func() {
			errChan <- fn()
		}()

		select {
		case err := <-errChan:
			return err
		case <-ctx.Done():
			return ErrTimeout
		}
	case <-ctx.Done():
		return ErrTooManyRequests
	}
}

// Available returns the number of available slots
func (b *Bulkhead) Available() int {
	return b.maxConcurrent - len(b.sem)
}
