package ratelimit

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Limiter represents a rate limiter
type Limiter struct {
	visitors map[string]*rate.Limiter
	mu       sync.RWMutex
	r        rate.Limit
	b        int
	cleanup  time.Duration
}

// NewLimiter creates a new rate limiter
// r is the number of requests per second
// b is the burst size
func NewLimiter(r rate.Limit, b int, cleanup time.Duration) *Limiter {
	l := &Limiter{
		visitors: make(map[string]*rate.Limiter),
		r:        r,
		b:        b,
		cleanup:  cleanup,
	}

	go l.cleanupVisitors()

	return l
}

// GetLimiter returns a rate limiter for the given key
func (l *Limiter) GetLimiter(key string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	limiter, exists := l.visitors[key]
	if !exists {
		limiter = rate.NewLimiter(l.r, l.b)
		l.visitors[key] = limiter
	}

	return limiter
}

// Allow checks if a request is allowed
func (l *Limiter) Allow(key string) bool {
	return l.GetLimiter(key).Allow()
}

// cleanupVisitors removes old entries
func (l *Limiter) cleanupVisitors() {
	ticker := time.NewTicker(l.cleanup)
	defer ticker.Stop()

	for range ticker.C {
		l.mu.Lock()
		for key, limiter := range l.visitors {
			// Remove limiters that haven't been used recently
			if limiter.Tokens() == float64(l.b) {
				delete(l.visitors, key)
			}
		}
		l.mu.Unlock()
	}
}

// GetVisitorKey extracts a key from the request (IP or API key)
func GetVisitorKey(r *http.Request) string {
	// Try to get API key first
	apiKey := r.Header.Get("X-API-Key")
	if apiKey != "" {
		return "api:" + apiKey
	}

	// Fall back to IP address
	ip := r.Header.Get("X-Forwarded-For")
	if ip == "" {
		ip = r.Header.Get("X-Real-IP")
	}
	if ip == "" {
		ip = r.RemoteAddr
	}

	return "ip:" + ip
}

// AdaptiveRateLimiter implements adaptive rate limiting
type AdaptiveRateLimiter struct {
	limiters map[string]*Limiter
	mu       sync.RWMutex
}

// NewAdaptiveRateLimiter creates a new adaptive rate limiter
func NewAdaptiveRateLimiter() *AdaptiveRateLimiter {
	return &AdaptiveRateLimiter{
		limiters: make(map[string]*Limiter),
	}
}

// SetLimit sets a custom limit for a specific key
func (arl *AdaptiveRateLimiter) SetLimit(key string, r rate.Limit, b int) {
	arl.mu.Lock()
	defer arl.mu.Unlock()

	arl.limiters[key] = NewLimiter(r, b, time.Minute)
}

// Allow checks if a request is allowed with adaptive limits
func (arl *AdaptiveRateLimiter) Allow(key string, defaultLimit rate.Limit, defaultBurst int) bool {
	arl.mu.RLock()
	limiter, exists := arl.limiters[key]
	arl.mu.RUnlock()

	if !exists {
		// Use default limiter
		limiter = NewLimiter(defaultLimit, defaultBurst, time.Minute)
	}

	return limiter.Allow(key)
}

// TokenBucket implements a simple token bucket
type TokenBucket struct {
	capacity  int
	tokens    int
	refillRate int
	lastRefill time.Time
	mu        sync.Mutex
}

// NewTokenBucket creates a new token bucket
func NewTokenBucket(capacity, refillRate int) *TokenBucket {
	return &TokenBucket{
		capacity:   capacity,
		tokens:     capacity,
		refillRate: refillRate,
		lastRefill: time.Now(),
	}
}

// Take attempts to take n tokens from the bucket
func (tb *TokenBucket) Take(n int) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	// Refill tokens
	now := time.Now()
	elapsed := now.Sub(tb.lastRefill)
	tokensToAdd := int(elapsed.Seconds()) * tb.refillRate

	if tokensToAdd > 0 {
		tb.tokens = min(tb.capacity, tb.tokens+tokensToAdd)
		tb.lastRefill = now
	}

	// Check if we have enough tokens
	if tb.tokens >= n {
		tb.tokens -= n
		return true
	}

	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
