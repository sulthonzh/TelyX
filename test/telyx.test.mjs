import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx } from '../dist/index.js';
import { TelyxAnalytics } from '../dist/analytics/TelyxAnalytics.js';
import { TelyxMiddleware } from '../dist/middleware/TelyxMiddleware.js';

// ─── Telyx Core ───
describe('Telyx', () => {
  it('initializes with required config', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.ok(t);
    t.destroy();
  });

  it('recordEvent does not throw', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    t.recordEvent('click', { page: '/home' });
    t.destroy();
  });

  it('recordMetric does not throw', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    t.recordMetric('cpu', 42);
    t.recordMetric('mem', 80.5);
    t.destroy();
  });

  it('recordSuccess does not throw', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    t.recordSuccess('fetchData', 120, { rows: 50 });
    t.destroy();
  });

  it('recordError does not throw', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    t.recordError('fetchData', new Error('timeout'), { retry: 3 });
    t.destroy();
  });

  it('trackMethod wraps async functions', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const fn = t.trackMethod('compute', async (input, next) => {
      return next();
    });
    // trackMethod returns a function
    assert.equal(typeof fn, 'function');
    t.destroy();
  });

  it('sampleRate 0 suppresses recording', () => {
    // With sampleRate 0, random always >= 0 so sampling is skipped
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 0, enableConsole: false });
    // Should not throw even though nothing is recorded
    t.recordEvent('test');
    t.recordMetric('test', 1);
    t.destroy();
  });

  it('sanitizeInput truncates long strings', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    // Access private method via bracket notation for test
    const longStr = 'a'.repeat(500);
    const sanitized = t['sanitizeInput'](longStr);
    assert.ok(sanitized.length < 500, 'should truncate long input');
    t.destroy();
  });

  it('destroy clears flush timer', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    t.destroy();
    // Should not throw on double destroy
    t.destroy();
  });
});

// ─── TelyxAnalytics ───
describe('TelyxAnalytics', () => {
  function makeEvent(overrides = {}) {
    return {
      timestamp: new Date().toISOString(),
      agent: 'test-agent',
      environment: 'test',
      event: 'method_call',
      method: 'fetchData',
      duration: 100,
      success: true,
      metadata: {},
      ...overrides,
    };
  }

  it('getMethodPerformance returns zeros for unknown method', () => {
    const a = new TelyxAnalytics();
    const perf = a.getMethodPerformance('nonexistent');
    assert.equal(perf.totalCalls, 0);
    assert.equal(perf.averageDuration, 0);
    assert.equal(perf.successRate, 0);
  });

  it('getMethodPerformance computes stats correctly', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      makeEvent({ method: 'fetch', duration: 50, success: true }),
      makeEvent({ method: 'fetch', duration: 150, success: true }),
      makeEvent({ method: 'fetch', duration: 200, success: false }),
    ]);
    const perf = a.getMethodPerformance('fetch');
    assert.equal(perf.totalCalls, 3);
    assert.equal(perf.successfulCalls, 2);
    assert.equal(perf.failedCalls, 1);
    assert.equal(perf.minDuration, 50);
    assert.equal(perf.maxDuration, 200);
    assert.ok(perf.averageDuration > 0);
  });

  it('getSystemHealth aggregates across methods', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      makeEvent({ method: 'a', duration: 10, success: true }),
      makeEvent({ method: 'b', duration: 20, success: false }),
    ]);
    const health = a.getSystemHealth();
    assert.equal(health.totalCalls, 2);
    assert.equal(health.successRate, 0.5);
    assert.equal(health.errorRate, 0.5);
    assert.ok(health.methodPerformance.a);
    assert.ok(health.methodPerformance.b);
  });

  it('getErrorAnalysis groups by method and type', () => {
    const a = new TelyxAnalytics();
    a.addErrors([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', error: 'Timeout: connection', context: { method: 'fetch' } },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', error: 'Auth: invalid token', context: { method: 'login' } },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', error: 'Timeout: read timeout', context: { method: 'fetch' } },
    ]);
    const analysis = a.getErrorAnalysis();
    assert.equal(analysis.totalErrors, 3);
    assert.equal(analysis.errorByMethod.fetch, 2);
    assert.equal(analysis.errorByMethod.login, 1);
    assert.ok(analysis.errorTypes.Timeout >= 2);
    assert.equal(analysis.recentErrors.length, 3);
  });

  it('getUsageMetrics tracks token usage', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      makeEvent({ event: 'ai_api_call', metadata: { provider: 'openai', model: 'gpt-4' } }),
      makeEvent({ event: 'ai_api_call', metadata: { provider: 'anthropic', model: 'claude-3' } }),
    ]);
    a.addMetrics([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', metric: 'tokens_used', value: 500 },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', metric: 'tokens_used', value: 300 },
    ]);
    const usage = a.getUsageMetrics();
    assert.equal(usage.totalTokens, 800);
    assert.equal(usage.totalApiCalls, 2);
    assert.equal(usage.providerUsage.openai, 1);
    assert.equal(usage.modelUsage['gpt-4'], 1);
    assert.equal(usage.averageTokensPerCall, 400);
  });

  it('clear removes all data', () => {
    const a = new TelyxAnalytics();
    a.addEvents([makeEvent()]);
    a.addMetrics([{ timestamp: '', agent: '', environment: '', metric: 'x', value: 1 }]);
    a.addErrors([{ timestamp: '', agent: '', environment: '', error: 'err' }]);
    a.clear();
    assert.equal(a.getMethodPerformance('fetchData').totalCalls, 0);
    assert.equal(a.getSystemHealth().totalCalls, 0);
    assert.equal(a.getErrorAnalysis().totalErrors, 0);
  });

  it('getSystemHealth does not count custom events without success as failures', () => {
    const a = new TelyxAnalytics();
    // Custom event with no success property — should NOT dilute success/error rates
    a.addEvents([
      makeEvent({ method: 'fetch', duration: 50, success: true }),
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'custom_click', metadata: {} },
    ]);
    const health = a.getSystemHealth();
    // totalCalls counts all events (2)
    assert.equal(health.totalCalls, 2);
    // successRate is 100% because the only method call succeeded — custom event excluded
    assert.equal(health.successRate, 1.0);
    assert.equal(health.errorRate, 0);
  });
});

