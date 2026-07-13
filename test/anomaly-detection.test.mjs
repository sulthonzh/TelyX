import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx, TelyxAnalytics } from '../dist/index.js';

describe('TelyxAnalytics Anomaly Detection', () => {
  it('detects high error rate methods', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'login', duration: 100, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'login', duration: 150, success: false },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'login', duration: 200, success: false },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'fetch', duration: 50, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'fetch', duration: 75, success: true },
    ]);
    
    const anomalies = a.detectAnomalies();
    assert.ok(anomalies.highErrorRateMethods.length > 0);
    assert.equal(anomalies.highErrorRateMethods[0].method, 'login');
    assert.ok(anomalies.highErrorRateMethods[0].errorRate > 0.05);
    assert.equal(anomalies.slowResponseMethods.length, 0);
  });

  it('detects slow response methods', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'slow', duration: 3000, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'slow', duration: 4000, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'fast', duration: 100, success: true },
    ]);
    
    const anomalies = a.detectAnomalies();
    assert.ok(anomalies.slowResponseMethods.length > 0);
    assert.equal(anomalies.slowResponseMethods[0].method, 'slow');
    assert.ok(anomalies.slowResponseMethods[0].avgDuration > 2000);
    assert.equal(anomalies.highErrorRateMethods.length, 0);
  });

  it('detects sudden traffic spikes', () => {
    const a = new TelyxAnalytics();
    const now = new Date();
    
    // Add normal traffic
    for (let i = 0; i < 10; i++) {
      a.addEvents([
        { timestamp: new Date(now.getTime() - i * 600000).toISOString(), agent: 'a', environment: 't', event: 'call', method: 'normal', duration: 100, success: true },
      ]);
    }
    
    // Add spike traffic
    for (let i = 0; i < 50; i++) {
      a.addEvents([
        { timestamp: new Date(now.getTime() - 300000).toISOString(), agent: 'a', environment: 't', event: 'call', method: 'spike', duration: 100, success: true },
      ]);
    }
    
    const anomalies = a.detectAnomalies();
    assert.ok(anomalies.suddenTrafficSpikes.length > 0);
    assert.ok(anomalies.suddenTrafficSpikes[0].requestCount > 30); // Should detect the spike
  });

  it('returns no anomalies with healthy data', () => {
    const a = new TelyxAnalytics();
    a.addEvents([
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'healthy', duration: 100, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'healthy', duration: 200, success: true },
      { timestamp: new Date().toISOString(), agent: 'a', environment: 't', event: 'call', method: 'other', duration: 50, success: true },
    ]);
    
    const anomalies = a.detectAnomalies();
    assert.equal(anomalies.highErrorRateMethods.length, 0);
    assert.equal(anomalies.slowResponseMethods.length, 0);
    assert.equal(anomalies.suddenTrafficSpikes.length, 0);
  });
});

// ─── Input Validation Tests ───
describe('Telyx Input Validation', () => {
  it('validates configuration on creation', () => {
    // Valid config should not throw
    assert.doesNotThrow(() => {
      new Telyx({ agentName: 'test', environment: 'test' });
    });
    
    // Missing required fields should throw
    assert.throws(() => {
      new Telyx({ agentName: '' });
    }, /agentName is required/);
    
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: '' });
    }, /environment is required/);
    
    // Invalid sampleRate should throw
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', sampleRate: 1.5 });
    }, /sampleRate must be a number between 0 and 1/);
    
    // Invalid maxBatchSize should throw
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', maxBatchSize: 0 });
    }, /maxBatchSize must be a positive number/);

    // Endpoint validation
    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: '   ' });
    }, /endpoint must not be empty/);

    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: 'not-a-url' });
    }, /endpoint must be a valid URL/);

    assert.throws(() => {
      new Telyx({ agentName: 'test', environment: 'test', endpoint: 123 });
    }, /endpoint must be a string/);

    // Valid endpoints with trailing slashes should be normalized
    const t = new Telyx({ agentName: 'test', environment: 'test', endpoint: 'https://telemetry.example.com/' });
    assert.ok(t);
    t.destroy();
  });

  it('validates recordEvent parameters', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test' });
    
    // Valid calls should not throw
    assert.doesNotThrow(() => t.recordEvent('test'));
    assert.doesNotThrow(() => t.recordEvent('test', { key: 'value' }));
    
    // Invalid calls should throw
    assert.throws(() => t.recordEvent(''), /eventName must be a non-empty string/);
    assert.throws(() => t.recordEvent(123), /eventName must be a non-empty string/);
    assert.throws(() => t.recordEvent('test', 'invalid'), /metadata must be an object if provided/);
  });

  it('validates recordMetric parameters', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test' });
    
    // Valid calls should not throw
    assert.doesNotThrow(() => t.recordMetric('test', 42));
    assert.doesNotThrow(() => t.recordMetric('test', 42.5));
    
    // Invalid calls should throw
    assert.throws(() => t.recordMetric('', 42), /metricName must be a non-empty string/);
    assert.throws(() => t.recordMetric('test', 'invalid'), /value must be a finite number/);
    assert.throws(() => t.recordMetric('test', Infinity), /value must be a finite number/);
  });

  it('validates recordSuccess parameters', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test' });
    
    // Valid calls should not throw
    assert.doesNotThrow(() => t.recordSuccess('method', 100));
    
    // Invalid calls should throw
    assert.throws(() => t.recordSuccess('', 100), /methodName must be a non-empty string/);
    assert.throws(() => t.recordSuccess('method', -1), /duration must be a finite non-negative number/);
  });

  it('validates recordError parameters', () => {
    const t = new Telyx({ agentName: 'test', environment: 'test' });
    
    // Valid calls should not throw
    assert.doesNotThrow(() => t.recordError('method', new Error('test')));
    assert.doesNotThrow(() => t.recordError('method', 'error message'));
    
    // Invalid calls should throw
    assert.throws(() => t.recordError('', new Error('test')), /methodName must be a non-empty string/);
  });
});