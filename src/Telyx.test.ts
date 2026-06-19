import { Telyx } from './core/Telyx';
import { TelyxAnalytics } from './analytics/TelyxAnalytics';
import { TelyxConfig, TelyxEvent } from './types';

// Helper to access private batch for assertions
function getBatch(telyx: Telyx) {
  return (telyx as any).batch;
}
function getConfig(telyx: Telyx) {
  return (telyx as any).config;
}

describe('Telyx', () => {
  let telyx: Telyx;

  beforeEach(() => {
    telyx = new Telyx({
      agentName: 'test-agent',
      environment: 'test',
      enableConsole: false,
      sampleRate: 1.0, // always sample in tests
    });
  });

  afterEach(async () => {
    await telyx.destroy();
  });

  describe('Initialization', () => {
    it('should apply default config values', () => {
      const config = getConfig(telyx);
      expect(config.sampleRate).toBe(1.0);
      expect(config.maxBatchSize).toBe(100);
      expect(config.flushInterval).toBe(5000);
      expect(config.enableConsole).toBe(false);
    });

    it('should accept custom config', async () => {
      const custom = new Telyx({
        endpoint: 'https://custom.example.com',
        agentName: 'custom',
        environment: 'staging',
        sampleRate: 0.5,
        maxBatchSize: 50,
        flushInterval: 1000,
        enableConsole: true,
      });
      const config = getConfig(custom);
      expect(config.endpoint).toBe('https://custom.example.com');
      expect(config.maxBatchSize).toBe(50);
      expect(config.flushInterval).toBe(1000);
      await custom.destroy();
    });
  });

  describe('Event Recording', () => {
    it('should add events to the batch', () => {
      telyx.recordEvent('test_event', { key: 'value' });
      const batch = getBatch(telyx);
      expect(batch.events).toHaveLength(1);
      expect(batch.events[0].event).toBe('test_event');
      expect(batch.events[0].metadata).toEqual({ key: 'value' });
      expect(batch.events[0].agent).toBe('test-agent');
      expect(batch.events[0].environment).toBe('test');
    });

    it('should add metrics to the batch', () => {
      telyx.recordMetric('test_metric', 42);
      const batch = getBatch(telyx);
      expect(batch.metrics).toHaveLength(1);
      expect(batch.metrics[0].metric).toBe('test_metric');
      expect(batch.metrics[0].value).toBe(42);
    });

    it('should record success events with duration', () => {
      telyx.recordSuccess('my_method', 150, { input: 'test' });
      const batch = getBatch(telyx);
      expect(batch.events).toHaveLength(1);
      expect(batch.events[0].method).toBe('my_method');
      expect(batch.events[0].duration).toBe(150);
      expect(batch.events[0].success).toBe(true);
    });

    it('should record errors with message and stack', () => {
      const error = new Error('Test error');
      telyx.recordError('failing_method', error, { extra: 'context' });
      const batch = getBatch(telyx);
      expect(batch.errors).toHaveLength(1);
      expect(batch.errors[0].error).toBe('Test error');
      expect(batch.errors[0].stack).toBeDefined();
      expect(batch.errors[0].context?.method).toBe('failing_method');
    });
  });

  describe('Method Tracking', () => {
    it('should track async methods with timing', async () => {
      const trackedMethod = telyx.trackMethod('test_method', async (input, next) => {
        return next();
      });

      const result = await trackedMethod('test input');
      expect(result).toBe('test input');
    });

    it('should propagate errors from the tracked function', async () => {
      const trackedMethod = telyx.trackMethod('test_method', async (input, _next) => {
        throw new Error('Test error');
      });

      await expect(trackedMethod('test input')).rejects.toThrow('Test error');
    });

    it('should create a failure event with success=false on error', async () => {
      const trackedMethod = telyx.trackMethod('failing_method', async (_input, _next) => {
        throw new Error('Boom');
      });

      await expect(trackedMethod('input')).rejects.toThrow('Boom');

      const batch = getBatch(telyx);
      // Should have a failure event with success=false
      const failureEvent = batch.events.find((e: any) => e.success === false);
      expect(failureEvent).toBeDefined();
      expect(failureEvent!.method).toBe('failing_method');
      expect(failureEvent!.success).toBe(false);
      expect(failureEvent!.duration).toBeGreaterThanOrEqual(0);
      // Should also have the error in the errors array
      expect(batch.errors).toHaveLength(1);
      expect(batch.errors[0].error).toBe('Boom');
    });
  });

  describe('Sampling', () => {
    it('should skip recording when sampleRate is 0', () => {
      const noSample = new Telyx({
        agentName: 'test-agent',
        environment: 'test',
        sampleRate: 0.0,
        enableConsole: false,
      });

      noSample.recordEvent('should_not_appear');
      noSample.recordMetric('also_not', 1);
      const batch = getBatch(noSample);
      expect(batch.events).toHaveLength(0);
      expect(batch.metrics).toHaveLength(0);
      noSample.destroy();
    });

    it('should sample correctly when sampleRate is 0.5', async () => {
      const sampleTest = new Telyx({
        agentName: 'test-agent',
        environment: 'test',
        sampleRate: 0.5,
        enableConsole: false,
      });

      // Record multiple events to test probabilistic sampling
      const sampleSize = 100;
      for (let i = 0; i < sampleSize; i++) {
        sampleTest.recordEvent('test_event');
      }

      const batch = getBatch(sampleTest);
      // With 0.5 sample rate, we expect roughly half the events to be recorded
      // Allow for some variance due to randomness
      const recordedCount = batch.events.length;
      expect(recordedCount).toBeGreaterThan(sampleSize * 0.3); // At least 30%
      expect(recordedCount).toBeLessThan(sampleSize * 0.7); // At most 70%
      await sampleTest.destroy();
    });
  });

  describe('Input Sanitization', () => {
    it('should truncate long string inputs to 100 chars', () => {
      const longString = 'a'.repeat(200);
      // sanitizeInput is called inside trackMethod, test indirectly
      const sanitized = (telyx as any).sanitizeInput(longString);
      expect(sanitized).toHaveLength(103); // 100 + '...'
      expect(sanitized.endsWith('...')).toBe(true);
    });

    it('should replace objects with placeholder', () => {
      expect((telyx as any).sanitizeInput({ foo: 'bar' })).toBe('[object]');
    });

    it('should pass through short strings unchanged', () => {
      expect((telyx as any).sanitizeInput('hello')).toBe('hello');
    });
  });
});

