import { Telyx } from '../core/Telyx';

export class TelyxMiddleware {
  private telyx: Telyx;

  constructor(telyx: Telyx) {
    this.telyx = telyx;
  }

  /**
   * Express-like middleware for HTTP requests
   */
  public httpRequestMiddleware = (req: any, res: any, next: any) => {
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
    res.send = (body: any) => {
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
  public databaseQueryMiddleware = (query: string, params?: any) => {
    const start = Date.now();
    
    this.telyx.recordEvent('database_query_start', {
      query: this.sanitizeQuery(query),
      paramsCount: params ? Object.keys(params).length : 0,
    });

    return {
      end: (result: any, error?: any) => {
        const duration = Date.now() - start;
        
        if (error) {
          this.telyx.recordError('database_query', error, {
            query: this.sanitizeQuery(query),
            duration,
          });
        } else {
          this.telyx.recordSuccess('database_query', duration, {
            query: this.sanitizeQuery(query),
            rowsAffected: result?.affectedRows || result?.rowCount || 0,
          });
        }
      },
    };
  };

  /**
   * Cache operation middleware
   */
  public cacheOperationMiddleware = (operation: string, key: string, value?: any) => {
    const start = Date.now();
    
    this.telyx.recordEvent('cache_operation', {
      operation,
      key,
      hasValue: value !== undefined,
    });

    return {
      end: (result: any, error?: any) => {
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
      end: (response: any, error?: any) => {
        const duration = Date.now() - start;
        
        if (error) {
          this.telyx.recordError('ai_api_call', error, {
            provider,
            model,
            duration,
          });
        } else {
          this.telyx.recordSuccess('ai_api_call', duration, {
            provider,
            model,
            tokensUsed: response?.usage?.total_tokens || 0,
            responseLength: response?.content?.length || 0,
          });
          
          // Track token usage as a metric
          if (response?.usage?.total_tokens) {
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