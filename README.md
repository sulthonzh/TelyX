<<<<<<< HEAD
# TelyX

Lightweight observability suite for small teams who want logs, metrics, and traces without the enterprise price tag.

## What it does

TelyX gives you a single dashboard to monitor your applications:

- **Logs** — ingest, search, and browse logs through OpenSearch
- **Metrics** — Prometheus-compatible metrics with a built-in dashboard
- **Traces** — OpenTelemetry tracing ready to plug into Jaeger/Zipkin

Everything runs in Docker. No complex setup, no vendor lock-in.

## Quick Start

```bash
git clone https://github.com/sulthonzh/TelyX.git
cd TelyX
docker compose -f docker/docker-compose.yml up -d
```

Open http://localhost:3000 for the dashboard.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   Frontend   │────▶│    Backend    │────▶│  OpenSearch    │
│  (React)     │     │   (Go)       │     │  + Dashboards  │
└─────────────┘     └──────┬───────┘     └────────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
              ┌─────▼─────┐ ┌────▼────────┐
              │ Prometheus │ │ OTel        │
              │            │ │ Collector   │
              └────────────┘ └─────────────┘
```

### Stack

| Component | Tech | Port |
|-----------|------|------|
| Dashboard | React | 3000 |
| API Server | Go | 8080 |
| Log Storage | OpenSearch | 9200 |
| Log Viewer | OpenSearch Dashboards | 5601 |
| Metrics | Prometheus | 9090 |
| Tracing | OpenTelemetry Collector | 4317 |

## Sending Logs

```bash
# Simple log
curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{"level":"info","message":"Server started","service":"my-app"}'

# With extra fields
curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "error",
    "message": "Database connection failed",
    "service": "api-gateway",
    "error_code": "DB_CONN_TIMEOUT",
    "retry_count": 3
  }'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/logs` | Ingest a log entry |
| `GET` | `/logs/search?q=&limit=50` | Search logs |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/health` | Health check |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | `""` | Backend URL for frontend (empty = same origin) |

### Adding Jaeger for Traces

Add to `docker/docker-compose.yml`:

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"  # Jaeger UI
    - "14250:14250"  # gRPC
  networks:
    - telyx-net
```

Then update the OTel Collector config to export to Jaeger.

## Development

### Backend

```bash
cd backend
go run main.go
```

### Frontend

```bash
cd frontend
npm install
npm start
```

## Why TelyX?

Most observability tools are either too simple (just log tailing) or too complex (full ELK stack with 20 services). TelyX sits in the middle — enough power to be useful, simple enough to run on a single machine.

Built for:
- Small teams that outgrew `kubectl logs`
- Side projects that need real monitoring
- Learning how observability works under the hood

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
=======
# Telyx - Telemetry System for Agent X

A lightweight, real-time telemetry system for AI agents and intelligent workflows. Track performance, monitor interactions, and gain insights into your agent's behavior.

## 🚀 Features

- **Real-time Performance Monitoring**: Track response times, success rates, and resource usage
- **Interaction Logging**: Capture agent-user interactions with structured metadata
- **Performance Analytics**: Built-in analytics for identifying bottlenecks and optimization opportunities
- **Lightweight & Fast**: Minimal overhead with efficient data collection
- **Flexible Export**: Multiple output formats (JSON, CSV, database)
- **Agent-Agnostic**: Works with any AI agent framework (OpenAI, Anthropic, custom, etc.)

## 🎯 Use Cases

- **Production Monitoring**: Track your agent's performance in production
- **Development Debugging**: Understand agent behavior during development
- **Performance Optimization**: Identify slow operations and bottlenecks
- **Usage Analytics**: Analyze how users interact with your agent
- **Cost Monitoring**: Track API usage and costs associated with agent operations

## 📦 Installation

```bash
npm install telyx
```

or

```bash
yarn add telyx
```

## 🚀 Quick Start

```typescript
import { Telyx } from 'telyx';

// Initialize telemetry
const telyx = new Telyx({
  endpoint: 'https://your-telemetry-endpoint.com',
  agentName: 'my-chatbot',
  environment: 'production'
});

// Wrap your agent with telemetry
const enhancedAgent = telyx.track(agent);

// Use your agent as normal
const response = await enhancedAgent.sendMessage("Hello world!");
```

## 📊 API Reference

### Configuration

```typescript
interface TelyxConfig {
  endpoint?: string;           // Telemetry endpoint
  agentName: string;          // Name of your agent
  environment: string;       // Environment name (development, production, etc.)
  sampleRate?: number;       // Sampling rate (0-1)
  maxBatchSize?: number;     // Maximum batch size for sending data
  flushInterval?: number;     // Interval for flushing data (ms)
  enableConsole?: boolean;    // Enable console output for debugging
}
```

### Tracking Methods

```typescript
// Track a method call
telyx.trackMethod('sendMessage', async (input, next) => {
  const start = Date.now();
  try {
    const result = await next(input);
    telyx.recordSuccess('sendMessage', Date.now() - start, { input: input.substring(0, 100) });
    return result;
  } catch (error) {
    telyx.recordError('sendMessage', error, { input: input.substring(0, 100) });
    throw error;
  }
});

// Track custom events
telyx.recordEvent('user_login', { userId: '123' });
telyx.recordEvent('api_call', { provider: 'openai', model: 'gpt-4' });

// Record metrics
telyx.recordMetric('response_time', 120);
telyx.recordMetric('tokens_used', 500);
```

## 📈 Data Formats

### Event Structure

```json
{
  "timestamp": "2026-06-06T21:47:00Z",
  "agent": "my-chatbot",
  "environment": "production",
  "event": "method_call",
  "method": "sendMessage",
  "duration": 1200,
  "success": true,
  "metadata": {
    "input_length": 50,
    "model": "gpt-4",
    "tokens_used": 150
  }
}
```

## 🔧 Configuration

### Environment Variables

- `TELYX_ENDPOINT`: Telemetry endpoint URL
- `TELYX_AGENT_NAME`: Name of your agent
- `TELYX_ENVIRONMENT`: Environment name
- `TELYX_SAMPLE_RATE`: Sampling rate (0-1)

### Advanced Configuration

```typescript
const telyx = new Telyx({
  endpoint: process.env.TELYX_ENDPOINT,
  agentName: process.env.TELYX_AGENT_NAME || 'default-agent',
  environment: process.env.TELYX_ENVIRONMENT || 'development',
  sampleRate: parseFloat(process.env.TELYX_SAMPLE_RATE) || 1.0,
  maxBatchSize: 100,
  flushInterval: 5000,
  enableConsole: process.env.NODE_ENV === 'development'
});
```

## 📊 Analytics Dashboard

Coming soon - web dashboard for visualizing telemetry data.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with inspiration from production telemetry systems in the AI/ML space.

---

**Telyx** - Making AI agents observable and production-ready.
>>>>>>> a683df1 (Initial commit: Telyx telemetry system for AI agents)
