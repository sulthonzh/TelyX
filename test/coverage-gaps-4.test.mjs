import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx } from '../dist/index.js';
import http from 'node:http';

// ─── Helper: create a mock HTTP server for endpoint testing ───
function createMockServer(opts = {}) {
  const { status = 200, delay = 0 } = opts;
  const received = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ url: req.url, method: req.method, headers: req.headers, body });
      if (delay) {
        setTimeout(() => { res.writeHead(status); res.end(); }, delay);
      } else {
        res.writeHead(status); res.end();
      }
    });
  });
  return { server, received };
}

function startServer(server) {
  return new Promise(resolve => server.listen(0, resolve));
}

// ─── trackMethod: sampled success/failure paths ───
describe('Telyx trackMethod coverage gaps', () => {
  it('trackMethod records success on sampled path', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: false });
    const fn = t.trackMethod('compute', async (input, next) => 'result');
    const result = await fn('input');
    assert.equal(result, 'result');
    const batch = t.getBatch();
    assert.ok(batch.events.some(e => e.event === 'method_success' && e.method === 'compute'));
    t.destroy();
  });

  it('trackMethod records failure on sampled path', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: false });
    const fn = t.trackMethod('failing', async () => { throw new Error('compute failed'); });
    await assert.rejects(() => fn('input'), /compute failed/);
    const batch = t.getBatch();
    assert.ok(batch.events.some(e => e.event === 'method_failure' && e.method === 'failing'));
    assert.ok(batch.errors.some(e => e.error === 'compute failed'));
    t.destroy();
  });

  it('trackMethod non-sampled path still executes fn', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 0, enableConsole: false });
    const fn = t.trackMethod('ok', async (input) => 'non-sampled-result');
    const result = await fn('data');
    assert.equal(result, 'non-sampled-result');
    assert.equal(t.getBatch().events.filter(e => e.event === 'method_success').length, 0);
    t.destroy();
  });

  it('trackMethod non-sampled path re-throws errors', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 0, enableConsole: false });
    const fn = t.trackMethod('throws', async () => { throw new Error('non-sampled throw'); });
    await assert.rejects(() => fn('data'), /non-sampled throw/);
    t.destroy();
  });
});

// ─── enableConsole logging branches ───
describe('Telyx enableConsole branches', () => {
  it('recordEvent logs when enableConsole is true', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: true });
    const spy = mock.method(console, 'log');
    t.recordEvent('test-event');
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Event:')));
    spy.mock.restore();
    t.destroy();
  });

  it('recordMetric logs when enableConsole is true', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: true });
    const spy = mock.method(console, 'log');
    t.recordMetric('cpu', 42);
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Metric:')));
    spy.mock.restore();
    t.destroy();
  });

  it('recordSuccess logs when enableConsole is true', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: true });
    const spy = mock.method(console, 'log');
    t.recordSuccess('m1', 100);
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Success:')));
    spy.mock.restore();
    t.destroy();
  });

  it('recordFailure logs when enableConsole is true', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: true });
    const spy = mock.method(console, 'log');
    t.recordFailure('m1', 50);
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Failure:')));
    spy.mock.restore();
    t.destroy();
  });

  it('recordError logs when enableConsole is true', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: true });
    const spy = mock.method(console, 'log');
    t.recordError('m1', new Error('console-test'));
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Error:')));
    spy.mock.restore();
    t.destroy();
  });
});

