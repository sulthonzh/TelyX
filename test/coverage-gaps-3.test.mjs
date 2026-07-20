import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx } from '../dist/index.js';
import { TelyxAnalytics } from '../dist/analytics/TelyxAnalytics.js';
import { TelyxMiddleware } from '../dist/middleware/TelyxMiddleware.js';

// ─── TelyxAnalytics Input Validation Branches ───

describe('TelyxAnalytics addEvents validation branches', () => {
  it('rejects non-array events', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addEvents(null), /events must be an array/);
    assert.throws(() => a.addEvents('notarray'), /events must be an array/);
    assert.throws(() => a.addEvents({}), /events must be an array/);
    assert.throws(() => a.addEvents(42), /events must be an array/);
  });

  it('rejects events with non-object items', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addEvents([null]), /objects only/);
    assert.throws(() => a.addEvents([42]), /objects only/);
    assert.throws(() => a.addEvents(['str']), /objects only/);
    assert.throws(() => a.addEvents([[]]), /objects only/);
  });

  it('rejects events with missing/empty timestamp', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addEvents([{ event: 'test' }]), /non-empty timestamp string/);
    assert.throws(() => a.addEvents([{ event: 'test', timestamp: '' }]), /non-empty timestamp string/);
    assert.throws(() => a.addEvents([{ event: 'test', timestamp: 123 }]), /non-empty timestamp string/);
    assert.throws(() => a.addEvents([{ event: 'test', timestamp: '   ' }]), /non-empty timestamp string/);
  });

  it('rejects events with missing/empty event string', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addEvents([{ timestamp: '2025-01-01T00:00:00Z' }]), /non-empty event string/);
    assert.throws(() => a.addEvents([{ timestamp: '2025-01-01T00:00:00Z', event: '' }]), /non-empty event string/);
    assert.throws(() => a.addEvents([{ timestamp: '2025-01-01T00:00:00Z', event: 42 }]), /non-empty event string/);
    assert.throws(() => a.addEvents([{ timestamp: '2025-01-01T00:00:00Z', event: '   ' }]), /non-empty event string/);
  });

  it('accepts valid events', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), event: 'test1' },
      { timestamp: new Date().toISOString(), event: 'test2', method: 'api', success: true, duration: 100 },
    ]);
    assert.ok(a.getSummary().totalEvents >= 2);
  });
});

describe('TelyxAnalytics addMetrics validation branches', () => {
  it('rejects non-array metrics', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addMetrics(null), /metrics must be an array/);
    assert.throws(() => a.addMetrics('notarray'), /metrics must be an array/);
    assert.throws(() => a.addMetrics({}), /metrics must be an array/);
  });

  it('rejects metrics with non-object items', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addMetrics([null]), /objects only/);
    assert.throws(() => a.addMetrics([42]), /objects only/);
    assert.throws(() => a.addMetrics([[]]), /objects only/);
  });

  it('rejects metrics with missing/empty timestamp', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addMetrics([{ metric: 'cpu', value: 1 }]), /non-empty timestamp string/);
    assert.throws(() => a.addMetrics([{ metric: 'cpu', value: 1, timestamp: '' }]), /non-empty timestamp string/);
    assert.throws(() => a.addMetrics([{ metric: 'cpu', value: 1, timestamp: 123 }]), /non-empty timestamp string/);
  });

  it('rejects metrics with missing/empty metric name', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', value: 1 }]), /non-empty metric string/);
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', value: 1, metric: '' }]), /non-empty metric string/);
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', value: 1, metric: 42 }]), /non-empty metric string/);
  });

  it('rejects metrics with non-finite value', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', metric: 'cpu' }]), /finite number value/);
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', metric: 'cpu', value: NaN }]), /finite number value/);
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', metric: 'cpu', value: Infinity }]), /finite number value/);
    assert.throws(() => a.addMetrics([{ timestamp: '2025-01-01T00:00:00Z', metric: 'cpu', value: 'high' }]), /finite number value/);
  });

  it('accepts valid metrics', () => {
    const a = new TelyxAnalytics();
    a.addMetrics([
      { timestamp: new Date().toISOString(), metric: 'cpu', value: 50 },
      { timestamp: new Date().toISOString(), metric: 'memory', value: 0 },
      { timestamp: new Date().toISOString(), metric: 'temp', value: -5 },
    ]);
    assert.ok(a.getSummary().totalMetrics >= 3);
  });
});

