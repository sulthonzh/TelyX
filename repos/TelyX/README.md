# TelyX

Lightweight observability suite for small teams who want logs, metrics, and traces without the enterprise price tag.

## What it does

TelyX gives you a single dashboard to monitor your applications:

- **Logs** — ingest, search, and browse logs through OpenSearch
- **Metrics** — Prometheus-compatible metrics with a built-in dashboard
- **Traces** — OpenTelemetry tracing ready to plug into Jaeger/Zipkin

Everything runs in Docker. No complex setup, no vendor lock-in.

## Quick Start

### Production

```bash
git clone https://github.com/sulthonzh/TelyX.git
cd TelyX
docker compose -f docker/docker-compose.yml up -d
```

### Development

```bash
cd TelyX
docker compose -f docker/docker-compose.dev.yml up -d
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

**Improved Features:**
- ✅ Health checks for all services
- ✅ Service dependency management
- ✅ Environment-based configuration
- ✅ Enhanced security headers
- ✅ Proper error handling
- ✅ Persistent data volumes

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
| `OPENSEARCH_URL` | `http://localhost:9200` | OpenSearch endpoint |
| `PROMETHEUS_PORT` | `8080` | Prometheus metrics port |
| `REACT_APP_API_URL` | `http://localhost:8080` | Frontend API URL |

### Environment Setup

Copy the example environment file:

```bash
cp docker/.env.example .env
```

Edit `.env` with your configuration and restart services.

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
# Install dependencies
go mod tidy
# Run with hot reload
go run main.go
```

### Frontend

```bash
cd frontend
# Install dependencies
npm install
# Run development server
npm start
```

### Docker Development

```bash
# Start all services
# Uses docker-compose.dev.yml for development settings
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

## Why TelyX?

Most observability tools are either too simple (just log tailing) or too complex (full ELK stack with 20 services). TelyX sits in the middle — enough power to be useful, simple enough to run on a single machine.

**Built for:**
- Small teams that outgrew `kubectl logs`
- Side projects that need real monitoring
- Learning how observability works under the hood

**Recent Improvements:**
- 🔧 Enhanced error handling and validation
- 🛡️ Security improvements and headers
- 📊 Better metrics collection
- 🚫 Input sanitization for logs
- ⚡ Service health checks
- 📁 Persistent data volumes
- 🔧 Environment-based configuration

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
