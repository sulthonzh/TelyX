package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"telyx-backend/auth"
	"telyx-backend/ratelimit"

	"golang.org/x/time/rate"
)

// AuthManager interface for authentication
type AuthManager interface {
	ValidateJWT(token string) (*auth.Claims, error)
	ValidateAPIKey(key string) (*auth.APIKey, error)
}

// contextKey is a custom type for context keys
type contextKey string

const (
	UserContextKey contextKey = "user"
	RolesContextKey contextKey = "roles"
)

// Authentication middleware
func Authentication(authMgr AuthManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Try API key first
			apiKey := r.Header.Get("X-API-Key")
			if apiKey != "" {
				key, err := authMgr.ValidateAPIKey(apiKey)
				if err != nil {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					json.NewEncoder(w).Encode(map[string]string{
						"error": "Invalid API key",
					})
					return
				}

				// Add user info to context
				ctx := context.WithValue(r.Context(), UserContextKey, key.Name)
				ctx = context.WithValue(ctx, RolesContextKey, key.Roles)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Try JWT token
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && parts[0] == "Bearer" {
					claims, err := authMgr.ValidateJWT(parts[1])
					if err != nil {
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusUnauthorized)
						json.NewEncoder(w).Encode(map[string]string{
							"error": "Invalid or expired token",
						})
						return
					}

					// Add user info to context
					ctx := context.WithValue(r.Context(), UserContextKey, claims.Username)
					ctx = context.WithValue(ctx, RolesContextKey, claims.Roles)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			// No valid authentication found
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Authentication required",
			})
		})
	}
}

// OptionalAuthentication middleware (doesn't require auth but adds context if present)
func OptionalAuthentication(authMgr AuthManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Try API key
			apiKey := r.Header.Get("X-API-Key")
			if apiKey != "" {
				if key, err := authMgr.ValidateAPIKey(apiKey); err == nil {
					ctx = context.WithValue(ctx, UserContextKey, key.Name)
					ctx = context.WithValue(ctx, RolesContextKey, key.Roles)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			// Try JWT
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && parts[0] == "Bearer" {
					if claims, err := authMgr.ValidateJWT(parts[1]); err == nil {
						ctx = context.WithValue(ctx, UserContextKey, claims.Username)
						ctx = context.WithValue(ctx, RolesContextKey, claims.Roles)
					}
				}
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole middleware checks if user has a specific role
func RequireRole(requiredRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			roles, ok := r.Context().Value(RolesContextKey).([]string)
			if !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Insufficient permissions",
				})
				return
			}

			if !auth.HasRole(roles, requiredRole) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Insufficient permissions",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RateLimit middleware
func RateLimit(limiter *ratelimit.Limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := ratelimit.GetVisitorKey(r)

			if !limiter.Allow(key) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-RateLimit-Limit", "100")
				w.Header().Set("X-RateLimit-Remaining", "0")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Rate limit exceeded",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// AdaptiveRateLimit middleware with different limits based on authentication
func AdaptiveRateLimit(limiter *ratelimit.AdaptiveRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := ratelimit.GetVisitorKey(r)

			// Check if user is authenticated
			roles, authenticated := r.Context().Value(RolesContextKey).([]string)

			var allowed bool
			if authenticated && auth.HasRole(roles, "admin") {
				// Higher limit for admins
				allowed = limiter.Allow(key, rate.Limit(1000), 2000)
			} else if authenticated {
				// Medium limit for authenticated users
				allowed = limiter.Allow(key, rate.Limit(100), 200)
			} else {
				// Lower limit for unauthenticated users
				allowed = limiter.Allow(key, rate.Limit(10), 20)
			}

			if !allowed {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Rate limit exceeded",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ContentSecurityPolicy middleware
func ContentSecurityPolicy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: https:; "+
				"font-src 'self'; "+
				"connect-src 'self'; "+
				"frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// RequestSizeLimit middleware limits request body size
func RequestSizeLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}