describe('TelyxAnalytics addErrors validation branches', () => {
  it('rejects non-array errors', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addErrors(null), /errors must be an array/);
    assert.throws(() => a.addErrors('notarray'), /errors must be an array/);
    assert.throws(() => a.addErrors({}), /errors must be an array/);
  });

  it('rejects errors with non-object items', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addErrors([null]), /objects only/);
    assert.throws(() => a.addErrors([42]), /objects only/);
    assert.throws(() => a.addErrors([[]]), /objects only/);
  });

  it('rejects errors with missing/empty timestamp', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addErrors([{ error: 'test', context: {} }]), /non-empty timestamp string/);
    assert.throws(() => a.addErrors([{ error: 'test', context: {}, timestamp: '' }]), /non-empty timestamp string/);
    assert.throws(() => a.addErrors([{ error: 'test', context: {}, timestamp: 123 }]), /non-empty timestamp string/);
  });

  it('rejects errors with missing/empty error string', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', context: {} }]), /non-empty error string/);
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', context: {}, error: '' }]), /non-empty error string/);
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', context: {}, error: 42 }]), /non-empty error string/);
  });

  it('rejects errors with missing/invalid context', () => {
    const a = new TelyxAnalytics();
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', error: 'test' }]), /object context/);
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', error: 'test', context: 'str' }]), /object context/);
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', error: 'test', context: 42 }]), /object context/);
    assert.throws(() => a.addErrors([{ timestamp: '2025-01-01T00:00:00Z', error: 'test', context: [] }]), /object context/);
  });

  it('accepts valid errors', () => {
    const a = new TelyxAnalytics();
    a.addErrors([
      { timestamp: new Date().toISOString(), error: 'TestError', context: { method: 'api' } },
      { timestamp: new Date().toISOString(), error: 'AnotherError: detail', context: {} },
    ]);
    assert.ok(a.getErrorAnalysis().totalErrors >= 2);
  });
});

// ─── TelyxAnalytics detectAnomalies branches ───

describe('TelyxAnalytics detectAnomalies edge cases', () => {
  it('returns empty arrays when no events exist', () => {
    const a = new TelyxAnalytics();
    const anomalies = a.detectAnomalies();
    assert.equal(anomalies.highErrorRateMethods.length, 0);
    assert.equal(anomalies.slowResponseMethods.length, 0);
    assert.equal(anomalies.suddenTrafficSpikes.length, 0);
  });

  it('detects high error rate methods', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'method_success', method: 'flaky', success: true, duration: 100 },
      { timestamp: now, event: 'method_success', method: 'flaky', success: true, duration: 100 },
      { timestamp: now, event: 'method_failure', method: 'flaky', success: false, duration: 100 },
      { timestamp: now, event: 'method_failure', method: 'flaky', success: false, duration: 100 },
      { timestamp: now, event: 'method_failure', method: 'flaky', success: false, duration: 100 },
      { timestamp: now, event: 'method_failure', method: 'flaky', success: false, duration: 100 },
    ]);
    const anomalies = a.detectAnomalies();
    assert.ok(anomalies.highErrorRateMethods.length > 0);
    assert.equal(anomalies.highErrorRateMethods[0].method, 'flaky');
  });

  it('detects slow response methods', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'slowMethod', success: true, duration: 3000 },
      { timestamp: now, event: 'test', method: 'slowMethod', success: true, duration: 2500 },
    ]);
    const anomalies = a.detectAnomalies();
    assert.ok(anomalies.slowResponseMethods.length > 0);
    assert.equal(anomalies.slowResponseMethods[0].method, 'slowMethod');
  });

  it('does not flag methods with low error rate (exactly 5%)', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    const events = [];
    for (let i = 0; i < 20; i++) {
      events.push({ timestamp: now, event: 'test', method: 'healthy', success: true, duration: 100 });
    }
    events.push({ timestamp: now, event: 'test', method: 'healthy', success: false, duration: 100 });
    a.addEvents(events);
    const anomalies = a.detectAnomalies();
    const found = anomalies.highErrorRateMethods.find(m => m.method === 'healthy');
    assert.equal(found, undefined); // 1/21 ≈ 4.76% < 5%
  });

  it('does not flag fast methods as slow', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'fast', success: true, duration: 100 },
      { timestamp: now, event: 'test', method: 'fast', success: true, duration: 200 },
    ]);
    const anomalies = a.detectAnomalies();
    const found = anomalies.slowResponseMethods.find(m => m.method === 'fast');
    assert.equal(found, undefined);
  });

  it('handles events with method but no duration', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'custom', method: 'noDuration' },
      { timestamp: now, event: 'test', method: 'withDur', success: true, duration: 100 },
    ]);
    const anomalies = a.detectAnomalies();
    // Should not crash — noDuration should be excluded from duration averages
    assert.ok(anomalies !== undefined);
  });
});

