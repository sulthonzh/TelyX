import { TelyxConfig, TelyxEvent, TelyxMetric, TelyxError, TelemetryBatch } from '../types';
export type { TelyxConfig, TelyxEvent, TelyxMetric, TelyxError, TelemetryBatch };
export declare class Telyx {
    private config;
    private httpClient;
    private batch;
    private flushTimer?;
    private agentWrapper?;
    constructor(config: TelyxConfig);
    /**
     * Track an agent method with automatic timing and success/failure detection
     */
    trackMethod<T>(methodName: string, fn: (input: any, next: () => Promise<T>) => Promise<T>): any;
    /**
     * Record a custom event
     */
    recordEvent(eventName: string, metadata?: Record<string, any>): void;
    /**
     * Record a metric
     */
    recordMetric(metricName: string, value: number, metadata?: Record<string, any>): void;
    /**
     * Record a success event
     */
    recordSuccess(methodName: string, duration: number, metadata?: Record<string, any>): void;
    /**
     * Record an error
     */
    recordError(methodName: string, error: any, metadata?: Record<string, any>): void;
    /**
     * Wrap an agent with telemetry
     */
    track(agent: any): any;
    /**
     * Flush the current batch to the server
     */
    flush(): Promise<void>;
    /**
     * Check if batch size has been exceeded and flush if necessary
     */
    private checkBatchSize;
    /**
     * Start the periodic flush timer
     */
    private startFlushTimer;
    /**
     * Stop the flush timer and clean up
     */
    destroy(): Promise<void>;
    /**
     * Sanitize input for privacy/size reasons
     */
    private sanitizeInput;
}
//# sourceMappingURL=Telyx.d.ts.map