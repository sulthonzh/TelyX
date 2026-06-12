# Telyx

Lightweight telemetry system for AI agents and intelligent workflows. Track performance, monitor interactions, and gain insights into your agent's behavior.

## Features

- **Real-time Performance Monitoring** — Track response times, success rates, and resource usage
- **Interaction Logging** — Capture agent-user interactions with structured metadata
- **Performance Analytics** — Built-in analytics for identifying bottlenecks
- **Lightweight & Fast** — Minimal overhead with efficient data collection
- **Flexible Export** — Multiple output formats (JSON, CSV, database)
- **Agent-Agnostic** — Works with any AI agent framework
- **Middleware** — Built-in middleware for HTTP, database, cache, and AI API calls

## Installation

```bash
npm install telyx
```

## Quick Start

```typescript
import { Telyx, TelyxAnalytics } from 'telyx';

// Initialize telemetry
const telyx = new Telyx({
  endpoint: 'https://your-telemetry-endpoint.com',
  agentName: 'my-chatbot',
  environment: 'production',
});

// Initialize analytics for local processing
const analytics = new TelyxAnalytics();

// Record events
const eventData = {
  userId: '123',
  message: 'hello',
  timestamp: new Date().toISOString()
};
telyx.recordEvent('user_message', eventData);
analytics.addEvents([{
  timestamp: new Date().toISOString(),
  agent: 'my-chatbot',
  environment: 'production',
  event: 'user_message',
  metadata: eventData
}]);

// Record metrics
telyx.recordMetric('response_time', 150);
analytics.addMetrics([{
  timestamp: new Date().toISOString(),
  agent: 'my-chatbot',
  environment: 'production',
  metric: 'response_time',
  value: 150
}]);

// Track method calls with automatic timing
const tracked = telyx.trackMethod('processQuery', async (input, next) => {
  console.log('Processing query:', input);
  const result = await next();
  console.log('Query processed:', result);
  return result;
});

const result = await tracked('user query');

// Clean up when done
await telyx.destroy();

// Generate analytics report
console.log('Analytics Report:', analytics.toMarkdown());
```

## Analytics

```typescript
import { TelyxAnalytics } from 'telyx';

const analytics = new TelyxAnalytics();
analytics.addEvents(events);
analytics.addMetrics(metrics);
analytics.addErrors(errors);

// Method performance
const perf = analytics.getMethodPerformance('processQuery');
// { averageDuration, minDuration, maxDuration, successRate, totalCalls }

// System health overview
const health = analytics.getSystemHealth();
// { totalCalls, successRate, errorRate, averageResponseTime }

// Error analysis
const errors = analytics.getErrorAnalysis();
// { totalErrors, errorByMethod, errorTypes, recentErrors }

// Usage metrics (tokens, API calls)
const usage = analytics.getUsageMetrics();
// { totalTokens, totalApiCalls, providerUsage, modelUsage }

// Anomaly detection
const anomalies = analytics.detectAnomalies();
// { highErrorRateMethods, slowResponseMethods, suddenTrafficSpikes }
```

## Best Practices

### 1. Configuration

```typescript
// Development - Full tracking with console output
const devTelyx = new Telyx({
  endpoint: 'http://localhost:3001/api/telemetry',
  agentName: 'dev-chatbot',
  environment: 'development',
  sampleRate: 1.0, // Track everything
  enableConsole: true, // Debug output
  flushInterval: 1000, // Quick feedback
});

// Production - Optimized for performance
const prodTelyx = new Telyx({
  endpoint: 'https://api.your-telemetry.com',
  agentName: 'prod-chatbot',
  environment: 'production',
  sampleRate: 0.1, // Sample 10% of events
  enableConsole: false, // No console output
  maxBatchSize: 500, // Larger batches
  flushInterval: 5000, // Every 5 seconds
});
```

### 2. Agent Wrapping

```typescript
// Wrap your entire agent class
const agent = {
  async processMessage(message: string) {
    // Your processing logic
  },
  
  async generateResponse(prompt: string) {
    // Your generation logic
  }
};

// Wrap with telemetry
const trackedAgent = telyx.track(agent);

// Now all methods are automatically tracked
await trackedAgent.processMessage('hello');
await trackedAgent.generateResponse('Tell me about AI');
```