// ─── TelyxAnalytics getTimeSeriesData branches ───

describe('TelyxAnalytics getTimeSeriesData branches', () => {
  it('returns 1h time range with 60 buckets', () => {
    const a = new TelyxAnalytics();
    const result = a.getTimeSeriesData('1h');
    assert.equal(result.requestsPerHour.length, 60);
    assert.equal(result.errorRatePerHour.length, 60);
    assert.equal(result.averageResponseTimePerHour.length, 60);
  });

  it('returns 24h time range with 24 buckets', () => {
    const a = new TelyxAnalytics();
    const result = a.getTimeSeriesData('24h');
    assert.equal(result.requestsPerHour.length, 24);
  });

  it('returns 7d time range with 168 buckets', () => {
    const a = new TelyxAnalytics();
    const result = a.getTimeSeriesData('7d');
    assert.equal(result.requestsPerHour.length, 168);
  });

  it('includes events in correct time buckets', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', method: 'api', success: true, duration: 100 },
      { timestamp: new Date().toISOString(), event: 'test', method: 'api', success: false, duration: 200 },
    ]);
    const result = a.getTimeSeriesData('1h');
    const totalRequests = result.requestsPerHour.reduce((sum, b) => sum + b.count, 0);
    assert.ok(totalRequests >= 2);
  });

  it('uses default 24h range when no argument', () => {
    const a = new TelyxAnalytics();
    const result = a.getTimeSeriesData();
    assert.equal(result.requestsPerHour.length, 24);
  });
});

// ─── TelyxAnalytics getSystemHealth branches ───

describe('TelyxAnalytics getSystemHealth branches', () => {
  it('returns zeros for empty analytics', () => {
    const a = new TelyxAnalytics();
    const health = a.getSystemHealth();
    assert.equal(health.totalCalls, 0);
    assert.equal(health.successRate, 0);
    assert.equal(health.errorRate, 0);
    assert.equal(health.averageResponseTime, 0);
  });

  it('calculates health correctly with mixed events', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'api_call', success: true, duration: 100 },
      { timestamp: now, event: 'test', method: 'api_call', success: true, duration: 200 },
      { timestamp: now, event: 'test', method: 'api_call', success: false, duration: 300 },
      { timestamp: now, event: 'custom' }, // no success field — excluded from rated events
    ]);
    const health = a.getSystemHealth();
    assert.equal(health.totalCalls, 3);
    assert.equal(health.successRate, 2/3);
    assert.equal(health.errorRate, 1/3);
    assert.ok(health.averageResponseTime > 0);
    assert.ok(health.methodPerformance['api_call'] !== undefined);
  });

  it('calculates uptime from event timestamps', () => {
    const a = new TelyxAnalytics();
    const oldTime = new Date(Date.now() - 5000).toISOString();
    const newTime = new Date().toISOString();
    a.addEvents([
      { timestamp: oldTime, event: 'start' },
      { timestamp: newTime, event: 'end' },
    ]);
    const health = a.getSystemHealth();
    assert.ok(health.uptime >= 4000);
  });

  it('excludes events without explicit success from rated counts', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'custom1' },
      { timestamp: now, event: 'custom2' },
    ]);
    const health = a.getSystemHealth();
    assert.equal(health.totalCalls, 0); // no rated events
    assert.equal(health.successRate, 0);
  });
});

