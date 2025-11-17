package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"telyx-backend/auth"
)

type mockAuthManager struct {
	jwtValid    bool
	apiKeyValid bool
	claims      *auth.Claims
	apiKey      *auth.APIKey
}

func (m *mockAuthManager) ValidateJWT(token string) (*auth.Claims, error) {
	if m.jwtValid {
		return m.claims, nil
	}
	return nil, auth.ErrInvalidToken
}

func (m *mockAuthManager) ValidateAPIKey(key string) (*auth.APIKey, error) {
	if m.apiKeyValid {
		return m.apiKey, nil
	}
	return nil, auth.ErrInvalidAPIKey
}

func TestAuthentication_ValidAPIKey(t *testing.T) {
	mockAuth := &mockAuthManager{
		apiKeyValid: true,
		apiKey: &auth.APIKey{
			Name:  "test-user",
			Roles: []string{"user"},
		},
	}

	middleware := Authentication(mockAuth)
	called := false

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true

		user := r.Context().Value(UserContextKey)
		if user != "test-user" {
			t.Errorf("Expected user 'test-user', got %v", user)
		}

		roles := r.Context().Value(RolesContextKey).([]string)
		if len(roles) != 1 || roles[0] != "user" {
			t.Errorf("Expected roles ['user'], got %v", roles)
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "test-key")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !called {
		t.Error("Handler was not called")
	}

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

func TestAuthentication_ValidJWT(t *testing.T) {
	mockAuth := &mockAuthManager{
		jwtValid: true,
		claims: &auth.Claims{
			UserID:   "user123",
			Username: "testuser",
			Roles:    []string{"admin"},
		},
	}

	middleware := Authentication(mockAuth)
	called := false

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true

		user := r.Context().Value(UserContextKey)
		if user != "testuser" {
			t.Errorf("Expected user 'testuser', got %v", user)
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !called {
		t.Error("Handler was not called")
	}

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

func TestAuthentication_NoAuth(t *testing.T) {
	mockAuth := &mockAuthManager{}

	middleware := Authentication(mockAuth)
	called := false

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if called {
		t.Error("Handler should not be called without auth")
	}

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}

func TestAuthentication_InvalidAPIKey(t *testing.T) {
	mockAuth := &mockAuthManager{
		apiKeyValid: false,
	}

	middleware := Authentication(mockAuth)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called with invalid API key")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "invalid-key")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}

func TestOptionalAuthentication_WithValidAuth(t *testing.T) {
	mockAuth := &mockAuthManager{
		apiKeyValid: true,
		apiKey: &auth.APIKey{
			Name:  "test-user",
			Roles: []string{"user"},
		},
	}

	middleware := OptionalAuthentication(mockAuth)
	called := false

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true

		user := r.Context().Value(UserContextKey)
		if user != "test-user" {
			t.Errorf("Expected user 'test-user', got %v", user)
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "test-key")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !called {
		t.Error("Handler was not called")
	}
}

func TestOptionalAuthentication_WithoutAuth(t *testing.T) {
	mockAuth := &mockAuthManager{}

	middleware := OptionalAuthentication(mockAuth)
	called := false

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true

		user := r.Context().Value(UserContextKey)
		if user != nil {
			t.Errorf("Expected nil user, got %v", user)
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if !called {
		t.Error("Handler should be called even without auth")
	}

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

func TestRequireRole_HasRole(t *testing.T) {
	middleware := RequireRole("admin")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	ctx := req.Context()
	ctx = NewContextWithValue(ctx, RolesContextKey, []string{"admin", "user"})
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

func TestRequireRole_NoRole(t *testing.T) {
	middleware := RequireRole("admin")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called without required role")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	ctx := req.Context()
	ctx = NewContextWithValue(ctx, RolesContextKey, []string{"user"})
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", w.Code)
	}
}

func TestRequireRole_NoRolesInContext(t *testing.T) {
	middleware := RequireRole("admin")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called without roles in context")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", w.Code)
	}
}

func TestContentSecurityPolicy(t *testing.T) {
	handler := ContentSecurityPolicy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	csp := w.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Error("Expected Content-Security-Policy header to be set")
	}

	if !containsStr(csp, "default-src 'self'") {
		t.Error("Expected CSP to contain default-src 'self'")
	}
}

func TestRequestSizeLimit(t *testing.T) {
	maxBytes := int64(10)
	middleware := RequestSizeLimit(maxBytes)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to read more than limit
		buf := make([]byte, 20)
		_, err := r.Body.Read(buf)
		if err == nil {
			t.Error("Expected error when reading beyond limit")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)
}

// Helper function to create context with value
func NewContextWithValue(ctx context.Context, key, value interface{}) context.Context {
	return context.WithValue(ctx, key, value)
}

func containsStr(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0)
}
