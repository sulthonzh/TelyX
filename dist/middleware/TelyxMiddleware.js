"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelyxMiddleware = void 0;
class TelyxMiddleware {
    constructor(telyx) {
        /**
         * Express-like middleware for HTTP requests
         */
        this.httpRequestMiddleware = (req, res, next) => {
            // Prevent double-wrapping if middleware is applied multiple times
            if (res._telyxWrapped) {
                return next();
            }
            res._telyxWrapped = true;
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
            res.send = (body) => {
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
        this.databaseQueryMiddleware = (query, params) => {
            const start = Date.now();
            return {
                end: (result, error) => {
                    const duration = Date.now() - start;
                    if (error) {
                        this.telyx.recordError('database_query', error, {
                            query: this.sanitizeQuery(query),
                            duration,
                        });
                    }
                    else {
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
        this.cacheOperationMiddleware = (operation, key, value) => {
            const start = Date.now();
            return {
                end: (result, error) => {
                    const duration = Date.now() - start;
                    if (error) {
                        this.telyx.recordError('cache_operation', error, {
                            operation,
                            key,
                            duration,
                        });
                    }
                    else {
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
        this.aiCallMiddleware = (provider, model, prompt) => {
            const start = Date.now();
            this.telyx.recordEvent('ai_api_call', {
                provider,
                model,
                promptLength: prompt.length,
            });
            return {
                end: (response, error) => {
                    const duration = Date.now() - start;
                    if (error) {
                        this.telyx.recordError('ai_api_call', error, {
                            provider,
                            model,
                            duration,
                        });
                    }
                    else {
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
        this.telyx = telyx;
    }
    /**
     * Sanitize query for privacy/size reasons
     */
    sanitizeQuery(query) {
        const sensitiveWords = ['password', 'secret', 'token', 'key', 'credential'];
        let sanitized = query;
        sensitiveWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\s*[:=]\\s*['"][^'"]*['"]`, 'gi');
            sanitized = sanitized.replace(regex, `${word}=****`);
        });
        return sanitized.substring(0, 200) + (sanitized.length > 200 ? '...' : '');
    }
}
exports.TelyxMiddleware = TelyxMiddleware;
//# sourceMappingURL=TelyxMiddleware.js.map