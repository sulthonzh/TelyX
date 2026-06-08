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
import { Telyx } from 'telyx';

const telyx = new Telyx({
  endpoint: 'https://your-telemetry-endpoint.com',
  agentName: 'my-chatbot',
  environment: 'production',
});

// Record events
telyx.recordEvent('user_message', { userId: '123', message: 'hello' });

// Record metrics
telyx.recordMetric('response_time', 150);

// Track method calls with automatic timing
const tracked = telyx.trackMethod('processQuery', async (input, next) => {
  return next();
});
await tracked('user query');

// Clean up
await telyx.destroy();
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
```

## Middleware

### HTTP Request Tracking

```typescript
import { Telyx, TelyxMiddleware } from 'telyx';

const telyx = new Telyx({ agentName: 'api', environment: 'prod' });
const middleware = new TelyxMiddleware(telyx);

app.use(middleware.httpRequestMiddleware);
```

### AI API Call Tracking

```typescript
const tracker = middleware.aiCallMiddleware('openai', 'gpt-4', prompt);
try {
  const response = await openai.chat.completions.create(...);
  tracker.end(response);
} catch (err) {
  tracker.end(null, err);
}
```

### Database Query Tracking

```typescript
const tracker = middleware.databaseQueryMiddleware('SELECT * FROM users', { id: 1 });
const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);
tracker.end(result);
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

## License

MIT
