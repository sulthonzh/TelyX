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
      
      const sanitizedHeaders = this.sanitizeHeaders(req.headers || {});

      const start = Date.now();

      this.telyx.recordEvent('http_request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        headers: {
          referer: sanitizedHeaders.referer,
          accept: sanitizedHeaders.accept,
          'accept-language': sanitizedHeaders['accept-language'],
          'cache-control': sanitizedHeaders['cache-control'],
        },
      });

      const originalSend = res.send;
      res.send = (body: unknown) => {
        try {
          const duration = Date.now() - start;
          const statusCode = res.statusCode;
          
          this.telyx.recordEvent('http_response', {
            method: req.method,
            url: req.url,
            statusCode,
            duration,
            contentLength: typeof body === 'string' ? body.length : 0,
          });

          return originalSend.call(res, body);
        } catch (error) {
          // If telemetry fails, don't break the response
          console.error('[Telyx] Failed to track HTTP response:', error);
          try {
            return originalSend.call(res, body);
          } catch (sendError) {
            console.error('[Telyx] Failed to send response after telemetry error:', sendError);
          }
        }
      };

      next();
    } catch (error) {
      console.error('[Telyx] Middleware error:', error);
      next();
    }
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
            
            const rowsAffected = typeof affectedRows === 'number' ? affectedRows : 
                               typeof rowCount === 'number' ? rowCount : 0;
            
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

    return {
      end: (result: unknown, error?: unknown) => {
        const duration = Date.now() - start;
        
        if (error) {
          this.telyx.recordFailure('cache_operation', duration, {
            operation,
            key,
          });
          this.telyx.recordError('cache_operation', error, {
            operation,
            key,
            duration,
          });
        } else {
          this.telyx.recordSuccess('cache_operation', duration, {
            operation,
            key,
            hit: result !== undefined,
          });
        }
      },
    };
  };

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
              if (usage && typeof usage === 'object' && 'total_tokens' in usage && typeof (usage as Record<string, unknown>).total_tokens === 'number') {
                tokensUsed = Math.max(0, (usage as Record<string, unknown>).total_tokens as number);
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
        sanitized[key] = '[REDACTED]';
      } else if (safeHeaders.includes(lowerKey)) {
        // Only include headers that are safe to expose
        sanitized[key] = value;
      } else {
        // Redact unknown headers to prevent information leakage
        sanitized[key] = '[HEADER]';
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