describe('TelyxAnalytics', () => {
  let analytics: TelyxAnalytics;

  beforeEach(() => {
    analytics = new TelyxAnalytics();
  });

  const makeEvent = (overrides: Partial<TelyxEvent> = {}): TelyxEvent => ({
    timestamp: new Date().toISOString(),
    agent: 'test-agent',
    environment: 'test',
    event: 'method_success',
    ...overrides,
  });

  describe('getMethodPerformance', () => {
    it('returns zeros for unknown method', () => {
      const perf = analytics.getMethodPerformance('nonexistent');
      expect(perf.totalCalls).toBe(0);
      expect(perf.successRate).toBe(0);
    });

    it('computes correct stats', () => {
      analytics.addEvents([
        makeEvent({ method: 'api', duration: 100, success: true }),
        makeEvent({ method: 'api', duration: 200, success: true }),
        makeEvent({ method: 'api', duration: 300, success: false }),
      ]);

      const perf = analytics.getMethodPerformance('api');
      expect(perf.totalCalls).toBe(3);
      expect(perf.successfulCalls).toBe(2);
      expect(perf.failedCalls).toBe(1);
      expect(perf.successRate).toBeCloseTo(2 / 3);
      expect(perf.minDuration).toBe(100);
      expect(perf.maxDuration).toBe(300);
      expect(perf.averageDuration).toBeCloseTo(200);
    });

    it('handles large datasets without stack overflow', () => {
      // Math.min(...array) would blow up at ~100K elements
      const analytics2 = new TelyxAnalytics(200_000);
      const events = Array.from({ length: 150_000 }, (_, i) =>
        makeEvent({ method: 'heavy', duration: i + 1, success: true })
      );
      analytics2.addEvents(events);

      const perf = analytics2.getMethodPerformance('heavy');
      expect(perf.totalCalls).toBe(150_000);
      expect(perf.minDuration).toBe(1);
      expect(perf.maxDuration).toBe(150_000);
    });
  });

  describe('getSystemHealth', () => {
    it('computes success and error rates', () => {
      analytics.addEvents([
        makeEvent({ success: true, duration: 50, method: 'a' }),
        makeEvent({ success: false, duration: 100, method: 'a' }),
        makeEvent({ success: true, duration: 75, method: 'b' }),
      ]);

      const health = analytics.getSystemHealth();
      expect(health.totalCalls).toBe(3);
      expect(health.successRate).toBeCloseTo(2 / 3);
      expect(health.errorRate).toBeCloseTo(1 / 3);
      expect(health.averageResponseTime).toBeCloseTo(75);
    });
  });

  describe('getErrorAnalysis', () => {
    it('groups errors by method and type', () => {
      analytics.addEvents([
        makeEvent({ success: true, method: 'x' }),
        makeEvent({ success: true, method: 'y' }),
      ]);
      analytics.addErrors([
        { timestamp: new Date().toISOString(), agent: 'a', environment: 'e', error: 'TypeError: bad', context: { method: 'x' } },
        { timestamp: new Date().toISOString(), agent: 'a', environment: 'e', error: 'RangeError: overflow', context: { method: 'x' } },
        { timestamp: new Date().toISOString(), agent: 'a', environment: 'e', error: 'TypeError: another', context: { method: 'y' } },
      ]);

      const analysis = analytics.getErrorAnalysis();
      expect(analysis.totalErrors).toBe(3);
      expect(analysis.errorByMethod['x']).toBe(2);
      expect(analysis.errorByMethod['y']).toBe(1);
      expect(analysis.errorTypes['TypeError']).toBe(2);
      expect(analysis.errorTypes['RangeError']).toBe(1);
      expect(analysis.errorRate).toBeCloseTo(3 / 2); // errors / events
    });
  });

  describe('clear', () => {
    it('resets all data', () => {
      analytics.addEvents([makeEvent()]);
      analytics.clear();
      expect(analytics.getSystemHealth().totalCalls).toBe(0);
    });
  });

  describe('successRate excludes custom events', () => {
    it('getSystemHealth does not dilute rates with custom events', () => {
      analytics.addEvents([
        makeEvent({ event: 'custom_click', success: undefined, method: undefined }),
        makeEvent({ event: 'custom_page_view', success: undefined, method: undefined }),
        makeEvent({ event: 'method_success', method: 'api', success: true, duration: 50 }),
        makeEvent({ event: 'method_failure', method: 'api', success: false, duration: 100 }),
      ]);

      const health = analytics.getSystemHealth();
      // totalCalls counts ALL events
      expect(health.totalCalls).toBe(4);
      // successRate/errorRate should only consider events with success=true/false
      expect(health.successRate).toBeCloseTo(0.5); // 1 success / (1 success + 1 failure)
      expect(health.errorRate).toBeCloseTo(0.5);
    });

    it('getSummary does not dilute rates with custom events', () => {
      analytics.addEvents([
        makeEvent({ event: 'custom', success: undefined }),
        makeEvent({ event: 'custom2', success: undefined }),
        makeEvent({ method: 'api', success: true, duration: 10 }),
      ]);

      const summary = analytics.getSummary();
      expect(summary.totalEvents).toBe(3);
      // Only 1 event has success=true out of 1 rated event → 100%
      expect(summary.successRate).toBe(1);
      expect(summary.errorRate).toBe(0);
    });
  });
});
