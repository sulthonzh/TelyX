import { Telyx } from '../core/Telyx';

export class TelyxMiddleware {
  private telyx: Telyx;

  constructor(telyx: Telyx) {
    this.telyx = telyx;
  }

  /**
   * Express-like middleware for HTTP requests
   * Automatically tracks HTTP requests and responses with timing and metadata
   */
  public httpRequestMiddleware = (req: { method: string; url: string; get: (header: string) => string; ip?: string; headers?: Record<string, string> }, res: { statusCode: number; send: (body: unknown) => void; [key: string]: unknown }, next: () => void) => {
    try {
      // Prevent double-wrapping if middleware is applied multiple times
      if ((res as Record<string, boolean>)._telyxWrapped) {
        return next();
      }
      (res as Record<string, boolean>)._telyxWrapped = true;
      
      if (!req || typeof req.method !== 'string' || typeof req.url !== 'string') {
        throw new Error('Invalid request object');
      }
      
      if (typeof req.get !== 'function') {
        throw new Error('req.get must be a function');
      }
      
      const sanitizedHeaders = this.sanitizeHeaders(req.headers || {});

      const start = Date.now();

      this.telyx.recordEvent('http_request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        headers: {
          'referer': sanitizedHeaders['referer'],
          'accept': sanitizedHeaders['accept'],
          'accept-language': sanitizedHeaders['accept-language'],
          'cache-control': sanitizedHeaders['cache-control'],
        },
      });

      // Record the HTTP response telemetry exactly once.
      // res.send() calls res.end() internally in Express, so we wrap both
      // and use _telyxRecorded to prevent double-counting. Without wrapping
      // res.end(), responses sent via res.end(), res.redirect(),
      // res.sendFile(), etc. would go untracked.
      const recordResponse = (body: unknown) => {
        if ((res as Record<string, boolean>)._telyxRecorded) return;
        (res as Record<string, boolean>)._telyxRecorded = true;

        const duration = Date.now() - start;
        const statusCode = res.statusCode;

        this.telyx.recordEvent('http_response', {
          method: req.method,
          url: req.url,
          statusCode,
          duration,
          contentLength: typeof body === 'string' ? body.length : 0,
        });
      };

      const originalSend = res.send;
      res.send = (body: unknown) => {
        // Telemetry and response sending are isolated so that:
        // 1. A telemetry error never causes a double-send (if originalSend
        //    threw on the first call, retrying it in a combined catch block
        //    would send the response twice).
        // 2. An originalSend error is never silently swallowed — it
        //    propagates to the caller as expected.
        try {
          recordResponse(body);
        } catch (error) {
          // If telemetry fails, don't break the response
          console.error('[Telyx] Failed to track HTTP response:', error);
        }

        // Always call the original send — errors propagate naturally
        return originalSend.call(res, body);
      };

