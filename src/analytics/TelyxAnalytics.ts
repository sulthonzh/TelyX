import { TelyxEvent, TelyxMetric, TelyxError } from '../types';

export class TelyxAnalytics {
  private events: TelyxEvent[] = [];
  private metrics: TelyxMetric[] = [];
  private errors: TelyxError[] = [];
  private maxRetention: number;
  private maxHistoryAgeMs: number;

  constructor(maxRetention: number = 10000, maxHistoryAgeMs: number = 7 * 24 * 60 * 60 * 1000) {
    this.maxRetention = maxRetention;
    this.maxHistoryAgeMs = maxHistoryAgeMs;
  }

  /**
   * Add events from telemetry batch
   */
  public addEvents(events: TelyxEvent[]): void {
    // Validate input: ensure it's an array and each item is a valid event object.
    // Without this, corrupted data (null, undefined, wrong types) would break
    // analytics calculations (reduce, filter, map operations would crash).
    if (!Array.isArray(events)) {
      throw new Error('events must be an array');
    }
    
    for (const event of events) {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new Error('events array must contain objects only');
      }
      
      if (typeof event.timestamp !== 'string' || event.timestamp.trim() === '') {
        throw new Error('each event must have a non-empty timestamp string');
      }
      
      if (typeof event.event !== 'string' || event.event.trim() === '') {
        throw new Error('each event must have a non-empty event string');
      }
    }
    
