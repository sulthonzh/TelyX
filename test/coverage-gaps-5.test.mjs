import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx } from '../dist/index.js';
import { TelyxAnalytics } from '../dist/analytics/TelyxAnalytics.js';
import { TelyxMiddleware } from '../dist/middleware/TelyxMiddleware.js';

// ════════════════════════════════════════════════════════════════
// Coverage Gaps Round 5 — Targeted tests for remaining uncovered lines
// ════════════════════════════════════════════════════════════════

// ─── TelyxAnalytics.toMarkdown(): suddenTrafficSpikes section (lines 624-633) ───
// detectAnomalies uses 10-minute buckets and flags when count > avg * 3.
// Strategy: 5 sparse buckets (1 event each) + 1 dense bucket (100 events)
//   avg = 105/6 = 17.5, threshold = 52.5, 100 > 52.5 → spike detected

describe('TelyxAnalytics toMarkdown() suddenTrafficSpikes section', () => {
  it('renders traffic spike section when suddenTrafficSpikes detected', () => {
    const analytics = new TelyxAnalytics();
    const now = new Date();

    // 5 sparse buckets: 1 event each, 11 minutes apart → different 10-min buckets
    for (let i = 5; i >= 1; i--) {
      const t = new Date(now.getTime() - i * 11 * 60000);
      analytics.addEvents([{
        timestamp: t.toISOString(),
        event: 'request',
        success: true,
        duration: 50,
        method: 'normalMethod',
      }]);
    }

    // 1 dense bucket: 100 events at current time
    for (let i = 0; i < 100; i++) {
      analytics.addEvents([{
        timestamp: now.toISOString(),
        event: 'request',
        success: true,
        duration: 50,
        method: 'spikeMethod',
      }]);
    }

    const anomalies = analytics.detectAnomalies();
    assert.ok(anomalies.suddenTrafficSpikes.length > 0, 'Should detect traffic spike');

    const markdown = analytics.toMarkdown();

    assert.match(markdown, /## ⚠️ Anomalies Detected/);
    assert.match(markdown, /### Sudden Traffic Spikes/);
    assert.match(markdown, /\| Time \| Requests \| Threshold \|/);
    assert.match(markdown, /\|------\|----------\|-----------\|/);
    assert.match(markdown, /100/); // request count
  });

  it('renders all three anomaly types together in toMarkdown', () => {
    const analytics = new TelyxAnalytics();
    const now = new Date();

    // Sparse buckets for traffic spike
    for (let i = 5; i >= 1; i--) {
      const t = new Date(now.getTime() - i * 11 * 60000);
      analytics.addEvents([{
        timestamp: t.toISOString(),
        event: 'request',
        success: true,
        duration: 50,
        method: 'normalMethod',
      }]);
    }

    // Dense bucket: high error rate + slow responses + traffic spike
    for (let i = 0; i < 100; i++) {
      analytics.addEvents([{
        timestamp: now.toISOString(),
        event: 'request',
        success: i % 10 === 0, // 90% error rate → highErrorRate (>5%)
        duration: 2500,         // all slow → slowResponse (>2000ms avg)
        method: 'spikeMethod',
      }]);
    }

    const markdown = analytics.toMarkdown();

    assert.match(markdown, /### High Error Rate Methods/);
    assert.match(markdown, /### Slow Response Methods/);
    assert.match(markdown, /### Sudden Traffic Spikes/);
  });
});

// ─── TelyxMiddleware: catch block coverage ───

describe('TelyxMiddleware error catch blocks', () => {
  function makeTelyx() {
    return new Telyx({
      endpoint: 'http://127.0.0.1:1',
      agentName: 'test',
      environment: 'test',
      enabled: false,
    });
  }

  it('httpRequestMiddleware catches res.send tracking errors', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const telyx = makeTelyx();
    const middleware = new TelyxMiddleware(telyx);

    // Let the first recordEvent (http_request) succeed, then throw on the second call (http_response)
    let callCount = 0;
    const origRecordEvent = telyx.recordEvent.bind(telyx);
    telyx.recordEvent = (...args) => {
      callCount++;
      if (callCount > 1) throw new Error('send bomb');
      origRecordEvent(...args);
    };

    const req = {
      method: 'GET',
      url: '/test',
      get: () => undefined,
      headers: {},
    };
    let sentBody = null;
    const res = {
      statusCode: 200,
      send: function(body) { sentBody = body; },
      end: function() {},
    };

    middleware.httpRequestMiddleware(req, res, () => {});

    // Trigger res.send wrapper — recordResponse calls recordEvent (2nd time → throws)
    res.send('response body');

    assert.ok(consoleError.mock.calls.length > 0, 'console.error should fire');
    const logged = consoleError.mock.calls.map(c => String(c.arguments[0])).join(' ');
    assert.match(logged, /\[Telyx\] Failed to track HTTP response/);
    assert.equal(sentBody, 'response body'); // original send still called

    consoleError.mock.restore();
  });

  it('httpRequestMiddleware catches res.end tracking errors', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const telyx = makeTelyx();
    const middleware = new TelyxMiddleware(telyx);

    // Let the first recordEvent (http_request) succeed, then throw on subsequent calls
    let callCount = 0;
    const origRecordEvent = telyx.recordEvent.bind(telyx);
    telyx.recordEvent = (...args) => {
      callCount++;
      if (callCount > 1) throw new Error('end bomb');
      origRecordEvent(...args);
    };

    const req = {
      method: 'GET',
      url: '/test',
      get: () => undefined,
      headers: {},
    };
    let endArg = null;
    const res = {
      statusCode: 200,
      send: function() {},
      end: function(chunk) { endArg = chunk; },
    };

    middleware.httpRequestMiddleware(req, res, () => {});

    // Trigger res.end wrapper — this hits the catch block for res.end tracking
    res.end('chunk-data');

    assert.ok(consoleError.mock.calls.length > 0, 'console.error should fire');
    const logged = consoleError.mock.calls.map(c => String(c.arguments[0])).join(' ');
    assert.match(logged, /\[Telyx\] Failed to track HTTP response \(end\)/);

    consoleError.mock.restore();
  });

  it('databaseQueryMiddleware catches tracking errors', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const telyx = makeTelyx();
    const middleware = new TelyxMiddleware(telyx);

    telyx.recordSuccess = () => { throw new Error('db bomb'); };

    const tracked = middleware.databaseQueryMiddleware('SELECT 1');
    tracked.end({ affectedRows: 5 }, null);

    assert.ok(consoleError.mock.calls.length > 0);
    const logged = consoleError.mock.calls.map(c => String(c.arguments[0])).join(' ');
    assert.match(logged, /\[Telyx\] Failed to track database query/);

    consoleError.mock.restore();
  });

  it('cacheOperationMiddleware catches tracking errors', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const telyx = makeTelyx();
    const middleware = new TelyxMiddleware(telyx);

    telyx.recordSuccess = () => { throw new Error('cache bomb'); };

    const tracked = middleware.cacheOperationMiddleware('get', 'mykey');
    tracked.end('cached-value', null);

    assert.ok(consoleError.mock.calls.length > 0);
    const logged = consoleError.mock.calls.map(c => String(c.arguments[0])).join(' ');
    assert.match(logged, /\[Telyx\] Failed to track cache operation/);

    consoleError.mock.restore();
  });

  it('aiCallMiddleware catches tracking errors on end()', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const telyx = makeTelyx();
    const middleware = new TelyxMiddleware(telyx);

    // recordEvent is called during init — let it work
    const tracked = middleware.aiCallMiddleware('openai', 'gpt-4', 'hello');

    // Now sabotage recordSuccess for end()
    telyx.recordSuccess = () => { throw new Error('ai end bomb'); };

    tracked.end({ content: 'response', usage: { total_tokens: 50 } }, null);

    assert.ok(consoleError.mock.calls.length > 0);
    const logged = consoleError.mock.calls.map(c => String(c.arguments[0])).join(' ');
    assert.match(logged, /\[Telyx\] Failed to track AI API call/);

    consoleError.mock.restore();
  });

  it('aiCallMiddleware catches initialization errors and returns no-op', () => {
    const consoleError = mock.method(console, 'error', () => {});

    const telyx = makeTelyx();

    // Sabotage recordEvent so aiCallMiddleware init throws
    telyx.recordEvent = () => { throw new Error('init bomb'); };

    const middleware = new TelyxMiddleware(telyx);

    // This should catch the init error and return a no-op
    const result = middleware.aiCallMiddleware('openai', 'gpt-4', 'test');

    assert.ok(typeof result.end === 'function');
    result.end(); // should not throw

    assert.ok(consoleError.mock.calls.length > 0);
    const logged = consoleError.mock.calls.map(c => String(c.arguments[0])).join(' ');
    assert.match(logged, /\[Telyx\] AI middleware initialization error/);

    consoleError.mock.restore();
  });
});
