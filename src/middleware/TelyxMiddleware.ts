import { Telyx } from '../core/Telyx';

export class TelyxMiddleware {
  private telyx: Telyx;

  constructor(telyx: Telyx) {
    this.telyx = telyx;
  }

  /**
   * Express-like middleware for HTTP requests
   */
  public httpRequestMiddleware = (req: { method: string; url: string; get: (header: string) => string; ip?: string }, res: { statusCode: number; send: (body: unknown) => void; [key: string]: unknown }, next: () => void) => {
    // Prevent double-wrapping if middleware is applied multiple times
    if ((res as Record<string, boolean>)._telyxWrapped) {
      return next();
    }
    (res as Record<string, boolean>)._telyxWrapped = true;

    const start = Date.now();

    // Track the request
    this.telyx.recordEvent('http_request', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    // Track response
    const originalSend = res.send;
    res.send = (body: unknown) => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;
      
      this.telyx.recordEvent('http_response', {
        method: req.method,
        url: req.url,
        statusCode,
        duration,
        contentLength: typeof body === 'string' ? body.length : 0,
      });

      originalSend.call(res, body);
    };

    next();
  };

  /**
   * Database query middleware
   */
  public databaseQueryMiddleware = (query: string) => {
    const start = Date.now();

    return {
      end: (result: unknown, error?: unknown) => {
        const duration = Date.now() - start;
        
        if (error) {
          this.telyx.recordError('database_query', error, {
            query: this.sanitizeQuery(query),
            duration,
          });
        } else {
          const resultObj = result as Record<string, unknown>;
          const affectedRows = resultObj?.affectedRows as number | undefined;
          const rowCount = resultObj?.rowCount as number | undefined;
          this.telyx.recordSuccess('database_query', duration, {
            query: this.sanitizeQuery(query),
            rowsAffected: affectedRows || rowCount || 0,
          });
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
    const start = Date.now();
    
    this.telyx.recordEvent('ai_api_call', {
      provider,
      model,
      promptLength: prompt.length,
    });

    return {
      end: (response: unknown, error?: unknown) => {
        const duration = Date.now() - start;
        
        if (error) {
          this.telyx.recordError('ai_api_call', error, {
            provider,
            model,
            duration,
          });
        } else {
          const responseObj = response as Record<string, unknown>;
          const usage = responseObj?.usage as Record<string, unknown> | undefined;
          const content = responseObj?.content as string | null | undefined;
          const tokensUsed = usage && typeof usage === 'object' && 'total_tokens' in usage ? (usage.total_tokens as number) : 0;
          const responseLength = content ? content.length : 0;
          
          this.telyx.recordSuccess('ai_api_call', duration, {
            provider,
            model,
            tokensUsed,
            responseLength,
          });
          
          // Track token usage as a metric
          if (response && typeof response === 'object' && 'usage' in response && response.usage && typeof response.usage === 'object' && 'total_tokens' in response.usage && typeof response.usage.total_tokens === 'number') {
            this.telyx.recordMetric('tokens_used', response.usage.total_tokens, {
              provider,
              model,
            });
          }
        }
      },
    };
  };

  /**
   * Sanitize query for privacy/size reasons
   */
  private sanitizeQuery(query: string): string {
    const sensitiveWords = ['password', 'secret', 'token', 'key', 'credential'];
    let sanitized = query;
    
    sensitiveWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\s*[:=]\\s*['"][^'"]*['"]`, 'gi');
      sanitized = sanitized.replace(regex, `${word}=****`);
    });
    
    return sanitized.substring(0, 200) + (sanitized.length > 200 ? '...' : '');
  }
}