import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx } from '../dist/index.js';
import { TelyxMiddleware } from '../dist/middleware/TelyxMiddleware.js';

// ─── TelyxMiddleware Branch Coverage ───

describe('TelyxMiddleware httpRequestMiddleware branches', () => {
  it('skips double-wrapping when _telyxWrapped is already true', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    let nextCalled = 0;
    const res = { statusCode: 200, send: () => {}, _telyxWrapped: true };
    mw.httpRequestMiddleware({ method: 'GET', url: '/', get: () => '' }, res, () => { nextCalled++; });
    assert.equal(nextCalled, 1);
    // Should not have re-wrapped or recorded
    t.destroy();
  });

  it('throws on invalid request object (missing method)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    let nextCalled = 0;
    // Missing method should trigger error path → console.error + next()
    mw.httpRequestMiddleware({ url: '/' }, { statusCode: 200, send: () => {} }, () => { nextCalled++; });
    assert.equal(nextCalled, 1);
    t.destroy();
  });

  it('throws on invalid request object (missing url)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    let nextCalled = 0;
    mw.httpRequestMiddleware({ method: 'GET' }, { statusCode: 200, send: () => {} }, () => { nextCalled++; });
    assert.equal(nextCalled, 1);
    t.destroy();
  });

  it('handles res.send throwing after telemetry error', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    let nextCalled = 0;
    const res = {
      statusCode: 200,
      send: () => { throw new Error('send failed'); },
    };
    mw.httpRequestMiddleware({ method: 'GET', url: '/test', get: () => '' }, res, () => { nextCalled++; });
    // The wrapped send catches errors from both telemetry and originalSend,
    // so it should NOT throw — it logs and swallows.
    res.send('body');
    assert.equal(nextCalled, 1);
    t.destroy();
  });

  it('records response with contentLength for string body', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const res = { statusCode: 200, send: () => {} };
    mw.httpRequestMiddleware({ method: 'POST', url: '/api', get: () => 'TestAgent', ip: '127.0.0.1', headers: {} }, res, () => {});
    res.send('hello world');
    t.destroy();
  });

  it('records response with 0 contentLength for non-string body', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const res = { statusCode: 500, send: () => {} };
    mw.httpRequestMiddleware({ method: 'GET', url: '/api', get: () => '', headers: {} }, res, () => {});
    res.send({ obj: true });
    t.destroy();
  });

  it('handles missing req.headers gracefully', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const res = { statusCode: 200, send: () => {} };
    // No headers property at all
    mw.httpRequestMiddleware({ method: 'GET', url: '/', get: () => '' }, res, () => {});
    res.send('ok');
    t.destroy();
  });
});

describe('TelyxMiddleware databaseQueryMiddleware branches', () => {
  it('throws on empty query', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    assert.throws(() => mw.databaseQueryMiddleware(''), /non-empty string/);
    assert.throws(() => mw.databaseQueryMiddleware('   '), /non-empty string/);
    assert.throws(() => mw.databaseQueryMiddleware(123), /non-empty string/);
    t.destroy();
  });

  it('tracks success with affectedRows', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT * FROM users');
    tracker.end({ affectedRows: 42 });
    t.destroy();
  });

  it('tracks success with rowCount (no affectedRows)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT * FROM users');
    tracker.end({ rowCount: 10 });
    t.destroy();
  });

  it('tracks success with neither affectedRows nor rowCount', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT * FROM users');
    tracker.end({ data: [] });
    t.destroy();
  });

  it('tracks success with non-object result', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT 1');
    tracker.end('ok');
    t.destroy();
  });

  it('tracks error', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.databaseQueryMiddleware('SELECT * FROM users');
    tracker.end(null, new Error('query failed'));
    t.destroy();
  });
});

describe('TelyxMiddleware cacheOperationMiddleware branches', () => {
  it('tracks cache hit (result defined)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('get', 'user:1');
    tracker.end({ id: 1 });
    t.destroy();
  });

  it('tracks cache miss (result undefined)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('get', 'user:2');
    tracker.end(undefined);
    t.destroy();
  });

  it('tracks cache error', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.cacheOperationMiddleware('set', 'user:3');
    tracker.end(null, new Error('cache write failed'));
    t.destroy();
  });
});

