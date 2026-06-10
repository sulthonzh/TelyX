import { Telyx } from '../core/Telyx';
export declare class TelyxMiddleware {
    private telyx;
    constructor(telyx: Telyx);
    /**
     * Express-like middleware for HTTP requests
     */
    httpRequestMiddleware: (req: any, res: any, next: any) => any;
    /**
     * Database query middleware
     */
    databaseQueryMiddleware: (query: string, params?: any) => {
        end: (result: any, error?: any) => void;
    };
    /**
     * Cache operation middleware
     */
    cacheOperationMiddleware: (operation: string, key: string, value?: any) => {
        end: (result: any, error?: any) => void;
    };
    /**
     * AI API call middleware
     */
    aiCallMiddleware: (provider: string, model: string, prompt: string) => {
        end: (response: any, error?: any) => void;
    };
    /**
     * Sanitize query for privacy/size reasons
     */
    private sanitizeQuery;
}
//# sourceMappingURL=TelyxMiddleware.d.ts.map