### 3. Error Handling

```typescript
// Wrap critical operations with error tracking
const safeOperation = async () => {
  try {
    const result = await someRiskyOperation();
    telyx.recordSuccess('risky_operation', Date.now() - start, { result });
    return result;
  } catch (error) {
    telyx.recordError('risky_operation', error, { context });
    throw error; // Re-throw to maintain error flow
  }
};
```

### 4. Resource Management

```typescript
// Always clean up when possible
try {
  // Your telemetry-enabled code
  const tracked = telyx.trackMethod('long_operation', fn);
  const result = await tracked(params);
  return result;
} finally {
  // Ensure cleanup happens
  await telyx.flush(); // Send any remaining data
}
```

### 5. Integration with Existing Systems

```typescript
// Express.js integration
const express = require('express');
const app = express();
const { Telyx, TelyxMiddleware } = require('telyx');

const telyx = new Telyx({ agentName: 'express-api', environment: 'production' });
const middleware = new TelyxMiddleware(telyx);

// Apply middleware to all routes
app.use(middleware.httpRequestMiddleware);

// Route-specific tracking
app.post('/api/chat', (req, res) => {
  const tracker = middleware.aiCallMiddleware('openai', 'gpt-4', req.body.message);
  
  openai.chat.completions.create({
    messages: [{ role: 'user', content: req.body.message }]
  })
  .then(response => {
    tracker.end(response);
    res.json(response);
  })
  .catch(error => {
    tracker.end(null, error);
    res.status(500).json({ error: error.message });
  });
});
```

## Troubleshooting

### Common Issues

1. **Events not appearing**: Check your `sampleRate` and `endpoint` configuration
2. **High memory usage**: Adjust `maxAnalyticsRetention` and `maxHistoryAgeMs`
3. **Slow performance**: Increase `flushInterval` and reduce `sampleRate`
4. **Network errors**: Telyx automatically retries failed requests

### Debug Mode

```typescript
// Enable debug logging
const telyx = new Telyx({
  agentName: 'debug-chatbot',
  environment: 'development',
  enableConsole: true,
});

// Check pending events
console.log('Batch size:', telyx.batch.events.length);
console.log('Pending metrics:', telyx.batch.metrics.length);
console.log('Pending errors:', telyx.batch.errors.length);

// Force flush
await telyx.flush();
```

## Middleware

### HTTP Request Tracking

Automatic HTTP request/response tracking with timing, status codes, and sanitized headers:

```typescript
import { Telyx, TelyxMiddleware } from 'telyx';

const telyx = new Telyx({ agentName: 'api', environment: 'prod' });
const middleware = new TelyxMiddleware(telyx);

// Apply to Express.js
app.use(middleware.httpRequestMiddleware);

// Automatically tracks:
// - Request method, URL, user agent
// - Response status code, duration
// - Sanitized headers (no sensitive data)
// - Content length
//```

### AI API Call Tracking

Comprehensive AI API tracking with token usage, response times, and error handling:

```typescript
const tracker = middleware.aiCallMiddleware('openai', 'gpt-4', prompt);
try {
  const response = await openai.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'gpt-4'
  });
  
  // Automatically tracks:
  // - Token usage (input/output)
  // - Response time
  // - Provider and model
  // - Success/failure status
  tracker.end(response);
} catch (err) {
  // Automatically tracks errors with context
  tracker.end(null, err);
}
```

### Database Query Tracking

Performance tracking for database queries with error handling and result analysis:

```typescript
const tracker = middleware.databaseQueryMiddleware(
  'SELECT * FROM users WHERE id = ?', 
  { id: 1 }
);

try {
  const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);
  // Automatically tracks:
  // - Query execution time
  // - Rows affected
  // - Success/failure status
  tracker.end(result);
} catch (err) {
  tracker.end(null, err);
}
```

### Cache Operation Tracking

Monitor cache hit rates and performance:

