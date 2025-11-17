package auth

import (
	"testing"
	"time"
)

func TestNewAuthManager(t *testing.T) {
	secret := "test-secret-key-12345"
	am := NewAuthManager(secret)

	if am == nil {
		t.Fatal("Expected non-nil auth manager")
	}

	if string(am.jwtSecret) != secret {
		t.Errorf("Expected secret %s, got %s", secret, string(am.jwtSecret))
	}
}

func TestGenerateJWT(t *testing.T) {
	am := NewAuthManager("test-secret")

	token, err := am.GenerateJWT("user123", "testuser", []string{"user"}, 1*time.Hour)
	if err != nil {
		t.Fatalf("Failed to generate JWT: %v", err)
	}

	if token == "" {
		t.Error("Expected non-empty token")
	}
}

func TestValidateJWT(t *testing.T) {
	am := NewAuthManager("test-secret")

	// Generate a valid token
	token, err := am.GenerateJWT("user123", "testuser", []string{"user"}, 1*time.Hour)
	if err != nil {
		t.Fatalf("Failed to generate JWT: %v", err)
	}

	// Validate the token
	claims, err := am.ValidateJWT(token)
	if err != nil {
		t.Fatalf("Failed to validate JWT: %v", err)
	}

	if claims.UserID != "user123" {
		t.Errorf("Expected UserID 'user123', got '%s'", claims.UserID)
	}

	if claims.Username != "testuser" {
		t.Errorf("Expected Username 'testuser', got '%s'", claims.Username)
	}

	if len(claims.Roles) != 1 || claims.Roles[0] != "user" {
		t.Errorf("Expected roles ['user'], got %v", claims.Roles)
	}
}

