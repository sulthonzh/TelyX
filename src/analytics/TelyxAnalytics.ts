import { TelyxEvent, TelyxMetric, TelyxError } from '../types';

export class TelyxAnalytics {
  private events: TelyxEvent[] = [];
  private metrics: TelyxMetric[] = [];
  private errors: TelyxError[] = [];

  /**
   * Add events from telemetry batch
   */
  public addEvents(events: TelyxEvent[]): void {
    for (const event of events) {
      this.events.push(event);
    }
  }

  /**
   * Add metrics from telemetry batch
   */
  public addMetrics(metrics: TelyxMetric[]): void {
    for (const metric of metrics) {
      this.metrics.push(metric);
    }
  }

  /**
   * Add errors from telemetry batch
   */
  public addErrors(errors: TelyxError[]): void {
    for (const error of errors) {
      this.errors.push(error);
    }
  }

  /**
   * Get performance metrics for a specific method
   */
  public getMethodPerformance(methodName: string): {
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
  } {
    const methodEvents = this.events.filter(
      event => event.method === methodName && event.duration !== undefined
    );

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

    const durations = methodEvents.map(event => event.duration!);
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
  public getSystemHealth(): {
    uptime: number;
    totalCalls: number;
    successRate: number;
    errorRate: number;
    averageResponseTime: number;
    methodPerformance: Record<string, any>;
  } {
    const totalEvents = this.events.length;
    const successfulEvents = this.events.filter(event => event.success).length;
    const failedEvents = this.events.filter(event => !event.success).length;

    // Calculate average response time from all method calls
    const methodEvents = this.events.filter(event => event.duration !== undefined);
    const averageResponseTime = methodEvents.length > 0
      ? methodEvents.reduce((sum, event) => sum + event.duration!, 0) / methodEvents.length
      : 0;

    // Get performance for all methods
    const methodNames = [...new Set(this.events.map(event => event.method).filter((methodName): methodName is string => Boolean(methodName)))];
    const methodPerformance: Record<string, any> = {};
    
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
  public getErrorAnalysis(): {
    totalErrors: number;
    errorByMethod: Record<string, number>;
    errorTypes: Record<string, number>;
    recentErrors: TelyxError[];
    errorRate: number;
  } {
    const totalEvents = this.events.length;
    const errorByMethod: Record<string, number> = {};
    const errorTypes: Record<string, number> = {};

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
  public getUsageMetrics(): {
    totalTokens: number;
    averageTokensPerCall: number;
    totalApiCalls: number;
    providerUsage: Record<string, number>;
    modelUsage: Record<string, number>;
  } {
    const aiEvents = this.events.filter(event => event.event === 'ai_api_call');
    const tokenMetrics = this.metrics.filter(metric => metric.metric === 'tokens_used');

    let totalTokens = 0;
    const providerUsage: Record<string, number> = {};
    const modelUsage: Record<string, number> = {};

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
  public getTimeSeriesData(timeRange: '1h' | '24h' | '7d' = '24h'): {
    requestsPerHour: { timestamp: string; count: number }[];
    errorRatePerHour: { timestamp: string; rate: number }[];
    averageResponseTimePerHour: { timestamp: string; time: number }[];
  } {
    const now = new Date();
    const bucketCount = timeRange === '1h' ? 60 : timeRange === '24h' ? 24 : 24 * 7;
    const bucketMs = timeRange === '1h' ? 60 * 1000 : 60 * 60 * 1000;

    // Initialize time series buckets
    const requestsPerHour: { timestamp: string; count: number; _totalDuration: number }[] = [];
    const errorRatePerHour: { timestamp: string; rate: number; _errorCount: number }[] = [];
    const averageResponseTimePerHour: { timestamp: string; time: number }[] = [];

    for (let i = bucketCount - 1; i >= 0; i--) {
      const bucketStart = new Date(now.getTime() - i * bucketMs);
      const timeKey = timeRange === '1h'
        ? bucketStart.toISOString().substring(14, 19) // HH:MM
        : bucketStart.toISOString().substring(0, 13); // YYYY-MM-DDTHH

      requestsPerHour.push({ timestamp: timeKey, count: 0, _totalDuration: 0 });
      errorRatePerHour.push({ timestamp: timeKey, rate: 0, _errorCount: 0 });
      averageResponseTimePerHour.push({ timestamp: timeKey, time: 0 });
    }

    // Populate data by assigning each event to its bucket
    this.events.forEach(event => {
      const eventTime = new Date(event.timestamp).getTime();
      const offsetMs = now.getTime() - eventTime;
      const offsetBuckets = Math.floor(offsetMs / bucketMs);

      // Skip events outside the time range
      if (offsetBuckets >= bucketCount || offsetBuckets < 0) return;

      // Bucket index: 0 = oldest, bucketCount-1 = current
      const index = bucketCount - 1 - offsetBuckets;
      if (index < 0 || index >= bucketCount) return;

      requestsPerHour[index].count++;

      if (event.success === false) {
        errorRatePerHour[index]._errorCount++;
      }

      if (event.duration != null) {
        requestsPerHour[index]._totalDuration += event.duration;
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
   * Clear all data
   */
  public clear(): void {
    this.events = [];
    this.metrics = [];
    this.errors = [];
  }

  /**
   * Calculate uptime based on event timestamps
   */
  private calculateUptime(): number {
    if (this.events.length === 0) return 0;

    const timestamps = this.events.map(event => new Date(event.timestamp).getTime());
    const minTime = timestamps.reduce((min, t) => (t < min ? t : min), timestamps[0]);
    const maxTime = timestamps.reduce((max, t) => (t > max ? t : max), timestamps[0]);
    
    return maxTime - minTime;
  }
}