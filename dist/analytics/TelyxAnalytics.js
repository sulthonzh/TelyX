"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelyxAnalytics = void 0;
class TelyxAnalytics {
    constructor() {
        this.events = [];
        this.metrics = [];
        this.errors = [];
    }
    /**
     * Add events from telemetry batch
     */
    addEvents(events) {
        this.events.push(...events);
    }
    /**
     * Add metrics from telemetry batch
     */
    addMetrics(metrics) {
        this.metrics.push(...metrics);
    }
    /**
     * Add errors from telemetry batch
     */
    addErrors(errors) {
        this.errors.push(...errors);
    }
    /**
     * Get performance metrics for a specific method
     */
    getMethodPerformance(methodName) {
        const methodEvents = this.events.filter(event => event.method === methodName && event.duration !== undefined);
        if (methodEvents.length === 0) {
            return {
                averageDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                successRate: 0,
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
            };
        }
        const durations = methodEvents.map(event => event.duration);
        const successfulCalls = methodEvents.filter(event => event.success).length;
        const failedCalls = methodEvents.filter(event => !event.success).length;
        return {
            averageDuration: durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            successRate: successfulCalls / methodEvents.length,
            totalCalls: methodEvents.length,
            successfulCalls,
            failedCalls,
        };
    }
    /**
     * Get overall system health
     */
    getSystemHealth() {
        const totalEvents = this.events.length;
        const successfulEvents = this.events.filter(event => event.success).length;
        const failedEvents = this.events.filter(event => !event.success).length;
        // Calculate average response time from all method calls
        const methodEvents = this.events.filter(event => event.duration !== undefined);
        const averageResponseTime = methodEvents.length > 0
            ? methodEvents.reduce((sum, event) => sum + event.duration, 0) / methodEvents.length
            : 0;
        // Get performance for all methods
        const methodNames = [...new Set(this.events.map(event => event.method).filter((methodName) => Boolean(methodName)))];
        const methodPerformance = {};
        methodNames.forEach(methodName => {
            methodPerformance[methodName] = this.getMethodPerformance(methodName);
        });
        return {
            uptime: this.calculateUptime(),
            totalCalls: totalEvents,
            successRate: totalEvents > 0 ? successfulEvents / totalEvents : 0,
            errorRate: totalEvents > 0 ? failedEvents / totalEvents : 0,
            averageResponseTime,
            methodPerformance,
        };
    }
    /**
     * Get error analysis
     */
    getErrorAnalysis() {
        const totalEvents = this.events.length;
        const errorByMethod = {};
        const errorTypes = {};
        this.errors.forEach(error => {
            // Count errors by method
            const method = error.context?.method || 'unknown';
            errorByMethod[method] = (errorByMethod[method] || 0) + 1;
            // Count errors by type
            const errorType = error.error.split(':')[0] || 'Unknown';
            errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
        });
        return {
            totalErrors: this.errors.length,
            errorByMethod,
            errorTypes,
            recentErrors: this.errors.slice(-10), // Last 10 errors
            errorRate: totalEvents > 0 ? this.errors.length / totalEvents : 0,
        };
    }
    /**
     * Get usage metrics
     */
    getUsageMetrics() {
        const aiEvents = this.events.filter(event => event.event === 'ai_api_call');
        const tokenMetrics = this.metrics.filter(metric => metric.metric === 'tokens_used');
        let totalTokens = 0;
        const providerUsage = {};
        const modelUsage = {};
        aiEvents.forEach(event => {
            const provider = event.metadata?.provider || 'unknown';
            const model = event.metadata?.model || 'unknown';
            providerUsage[provider] = (providerUsage[provider] || 0) + 1;
            modelUsage[model] = (modelUsage[model] || 0) + 1;
        });
        tokenMetrics.forEach(metric => {
            totalTokens += metric.value;
        });
        return {
            totalTokens,
            averageTokensPerCall: tokenMetrics.length > 0 ? totalTokens / tokenMetrics.length : 0,
            totalApiCalls: aiEvents.length,
            providerUsage,
            modelUsage,
        };
    }
    /**
     * Get time-based analytics
     */
    getTimeSeriesData(timeRange = '24h') {
        const now = new Date();
        const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : 24 * 7;
        const interval = timeRange === '1h' ? 'minute' : 'hour';
        // Initialize time series data
        const requestsPerHour = [];
        const errorRatePerHour = [];
        const averageResponseTimePerHour = [];
        for (let i = hours - 1; i >= 0; i--) {
            const timestamp = new Date(now.getTime() - i * (timeRange === '1h' ? 60 * 60 * 1000 : 60 * 60 * 1000));
            const timeKey = timeRange === '1h'
                ? timestamp.toISOString().substring(14, 19) // HH:MM
                : timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
            requestsPerHour.push({
                timestamp: timeKey,
                count: 0,
            });
            errorRatePerHour.push({
                timestamp: timeKey,
                rate: 0,
            });
            averageResponseTimePerHour.push({
                timestamp: timeKey,
                time: 0,
            });
        }
        // Populate data
        this.events.forEach(event => {
            const eventTime = new Date(event.timestamp);
            const timeDiff = now.getTime() - eventTime.getTime();
            const hoursAgo = Math.floor(timeDiff / (60 * 60 * 1000));
            if (hoursAgo < hours) {
                const index = timeRange === '1h' ? hours - 1 - hoursAgo : Math.floor(hoursAgo / 24);
                if (index >= 0 && index < hours) {
                    requestsPerHour[index].count++;
                    if (!event.success) {
                        errorRatePerHour[index].rate++;
                    }
                    if (event.duration) {
                        averageResponseTimePerHour[index].time += event.duration;
                    }
                }
            }
        });
        // Calculate averages
        averageResponseTimePerHour.forEach(point => {
            const eventsInPeriod = requestsPerHour.find(r => r.timestamp === point.timestamp)?.count || 1;
            point.time = eventsInPeriod > 0 ? point.time / eventsInPeriod : 0;
        });
        // Calculate error rates
        requestsPerHour.forEach((point, index) => {
            if (point.count > 0) {
                errorRatePerHour[index].rate = errorRatePerHour[index].rate / point.count;
            }
        });
        return {
            requestsPerHour,
            errorRatePerHour,
            averageResponseTimePerHour,
        };
    }
    /**
     * Clear all data
     */
    clear() {
        this.events = [];
        this.metrics = [];
        this.errors = [];
    }
    /**
     * Calculate uptime based on event timestamps
     */
    calculateUptime() {
        if (this.events.length === 0)
            return 0;
        const timestamps = this.events.map(event => new Date(event.timestamp).getTime());
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        return maxTime - minTime;
    }
}
exports.TelyxAnalytics = TelyxAnalytics;
//# sourceMappingURL=TelyxAnalytics.js.map