// ─── TelyxMiddleware ───
describe('TelyxMiddleware', () => {
  it('httpRequestMiddleware calls next and records', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    let nextCalled = false;
    const fakeReq = { method: 'GET', url: '/api/test', get: () => 'test-agent', ip: '127.0.0.1' };
    const fakeRes = { statusCode: 200, send: function(body) { return this; } };
    mw.httpRequestMiddleware(fakeReq, fakeRes, () => { nextCalled = true; });
    assert.ok(nextCalled);
    // Trigger response tracking
    fakeRes.send('ok');
    t.destroy();
  });

  it('databaseQueryMiddleware tracks start and end', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT * FROM users WHERE id = ?', { id: 1 });
    tracker.end({ affectedRows: 5 });
    t.destroy();
  });

  it('databaseQueryMiddleware tracks errors', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT * FROM users');
    tracker.end(null, new Error('connection lost'));
    t.destroy();
  });

  it('cacheOperationMiddleware tracks hits and misses', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const hit = mw.cacheOperationMiddleware('get', 'user:123', { name: 'Alice' });
    hit.end({ name: 'Alice' });
    const miss = mw.cacheOperationMiddleware('get', 'user:456');
    miss.end(null);
    t.destroy();
  });

  it('aiCallMiddleware tracks token usage', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'Summarize this document');
    tracker.end({ usage: { total_tokens: 250 }, content: 'Summary here' });
    t.destroy();
  });

  it('aiCallMiddleware tracks errors', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('anthropic', 'claude-3', 'Hello');
    tracker.end(null, new Error('Rate limit exceeded'));
    t.destroy();
  });

  it('sanitizeQuery redacts sensitive fields', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']("SELECT * FROM users WHERE password='secret123' AND token='abc'");
    assert.ok(!result.includes('secret123'));
    assert.ok(!result.includes('abc'));
    assert.ok(result.includes('****'));
    t.destroy();
  });
});

