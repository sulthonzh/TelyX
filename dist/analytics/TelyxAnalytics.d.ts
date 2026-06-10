import { TelyxEvent, TelyxMetric, TelyxError } from '../types';
export declare class TelyxAnalytics {
    private events;
    private metrics;
    private errors;
    /**
     * Add events from telemetry batch
     */
    addEvents(events: TelyxEvent[]): void;
    /**
     * Add metrics from telemetry batch
     */
    addMetrics(metrics: TelyxMetric[]): void;
    /**
     * Add errors from telemetry batch
     */
    addErrors(errors: TelyxError[]): void;
    /**
     * Get performance metrics for a specific method
     */
    getMethodPerformance(methodName: string): {
        averageDuration: number;
        minDuration: number;
        maxDuration: number;
        successRate: number;
        totalCalls: number;
        successfulCalls: number;
        failedCalls: number;
    };
    /**
     * Get overall system health
     */
    getSystemHealth(): {
        uptime: number;
        totalCalls: number;
        successRate: number;
        errorRate: number;
        averageResponseTime: number;
        methodPerformance: Record<string, any>;
    };
    /**
     * Get error analysis
     */
    getErrorAnalysis(): {
        totalErrors: number;
        errorByMethod: Record<string, number>;
        errorTypes: Record<string, number>;
        recentErrors: TelyxError[];
        errorRate: number;
    };
    /**
     * Get usage metrics
     */
    getUsageMetrics(): {
        totalTokens: number;
        averageTokensPerCall: number;
        totalApiCalls: number;
        providerUsage: Record<string, number>;
        modelUsage: Record<string, number>;
    };
    /**
     * Get time-based analytics with fixed indexing
     */
    getTimeSeriesData(timeRange?: '1h' | '24h' | '7d'): {
        requestsPerHour: {
            timestamp: string;
            count: number;
        }[];
        errorRatePerHour: {
            timestamp: string;
            rate: number;
        }[];
        averageResponseTimePerHour: {
            timestamp: string;
            time: number;
        }[];
    };
    /**
     * Get a quick summary of system health — one object for dashboards, CI, alerts.
     */
    getSummary(): {
        totalEvents: number;
        totalErrors: number;
        totalMetrics: number;
        successRate: number;
        errorRate: number;
        avgResponseTime: number;
        topMethods: {
            method: string;
            calls: number;
            avgDuration: number;
        }[];
        recentErrors: TelyxError[];
    };
    /**
     * Render a markdown report of the telemetry data — useful for PR comments and dashboards.
     */
    toMarkdown(): string;
    /**
     * Clear all data
     */
    clear(): void;
    /**
     * Calculate uptime based on event timestamps
     */
    private calculateUptime;
}
//# sourceMappingURL=TelyxAnalytics.d.ts.map