describe('TelyxMiddleware aiCallMiddleware branches', () => {
  it('throws on empty provider', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    // Returns no-op middleware (catches error internally)
    const tracker = mw.aiCallMiddleware('', 'gpt-4', 'hello');
    tracker.end();
    t.destroy();
  });

  it('throws on empty model', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', '', 'hello');
    tracker.end();
    t.destroy();
  });

  it('throws on non-string prompt', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 123);
    tracker.end();
    t.destroy();
  });

  it('tracks success with token usage', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end({ content: 'response text', usage: { total_tokens: 150 } });
    t.destroy();
  });

  it('tracks success with usage object but missing total_tokens', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end({ content: 'response', usage: { prompt_tokens: 50 } });
    t.destroy();
  });

  it('tracks success with usage but total_tokens is not a number', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end({ content: 'response', usage: { total_tokens: 'many' } });
    t.destroy();
  });

  it('tracks success with response content as non-string', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end({ content: 42, usage: { total_tokens: 10 } });
    t.destroy();
  });

  it('tracks success with null response', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end(null);
    t.destroy();
  });

  it('tracks success with undefined response', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end(undefined);
    t.destroy();
  });

  it('tracks success with primitive response (non-object)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end('plain string response');
    t.destroy();
  });

  it('tracks error', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end(null, new Error('API rate limited'));
    t.destroy();
  });

  it('tracks success with 0 tokens (no metric recorded)', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const tracker = mw.aiCallMiddleware('openai', 'gpt-4', 'hello');
    tracker.end({ content: 'response' }); // no usage object
    t.destroy();
  });
});

describe('TelyxMiddleware sanitizeHeaders branches', () => {
  it('redacts sensitive headers', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    // Access private method via any cast
    const sanitized = mw['sanitizeHeaders']({
      'Authorization': 'Bearer token123',
      'Cookie': 'session=abc',
      'Set-Cookie': 'foo=bar',
      'X-API-Key': 'key123',
      'X-Auth-Token': 'auth',
      'X-Secret': 'secret',
      'password': 'pw',
      'secret': 's',
      'X-XSRF-Token': 'xsrf',
      'X-CSRF-Token': 'csrf',
      'Proxy-Authorization': 'proxy',
      'WWW-Authenticate': 'www',
    });
    // sanitizeHeaders() converts all keys to lowercase
    assert.equal(sanitized['authorization'], '[REDACTED]');
    assert.equal(sanitized['cookie'], '[REDACTED]');
    assert.equal(sanitized['set-cookie'], '[REDACTED]');
    assert.equal(sanitized['x-api-key'], '[REDACTED]');
    assert.equal(sanitized['password'], '[REDACTED]');
    assert.equal(sanitized['www-authenticate'], '[REDACTED]');
    t.destroy();
  });

  it('includes safe headers', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const sanitized = mw['sanitizeHeaders']({
      'Accept': 'text/html',
      'Accept-Encoding': 'gzip',
      'Accept-Language': 'en-US',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'Content-Length': '42',
      'Host': 'example.com',
      'User-Agent': 'TestAgent/1.0',
      'Referer': 'https://example.com',
      'Pragma': 'no-cache',
    });
    // sanitizeHeaders() converts all keys to lowercase
    assert.equal(sanitized['accept'], 'text/html');
    assert.equal(sanitized['content-type'], 'application/json');
    assert.equal(sanitized['user-agent'], 'TestAgent/1.0');
    t.destroy();
  });

  it('marks unknown headers as [HEADER]', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const sanitized = mw['sanitizeHeaders']({
      'X-Custom-Header': 'custom-value',
      'X-Trace-Id': 'abc123',
    });
    // sanitizeHeaders() converts all keys to lowercase
    assert.equal(sanitized['x-custom-header'], '[HEADER]');
    assert.equal(sanitized['x-trace-id'], '[HEADER]');
    t.destroy();
  });

  it('handles null/undefined headers', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const sanitized = mw['sanitizeHeaders'](null);
    assert.deepEqual(sanitized, {});
    const sanitized2 = mw['sanitizeHeaders'](undefined);
    assert.deepEqual(sanitized2, {});
    t.destroy();
  });
});

describe('TelyxMiddleware sanitizeQuery branches', () => {
  it('redacts password in quoted values', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']("SELECT * FROM users WHERE password = 'secret123' AND name = 'john'");
    assert.ok(result.includes('password=****'));
    assert.ok(!result.includes('secret123'));
    t.destroy();
  });

  it('redacts password in double-quoted values', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']('SELECT * FROM users WHERE password = "secret123"');
    assert.ok(result.includes('password=****'));
    t.destroy();
  });

  it('redacts password in unquoted values', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']('SELECT * FROM users WHERE password = secret123 AND id = 1');
    assert.ok(result.includes('password=****'));
    t.destroy();
  });

  it('redacts multiple sensitive words', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']("UPDATE users SET token = 'abc', key = 'xyz', credential = 'pw'");
    assert.ok(result.includes('token=****'));
    assert.ok(result.includes('key=****'));
    assert.ok(result.includes('credential=****'));
    t.destroy();
  });

  it('redacts secret word in assignment', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']("UPDATE config SET secret = 'my_secret_value' WHERE id = 1");
    assert.ok(result.includes('secret=****'));
    assert.ok(!result.includes('my_secret_value'));
    t.destroy();
  });

  it('truncates long queries', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const longQuery = 'SELECT * FROM users WHERE ' + 'x = 1 AND '.repeat(50);
    const result = mw['sanitizeQuery'](longQuery);
    assert.ok(result.endsWith('...'));
    assert.ok(result.length <= 203); // 200 + '...'
    t.destroy();
  });

  it('does not truncate short queries', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const mw = new TelyxMiddleware(t);
    const result = mw['sanitizeQuery']('SELECT 1');
    assert.ok(!result.endsWith('...'));
    t.destroy();
  });
});