// ─── TelyxAnalytics getErrorAnalysis branches ───

describe('TelyxAnalytics getErrorAnalysis branches', () => {
  it('returns unknown method for errors without context.method', () => {
    const a = new TelyxAnalytics();
    a.addErrors([{ timestamp: new Date().toISOString(), error: 'SomethingFailed: detail', context: { code: 500 } }]);
    const analysis = a.getErrorAnalysis();
    assert.equal(analysis.errorByMethod['unknown'], 1);
    assert.equal(analysis.errorTypes['SomethingFailed'], 1);
  });

  it('uses whole error string as type when no colon', () => {
    const a = new TelyxAnalytics();
    a.addErrors([{ timestamp: new Date().toISOString(), error: 'NoColonHere', context: { method: 'test' } }]);
    const analysis = a.getErrorAnalysis();
    assert.equal(analysis.errorTypes['NoColonHere'], 1);
  });

  it('calculates error rate from failed events', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'api', success: true, duration: 100 },
      { timestamp: now, event: 'test', method: 'api', success: true, duration: 200 },
      { timestamp: now, event: 'test', method: 'api', success: false, duration: 150 },
    ]);
    const analysis = a.getErrorAnalysis();
    assert.equal(analysis.errorRate, 1/3);
  });

  it('returns zero error rate when no rated events', () => {
    const a = new TelyxAnalytics();
    const analysis = a.getErrorAnalysis();
    assert.equal(analysis.errorRate, 0);
    assert.equal(analysis.totalErrors, 0);
  });

  it('returns recent errors (max 10)', () => {
    const a = new TelyxAnalytics();
    const errors = [];
    for (let i = 0; i < 15; i++) {
      errors.push({ timestamp: new Date().toISOString(), error: `Error${i}`, context: { method: 'test' } });
    }
    a.addErrors(errors);
    const analysis = a.getErrorAnalysis();
    assert.equal(analysis.recentErrors.length, 10);
  });
});

// ─── TelyxAnalytics getUsageMetrics branches ───

describe('TelyxAnalytics getUsageMetrics branches', () => {
  it('returns zeros for empty analytics', () => {
    const a = new TelyxAnalytics();
    const usage = a.getUsageMetrics();
    assert.equal(usage.totalTokens, 0);
    assert.equal(usage.totalApiCalls, 0);
    assert.equal(usage.averageTokensPerCall, 0);
  });

  it('tracks usage with multiple providers and models', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'method_success', method: 'ai_api_call', success: true, duration: 500, metadata: { provider: 'openai', model: 'gpt-4', tokensUsed: 100 } },
      { timestamp: now, event: 'method_success', method: 'ai_api_call', success: true, duration: 300, metadata: { provider: 'openai', model: 'gpt-4', tokensUsed: 200 } },
      { timestamp: now, event: 'method_failure', method: 'ai_api_call', success: false, duration: 200, metadata: { provider: 'anthropic', model: 'claude-3' } },
    ]);
    const usage = a.getUsageMetrics();
    assert.equal(usage.totalTokens, 300);
    assert.equal(usage.totalApiCalls, 3);
    assert.equal(usage.providerUsage['openai'], 2);
    assert.equal(usage.providerUsage['anthropic'], 1);
    assert.equal(usage.modelUsage['gpt-4'], 2);
    assert.equal(usage.modelUsage['claude-3'], 1);
  });

  it('handles success events without tokensUsed metadata', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'method_success', method: 'ai_api_call', success: true, duration: 100, metadata: { provider: 'test', model: 'm1' } },
    ]);
    const usage = a.getUsageMetrics();
    assert.equal(usage.totalTokens, 0);
    assert.equal(usage.averageTokensPerCall, 0);
  });

  it('calculates average tokens per successful call', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'method_success', method: 'ai_api_call', success: true, duration: 100, metadata: { provider: 'o', model: 'm', tokensUsed: 150 } },
      { timestamp: now, event: 'method_success', method: 'ai_api_call', success: true, duration: 100, metadata: { provider: 'o', model: 'm', tokensUsed: 250 } },
    ]);
    const usage = a.getUsageMetrics();
    assert.equal(usage.totalTokens, 400);
    assert.equal(usage.averageTokensPerCall, 200);
  });
});