```typescript
const tracker = middleware.cacheOperationMiddleware('get', 'user:123');
const result = await cache.get('user:123');
tracker.end(result); // Tracks cache hit/miss and timing
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | `'https://api.telyx.example.com'` | Telemetry endpoint |
| `agentName` | `string` | required | Your agent's name |
| `environment` | `string` | required | Environment (dev/staging/prod) |
| `sampleRate` | `number` | `1.0` | Sampling rate (0.0 - 1.0) |
| `maxBatchSize` | `number` | `100` | Max events per batch |
| `flushInterval` | `number` | `5000` | Batch flush interval (ms) |
| `enableConsole` | `boolean` | `false` | Log to console |
| `maxAnalyticsRetention` | `number` | `10000` | Max analytics data points to retain |
| `maxHistoryAgeMs` | `number` | `7 * 24 * 60 * 60 * 1000` | Max age of data in milliseconds |

### Advanced Configuration

```typescript
const telyx = new Telyx({
  endpoint: 'https://your-telemetry-endpoint.com',
  agentName: 'my-chatbot',
  environment: 'production',
  sampleRate: 0.1, // Sample 10% of events for production
  maxBatchSize: 500, // Larger batch for high-volume systems
  flushInterval: 1000, // Flush every second
  enableConsole: false, // Disable console logging in production
  maxAnalyticsRetention: 50000, // Retain more analytics data
  maxHistoryAgeMs: 24 * 60 * 60 * 1000, // Keep 1 day of history
});
```

## Error Handling

Telyx automatically handles errors and provides comprehensive error tracking:

```typescript
// Automatic error tracking
telyx.recordError('processMessage', error, {
  userId: '123',
  message: 'hello',
  context: additionalData
});

// The analytics class provides error analysis
const errorAnalysis = analytics.getErrorAnalysis();
console.log(errorAnalysis.totalErrors); // Total error count
console.log(errorAnalysis.errorByMethod); // Errors by method
console.log(errorAnalysis.recentErrors); // Recent error details
```

## Performance Optimization

### Sampling for High-Volume Systems

```typescript
// Use sampling to reduce overhead in production
const telyx = new Telyx({
  agentName: 'high-volume-bot',
  environment: 'production',
  sampleRate: 0.01, // Only track 1% of events
  maxBatchSize: 1000,
  flushInterval: 2000,
});
```

### Batch Processing

```typescript
// Manual batching for performance-critical sections
const events = [
  telyx.recordEvent('batch_start', { size: 100 }),
  // ... many events
  telyx.recordEvent('batch_end', { success: true })
];

// Flush manually for immediate sending
await telyx.flush();
```

## Advanced Analytics

### Anomaly Detection

```typescript
const anomalies = analytics.detectAnomalies();
if (anomalies.highErrorRateMethods.length > 0) {
  console.warn('High error rates detected:', anomalies.highErrorRateMethods);
}
if (anomalies.slowResponseMethods.length > 0) {
  console.warn('Slow methods detected:', anomalies.slowResponseMethods);
}
```

### Time Series Analysis

```typescript
// Get hourly/daily/weekly trends
const hourlyData = analytics.getTimeSeriesData('1h');
const dailyData = analytics.getTimeSeriesData('24h');
const weeklyData = analytics.getTimeSeriesData('7d');

// Example usage for monitoring
const lastHour = hourlyData.requestsPerHour.slice(-1)[0];
console.log(`Requests in last hour: ${lastHour.count}`);
```

### Markdown Reports

Generate markdown reports for dashboards and PR comments:

```typescript
const report = analytics.toMarkdown();
console.log(report);
// Output:
// # Telyx Telemetry Report
// - **Total Events:** 1250
// - **Errors:** 15
// - **Success Rate:** 98.8%
// - **Avg Response Time:** 145ms

// Anomalies section if any problems detected
// ## ⚠️ Anomalies Detected
// ### High Error Rate Methods
// | Method | Error Rate | Threshold |
// |--------|------------|-----------|
// | processQuery | 8.5% | 5.0% |
```

## Monitoring and Alerting

Set up monitoring based on telemetry data:

```typescript
// Check system health every minute
setInterval(() => {
  const health = analytics.getSystemHealth();
  
  if (health.errorRate > 0.05) {
    // Trigger alert for high error rate
    alert(`High error rate: ${(health.errorRate * 100).toFixed(1)}%`);
  }
  
  if (health.averageResponseTime > 2000) {
    // Trigger alert for slow responses
    alert(`Slow response time: ${health.averageResponseTime.toFixed(0)}ms`);
  }
}, 60000);
```

## License

MIT
