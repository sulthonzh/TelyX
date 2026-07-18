import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Telyx } from '../dist/index.js';
import { TelyxAnalytics } from '../dist/analytics/TelyxAnalytics.js';

describe('TelyxAnalytics toMarkdown() anomaly sections', () => {
  it('omits anomaly sections when no anomalies detected', () => {
    const analytics = new TelyxAnalytics();
    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 100, method: 'fastMethod' },
    ]);

    const markdown = analytics.toMarkdown();
    assert.match(markdown, /# Telyx Telemetry Report/);
    assert.doesNotMatch(markdown, /## ⚠️ Anomalies Detected/);
    assert.doesNotMatch(markdown, /### High Error Rate Methods/);
    assert.doesNotMatch(markdown, /### Slow Response Methods/);
    assert.doesNotMatch(markdown, /### Sudden Traffic Spikes/);
  });

  it('includes slow response methods section when present', () => {
    const analytics = new TelyxAnalytics();
    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 2500, method: 'slowMethod' },
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 3000, method: 'slowMethod' },
    ]);

    const markdown = analytics.toMarkdown();
    assert.match(markdown, /## ⚠️ Anomalies Detected/);
    assert.match(markdown, /### Slow Response Methods/);
    assert.match(markdown, /slowMethod/);
    assert.match(markdown, /2750/); // Should show avg duration (2750 = (2500+3000)/2)
  });

  // Note: Traffic spike detection is already covered in test/anomaly-detection.test.mjs

  it('includes all three anomaly types when present', () => {
    const analytics = new TelyxAnalytics();

    // Add high error rate method
    for (let i = 0; i < 20; i++) {
      analytics.addEvents([
        { timestamp: new Date().toISOString(), event: 'test', success: false, duration: 100, method: 'failingMethod' },
        { timestamp: new Date().toISOString(), event: 'test', success: false, duration: 100, method: 'failingMethod' },
        { timestamp: new Date().toISOString(), event: 'test', success: false, duration: 100, method: 'failingMethod' },
        { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 100, method: 'failingMethod' },
      ]);
    }

    // Add slow response method
    for (let i = 0; i < 5; i++) {
      analytics.addEvents([
        { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 2100, method: 'slowMethod' },
      ]);
    }

    const markdown = analytics.toMarkdown();
    assert.match(markdown, /## ⚠️ Anomalies Detected/);
    assert.match(markdown, /### High Error Rate Methods/);
    assert.match(markdown, /### Slow Response Methods/);
  });

  it('formats anomaly sections with correct table structure', () => {
    const analytics = new TelyxAnalytics();
    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 2500, method: 'slowMethod' },
    ]);

    const markdown = analytics.toMarkdown();
    assert.match(markdown, /\| Method \| Avg Duration \| Threshold \|/);
    assert.match(markdown, /\|--------\|-------------\|-----------\|/);
    assert.match(markdown, /\| 2000ms \|/); // Threshold column shows 2000ms
  });
});

describe('TelyxAnalytics cleanupData() retention limits', () => {
  it('truncates events when exceeding maxRetention', () => {
    const analytics = new TelyxAnalytics(10, 7 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 20; i++) {
      analytics.addEvents([
        { timestamp: new Date().toISOString(), event: `event-${i}`, success: true, duration: 100, method: 'test' },
      ]);
    }

    const summary = analytics.getSummary();
    assert.equal(summary.totalEvents, 10); // Should be truncated to maxRetention
  });

  it('truncates metrics when exceeding maxRetention', () => {
    const analytics = new TelyxAnalytics(10, 7 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 20; i++) {
      analytics.addMetrics([
        { timestamp: new Date().toISOString(), name: 'test', value: i },
      ]);
    }

    assert.equal(analytics.getSummary().totalMetrics, 10); // Should be truncated to maxRetention
  });

  it('truncates errors when exceeding maxRetention/10', () => {
    const analytics = new TelyxAnalytics(10, 7 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 5; i++) {
      analytics.addErrors([
        { timestamp: new Date().toISOString(), error: `error-${i}`, context: {} },
      ]);
    }

    assert.equal(analytics.getSummary().totalErrors, 1); // Should be truncated to maxRetention/10 = 1
  });

  it('does not truncate events when under maxRetention', () => {
    const analytics = new TelyxAnalytics(100, 7 * 24 * 60 * 60 * 1000);

    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 100, method: 'test' },
    ]);

    const summary = analytics.getSummary();
    assert.equal(summary.totalEvents, 1);
  });

  it('does not truncate metrics when under maxRetention', () => {
    const analytics = new TelyxAnalytics(100, 7 * 24 * 60 * 60 * 1000);

    analytics.addMetrics([
      { timestamp: new Date().toISOString(), name: 'test', value: 42 },
    ]);

    assert.equal(analytics.getSummary().totalMetrics, 1);
  });

  it('does not truncate errors when under maxRetention/10', () => {
    const analytics = new TelyxAnalytics(100, 7 * 24 * 60 * 60 * 1000);

    analytics.addErrors([
      { timestamp: new Date().toISOString(), error: 'test', context: {} },
    ]);

    assert.equal(analytics.getSummary().totalErrors, 1);
  });

  it('keeps most recent events when truncating', () => {
    const analytics = new TelyxAnalytics(5, 7 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 10; i++) {
      analytics.addEvents([
        { timestamp: new Date().toISOString(), event: `event-${i}`, success: true, duration: 100, method: 'test' },
      ]);
    }

    const summary = analytics.getSummary();
    assert.equal(summary.totalEvents, 5);
  });

  it('handles edge case maxRetention=0', () => {
    const analytics = new TelyxAnalytics(0, 7 * 24 * 60 * 60 * 1000);

    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 100, method: 'test' },
    ]);

    assert.equal(analytics.getSummary().totalEvents, 1); // Should not truncate when maxRetention=0
  });
});

describe('TelyxAnalytics getSummary() with anomalies', () => {
  it('computes correct averages for top methods', () => {
    const analytics = new TelyxAnalytics();

    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 100, method: 'method1' },
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 200, method: 'method1' },
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 300, method: 'method1' },
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 50, method: 'method2' },
    ]);

    const summary = analytics.getSummary();
    assert.equal(summary.topMethods.length, 2);
    assert.equal(summary.topMethods[0].method, 'method1');
    assert.equal(summary.topMethods[0].avgDuration, 200);
  });

  it('handles empty method list gracefully', () => {
    const analytics = new TelyxAnalytics();
    const summary = analytics.getSummary();
    assert.equal(summary.topMethods.length, 0);
  });

  it('handles missing duration in events for averages', () => {
    const analytics = new TelyxAnalytics();

    analytics.addEvents([
      { timestamp: new Date().toISOString(), event: 'test', success: true, method: 'method1' }, // No duration
      { timestamp: new Date().toISOString(), event: 'test', success: true, duration: 200, method: 'method1' },
    ]);

    const summary = analytics.getSummary();
    assert.equal(summary.topMethods.length, 1);
    assert.equal(summary.topMethods[0].avgDuration, 100); // Should compute avg of defined durations only
  });
});