// ─── TelyxAnalytics getMethodPerformance edge cases ───

describe('TelyxAnalytics getMethodPerformance edge cases', () => {
  it('returns zeros for unknown method', () => {
    const a = new TelyxAnalytics();
    const perf = a.getMethodPerformance('nonexistent');
    assert.equal(perf.totalCalls, 0);
    assert.equal(perf.averageDuration, 0);
    assert.equal(perf.minDuration, 0);
    assert.equal(perf.maxDuration, 0);
    assert.equal(perf.successRate, 0);
    assert.equal(perf.successfulCalls, 0);
    assert.equal(perf.failedCalls, 0);
  });

  it('calculates min/max/avg correctly', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'compute', success: true, duration: 100 },
      { timestamp: now, event: 'test', method: 'compute', success: true, duration: 300 },
      { timestamp: now, event: 'test', method: 'compute', success: true, duration: 200 },
    ]);
    const perf = a.getMethodPerformance('compute');
    assert.equal(perf.minDuration, 100);
    assert.equal(perf.maxDuration, 300);
    assert.equal(perf.averageDuration, 200);
    assert.equal(perf.successfulCalls, 3);
    assert.equal(perf.failedCalls, 0);
  });

  it('counts failures correctly', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'api', success: true, duration: 100 },
      { timestamp: now, event: 'test', method: 'api', success: false, duration: 200 },
    ]);
    const perf = a.getMethodPerformance('api');
    assert.equal(perf.successfulCalls, 1);
    assert.equal(perf.failedCalls, 1);
    assert.equal(perf.totalCalls, 2);
    assert.equal(perf.successRate, 0.5);
  });

  it('handles events with method but no duration (excluded from perf)', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'mixed', success: true, duration: 150 },
      { timestamp: now, event: 'test', method: 'mixed', success: true }, // no duration — excluded
    ]);
    const perf = a.getMethodPerformance('mixed');
    assert.equal(perf.totalCalls, 1); // only events with duration counted
    assert.equal(perf.averageDuration, 150);
    assert.equal(perf.minDuration, 150);
    assert.equal(perf.maxDuration, 150);
  });
});

// ─── TelyxAnalytics cleanupData with maxHistoryAgeMs=0 ───

describe('TelyxAnalytics cleanupData maxHistoryAgeMs=0', () => {
  it('does not filter by age when maxHistoryAgeMs is 0', () => {
    const a = new TelyxAnalytics(10000, 0);
    const oldTs = new Date(Date.now() - 999999999).toISOString();
    a.addEvents([{ timestamp: oldTs, event: 'old_event' }]);
    // Should still be there since age filtering is disabled
    const summary = a.getSummary();
    assert.ok(summary.totalEvents >= 1);
  });

  it('retention limits truncate events', () => {
    const a = new TelyxAnalytics(5, 0); // maxRetention=5
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push({ timestamp: new Date().toISOString(), event: `event_${i}` });
    }
    a.addEvents(events);
    // Should be truncated to last 5
    assert.equal(a.getSummary().totalEvents, 5);
  });

  it('retention limits truncate errors to maxRetention/10', () => {
    const a = new TelyxAnalytics(50, 0); // maxRetention=50, errors cap=5
    const errors = [];
    for (let i = 0; i < 10; i++) {
      errors.push({ timestamp: new Date().toISOString(), error: `err_${i}`, context: {} });
    }
    a.addErrors(errors);
    assert.equal(a.getErrorAnalysis().totalErrors, 5); // Math.floor(50/10) = 5
  });
});

