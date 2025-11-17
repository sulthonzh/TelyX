package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

func TestNewLimiter(t *testing.T) {
	limiter := NewLimiter(rate.Limit(10), 20, time.Minute)

	if limiter == nil {
		t.Fatal("Expected non-nil limiter")
	}

	if limiter.r != rate.Limit(10) {
		t.Errorf("Expected rate 10, got %v", limiter.r)
	}

	if limiter.b != 20 {
		t.Errorf("Expected burst 20, got %d", limiter.b)
	}
}

func TestLimiter_Allow(t *testing.T) {
	limiter := NewLimiter(rate.Limit(2), 2, time.Minute)

	key := "test-key"

	// First two requests should be allowed
	if !limiter.Allow(key) {
		t.Error("First request should be allowed")
	}

	if !limiter.Allow(key) {
		t.Error("Second request should be allowed")
	}

	// Third request should be rate limited (burst exhausted)
	if limiter.Allow(key) {
		t.Error("Third request should be rate limited")
	}

	// Wait for token refill
	time.Sleep(600 * time.Millisecond)

	// Should be allowed again
	if !limiter.Allow(key) {
		t.Error("Request after waiting should be allowed")
	}
}

func TestLimiter_DifferentKeys(t *testing.T) {
	limiter := NewLimiter(rate.Limit(1), 1, time.Minute)

	// Different keys should have independent limits
	if !limiter.Allow("key1") {
		t.Error("First key should be allowed")
	}

	if !limiter.Allow("key2") {
		t.Error("Second key should be allowed")
	}

	// Both keys should be rate limited now
	if limiter.Allow("key1") {
		t.Error("First key should be rate limited")
	}

	if limiter.Allow("key2") {
		t.Error("Second key should be rate limited")
	}
}

func TestGetVisitorKey(t *testing.T) {
	tests := []struct {
		name      string
		setupReq  func(*http.Request)
		expectKey string
	}{
		{
			name: "with API key",
			setupReq: func(r *http.Request) {
				r.Header.Set("X-API-Key", "test-key-123")
			},
			expectKey: "api:test-key-123",
		},
		{
			name: "with X-Forwarded-For",
			setupReq: func(r *http.Request) {
				r.Header.Set("X-Forwarded-For", "1.2.3.4")
			},
			expectKey: "ip:1.2.3.4",
		},
		{
			name: "with X-Real-IP",
			setupReq: func(r *http.Request) {
				r.Header.Set("X-Real-IP", "5.6.7.8")
			},
			expectKey: "ip:5.6.7.8",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			tt.setupReq(req)

			key := GetVisitorKey(req)
			if key != tt.expectKey {
				t.Errorf("Expected key %s, got %s", tt.expectKey, key)
			}
		})
	}
}

func TestNewAdaptiveRateLimiter(t *testing.T) {
	arl := NewAdaptiveRateLimiter()

	if arl == nil {
		t.Fatal("Expected non-nil adaptive rate limiter")
	}

	if arl.limiters == nil {
		t.Error("Expected limiters map to be initialized")
	}
}

func TestAdaptiveRateLimiter_SetLimit(t *testing.T) {
	arl := NewAdaptiveRateLimiter()

	arl.SetLimit("test-key", rate.Limit(5), 10)

	// Verify custom limit is set
	if !arl.Allow("test-key", rate.Limit(1), 1) {
		t.Error("Request should be allowed with custom limit")
	}
}

func TestAdaptiveRateLimiter_Allow(t *testing.T) {
	arl := NewAdaptiveRateLimiter()

	key := "test-key"
	defaultLimit := rate.Limit(2)
	defaultBurst := 2

	// First two requests should be allowed
	if !arl.Allow(key, defaultLimit, defaultBurst) {
		t.Error("First request should be allowed")
	}

	if !arl.Allow(key, defaultLimit, defaultBurst) {
		t.Error("Second request should be allowed")
	}

	// Third should be limited
	if arl.Allow(key, defaultLimit, defaultBurst) {
		t.Error("Third request should be rate limited")
	}
}

func TestNewTokenBucket(t *testing.T) {
	tb := NewTokenBucket(10, 5)

	if tb == nil {
		t.Fatal("Expected non-nil token bucket")
	}

	if tb.capacity != 10 {
		t.Errorf("Expected capacity 10, got %d", tb.capacity)
	}

	if tb.tokens != 10 {
		t.Errorf("Expected initial tokens 10, got %d", tb.tokens)
	}

	if tb.refillRate != 5 {
		t.Errorf("Expected refill rate 5, got %d", tb.refillRate)
	}
}

func TestTokenBucket_Take(t *testing.T) {
	tb := NewTokenBucket(5, 2)

	// Should be able to take 5 tokens initially
	for i := 0; i < 5; i++ {
		if !tb.Take(1) {
			t.Errorf("Should be able to take token %d", i+1)
		}
	}

	// Bucket is empty, should fail
	if tb.Take(1) {
		t.Error("Should not be able to take token when bucket is empty")
	}

	// Wait for refill (2 tokens per second)
	time.Sleep(1100 * time.Millisecond)

	// Should have refilled approximately 2 tokens
	if !tb.Take(1) {
		t.Error("Should be able to take token after refill")
	}
}

func TestTokenBucket_TakeMultiple(t *testing.T) {
	tb := NewTokenBucket(10, 1)

	// Take 5 tokens at once
	if !tb.Take(5) {
		t.Error("Should be able to take 5 tokens")
	}

	// Should have 5 left
	if !tb.Take(5) {
		t.Error("Should be able to take remaining 5 tokens")
	}

	// Bucket is empty
	if tb.Take(1) {
		t.Error("Should not be able to take when empty")
	}
}

func TestTokenBucket_Refill(t *testing.T) {
	tb := NewTokenBucket(10, 5)

	// Drain the bucket
	tb.Take(10)

	// Wait for refill
	time.Sleep(1100 * time.Millisecond)

	// Should have approximately 5 tokens
	if !tb.Take(4) {
		t.Error("Should have refilled tokens")
	}
}

func TestTokenBucket_MaxCapacity(t *testing.T) {
	tb := NewTokenBucket(5, 10)

	// Wait for refill (should not exceed capacity)
	time.Sleep(2 * time.Second)

	// Should only be able to take capacity amount
	if !tb.Take(5) {
		t.Error("Should be able to take up to capacity")
	}

	// Should not have more than capacity
	if tb.Take(1) {
		t.Error("Should not have tokens beyond capacity")
	}
}