// ─── TelyxAnalytics: Time Series ───
describe('TelyxAnalytics TimeSeries', () => {
  it('getTimeSeriesData returns correct bucket count for 1h', () => {
    const a = new TelyxAnalytics();
    const ts = a.getTimeSeriesData('1h');
    assert.equal(ts.requestsPerHour.length, 60);
    assert.equal(ts.errorRatePerHour.length, 60);
    assert.equal(ts.averageResponseTimePerHour.length, 60);
  });

  it('getTimeSeriesData returns correct bucket count for 24h', () => {
    const a = new TelyxAnalytics();
    const ts = a.getTimeSeriesData('24h');
    assert.equal(ts.requestsPerHour.length, 24);
  });

  it('getTimeSeriesData returns correct bucket count for 7d', () => {
    const a = new TelyxAnalytics();
    const ts = a.getTimeSeriesData('7d');
    assert.equal(ts.requestsPerHour.length, 24 * 7);
  });

  it('getTimeSeriesData populates buckets from events', () => {
    const a = new TelyxAnalytics();
    const now = new Date();
    a.addEvents([
      { timestamp: now.toISOString(), agent: 'a', environment: 't', event: 'method_call', method: 'test', duration: 100, success: true, metadata: {} },
      { timestamp: now.toISOString(), agent: 'a', environment: 't', event: 'method_call', method: 'test', duration: 200, success: false, metadata: {} },
    ]);
    const ts = a.getTimeSeriesData('1h');
    // Last bucket should have 2 requests
    const last = ts.requestsPerHour[ts.requestsPerHour.length - 1];
    assert.equal(last.count, 2);
    // Error rate in last bucket should be 0.5
    const lastErr = ts.errorRatePerHour[ts.errorRatePerHour.length - 1];
    assert.equal(lastErr.rate, 0.5);
    // Average response time should be 150
    const lastAvg = ts.averageResponseTimePerHour[ts.averageResponseTimePerHour.length - 1];
    assert.equal(lastAvg.time, 150);
  });

  it('getTimeSeriesData ignores events outside time range', () => {
    const a = new TelyxAnalytics();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    a.addEvents([
      { timestamp: twoHoursAgo, agent: 'a', environment: 't', event: 'method_call', method: 'test', duration: 100, success: true, metadata: {} },
    ]);
    const ts = a.getTimeSeriesData('1h');
    const total = ts.requestsPerHour.reduce((sum, b) => sum + b.count, 0);
    assert.equal(total, 0);
  });
});

// ─── Telyx: track() proxy ───
describe('Telyx track() proxy', () => {
  it('wraps agent methods with telemetry', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const agent = {
      greet: (name) => `hello ${name}`,
      value: 42,
    };
    const tracked = t.track(agent);
    assert.equal(tracked.value, 42);
    const result = await tracked.greet('world');
    assert.equal(result, 'hello world');
    t.destroy();
  });
});

// ─── TelyxAnalytics: getSummary + toMarkdown ───
describe('TelyxAnalytics getSummary & toMarkdown', () => {
  it('getSummary returns correct overview', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'fetch', duration: 100, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'fetch', duration: 200, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'save', duration: 300, success: false },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'custom_click', metadata: {} },
    ]);
    a.addMetrics([{ timestamp: new Date().toISOString(), agent: 'a', environment: 't', metric: 'cpu', value: 42 }]);
    a.addErrors([{ timestamp: new Date().toISOString(), agent: 'a', environment: 't', error: 'TimeoutError', context: { method: 'save' } }]);

    const s = a.getSummary();
    assert.equal(s.totalEvents, 4); // includes custom event
    assert.equal(s.totalMetrics, 1);
    assert.equal(s.totalErrors, 1);
    // successRate excludes custom event from denominator: 2 success / 3 method calls
    assert.equal(s.successRate, 2 / 3);
    assert.equal(s.errorRate, 1 / 3);
    assert.equal(s.avgResponseTime, 200); // (100+200+300)/3
    assert.equal(s.topMethods.length, 2);
    assert.equal(s.topMethods[0].method, 'fetch');
    assert.equal(s.topMethods[0].calls, 2);
    assert.equal(s.topMethods[1].method, 'save');
    assert.equal(s.recentErrors.length, 1);
  });

  it('getSummary returns safe defaults with no data', () => {
    const a = new TelyxAnalytics();
    const s = a.getSummary();
    assert.equal(s.totalEvents, 0);
    assert.equal(s.successRate, 1); // no events = perfect health
    assert.equal(s.errorRate, 0);
    assert.equal(s.avgResponseTime, 0);
    assert.equal(s.topMethods.length, 0);
  });

  it('toMarkdown produces valid report', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'process', duration: 50, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'process', duration: 150, success: false },
    ]);
    a.addErrors([{ timestamp: new Date().toISOString(), agent: 'a', environment: 't', error: 'NetworkError', context: { method: 'process' } }]);

    const md = a.toMarkdown();
    assert.ok(md.includes('# Telyx Telemetry Report'));
    assert.ok(md.includes('Total Events'));
    assert.ok(md.includes('Top Methods'));
    assert.ok(md.includes('process'));
    assert.ok(md.includes('Recent Errors'));
    assert.ok(md.includes('NetworkError'));
  });

  it('toMarkdown omits methods/errors sections when empty', () => {
    const a = new TelyxAnalytics();
    const md = a.toMarkdown();
    assert.ok(md.includes('# Telyx Telemetry Report'));
    assert.ok(!md.includes('Top Methods'));
    assert.ok(!md.includes('Recent Errors'));
  });
});
