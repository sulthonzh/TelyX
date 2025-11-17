package validation

import (
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"unicode"
)

var (
	ErrInvalidEmail        = errors.New("invalid email address")
	ErrInvalidURL          = errors.New("invalid URL")
	ErrInvalidIP           = errors.New("invalid IP address")
	ErrStringTooShort      = errors.New("string too short")
	ErrStringTooLong       = errors.New("string too long")
	ErrInvalidFormat       = errors.New("invalid format")
	ErrContainsSQLKeywords = errors.New("potentially dangerous SQL keywords detected")
	ErrContainsXSS         = errors.New("potentially dangerous XSS content detected")
)

var (
	emailRegex  = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	urlRegex    = regexp.MustCompile(`^https?://[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]+$`)
	sqlKeywords = []string{
		"DROP", "DELETE", "INSERT", "UPDATE", "SELECT", "UNION",
		"CREATE", "ALTER", "EXEC", "EXECUTE", "SCRIPT", "--", "/*", "*/",
		"xp_", "sp_", "WAITFOR", "BENCHMARK",
	}
	xssPatterns = []string{
		"<script", "</script>", "javascript:", "onerror=", "onload=",
		"onclick=", "onmouseover=", "<iframe", "eval(", "expression(",
	}
)

// Validator provides validation functions
type Validator struct{}

// NewValidator creates a new validator
func NewValidator() *Validator {
	return &Validator{}
}

// ValidateEmail validates an email address
func (v *Validator) ValidateEmail(email string) error {
	if !emailRegex.MatchString(email) {
		return ErrInvalidEmail
	}
	return nil
}

// ValidateURL validates a URL
func (v *Validator) ValidateURL(url string) error {
	if !urlRegex.MatchString(url) {
		return ErrInvalidURL
	}
	return nil
}

// ValidateIP validates an IP address
func (v *Validator) ValidateIP(ip string) error {
	if net.ParseIP(ip) == nil {
		return ErrInvalidIP
	}
	return nil
}

// ValidateStringLength validates string length
func (v *Validator) ValidateStringLength(s string, min, max int) error {
	length := len(s)
	if length < min {
		return fmt.Errorf("%w: minimum %d characters required", ErrStringTooShort, min)
	}
	if max > 0 && length > max {
		return fmt.Errorf("%w: maximum %d characters allowed", ErrStringTooLong, max)
	}
	return nil
}

// SanitizeString removes potentially dangerous characters
func (v *Validator) SanitizeString(s string) string {
	// Remove null bytes
	s = strings.ReplaceAll(s, "\x00", "")

	// Remove control characters except newline and tab
	var result strings.Builder
	for _, r := range s {
		if r == '\n' || r == '\t' || !unicode.IsControl(r) {
			result.WriteRune(r)
		}
	}

	return result.String()
}

// ValidateNoSQLInjection checks for SQL injection patterns
func (v *Validator) ValidateNoSQLInjection(s string) error {
	upperS := strings.ToUpper(s)
	for _, keyword := range sqlKeywords {
		if strings.Contains(upperS, keyword) {
			return fmt.Errorf("%w: contains '%s'", ErrContainsSQLKeywords, keyword)
		}
	}
	return nil
}

// ValidateNoXSS checks for XSS patterns
func (v *Validator) ValidateNoXSS(s string) error {
	lowerS := strings.ToLower(s)
	for _, pattern := range xssPatterns {
		if strings.Contains(lowerS, pattern) {
			return fmt.Errorf("%w: contains '%s'", ErrContainsXSS, pattern)
		}
	}
	return nil
}

// ValidateLogLevel validates log level
func (v *Validator) ValidateLogLevel(level string) error {
	validLevels := map[string]bool{
		"debug": true,
		"info":  true,
		"warn":  true,
		"error": true,
		"fatal": true,
	}

	if !validLevels[strings.ToLower(level)] {
		return fmt.Errorf("%w: invalid log level", ErrInvalidFormat)
	}
	return nil
}

// ValidateJSONField validates that a field is safe for JSON
func (v *Validator) ValidateJSONField(field string) error {
	// Check length
	if err := v.ValidateStringLength(field, 1, 1000); err != nil {
		return err
	}

	// Check for dangerous patterns
	if err := v.ValidateNoXSS(field); err != nil {
		return err
	}

	return nil
}

// ValidateLogData validates log data structure
func (v *Validator) ValidateLogData(data map[string]interface{}) error {
	// Validate required fields
	level, ok := data["level"].(string)
	if ok {
		if err := v.ValidateLogLevel(level); err != nil {
			return err
		}
	}

	// Validate message field
	if message, ok := data["message"].(string); ok {
		if err := v.ValidateStringLength(message, 1, 10000); err != nil {
			return err
		}
		if err := v.ValidateNoXSS(message); err != nil {
			return err
		}
	}

	// Validate all string fields
	for key, value := range data {
		if str, ok := value.(string); ok {
			// Sanitize the string
			data[key] = v.SanitizeString(str)
		}
	}

	return nil
}

// ValidatePassword validates password strength
func (v *Validator) ValidatePassword(password string) error {
	if err := v.ValidateStringLength(password, 8, 128); err != nil {
		return err
	}

	var (
		hasUpper   bool
		hasLower   bool
		hasNumber  bool
		hasSpecial bool
	)

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsDigit(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
		return fmt.Errorf("%w: password must contain uppercase, lowercase, number, and special character", ErrInvalidFormat)
	}

	return nil
}

// ValidateUsername validates username format
func (v *Validator) ValidateUsername(username string) error {
	if err := v.ValidateStringLength(username, 3, 32); err != nil {
		return err
	}

	// Username should only contain alphanumeric and underscore
	for _, char := range username {
		if !unicode.IsLetter(char) && !unicode.IsDigit(char) && char != '_' {
			return fmt.Errorf("%w: username can only contain letters, numbers, and underscores", ErrInvalidFormat)
		}
	}

	return nil
}