// ─── track() Proxy: sampled + non-sampled + edge cases ───
describe('Telyx track() proxy coverage gaps', () => {
  it('track() proxy success on sampled path', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: false });
    const agent = { async greet(name) { return `hello ${name}`; } };
    const tracked = t.track(agent);
    const result = await tracked.greet('world');
    assert.equal(result, 'hello world');
    assert.ok(t.getBatch().events.some(e => e.event === 'method_success' && e.method === 'greet'));
    t.destroy();
  });

  it('track() proxy failure on sampled path', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: false });
    const agent = { async fail() { throw new Error('proxy fail'); } };
    const tracked = t.track(agent);
    await assert.rejects(() => tracked.fail(), /proxy fail/);
    assert.ok(t.getBatch().events.some(e => e.event === 'method_failure' && e.method === 'fail'));
    t.destroy();
  });

  it('track() proxy non-sampled path still calls method', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 0, enableConsole: false });
    const agent = { async compute(x) { return x * 2; } };
    const tracked = t.track(agent);
    assert.equal(await tracked.compute(5), 10);
    assert.equal(t.getBatch().events.filter(e => e.event === 'method_success').length, 0);
    t.destroy();
  });

  it('track() proxy handles sync throw as rejection (non-sampled)', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 0, enableConsole: false });
    const agent = { boom() { throw new Error('sync throw'); } };
    const tracked = t.track(agent);
    await assert.rejects(() => tracked.boom(), /sync throw/);
    t.destroy();
  });

  it('track() proxy handles sync throw as rejection (sampled)', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1, enableConsole: false });
    const agent = { boom() { throw new Error('sync throw sampled'); } };
    const tracked = t.track(agent);
    await assert.rejects(() => tracked.boom(), /sync throw sampled/);
    assert.ok(t.getBatch().events.some(e => e.event === 'method_failure' && e.method === 'boom'));
    t.destroy();
  });

  it('track() proxy returns non-function properties as-is', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const tracked = t.track({ name: 'agent1', count: 42 });
    assert.equal(tracked.name, 'agent1');
    assert.equal(tracked.count, 42);
    t.destroy();
  });

  it('track() proxy returns symbol properties as-is', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    const sym = Symbol('test');
    const tracked = t.track({ [sym]: 'symbol-value' });
    assert.equal(tracked[sym], 'symbol-value');
    t.destroy();
  });
});

// ─── flush() + postBatch with real HTTP server ───
describe('Telyx flush/postBatch coverage', () => {
  it('flush sends batch to server successfully', async () => {
    const { server, received } = createMockServer({ status: 200 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: false,
    });

    t.recordEvent('flush-test');
    t.recordMetric('cpu', 50);
    await t.flush();

    assert.ok(received.length > 0);
    assert.equal(received[0].url, '/telemetry');
    const body = JSON.parse(received[0].body);
    assert.ok(body.events.length > 0);

    t.destroy();
    server.close();
  });

  it('flush with empty batch is a no-op', async () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    await t.flush();
    t.destroy();
  });

  it('flush on 500 adds to retry queue', async () => {
    const { server, received } = createMockServer({ status: 500 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: false,
    });

    t.recordEvent('retry-test');
    await t.flush();
    assert.ok(received.length >= 1);

    t.destroy();
    server.close();
  });

  it('flush logs success to console when enableConsole', async () => {
    const { server } = createMockServer({ status: 200 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: true,
    });

    t.recordEvent('log-test');
    const spy = mock.method(console, 'log');
    await t.flush();
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Flushed')));
    spy.mock.restore();

    t.destroy();
    server.close();
  });

  it('flush error logs to console when enableConsole', async () => {
    const { server } = createMockServer({ status: 500 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: true,
    });

    t.recordEvent('err-log-test');
    const spy = mock.method(console, 'error');
    await t.flush();
    assert.ok(spy.mock.calls.some(c => String(c.arguments[0]).includes('Failed to flush')));
    spy.mock.restore();

    t.destroy();
    server.close();
  });

  it('retry console logging works', async () => {
    const { server } = createMockServer({ status: 500 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: true,
    });

    t.recordEvent('retry-console');
    const logSpy = mock.method(console, 'log');
    const errSpy = mock.method(console, 'error');
    await t.flush();
    // Retry queue processing logs
    assert.ok(logSpy.mock.calls.some(c => String(c.arguments[0] || '').includes('Retrying')) ||
              errSpy.mock.calls.some(c => String(c.arguments[0] || '').includes('Retry')));
    logSpy.mock.restore();
    errSpy.mock.restore();

    t.destroy();
    server.close();
  });
});