// ─── Telyx config validation additional branches ───

describe('Telyx config validation additional branches', () => {
  it('rejects flushInterval below 1000ms', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', flushInterval: 500 });
    }, /flushInterval must be at least 1000ms/);
  });

  it('rejects flushInterval as non-number', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', flushInterval: '5s' });
    }, /flushInterval must be at least 1000ms/);
  });

  it('rejects enableConsole as non-boolean', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', enableConsole: 'yes' });
    }, /enableConsole must be a boolean/);
  });

  it('rejects maxAnalyticsRetention as non-positive', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxAnalyticsRetention: 0 });
    }, /maxAnalyticsRetention must be a positive number/);
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxAnalyticsRetention: -5 });
    }, /maxAnalyticsRetention must be a positive number/);
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxAnalyticsRetention: 'big' });
    }, /maxAnalyticsRetention must be a positive number/);
  });

  it('rejects maxHistoryAgeMs as negative', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxHistoryAgeMs: -1 });
    }, /maxHistoryAgeMs must be a non-negative number/);
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxHistoryAgeMs: 'old' });
    }, /maxHistoryAgeMs must be a non-negative number/);
  });

  it('rejects endpoint as non-string', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: 42 });
    }, /endpoint must be a string/);
  });

  it('rejects endpoint as empty string after trim', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: '   ' });
    }, /endpoint must not be empty/);
  });

  it('rejects endpoint as invalid URL', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: 'not a valid url' });
    }, /endpoint must be a valid URL/);
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: '://' });
    }, /endpoint must be a valid URL/);
  });

  it('accepts valid endpoint with trailing slash (stripped)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', endpoint: 'https://api.example.com/' });
    assert.ok(t);
    t.destroy();
  });

  it('accepts maxBatchSize of 1', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', maxBatchSize: 1 });
    assert.ok(t);
    t.destroy();
  });
});

// ─── Telyx retry queue and flush branches ───

describe('Telyx flush and batch behavior', () => {
  it('checkBatchSize triggers flush when maxBatchSize reached', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', maxBatchSize: 2, enableConsole: false });
    t.recordEvent('event1');
    t.recordEvent('event2');
    t.destroy();
  });

  it('getBatch returns current batch state', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    t.recordEvent('test_event');
    const batch = t.getBatch();
    assert.ok(batch);
    assert.ok(batch.events.length >= 1);
    t.destroy();
  });
});

// ─── TelyxMiddleware sanitizeCacheKey additional branches ───

describe('TelyxMiddleware sanitizeCacheKey additional branches', () => {
  it('converts non-string key to string', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('get', 12345);
    tracker.end({ id: 1 });
    const batch = t.getBatch();
    const successEvent = batch.events.find(e => e.event === 'method_success');
    assert.ok(successEvent);
    assert.ok(successEvent.metadata.key.includes('12345'));
    t.destroy();
  });

  it('redacts auth pattern in cache key', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('get', 'auth=super_secret_token');
    tracker.end({ id: 1 });
    const batch = t.getBatch();
    const successEvent = batch.events.find(e => e.event === 'method_success');
    assert.ok(successEvent);
    assert.ok(!JSON.stringify(successEvent).includes('super_secret_token'));
    t.destroy();
  });

  it('redacts credential pattern in cache key', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('get', 'credential=my_password');
    tracker.end({ id: 1 });
    const batch = t.getBatch();
    const successEvent = batch.events.find(e => e.event === 'method_success');
    assert.ok(successEvent);
    assert.ok(!JSON.stringify(successEvent).includes('my_password'));
    t.destroy();
  });

  it('redacts password pattern in cache key', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('get', 'password=hunter2');
    tracker.end({ id: 1 });
    const batch = t.getBatch();
    const successEvent = batch.events.find(e => e.event === 'method_success');
    assert.ok(successEvent);
    assert.ok(!JSON.stringify(successEvent).includes('hunter2'));
    t.destroy();
  });
});