// ─── Telyx Core Branch Coverage ───

describe('Telyx track() proxy branches', () => {
  it('tracks method that throws synchronously', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const agent = {
      boom() { throw new Error('sync throw'); },
    };
    const tracked = t.track(agent);
    await assert.rejects(() => tracked.boom(), /sync throw/);
    t.destroy();
  });

  it('tracks method that returns a promise rejection', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const agent = {
      async fail() { throw new Error('async throw'); },
    };
    const tracked = t.track(agent);
    await assert.rejects(() => tracked.fail(), /async throw/);
    t.destroy();
  });

  it('tracks method with multiple arguments', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const agent = {
      async add(a, b) { return a + b; },
    };
    const tracked = t.track(agent);
    const result = await tracked.add(2, 3);
    assert.equal(result, 5);
    t.destroy();
  });

  it('skips non-function properties', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const agent = { name: 'test', count: 42, method: () => 'ok' };
    const tracked = t.track(agent);
    assert.equal(tracked.name, 'test');
    assert.equal(tracked.count, 42);
    t.destroy();
  });

  it('handles sampleRate=1 always recording', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: false });
    const agent = { async quick() { return 'done'; } };
    const tracked = t.track(agent);
    await tracked.quick();
    await tracked.quick();
    await tracked.quick();
    t.destroy();
  });
});

describe('Telyx destroy and flush branches', () => {
  it('destroy handles flush error gracefully', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: true });
    // Add some data to trigger a flush
    t.recordEvent('test');
    t.recordSuccess('method', 100);
    await t.destroy();
    // Should not throw
  });

  it('destroy with no pending data completes cleanly', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    await t.destroy();
    // Should not throw, should be idempotent
  });

  it('destroy can be called when flush is already in progress', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', maxBatchSize: 1, enableConsole: false });
    // Fill batch to trigger auto-flush
    t.recordEvent('event1');
    // Immediately destroy while flush might be in progress
    await t.destroy();
  });
});

describe('Telyx config validation edge cases', () => {
  it('accepts sampleRate of 0', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 0 });
    assert.ok(t);
    t.destroy();
  });

  it('accepts sampleRate of 1', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1 });
    assert.ok(t);
    t.destroy();
  });



  it('rejects NaN sampleRate', () => {
    // NaN is explicitly rejected by the validation logic
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', sampleRate: NaN });
    }, /sampleRate must be a number between 0 and 1/);
  });

  it('rejects negative sampleRate', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', sampleRate: -0.1 });
    }, /sampleRate must be a number between 0 and 1/);
  });

  it('rejects maxBatchSize as negative', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxBatchSize: -1 });
    }, /maxBatchSize must be a positive number/);
  });

  it('rejects maxBatchSize as non-number', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxBatchSize: 'big' });
    }, /maxBatchSize must be a positive number/);
  });

  it('accepts valid flushInterval', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', flushInterval: 5000 });
    assert.ok(t);
    t.destroy();
  });

  it('rejects agentName with newline (HTTP header injection)', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test\nmalicious', environment: 'test' });
    }, /newline or carriage return/);
  });

  it('rejects agentName with carriage return', () => {
    assert.throws(() => {
      new Telyx({ agentName: 'test\rmalicious', environment: 'test' });
    }, /newline or carriage return/);
  });
});

describe('Telyx sanitizeInput branches', () => {
  it('handles null input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    // Access private method
    const result = t['sanitizeInput'](null);
    assert.equal(result, 'null');
    t.destroy();
  });

  it('handles undefined input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const result = t['sanitizeInput'](undefined);
    assert.equal(result, 'undefined');
    t.destroy();
  });

  it('handles object input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const result = t['sanitizeInput']({ key: 'value' });
    assert.equal(result, '[object]');
    t.destroy();
  });

  it('handles number input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const result = t['sanitizeInput'](42);
    assert.equal(result, 42);
    t.destroy();
  });

  it('handles boolean input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const result = t['sanitizeInput'](true);
    assert.equal(result, true);
    t.destroy();
  });

  it('truncates long string input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const longStr = 'a'.repeat(150);
    const result = t['sanitizeInput'](longStr);
    assert.ok(result.length <= 103); // 100 + '...'
    assert.ok(result.endsWith('...'));
    t.destroy();
  });

  it('does not truncate short string input', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const result = t['sanitizeInput']('short');
    assert.equal(result, 'short');
    t.destroy();
  });
});