func TestValidateJWT_InvalidToken(t *testing.T) {
	am := NewAuthManager("test-secret")

	_, err := am.ValidateJWT("invalid.token.here")
	if err != ErrInvalidToken {
		t.Errorf("Expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateJWT_ExpiredToken(t *testing.T) {
	am := NewAuthManager("test-secret")

	// Generate token that expires immediately
	token, err := am.GenerateJWT("user123", "testuser", []string{"user"}, -1*time.Hour)
	if err != nil {
		t.Fatalf("Failed to generate JWT: %v", err)
	}

	_, err = am.ValidateJWT(token)
	if err != ErrExpiredToken {
		t.Errorf("Expected ErrExpiredToken, got %v", err)
	}
}

func TestGenerateAPIKey(t *testing.T) {
	am := NewAuthManager("test-secret")

	key, err := am.GenerateAPIKey("test-key", []string{"user"}, 100, nil)
	if err != nil {
		t.Fatalf("Failed to generate API key: %v", err)
	}

	if key.Key == "" {
		t.Error("Expected non-empty key")
	}

	if !containsString(key.Key, "tlx_") {
		t.Error("Expected key to start with 'tlx_'")
	}

	if key.Name != "test-key" {
		t.Errorf("Expected name 'test-key', got '%s'", key.Name)
	}

	if key.RateLimit != 100 {
		t.Errorf("Expected rate limit 100, got %d", key.RateLimit)
	}
}

func TestValidateAPIKey(t *testing.T) {
	am := NewAuthManager("test-secret")

	// Generate a key
	key, err := am.GenerateAPIKey("test-key", []string{"user"}, 100, nil)
	if err != nil {
		t.Fatalf("Failed to generate API key: %v", err)
	}

	// Validate it
	validatedKey, err := am.ValidateAPIKey(key.Key)
	if err != nil {
		t.Fatalf("Failed to validate API key: %v", err)
	}

	if validatedKey.Name != "test-key" {
		t.Errorf("Expected name 'test-key', got '%s'", validatedKey.Name)
	}
}

func TestValidateAPIKey_Invalid(t *testing.T) {
	am := NewAuthManager("test-secret")

	_, err := am.ValidateAPIKey("invalid-key")
	if err != ErrInvalidAPIKey {
		t.Errorf("Expected ErrInvalidAPIKey, got %v", err)
	}
}

func TestValidateAPIKey_RateLimit(t *testing.T) {
	am := NewAuthManager("test-secret")

	key, err := am.GenerateAPIKey("test-key", []string{"user"}, 2, nil)
	if err != nil {
		t.Fatalf("Failed to generate API key: %v", err)
	}

	// Use the key twice (should succeed)
	for i := 0; i < 2; i++ {
		_, err := am.ValidateAPIKey(key.Key)
		if err != nil {
			t.Fatalf("Request %d failed: %v", i+1, err)
		}
	}

	// Third request should be rate limited
	_, err = am.ValidateAPIKey(key.Key)
	if err != ErrRateLimitExceeded {
		t.Errorf("Expected ErrRateLimitExceeded, got %v", err)
	}
}

func TestRevokeAPIKey(t *testing.T) {
	am := NewAuthManager("test-secret")

	key, err := am.GenerateAPIKey("test-key", []string{"user"}, 100, nil)
	if err != nil {
		t.Fatalf("Failed to generate API key: %v", err)
	}

	// Revoke the key
	err = am.RevokeAPIKey(key.ID)
	if err != nil {
		t.Fatalf("Failed to revoke API key: %v", err)
	}

	// Try to validate (should fail)
	_, err = am.ValidateAPIKey(key.Key)
	if err != ErrInvalidAPIKey {
		t.Errorf("Expected ErrInvalidAPIKey after revocation, got %v", err)
	}
}

func TestListAPIKeys(t *testing.T) {
	am := NewAuthManager("test-secret")

	// Generate multiple keys
	for i := 0; i < 3; i++ {
		_, err := am.GenerateAPIKey("test-key", []string{"user"}, 100, nil)
		if err != nil {
			t.Fatalf("Failed to generate API key %d: %v", i, err)
		}
	}

	keys := am.ListAPIKeys()
	if len(keys) != 3 {
		t.Errorf("Expected 3 keys, got %d", len(keys))
	}

	// Check that actual key values are not exposed
	for _, key := range keys {
		if key.Key != "" {
			t.Error("Expected Key field to be empty in list")
		}
	}
}

func TestHasRole(t *testing.T) {
	tests := []struct {
		name         string
		roles        []string
		requiredRole string
		expected     bool
	}{
		{"has exact role", []string{"user", "editor"}, "user", true},
		{"has admin (superuser)", []string{"admin"}, "user", true},
		{"does not have role", []string{"user"}, "admin", false},
		{"empty roles", []string{}, "user", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := HasRole(tt.roles, tt.requiredRole)
			if result != tt.expected {
				t.Errorf("HasRole(%v, %s) = %v, expected %v", tt.roles, tt.requiredRole, result, tt.expected)
			}
		})
	}
}

func TestSecureCompare(t *testing.T) {
	tests := []struct {
		a        string
		b        string
		expected bool
	}{
		{"same", "same", true},
		{"different", "values", false},
		{"", "", true},
	}

	for _, tt := range tests {
		result := SecureCompare(tt.a, tt.b)
		if result != tt.expected {
			t.Errorf("SecureCompare(%s, %s) = %v, expected %v", tt.a, tt.b, result, tt.expected)
		}
	}
}

func TestAPIKeyExpiration(t *testing.T) {
	am := NewAuthManager("test-secret")

	// Create key that expires in 1 second
	expiry := 1 * time.Second
	key, err := am.GenerateAPIKey("test-key", []string{"user"}, 100, &expiry)
	if err != nil {
		t.Fatalf("Failed to generate API key: %v", err)
	}

	// Should be valid initially
	_, err = am.ValidateAPIKey(key.Key)
	if err != nil {
		t.Fatalf("Key should be valid initially: %v", err)
	}

	// Wait for expiration
	time.Sleep(2 * time.Second)

	// Should be invalid now
	_, err = am.ValidateAPIKey(key.Key)
	if err != ErrInvalidAPIKey {
		t.Errorf("Expected ErrInvalidAPIKey after expiration, got %v", err)
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && s[:len(substr)] == substr
}