// ─── TelyxAnalytics getSummary additional coverage ───

describe('TelyxAnalytics getSummary additional branches', () => {
  it('returns correct summary with mixed data', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'method_success', method: 'api', success: true, duration: 100, metadata: { endpoint: '/users' } },
      { timestamp: now, event: 'method_success', method: 'api', success: true, duration: 200, metadata: { endpoint: '/posts' } },
      { timestamp: now, event: 'method_failure', method: 'api', success: false, duration: 300 },
    ]);
    a.addMetrics([{ timestamp: now, metric: 'memory', value: 512 }]);
    a.addErrors([{ timestamp: now, error: 'db_error', context: { method: 'db' } }]);
    const summary = a.getSummary();
    assert.ok(summary.totalEvents >= 3);
    assert.ok(summary.totalErrors >= 1);
    assert.ok(summary.totalMetrics >= 1);
    assert.ok(summary.topMethods.length > 0);
    assert.equal(summary.topMethods[0].method, 'api');
    assert.ok(summary.recentErrors.length > 0);
  });

  it('handles events without duration in avgResponseTime', () => {
    const a = new TelyxAnalytics();
    a.addEvents([{ timestamp: new Date().toISOString(), event: 'custom_no_duration' }]);
    const summary = a.getSummary();
    assert.equal(summary.avgResponseTime, 0);
  });

  it('returns top 10 methods sorted by call count', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push({ timestamp: now, event: 'test', method: `method_${i}`, success: true, duration: 100 });
    }
    // Add more calls to method_0
    for (let i = 0; i < 5; i++) {
      events.push({ timestamp: now, event: 'test', method: 'method_0', success: true, duration: 100 });
    }
    a.addEvents(events);
    const summary = a.getSummary();
    assert.equal(summary.topMethods.length, 10); // capped at 10
    assert.equal(summary.topMethods[0].method, 'method_0'); // most calls
  });
});

// ─── TelyxAnalytics toMarkdown additional coverage ───

describe('TelyxAnalytics toMarkdown coverage', () => {
  it('generates markdown report with full data', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([
      { timestamp: now, event: 'test', method: 'api_call', success: true, duration: 100 },
      { timestamp: now, event: 'test', method: 'api_call', success: false, duration: 3000 },
    ]);
    a.addErrors([{ timestamp: now, error: 'TimeoutError: request timed out', context: { method: 'api_call' } }]);
    const markdown = a.toMarkdown();
    assert.ok(typeof markdown === 'string');
    assert.ok(markdown.length > 0);
    assert.match(markdown, /# Telyx Telemetry Report/);
  });

  it('generates markdown with no data', () => {
    const a = new TelyxAnalytics();
    const markdown = a.toMarkdown();
    assert.ok(typeof markdown === 'string');
    assert.ok(markdown.length > 0);
  });
});

// ─── TelyxAnalytics clear() ───

describe('TelyxAnalytics clear', () => {
  it('clears all data', () => {
    const a = new TelyxAnalytics();
    const now = new Date().toISOString();
    a.addEvents([{ timestamp: now, event: 'test', method: 'm', success: true, duration: 100 }]);
    a.addMetrics([{ timestamp: now, metric: 'cpu', value: 50 }]);
    a.addErrors([{ timestamp: now, error: 'err', context: {} }]);
    a.clear();
    const summary = a.getSummary();
    assert.equal(summary.totalEvents, 0);
    assert.equal(summary.totalMetrics, 0);
    assert.equal(summary.totalErrors, 0);
  });
});