    // Use concat instead of push(...events) to avoid RangeError
    // (Maximum call stack size exceeded) when events is very large.
    this.events = this.events.concat(events);
    this.cleanupData();
  }

  /**
   * Add metrics from telemetry batch
   */
  public addMetrics(metrics: TelyxMetric[]): void {
    // Validate input: ensure it's an array and each item is a valid metric object.
    // Without this, corrupted data would break analytics calculations.
    if (!Array.isArray(metrics)) {
      throw new Error('metrics must be an array');
    }
    
    for (const metric of metrics) {
      if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
        throw new Error('metrics array must contain objects only');
      }
      
      if (typeof metric.timestamp !== 'string' || metric.timestamp.trim() === '') {
        throw new Error('each metric must have a non-empty timestamp string');
      }
      
      if (typeof metric.metric !== 'string' || metric.metric.trim() === '') {
        throw new Error('each metric must have a non-empty metric string');
      }
      
      if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) {
        throw new Error('each metric must have a finite number value');
      }
    }
    
    this.metrics = this.metrics.concat(metrics);
    this.cleanupData();
  }

  /**
   * Add errors from telemetry batch
   */
  public addErrors(errors: TelyxError[]): void {
    // Validate input: ensure it's an array and each item is a valid error object.
    // Without this, corrupted data would break analytics calculations.
    if (!Array.isArray(errors)) {
      throw new Error('errors must be an array');
    }
    
    for (const error of errors) {
      if (!error || typeof error !== 'object' || Array.isArray(error)) {
        throw new Error('errors array must contain objects only');
      }
      
      if (typeof error.timestamp !== 'string' || error.timestamp.trim() === '') {
        throw new Error('each error must have a non-empty timestamp string');
      }
      
      if (typeof error.error !== 'string' || error.error.trim() === '') {
        throw new Error('each error must have a non-empty error string');
      }
      
      if (!error.context || typeof error.context !== 'object' || Array.isArray(error.context)) {
        throw new Error('each error must have an object context');
      }
    }
    
    this.errors = this.errors.concat(errors);
    this.cleanupData();
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

    // Use Number.isFinite() for consistency — it rejects undefined, null,
    // NaN, Infinity, and -Infinity in a single check, matching the pattern
    // used in recordSuccess/recordMetric.
    const durations = methodEvents
      .map(event => event.duration!)
      .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration));

    const successfulCalls = methodEvents.filter(event => event.success).length;
    const failedCalls = methodEvents.filter(event => !event.success).length;

    return {
      averageDuration: durations.length > 0 ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0,
      minDuration: durations.length > 0 ? durations.reduce((min, d) => (d < min ? d : min), durations[0]) : 0,
      maxDuration: durations.length > 0 ? durations.reduce((max, d) => (d > max ? d : max), durations[0]) : 0,
      successRate: methodEvents.length > 0 ? successfulCalls / methodEvents.length : 0,
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
    methodPerformance: Record<string, unknown>;
    } {
    // Only count events that have an explicit success boolean — custom events
    // (recordEvent) have no success field and must not inflate totals.
    const successfulEvents = this.events.filter(event => event.success === true).length;
    const failedEvents = this.events.filter(event => event.success === false).length;
    // Only events with an explicit success boolean belong in the denominator.
    // Custom events (recordEvent) have no success field and would dilute the rates.
    // totalCalls must equal ratedEvents — using this.events.length here would
    // count custom events (http_request, user_signup, etc.) as "calls",
    // producing misleading system health metrics.
    const ratedEvents = successfulEvents + failedEvents;

    // Calculate average response time from all method calls.
    // Filter for finite durations only — NaN/Infinity pass `!== undefined`
    // and would corrupt the sum (NaN propagates, Infinity skews the average).
    // Events can enter via addEvents() which doesn't validate duration finiteness.
    const methodEvents = this.events.filter(
      event => typeof event.duration === 'number' && Number.isFinite(event.duration)
    );
    const averageResponseTime = methodEvents.length > 0
      ? methodEvents.reduce((sum, event) => sum + event.duration!, 0) / methodEvents.length
      : 0;

    // Get performance for all methods
    const methodNames = [...new Set(this.events.map(event => event.method).filter((methodName): methodName is string => Boolean(methodName)))];
    const methodPerformance: Record<string, unknown> = {};
    
    methodNames.forEach(methodName => {
      methodPerformance[methodName] = this.getMethodPerformance(methodName);
    });

    return {
      uptime: this.calculateUptime(),
      totalCalls: ratedEvents,
      successRate: ratedEvents > 0 ? successfulEvents / ratedEvents : 0,
      errorRate: ratedEvents > 0 ? failedEvents / ratedEvents : 0,
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
    // Only events with explicit success/failure belong in the denominator.
    // Custom events (recordEvent) have no success field and would dilute the rate.
    const ratedEvents = this.events.filter(e => e.success === true || e.success === false).length;
    const errorByMethod: Record<string, number> = {};
    const errorTypes: Record<string, number> = {};

    this.errors.forEach(error => {
      const method = (error.context as Record<string, unknown>)?.method as string || 'unknown';
      errorByMethod[method] = (errorByMethod[method] || 0) + 1;

      const errorType = typeof error.error === 'string' ? error.error.split(':')[0] || 'Unknown' : 'Unknown';
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });

    // Error rate should be based on failed events vs rated events, not
    // errors.length vs rated events. errors.length can exceed ratedEvents
    // when recordError() is called directly (without recordFailure()),
    // which would produce errorRate > 1.0 — a meaningless value.
    const failedEvents = this.events.filter(e => e.success === false).length;

    return {
      totalErrors: this.errors.length,
      errorByMethod,
      errorTypes,
      recentErrors: this.errors.slice(-10),
      errorRate: ratedEvents > 0 ? failedEvents / ratedEvents : 0,
    };
  }

  /**
   * Get usage metrics
   *
   * Counts from method success/failure events (recordSuccess/recordFailure)
   * which are NOT sampled, rather than custom 'ai_api_call' events
   * (recordEvent) which ARE sampled at sampleRate < 1.
   * aiCallMiddleware calls recordSuccess/recordFailure directly (not via
   * trackMethod or track Proxy), so those events represent the true call
   * count regardless of sampleRate. Token totals are extracted from the
   * tokensUsed field in success metadata, also unsampled.
   */
  public getUsageMetrics(): {
    totalTokens: number;
    averageTokensPerCall: number;
    totalApiCalls: number;
    providerUsage: Record<string, number>;
    modelUsage: Record<string, number>;
    } {
    // recordSuccess and recordFailure create events with method='ai_api_call'
    // and success=true/false. These bypass sampling, so they reflect the
    // true number of AI API calls even at sampleRate < 1.
    const aiMethodEvents = this.events.filter(
      event => event.method === 'ai_api_call' && event.success !== undefined
    );

    let totalTokens = 0;
    const providerUsage: Record<string, number> = {};
    const modelUsage: Record<string, number> = {};

    aiMethodEvents.forEach(event => {
      const meta = (event.metadata || {}) as Record<string, unknown>;
      const provider = meta.provider as string || 'unknown';
      const model = meta.model as string || 'unknown';

      providerUsage[provider] = (providerUsage[provider] || 0) + 1;
      modelUsage[model] = (modelUsage[model] || 0) + 1;

      // Only success events carry tokensUsed in their metadata.
      if (event.success && typeof meta.tokensUsed === 'number') {
        totalTokens += meta.tokensUsed;
      }
    });

    const successfulCalls = aiMethodEvents.filter(e => e.success).length;

    return {
      totalTokens,
      averageTokensPerCall: successfulCalls > 0 ? totalTokens / successfulCalls : 0,
      totalApiCalls: aiMethodEvents.length,
      providerUsage,
      modelUsage,
    };
  }

  /**
   * Detect anomalies in response times and error rates
   */
  public detectAnomalies(): {
    highErrorRateMethods: { method: string; errorRate: number; threshold: number }[];
    slowResponseMethods: { method: string; avgDuration: number; threshold: number }[];
    suddenTrafficSpikes: { timestamp: string; requestCount: number; threshold: number }[];
    } {
    const highErrorRateMethods: { method: string; errorRate: number; threshold: number }[] = [];
    const slowResponseMethods: { method: string; avgDuration: number; threshold: number }[] = [];
    const suddenTrafficSpikes: { timestamp: string; requestCount: number; threshold: number }[] = [];
    
    // Track durationCount separately from totalCalls. totalCalls counts ALL
    // events with a method field (for error rate), but only events with valid
    // finite durations should contribute to the average. Without this, events
    // that have method but no duration inflate the denominator, producing
    // underestimated averages.
    const methodStats: Record<string, { totalCalls: number; errors: number; totalTime: number; durationCount: number }> = {};
    for (const event of this.events) {
      if (!event.method) continue;
      
      const stats = methodStats[event.method] || { totalCalls: 0, errors: 0, totalTime: 0, durationCount: 0 };
      stats.totalCalls++;
      if (event.success === false) {
        stats.errors++;
      }
      // Only sum finite durations — NaN/Infinity would corrupt totalTime.
      if (typeof event.duration === 'number' && Number.isFinite(event.duration)) {
        stats.totalTime += event.duration;
        stats.durationCount++;
      }
      methodStats[event.method] = stats;
    }
    
    for (const [method, stats] of Object.entries(methodStats)) {
      if (stats.totalCalls === 0) continue;
      
      const errorRate = stats.errors / stats.totalCalls;
      if (errorRate > 0.05) {
        highErrorRateMethods.push({
          method,
          errorRate,
          threshold: 0.05,
        });
      }
      
      // Average over events that had a valid duration, not all method events.
      const avgDuration = stats.durationCount > 0 ? stats.totalTime / stats.durationCount : 0;
      if (avgDuration > 2000) {
        slowResponseMethods.push({
          method,
          avgDuration,
          threshold: 2000,
        });
      }
    }
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const spikeEvents = this.events.filter(event => 
      new Date(event.timestamp) > oneHourAgo
    );
    
    // Group by 10-minute buckets
    const buckets: Record<string, number> = {};
    spikeEvents.forEach(event => {
      const bucketTime = new Date(event.timestamp);
      // Include date in bucket key so multi-day data doesn't collide.
      // Use UTC for both date and time to stay consistent with ISO timestamps
      // used everywhere else in the codebase. Mixing UTC date with local
      // hours (getHours) would place events in wrong buckets near midnight.
      const hh = String(bucketTime.getUTCHours()).padStart(2, '0');
      const mm = String(Math.floor(bucketTime.getUTCMinutes() / 10) * 10).padStart(2, '0');
      const bucketKey = `${bucketTime.toISOString().substring(0, 10)} ${hh}:${mm}`;
      buckets[bucketKey] = (buckets[bucketKey] || 0) + 1;
    });
    
    const bucketValues = Object.values(buckets);
    if (bucketValues.length === 0) {
      return { highErrorRateMethods, slowResponseMethods, suddenTrafficSpikes };
    }

    const avgRequests = bucketValues.reduce((sum, val) => sum + val, 0) / bucketValues.length;

    for (const [timestamp, count] of Object.entries(buckets)) {
      if (count > avgRequests * 3) {
        suddenTrafficSpikes.push({
          timestamp,
          requestCount: count,
          threshold: avgRequests * 3,
        });
      }
    }
    
    return {
      highErrorRateMethods,
      slowResponseMethods,
      suddenTrafficSpikes,
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

    const buckets = Array(bucketCount).fill(null).map((_, i) => {
      const bucketStart = new Date(now.getTime() - (bucketCount - 1 - i) * bucketMs);
      const timeKey = timeRange === '1h'
        ? bucketStart.toISOString().substring(11, 16) // HH:MM
        : bucketStart.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      
      return {
        timestamp: timeKey,
        count: 0,
        errors: 0,
        totalDuration: 0
      };
    });

    // Filter events to only those within the time range first
    const minTime = now.getTime() - bucketCount * bucketMs;
    const relevantEvents = this.events.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime >= minTime && eventTime <= now.getTime();
    });

    for (const event of relevantEvents) {
      const eventTime = new Date(event.timestamp).getTime();
      const timeDiffMs = now.getTime() - eventTime;
      
      const bucketIndex = Math.floor(timeDiffMs / bucketMs);
      const index = bucketCount - 1 - bucketIndex;
      
      if (index >= 0 && index < bucketCount) {
        buckets[index].count++;

        if (event.success === false) {
          buckets[index].errors++;
        }

        // Only sum finite durations — NaN/Infinity from addEvents() would
        // corrupt totalDuration and propagate to averageResponseTimePerHour.
        if (typeof event.duration === 'number' && Number.isFinite(event.duration)) {
          buckets[index].totalDuration += event.duration;
        }
      }
    }

    const requestsPerHour = buckets.map(bucket => ({
      timestamp: bucket.timestamp,
      count: bucket.count
    }));

    // Only events with explicit success/failure belong in the denominator.
    // Custom events (recordEvent) have no success field and would dilute the rate.
    const ratedPerBucket = new Array(bucketCount).fill(0);
    // Only events with a duration should count toward average response time.
    // Custom events (recordEvent) have no duration and would dilute the average.
    const timedPerBucket = new Array(bucketCount).fill(0);
    for (const event of relevantEvents) {
      const eventTime = new Date(event.timestamp).getTime();
      const timeDiffMs = now.getTime() - eventTime;
      const bucketIndex = Math.floor(timeDiffMs / bucketMs);
      const index = bucketCount - 1 - bucketIndex;
      if (index >= 0 && index < bucketCount) {
        if (event.success === true || event.success === false) {
          ratedPerBucket[index]++;
        }
        if (typeof event.duration === 'number' && Number.isFinite(event.duration)) {
          timedPerBucket[index]++;
        }
      }
    }

    const errorRatePerHour = buckets.map((bucket, i) => ({
      timestamp: bucket.timestamp,
      rate: ratedPerBucket[i] > 0 ? bucket.errors / ratedPerBucket[i] : 0
    }));

    const averageResponseTimePerHour = buckets.map((bucket, i) => ({
      timestamp: bucket.timestamp,
      time: timedPerBucket[i] > 0 ? bucket.totalDuration / timedPerBucket[i] : 0
    }));

    return {
      requestsPerHour,
      errorRatePerHour,
      averageResponseTimePerHour,
    };
  }

  /**
   * Get a quick summary of system health — one object for dashboards, CI, alerts.
   */
  public getSummary(): {
    totalEvents: number;
    totalErrors: number;
    totalMetrics: number;
    successRate: number;
    errorRate: number;
    avgResponseTime: number;
    topMethods: { method: string; calls: number; avgDuration: number }[];
    recentErrors: TelyxError[];
    } {
    const totalEvents = this.events.length;
    const successful = this.events.filter(e => e.success === true).length;
    const failed = this.events.filter(e => e.success === false).length;
    // Only events with explicit success/failure belong in rate denominators.
    // Custom events (recordEvent) have no success field and would skew the rates.
    const ratedEvents = successful + failed;
    // Use Number.isFinite() for consistency with getMethodPerformance(),
    // getSystemHealth(), and detectAnomalies(). Events from addEvents() are
    // not validated for duration finiteness — NaN/Infinity would corrupt
    // the sum and produce a NaN average.
    const withDuration = this.events.filter(
      e => typeof e.duration === 'number' && Number.isFinite(e.duration)
    );

    const avgResponseTime = withDuration.length > 0
      ? withDuration.reduce((s, e) => s + e.duration!, 0) / withDuration.length
      : 0;

    // Track durationCount separately — dividing totalDuration by ALL calls
    // (including ones without a valid duration) underestimates the average.
    // This matches the pattern in detectAnomalies().
    const methodCounts: Record<string, { calls: number; totalDuration: number; durationCount: number }> = {};
    for (const e of this.events) {
      if (!e.method) continue;
      if (!methodCounts[e.method]) methodCounts[e.method] = { calls: 0, totalDuration: 0, durationCount: 0 };
      methodCounts[e.method].calls++;
      if (typeof e.duration === 'number' && Number.isFinite(e.duration)) {
        methodCounts[e.method].totalDuration += e.duration;
        methodCounts[e.method].durationCount++;
      }
    }
    const topMethods = Object.entries(methodCounts)
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 10)
      .map(([method, d]) => ({ method, calls: d.calls, avgDuration: d.durationCount > 0 ? d.totalDuration / d.durationCount : 0 }));

    return {
      totalEvents,
      totalErrors: this.errors.length,
      totalMetrics: this.metrics.length,
      successRate: ratedEvents > 0 ? successful / ratedEvents : 1,
      errorRate: ratedEvents > 0 ? failed / ratedEvents : 0,
      avgResponseTime,
      topMethods,
      recentErrors: this.errors.slice(-5),
    };
  }

  /**
   * Render a markdown report of the telemetry data — useful for PR comments and dashboards.
   */
  public toMarkdown(): string {
    const summary = this.getSummary();
    const anomalies = this.detectAnomalies();
    const lines: string[] = [];

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

    // Anomaly Detection Results
    if (anomalies.highErrorRateMethods.length > 0 || 
        anomalies.slowResponseMethods.length > 0 || 
        anomalies.suddenTrafficSpikes.length > 0) {
      lines.push('');
      lines.push('## ⚠️ Anomalies Detected');
      lines.push('');
      
      if (anomalies.highErrorRateMethods.length > 0) {
        lines.push('### High Error Rate Methods');
        lines.push('');
        lines.push('| Method | Error Rate | Threshold |');
        lines.push('|--------|------------|-----------|');
        for (const method of anomalies.highErrorRateMethods) {
          lines.push(`| ${method.method} | ${(method.errorRate * 100).toFixed(1)}% | 5.0% |`);
        }
        lines.push('');
      }
      
      if (anomalies.slowResponseMethods.length > 0) {
        lines.push('### Slow Response Methods');
        lines.push('');
        lines.push('| Method | Avg Duration | Threshold |');
        lines.push('|--------|-------------|-----------|');
        for (const method of anomalies.slowResponseMethods) {
          lines.push(`| ${method.method} | ${method.avgDuration.toFixed(0)}ms | 2000ms |`);
        }
        lines.push('');
      }
      
      if (anomalies.suddenTrafficSpikes.length > 0) {
        lines.push('### Sudden Traffic Spikes');
        lines.push('');
        lines.push('| Time | Requests | Threshold |');
        lines.push('|------|----------|-----------|');
        for (const spike of anomalies.suddenTrafficSpikes) {
          lines.push(`| ${spike.timestamp} | ${spike.requestCount} | ${spike.threshold.toFixed(0)} |`);
        }
        lines.push('');
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
   * Clean up old data to prevent memory leaks
   */
  private cleanupData(): void {
    const now = Date.now();
    
    if (this.maxHistoryAgeMs > 0) {
      this.events = this.events.filter(event => {
        const eventTime = new Date(event.timestamp).getTime();
        return now - eventTime < this.maxHistoryAgeMs;
      });
      
      this.metrics = this.metrics.filter(metric => {
        const metricTime = new Date(metric.timestamp).getTime();
        return now - metricTime < this.maxHistoryAgeMs;
      });
      
      this.errors = this.errors.filter(error => {
        const errorTime = new Date(error.timestamp).getTime();
        return now - errorTime < this.maxHistoryAgeMs;
      });
    }
    
    if (this.events.length > this.maxRetention) {
      this.events = this.events.slice(-this.maxRetention);
    }
    
    if (this.metrics.length > this.maxRetention) {
      this.metrics = this.metrics.slice(-this.maxRetention);
    }
    
    if (this.errors.length > Math.floor(this.maxRetention / 10)) {
      this.errors = this.errors.slice(-Math.floor(this.maxRetention / 10));
    }
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
    if (timestamps.length === 0) return 0;
    
    const minTime = timestamps.reduce((min, t) => (t < min ? t : min), timestamps[0]);
    const maxTime = timestamps.reduce((max, t) => (t > max ? t : max), timestamps[0]);
    
    return maxTime - minTime;
  }
}