      // Also wrap res.end() — Express routes that use res.end(),
      // res.redirect(), res.sendFile(), or streaming don't call res.send(),
      // so without this wrapper those responses would be invisible to telemetry.
      const originalEnd = typeof (res as Record<string, unknown>).end === 'function'
        ? (res as Record<string, (...args: unknown[]) => unknown>).end
        : undefined;
      if (originalEnd) {
        (res as Record<string, (...args: unknown[]) => unknown>).end = function (this: typeof res, ...args: unknown[]): unknown {
          try {
            // res.end() can be called with (chunk), (chunk, encoding), or (cb) —
            // the first arg is a Buffer/string or undefined.
            recordResponse(typeof args[0] === 'string' ? args[0] : undefined);
          } catch (error) {
            console.error('[Telyx] Failed to track HTTP response (end):', error);
          }
          return originalEnd.apply(this as typeof res, args);
        };
      }

    } catch (error) {
      console.error('[Telyx] Middleware error:', error);
    }
    // Call next() exactly once, outside the try-catch. Previously next() was
    // the last line inside try, and the catch also called next() — so if
    // next() itself threw, the catch would double-dispatch the request.
    next();
  };

  /**
   * Database query middleware
   */
  public databaseQueryMiddleware = (query: string) => {
    const start = Date.now();
    
    if (typeof query !== 'string' || query.trim() === '') {
      throw new Error('Database query must be a non-empty string');
    }

    return {
      end: (result: unknown, error?: unknown) => {
        try {
          const duration = Date.now() - start;
          
          if (error) {
            this.telyx.recordFailure('database_query', duration, {
              query: this.sanitizeQuery(query),
            });
            this.telyx.recordError('database_query', error, {
              query: this.sanitizeQuery(query),
              duration,
            });
          } else {
            const resultObj = result as Record<string, unknown>;
            const affectedRows = resultObj?.affectedRows as number | undefined;
            const rowCount = resultObj?.rowCount as number | undefined;
            
            // Validate with Number.isFinite() — typeof NaN === 'number' is true,
            // so NaN/Infinity would pass a plain typeof check and propagate to
            // analytics, corrupting aggregate calculations.
            const rowsAffected = (typeof affectedRows === 'number' && Number.isFinite(affectedRows)) ? affectedRows : 
                               (typeof rowCount === 'number' && Number.isFinite(rowCount)) ? rowCount : 0;
            
            this.telyx.recordSuccess('database_query', duration, {
              query: this.sanitizeQuery(query),
              rowsAffected: Math.max(0, rowsAffected),
            });
          }
        } catch (error) {
          console.error('[Telyx] Failed to track database query:', error);
        }
      },
    };
  };

  /**
   * Cache operation middleware
   */
  public cacheOperationMiddleware = (operation: string, key: string) => {
    const start = Date.now();
    const sanitizedKey = this.sanitizeCacheKey(key);

    return {
      end: (result: unknown, error?: unknown) => {
        try {
          const duration = Date.now() - start;

          if (error) {
            this.telyx.recordFailure('cache_operation', duration, {
              operation,
              key: sanitizedKey,
            });
            this.telyx.recordError('cache_operation', error, {
              operation,
              key: sanitizedKey,
              duration,
            });
          } else {
            this.telyx.recordSuccess('cache_operation', duration, {
              operation,
              key: sanitizedKey,
              // Use loose null check so both null and undefined register as cache
              // misses. Many cache backends (Redis, Memcached) return null for
              // missing keys — strict !== undefined would treat those as hits.
              hit: result != null,
            });
          }
        } catch (error) {
          console.error('[Telyx] Failed to track cache operation:', error);
        }
      },
    };
  };

  /**
   * Sanitize cache keys to prevent leaking sensitive data.
   * Cache keys often embed session tokens, API keys, user PII, etc.
   * Truncates to 100 chars and redacts known sensitive patterns.
   */
  private sanitizeCacheKey(key: string): string {
    if (typeof key !== 'string') {
      return String(key);
    }

    const sensitivePatterns = ['token', 'session', 'secret', 'password', 'key', 'auth', 'credential'];
    let sanitized = key;
    for (const pattern of sensitivePatterns) {
      // Redact values that look like pattern=value or pattern:value
      // \b word boundary prevents false positives on substrings (e.g. 'key'
      // matching inside 'monkey=', 'keyboard='). Consistent with sanitizeQuery().
      const regex = new RegExp(`\\b(${pattern}[:=])[^,;\\s&|]+`, 'gi');
      sanitized = sanitized.replace(regex, '$1****');
    }
    return sanitized.substring(0, 100) + (sanitized.length > 100 ? '...' : '');
  }

  /**
   * AI API call middleware
   */
  public aiCallMiddleware = (provider: string, model: string, prompt: string) => {
    try {
      if (typeof provider !== 'string' || provider.trim() === '') {
        throw new Error('Provider must be a non-empty string');
      }
      if (typeof model !== 'string' || model.trim() === '') {
        throw new Error('Model must be a non-empty string');
      }
      if (typeof prompt !== 'string') {
        throw new Error('Prompt must be a string');
      }
      
      const start = Date.now();
      
      this.telyx.recordEvent('ai_api_call', {
        provider,
        model,
        promptLength: prompt.length,
      });

      return {
        end: (response: unknown, error?: unknown) => {
          try {
            const duration = Date.now() - start;
            
            if (error) {
              this.telyx.recordFailure('ai_api_call', duration, {
                provider,
                model,
              });
              this.telyx.recordError('ai_api_call', error, {
                provider,
                model,
                duration,
              });
            } else if (response !== null && typeof response === 'object') {
              const responseObj = response as Record<string, unknown>;
              const usage = responseObj?.usage;
              const content = responseObj?.content;

              let tokensUsed = 0;
              if (usage && typeof usage === 'object' && !Array.isArray(usage) && 'total_tokens' in usage && typeof (usage as Record<string, unknown>).total_tokens === 'number') {
                const rawTokens = (usage as Record<string, unknown>).total_tokens as number;
                // Validate: reject NaN, Infinity, negative values. These corrupt
                // analytics (averages become NaN/Infinity, usage totals wrong).
                if (Number.isFinite(rawTokens) && rawTokens >= 0) {
                  tokensUsed = rawTokens;
                }
              }

              const responseLength = typeof content === 'string' ? content.length : 0;

              this.telyx.recordSuccess('ai_api_call', duration, {
                provider,
                model,
                tokensUsed,
                responseLength,
              });

              if (tokensUsed > 0) {
                this.telyx.recordMetric('tokens_used', tokensUsed, {
                  provider,
                  model,
                });
              }
            } else {
              // response is null, undefined, or a non-object; still record a success event.
              this.telyx.recordSuccess('ai_api_call', duration, {
                provider,
                model,
                tokensUsed: 0,
                responseLength: 0,
              });
            }
          } catch (error) {
            console.error('[Telyx] Failed to track AI API call:', error);
          }
        },
      };
    } catch (error) {
      console.error('[Telyx] AI middleware initialization error:', error);
      // Return a no-op middleware to prevent breaking the application
      return {
        end: () => {
        }
      };
    }
  };

  /**
   * Sanitize headers to prevent sensitive information leakage
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    if (!headers || typeof headers !== 'object') {
      return {};
    }
    
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
      'x-secret',
      'password',
      'secret',
      'x-xsrf-token',
      'x-csrf-token',
      'proxy-authorization',
      'www-authenticate',
    ];
    
    const safeHeaders = [
      'accept',
      'accept-encoding',
      'accept-language',
      'cache-control',
      'connection',
      'content-type',
      'content-length',
      'host',
      'user-agent',
      'referer',
      'pragma',
    ];
    
    const sanitized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveHeaders.includes(lowerKey)) {
        sanitized[lowerKey] = '[REDACTED]';
      } else if (safeHeaders.includes(lowerKey)) {
        // Only include headers that are safe to expose
        // Store with lowercase key so consumers can reliably access them
        sanitized[lowerKey] = value;
      } else {
        // Redact unknown headers to prevent information leakage
        sanitized[lowerKey] = '[HEADER]';
      }
    }
    
    return sanitized;
  }

  /**
   * Sanitize query for privacy/size reasons
   */
  private sanitizeQuery(query: string): string {
    const sensitiveWords = ['password', 'secret', 'token', 'key', 'credential'];
    let sanitized = query;
    
    sensitiveWords.forEach(word => {
      // Match both quoted ('value', "value") and unquoted (value) assignments.
      // Unquoted values stop at whitespace, comma, or semicolon.
      const regex = new RegExp(`\\b${word}\\s*[:=]\\s*(?:['"][^'"]*['"]|[^,;\\s]+)`, 'gi');
      sanitized = sanitized.replace(regex, `${word}=****`);
    });
    
    return sanitized.substring(0, 200) + (sanitized.length > 200 ? '...' : '');
  }
}