// ─── destroy() coverage ───
describe('Telyx destroy() coverage', () => {
  it('destroy waits for pending flush promise and clears it', async () => {
    const { server, received } = createMockServer({ status: 200, delay: 100 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: false,
    });

    t.recordEvent('destroy-pending');
    t.flush(); // Don't await — destroy should handle it
    await t.destroy();
    assert.equal(t['_flushPromise'], undefined, '_flushPromise should be cleared');
    assert.equal(t['flushTimer'], undefined, 'flushTimer should be cleared');
    assert.ok(received.length > 0, 'data should have been flushed');
    server.close();
  });

  it('destroy logs final flush failure with enableConsole (500 server)', async () => {
    const { server } = createMockServer({ status: 500 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: true,
    });

    t.recordEvent('final-flush-fail');
    const errSpy = mock.method(console, 'error');
    const warnSpy = mock.method(console, 'warn');
    await t.destroy();
    // _flushInternal catches errors internally and logs via console.error
    const allMessages = [
      ...errSpy.mock.calls.map(c => String(c.arguments[0] || '')),
      ...warnSpy.mock.calls.map(c => String(c.arguments[0] || '')),
    ];
    assert.ok(
      allMessages.some(m => m.includes('Failed') || m.includes('flush') || m.includes('Flush')),
      `expected a flush-related message, got: ${JSON.stringify(allMessages)}`
    );
    errSpy.mock.restore();
    warnSpy.mock.restore();
    server.close();
  });

  it('destroy removes flush timer interval', async () => {
    const t = new Telyx({
      agentName: 'test', environment: 'test',
      enableConsole: false,
      flushInterval: 5000,
    });
    assert.ok(t['flushTimer'], 'flushTimer should be set');
    await t.destroy();
    assert.equal(t['flushTimer'], undefined, 'flushTimer should be cleared after destroy');
  });
});

// ─── sanitizeInput edge cases ───
describe('Telyx sanitizeInput coverage', () => {
  it('returns "null" for null', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.equal(t['sanitizeInput'](null), 'null');
    t.destroy();
  });

  it('returns "undefined" for undefined', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.equal(t['sanitizeInput'](undefined), 'undefined');
    t.destroy();
  });

  it('returns "[object]" for objects', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.equal(t['sanitizeInput']({ key: 'value' }), '[object]');
    t.destroy();
  });

  it('returns short strings as-is', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.equal(t['sanitizeInput']('short'), 'short');
    t.destroy();
  });

  it('returns non-string primitives as-is', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.equal(t['sanitizeInput'](42), 42);
    assert.equal(t['sanitizeInput'](true), true);
    t.destroy();
  });
});

// ─── checkBatchSize auto-flush ───
describe('Telyx checkBatchSize auto-flush', () => {
  it('triggers auto-flush when batch exceeds maxBatchSize', async () => {
    const { server, received } = createMockServer({ status: 200 });
    await startServer(server);
    const port = server.address().port;

    const t = new Telyx({
      agentName: 'test', environment: 'test',
      endpoint: `http://localhost:${port}`,
      sampleRate: 1, enableConsole: false,
      maxBatchSize: 2,
    });

    t.recordEvent('e1');
    t.recordEvent('e2');
    t.recordEvent('e3'); // triggers auto-flush

    await new Promise(r => setTimeout(r, 500));
    assert.ok(received.length > 0);

    t.destroy();
    server.close();
  });
});

// ─── registerShutdownHandler ───
describe('Telyx registerShutdownHandler coverage', () => {
  it('registers and removes beforeExit handler', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test', enableConsole: false });
    assert.ok(t['shutdownHandler'], 'handler should exist');
    t.destroy();
    assert.equal(t['shutdownHandler'], undefined, 'handler removed after destroy');
  });
});
