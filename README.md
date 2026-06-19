# TelyX

Lightweight telemetry for AI agents — zero dependencies, native `fetch`, plug-and-play observability for LLM-powered apps.

Track response times, token usage, error rates, and method-level performance without heavyweight infrastructure.

## Quick Start

```bash
npm install telyx
```

```javascript
const { Telyx } = require('telyx');

const telyx = new Telyx({
  endpoint: 'https://your-telemetry-server.com',
  agentName: 'support-bot',
  environment: 'production',
});

// Wrap any object — all method calls auto-tracked
const trackedAgent = telyx.track(myAIAgent);
const response = await trackedAgent.sendMessage('Hello!');
```

## Why TelyX?

Most observability tools (Datadog, New Relic, OpenTelemetry) are built for microservices, not AI agents. They require SDKs, agents, config files, and infrastructure. TelyX gives you the 80% that matters for AI workloads in a single zero-dependency package.

| Feature | TelyX | OpenTelemetry | Langfuse | Datadog |
|---------|-------|---------------|----------|---------|
| Zero dependencies | ✅ | ❌ (5+ packages) | ❌ | ❌ |
| AI-specific tracking | ✅ (tokens, providers) | ❌ (generic) | ✅ | ❌ |
| Setup time | <2 min | 30+ min | 10 min | 20 min |
| Cost | Free (self-hosted) | Free | Freemium | $$$ |
| Batch + flush | ✅ | ✅ | ✅ | ✅ |
| Proxy auto-tracking | ✅ | ❌ | ❌ | ❌ |
| Middleware (HTTP, DB, cache) | ✅ | ✅ | ❌ | ✅ |
| Retry queue | ✅ | ❌ | ❌ | ✅ |

## Core API

### `new Telyx(config)`

```javascript
const telyx = new Telyx({
  endpoint: 'https://telemetry.example.com',  // Your telemetry server
  agentName: 'my-chatbot',                     // Required
  environment: 'production',                   // Required
  sampleRate: 1.0,                             // 0-1, default 1.0
  maxBatchSize: 100,                           // Auto-flush threshold
  flushInterval: 5000,                         // Auto-flush ms
  enableConsole: false,                        // Debug logging
});
```

### Manual Recording

```javascript
// Custom events
telyx.recordEvent('user_signup', { plan: 'pro' });

// Metrics
telyx.recordMetric('tokens_used', 1500, { model: 'gpt-4' });

// Errors
telyx.recordError('query', new Error('Timeout'), { query: 'SELECT *' });
```

### `telyx.track(agent)` — Proxy Auto-Tracking

Wraps any object. All function calls are automatically timed, and success/error is recorded.

```javascript
const agent = { 
  generate: async (prompt) => callLLM(prompt),
  summarize: async (text) => callLLM(`Summarize: ${text}`),
};

const tracked = telyx.track(agent);
await tracked.generate('Write a haiku');  // Auto-recorded with timing
```

### `telyx.trackMethod(name, fn)` — Function Wrapping

```javascript
const trackedFn = telyx.trackMethod('fetchData', async (input, next) => {
  return await fetchFromDB(input);
});

const result = await trackedFn('query');
// Automatically records: method=fetchData, duration, success/error
```

## Middleware

Built-in middleware for common AI/infra patterns:

```javascript
const { TelyxMiddleware } = require('telyx');
const mw = new TelyxMiddleware(telyx);

// Express/Connect HTTP
app.use(mw.httpRequestMiddleware);

// Database queries (auto-sanitizes passwords/secrets)
const tracker = mw.databaseQueryMiddleware('SELECT * FROM users WHERE id=?', [123]);
tracker.end({ rowCount: 1 });

// AI API calls (auto-tracks token usage)
const aiTracker = mw.aiCallMiddleware('openai', 'gpt-4', prompt);
const response = await openai.chat.completions.create({ ... });
aiTracker.end(response);  // Records tokens, latency, provider
```

## Analytics

Process collected telemetry for dashboards and reports:

```javascript
const { TelyxAnalytics } = require('telyx');
const analytics = new TelyxAnalytics();

// Feed batch data
analytics.addEvents(telyx.getBatch().events);
analytics.addMetrics(telyx.getBatch().metrics);

// Get insights
const perf = analytics.getMethodPerformance('sendMessage');
// { averageDuration: 1200, successRate: 0.98, totalCalls: 1542, ... }

const health = analytics.getSystemHealth();
// { uptime: 3600000, successRate: 0.97, averageResponseTime: 850, ... }

const usage = analytics.getUsageMetrics();
// { totalTokens: 45000, providerUsage: { openai: 30, anthropic: 5 }, ... }
```

## Real-World Examples

### 1. Production Chatbot Monitoring

```javascript
const telyx = new Telyx({
  endpoint: process.env.TELYX_ENDPOINT,
  agentName: 'support-bot',
  environment: 'production',
  sampleRate: 0.1,  // 10% sampling for high volume
  maxBatchSize: 500,
});

// Wrap your AI agent
const trackedBot = telyx.track(chatBot);

// Every call auto-tracked: response time, success rate, errors
await trackedBot.respond(userMessage);

// Custom: track user satisfaction
telyx.recordEvent('user_feedback', { rating: 5, conversationId: '123' });
```

### 2. Multi-Provider Cost Tracking

```javascript
// Track costs across OpenAI, Anthropic, Google
const mw = new TelyxMiddleware(telyx);

async function callLLM(provider, model, prompt) {
  const tracker = mw.aiCallMiddleware(provider, model, prompt);
  try {
    const response = await providers[provider].complete(model, prompt);
    tracker.end(response);  // Records tokens + latency
    return response;
  } catch (err) {
    tracker.end(null, err);
    throw err;
  }
}

// Later: analyze costs
const usage = analytics.getUsageMetrics();
// { totalTokens: 150000, providerUsage: { openai: 800, anthropic: 200 }, ... }
```

### 3. Express API Observability

```javascript
const express = require('express');
const app = express();
const mw = new TelyxMiddleware(telyx);

// Auto-track all HTTP requests
app.use(mw.httpRequestMiddleware);

app.get('/chat', async (req, res) => {
  const dbTracker = mw.databaseQueryMiddleware('SELECT * FROM context WHERE session=?');
  const context = await db.query(req.query.session);
  dbTracker.end({ rowCount: context.length });
  
  const aiTracker = mw.aiCallMiddleware('openai', 'gpt-4', req.body.message);
  const reply = await openai.chat(req.body.message);
  aiTracker.end(reply);
  
  res.json({ reply });
});
```

## Features

- **Real-time Performance Monitoring** — Track response times, success rates, and resource usage
- **Interaction Logging** — Capture agent-user interactions with structured metadata
- **Performance Analytics** — Built-in analytics for identifying bottlenecks
- **Lightweight & Fast** — Minimal overhead with efficient data collection
- **Flexible Export** — Multiple output formats (JSON, CSV, database)
- **Agent-Agnostic** — Works with any AI agent framework
- **Middleware** — Built-in middleware for HTTP, database, cache, and AI API calls
- **Retry Queue** — Failed batches automatically retried with exponential backoff
- **Input Sanitization** — PII protection with automatic input truncation and object masking
- **Anomaly Detection** — Built-in statistical anomaly detection for response times and error rates

## License

MIT
