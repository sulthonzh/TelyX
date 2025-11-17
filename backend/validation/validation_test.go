package validation

import (
	"testing"
)

func TestValidateEmail(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		email    string
		expected bool
	}{
		{"test@example.com", true},
		{"user.name@company.co.uk", true},
		{"invalid-email", false},
		{"@example.com", false},
		{"test@", false},
		{"", false},
	}

	for _, tt := range tests {
		err := v.ValidateEmail(tt.email)
		if (err == nil) != tt.expected {
			t.Errorf("ValidateEmail(%s) error = %v, expected valid = %v", tt.email, err, tt.expected)
		}
	}
}

func TestValidateURL(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		url      string
		expected bool
	}{
		{"https://example.com", true},
		{"http://localhost:8080", true},
		{"https://api.example.com/path?query=1", true},
		{"not-a-url", false},
		{"ftp://example.com", false},
		{"", false},
	}

	for _, tt := range tests {
		err := v.ValidateURL(tt.url)
		if (err == nil) != tt.expected {
			t.Errorf("ValidateURL(%s) error = %v, expected valid = %v", tt.url, err, tt.expected)
		}
	}
}

func TestValidateIP(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		ip       string
		expected bool
	}{
		{"192.168.1.1", true},
		{"10.0.0.1", true},
		{"2001:0db8:85a3:0000:0000:8a2e:0370:7334", true},
		{"256.1.1.1", false},
		{"invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		err := v.ValidateIP(tt.ip)
		if (err == nil) != tt.expected {
			t.Errorf("ValidateIP(%s) error = %v, expected valid = %v", tt.ip, err, tt.expected)
		}
	}
}

func TestValidateStringLength(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		s        string
		min      int
		max      int
		expected bool
	}{
		{"valid length", "hello", 3, 10, true},
		{"too short", "hi", 3, 10, false},
		{"too long", "hello world!", 3, 10, false},
		{"exact min", "abc", 3, 10, true},
		{"exact max", "1234567890", 3, 10, true},
		{"no max limit", "very long string", 5, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidateStringLength(tt.s, tt.min, tt.max)
			if (err == nil) != tt.expected {
				t.Errorf("ValidateStringLength(%s, %d, %d) error = %v, expected valid = %v",
					tt.s, tt.min, tt.max, err, tt.expected)
			}
		})
	}
}

func TestSanitizeString(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"no special chars", "hello world", "hello world"},
		{"with null bytes", "hello\x00world", "helloworld"},
		{"with control chars", "hello\x01\x02world", "helloworld"},
		{"preserve newlines", "hello\nworld", "hello\nworld"},
		{"preserve tabs", "hello\tworld", "hello\tworld"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := v.SanitizeString(tt.input)
			if result != tt.expected {
				t.Errorf("SanitizeString(%q) = %q, expected %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestValidateNoSQLInjection(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"safe string", "hello world", true},
		{"with SELECT", "SELECT * FROM users", false},
		{"with DROP", "DROP TABLE users", false},
		{"with --", "test--comment", false},
		{"with UNION", "1 UNION SELECT", false},
		{"lowercase select", "select * from", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidateNoSQLInjection(tt.input)
			if (err == nil) != tt.expected {
				t.Errorf("ValidateNoSQLInjection(%s) error = %v, expected valid = %v",
					tt.input, err, tt.expected)
			}
		})
	}
}

func TestValidateNoXSS(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"safe string", "hello world", true},
		{"with script tag", "<script>alert('xss')</script>", false},
		{"with javascript:", "javascript:alert(1)", false},
		{"with onerror", "<img onerror='alert(1)'>", false},
		{"with onload", "<body onload='alert(1)'>", false},
		{"uppercase SCRIPT", "<SCRIPT>alert(1)</SCRIPT>", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidateNoXSS(tt.input)
			if (err == nil) != tt.expected {
				t.Errorf("ValidateNoXSS(%s) error = %v, expected valid = %v",
					tt.input, err, tt.expected)
			}
		})
	}
}

func TestValidateLogLevel(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		level    string
		expected bool
	}{
		{"debug", true},
		{"info", true},
		{"warn", true},
		{"error", true},
		{"fatal", true},
		{"DEBUG", true}, // case insensitive
		{"invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		err := v.ValidateLogLevel(tt.level)
		if (err == nil) != tt.expected {
			t.Errorf("ValidateLogLevel(%s) error = %v, expected valid = %v",
				tt.level, err, tt.expected)
		}
	}
}

func TestValidateJSONField(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		field    string
		expected bool
	}{
		{"valid field", "test field", true},
		{"with special chars", "field-name_123", true},
		{"too long", string(make([]byte, 1001)), false},
		{"empty", "", false},
		{"with XSS", "<script>alert(1)</script>", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidateJSONField(tt.field)
			if (err == nil) != tt.expected {
				t.Errorf("ValidateJSONField(%s) error = %v, expected valid = %v",
					tt.field, err, tt.expected)
			}
		})
	}
}

func TestValidateLogData(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		data     map[string]interface{}
		expected bool
	}{
		{
			"valid log data",
			map[string]interface{}{
				"level":   "info",
				"message": "test message",
			},
			true,
		},
		{
			"invalid log level",
			map[string]interface{}{
				"level":   "invalid",
				"message": "test",
			},
			false,
		},
		{
			"XSS in message",
			map[string]interface{}{
				"level":   "info",
				"message": "<script>alert(1)</script>",
			},
			false,
		},
		{
			"message too long",
			map[string]interface{}{
				"level":   "info",
				"message": string(make([]byte, 10001)),
			},
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidateLogData(tt.data)
			if (err == nil) != tt.expected {
				t.Errorf("ValidateLogData() error = %v, expected valid = %v", err, tt.expected)
			}
		})
	}
}

func TestValidatePassword(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		password string
		expected bool
	}{
		{"strong password", "Str0ng!Pass", true},
		{"with all requirements", "Abc123!@#", true},
		{"too short", "Abc1!", false},
		{"no uppercase", "abc123!@#", false},
		{"no lowercase", "ABC123!@#", false},
		{"no numbers", "Abcdef!@#", false},
		{"no special", "Abcdef123", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidatePassword(tt.password)
			if (err == nil) != tt.expected {
				t.Errorf("ValidatePassword(%s) error = %v, expected valid = %v",
					tt.password, err, tt.expected)
			}
		})
	}
}

func TestValidateUsername(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name     string
		username string
		expected bool
	}{
		{"valid username", "user123", true},
		{"with underscore", "user_name", true},
		{"alphanumeric", "abc123", true},
		{"too short", "ab", false},
		{"too long", "this_is_a_very_long_username_that_exceeds_limit", false},
		{"with special chars", "user@name", false},
		{"with spaces", "user name", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.ValidateUsername(tt.username)
			if (err == nil) != tt.expected {
				t.Errorf("ValidateUsername(%s) error = %v, expected valid = %v",
					tt.username, err, tt.expected)
			}
		})
	}
}
