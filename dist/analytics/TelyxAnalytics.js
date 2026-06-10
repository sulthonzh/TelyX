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
        for (const event of events) {
            this.events.push(event);
        }
    }
    /**
     * Add metrics from telemetry batch
     */
    addMetrics(metrics) {
        for (const metric of metrics) {
            this.metrics.push(metric);
        }
    }
    /**
     * Add errors from telemetry batch
     */
    addErrors(errors) {
        for (const error of errors) {
            this.errors.push(error);
        }
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
            minDuration: durations.reduce((min, d) => (d < min ? d : min), durations[0]),
            maxDuration: durations.reduce((max, d) => (d > max ? d : max), durations[0]),
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
     * Get time-based analytics with fixed indexing
     */
    getTimeSeriesData(timeRange = '24h') {
        const now = new Date();
        const bucketCount = timeRange === '1h' ? 60 : timeRange === '24h' ? 24 : 24 * 7;
        const bucketMs = timeRange === '1h' ? 60 * 1000 : 60 * 60 * 1000;
        // Initialize time series buckets
        const requestsPerHour = [];
        const errorRatePerHour = [];
        const averageResponseTimePerHour = [];
        for (let i = 0; i < bucketCount; i++) {
            const bucketStart = new Date(now.getTime() - (bucketCount - 1 - i) * bucketMs);
            const timeKey = timeRange === '1h'
                ? bucketStart.toISOString().substring(14, 19) // HH:MM
                : bucketStart.toISOString().substring(0, 13); // YYYY-MM-DDTHH
            requestsPerHour.push({ timestamp: timeKey, count: 0, _totalDuration: 0 });
            errorRatePerHour.push({ timestamp: timeKey, rate: 0, _errorCount: 0 });
            averageResponseTimePerHour.push({ timestamp: timeKey, time: 0 });
        }
        // Populate data by assigning each event to its correct bucket
        this.events.forEach(event => {
            const eventTime = new Date(event.timestamp).getTime();
            const timeDiffMs = now.getTime() - eventTime;
            // Skip events outside the time range
            if (timeDiffMs < 0 || timeDiffMs >= bucketCount * bucketMs)
                return;
            // Calculate correct bucket index (0 = oldest, bucketCount-1 = current)
            const bucketIndex = Math.floor(timeDiffMs / bucketMs);
            const index = bucketCount - 1 - bucketIndex;
            if (index >= 0 && index < bucketCount) {
                requestsPerHour[index].count++;
                if (event.success === false) {
                    errorRatePerHour[index]._errorCount++;
                }
                if (event.duration != null) {
                    requestsPerHour[index]._totalDuration += event.duration;
                }
            }
        });
        // Calculate averages and rates
        for (let i = 0; i < bucketCount; i++) {
            const count = requestsPerHour[i].count;
            averageResponseTimePerHour[i].time = count > 0
                ? requestsPerHour[i]._totalDuration / count
                : 0;
            errorRatePerHour[i].rate = count > 0
                ? errorRatePerHour[i]._errorCount / count
                : 0;
        }
        // Strip internal fields
        const cleanRequests = requestsPerHour.map(({ _totalDuration, ...rest }) => rest);
        const cleanErrors = errorRatePerHour.map(({ _errorCount, ...rest }) => rest);
        return {
            requestsPerHour: cleanRequests,
            errorRatePerHour: cleanErrors,
            averageResponseTimePerHour,
        };
    }
    /**
     * Get a quick summary of system health — one object for dashboards, CI, alerts.
     */
    getSummary() {
        const totalEvents = this.events.length;
        const successful = this.events.filter(e => e.success === true).length;
        const failed = this.events.filter(e => e.success === false).length;
        const withDuration = this.events.filter(e => e.duration !== undefined);
        const avgResponseTime = withDuration.length > 0
            ? withDuration.reduce((s, e) => s + e.duration, 0) / withDuration.length
            : 0;
        // Top methods by call count
        const methodCounts = {};
        for (const e of this.events) {
            if (!e.method)
                continue;
            if (!methodCounts[e.method])
                methodCounts[e.method] = { calls: 0, totalDuration: 0 };
            methodCounts[e.method].calls++;
            if (e.duration !== undefined)
                methodCounts[e.method].totalDuration += e.duration;
        }
        const topMethods = Object.entries(methodCounts)
            .sort((a, b) => b[1].calls - a[1].calls)
            .slice(0, 10)
            .map(([method, d]) => ({ method, calls: d.calls, avgDuration: d.calls > 0 ? d.totalDuration / d.calls : 0 }));
        return {
            totalEvents,
            totalErrors: this.errors.length,
            totalMetrics: this.metrics.length,
            successRate: totalEvents > 0 ? successful / totalEvents : 1,
            errorRate: totalEvents > 0 ? failed / totalEvents : 0,
            avgResponseTime,
            topMethods,
            recentErrors: this.errors.slice(-5),
        };
    }
    /**
     * Render a markdown report of the telemetry data — useful for PR comments and dashboards.
     */
    toMarkdown() {
        const summary = this.getSummary();
        const lines = [];
        lines.push('# Telyx Telemetry Report');
        lines.push('');
        lines.push(`- **Total Events:** ${summary.totalEvents}`);
        lines.push(`- **Errors:** ${summary.totalErrors}`);
        lines.push(`- **Metrics:** ${summary.totalMetrics}`);
        lines.push(`- **Success Rate:** ${(summary.successRate * 100).toFixed(1)}%`);
        lines.push(`- **Avg Response Time:** ${summary.avgResponseTime.toFixed(0)}ms`);
        if (summary.topMethods.length > 0) {
            lines.push('');
            lines.push('## Top Methods');
            lines.push('');
            lines.push('| Method | Calls | Avg Duration |');
            lines.push('|--------|-------|-------------|');
            for (const m of summary.topMethods) {
                lines.push(`| ${m.method} | ${m.calls} | ${m.avgDuration.toFixed(0)}ms |`);
            }
        }
        if (summary.recentErrors.length > 0) {
            lines.push('');
            lines.push('## Recent Errors');
            lines.push('');
            for (const err of summary.recentErrors) {
                lines.push(`- **${err.error}** (${err.context?.method || 'unknown'})`);
            }
        }
        lines.push('');
        return lines.join('\n');
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
        const minTime = timestamps.reduce((min, t) => (t < min ? t : min), timestamps[0]);
        const maxTime = timestamps.reduce((max, t) => (t > max ? t : max), timestamps[0]);
        return maxTime - minTime;
    }
}
exports.TelyxAnalytics = TelyxAnalytics;
//# sourceMappingURL=TelyxAnalytics.js.map