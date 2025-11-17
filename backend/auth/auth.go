package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken      = errors.New("invalid token")
	ErrExpiredToken      = errors.New("token expired")
	ErrInvalidAPIKey     = errors.New("invalid API key")
	ErrRateLimitExceeded = errors.New("rate limit exceeded")
)

// Claims represents JWT claims
type Claims struct {
	UserID   string   `json:"user_id"`
	Username string   `json:"username"`
	Roles    []string `json:"roles"`
	jwt.RegisteredClaims
}

// APIKey represents an API key
type APIKey struct {
	ID           string
	Key          string
	HashedKey    string
	Name         string
	Roles        []string
	CreatedAt    time.Time
	ExpiresAt    *time.Time
	LastUsedAt   *time.Time
	RateLimit    int // requests per minute
	RequestCount int
	mu           sync.Mutex
}

// AuthManager manages authentication
type AuthManager struct {
	jwtSecret []byte
	apiKeys   map[string]*APIKey
	mu        sync.RWMutex
}

// NewAuthManager creates a new auth manager
func NewAuthManager(jwtSecret string) *AuthManager {
	return &AuthManager{
		jwtSecret: []byte(jwtSecret),
		apiKeys:   make(map[string]*APIKey),
	}
}

// GenerateJWT generates a new JWT token
func (am *AuthManager) GenerateJWT(userID, username string, roles []string, duration time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Username: username,
		Roles:    roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(duration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "telyx",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(am.jwtSecret)
}

// ValidateJWT validates a JWT token
func (am *AuthManager) ValidateJWT(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return am.jwtSecret, nil
	})

	if err != nil {
		// Check if it's an expiration error
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// GenerateAPIKey generates a new API key
func (am *AuthManager) GenerateAPIKey(name string, roles []string, rateLimit int, expiresIn *time.Duration) (*APIKey, error) {
	// Generate random key
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return nil, fmt.Errorf("failed to generate random key: %w", err)
	}

	key := "tlx_" + base64.URLEncoding.EncodeToString(keyBytes)

	// Hash the key for storage
	hash := sha256.Sum256([]byte(key))
	hashedKey := hex.EncodeToString(hash[:])

	var expiresAt *time.Time
	if expiresIn != nil {
		expiry := time.Now().Add(*expiresIn)
		expiresAt = &expiry
	}

	apiKey := &APIKey{
		ID:        generateID(),
		Key:       key,
		HashedKey: hashedKey,
		Name:      name,
		Roles:     roles,
		CreatedAt: time.Now(),
		ExpiresAt: expiresAt,
		RateLimit: rateLimit,
	}

	am.mu.Lock()
	am.apiKeys[hashedKey] = apiKey
	am.mu.Unlock()

	return apiKey, nil
}

// ValidateAPIKey validates an API key and checks rate limits
func (am *AuthManager) ValidateAPIKey(key string) (*APIKey, error) {
	// Hash the provided key
	hash := sha256.Sum256([]byte(key))
	hashedKey := hex.EncodeToString(hash[:])

	am.mu.RLock()
	apiKey, exists := am.apiKeys[hashedKey]
	am.mu.RUnlock()

	if !exists {
		return nil, ErrInvalidAPIKey
	}

	// Check expiration
	if apiKey.ExpiresAt != nil && apiKey.ExpiresAt.Before(time.Now()) {
		return nil, ErrInvalidAPIKey
	}

	// Check rate limit
	apiKey.mu.Lock()
	defer apiKey.mu.Unlock()

	// Reset counter every minute
	now := time.Now()
	if apiKey.LastUsedAt != nil && now.Sub(*apiKey.LastUsedAt) > time.Minute {
		apiKey.RequestCount = 0
	}

	if apiKey.RateLimit > 0 && apiKey.RequestCount >= apiKey.RateLimit {
		return nil, ErrRateLimitExceeded
	}

	apiKey.RequestCount++
	apiKey.LastUsedAt = &now

	return apiKey, nil
}

// RevokeAPIKey revokes an API key
func (am *AuthManager) RevokeAPIKey(keyID string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	for hashedKey, apiKey := range am.apiKeys {
		if apiKey.ID == keyID {
			delete(am.apiKeys, hashedKey)
			return nil
		}
	}

	return errors.New("API key not found")
}

// ListAPIKeys returns all API keys (without the actual key values)
func (am *AuthManager) ListAPIKeys() []*APIKey {
	am.mu.RLock()
	defer am.mu.RUnlock()

	keys := make([]*APIKey, 0, len(am.apiKeys))
	for _, apiKey := range am.apiKeys {
		// Create a copy without the actual key
		keyCopy := *apiKey
		keyCopy.Key = ""
		keys = append(keys, &keyCopy)
	}

	return keys
}

// HasRole checks if roles include a specific role
func HasRole(roles []string, requiredRole string) bool {
	for _, role := range roles {
		if role == requiredRole || role == "admin" {
			return true
		}
	}
	return false
}

// SecureCompare performs constant-time comparison of two strings
func SecureCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
