
# TelyX Production Deployment Guide

This guide covers deploying TelyX to production with enterprise-grade security, reliability, and performance.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Security](#security)
- [Performance](#performance)
- [Reliability](#reliability)
- [Monitoring & Alerting](#monitoring--alerting)
- [Deployment](#deployment)
- [Scaling](#scaling)
- [Disaster Recovery](#disaster-recovery)

---

## Architecture Overview

### Component Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Load Balancer                           │
│                    (AWS ALB / NGINX / HAProxy)                  │
└──────────────────────────┬─────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼─────┐     ┌────▼─────┐     ┌────▼─────┐
    │ Backend  │     │ Backend  │     │ Backend  │
    │ Instance │     │ Instance │     │ Instance │
    │   (Pod)  │     │   (Pod)  │     │   (Pod)  │
    └────┬─────┘     └────┬─────┘     └────┬─────┘
         │                │                 │
         └─────────────────┼─────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼─────────┐  ┌───▼────────┐  ┌────▼────────┐
    │  OpenSearch  │  │ Prometheus │  │     OTEL    │
    │   Cluster    │  │  + Grafana │  │  Collector  │
    └──────────────┘  └────────────┘  └─────────────┘
```

### Security Layers

1. **Network Security**: VPC, Security Groups, Network Policies
2. **Transport Security**: TLS 1.3, Certificate Management
3. **Application Security**: Authentication, Authorization, Rate Limiting
4. **Data Security**: Encryption at rest and in transit
5. **Runtime Security**: Container scanning, Seccomp profiles

---

## Security

### 1. Authentication & Authorization

#### API Key Management

```bash
# Generate admin API key
curl -X POST http://localhost:8080/api/auth/generate-key \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-admin",
    "roles": ["admin"],
    "rate_limit": 10000,
    "expires_in": "8760h"
  }'
```

#### JWT Configuration

```bash
# Set secure JWT secret (minimum 32 characters)
export JWT_SECRET=$(openssl rand -base64 32)

# Store in secrets manager (AWS Secrets Manager, Vault, etc.)
aws secretsmanager create-secret \
  --name telyx/jwt-secret \
  --secret-string "$JWT_SECRET"
```

### 2. TLS/SSL Configuration

```yaml
# docker-compose.production.yml
services:
  backend:
    environment:
      - TLS_ENABLED=true
      - TLS_CERT_FILE=/certs/tls.crt
      - TLS_KEY_FILE=/certs/tls.key
    volumes:
      - ./certs:/certs:ro
```

### 3. Secrets Management

**Never commit secrets to Git!**

Use environment-specific secret management:

```bash
# Development
cp .env.example .env.local

# Production
# Use AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets
```

### 4. Network Security

```yaml
# Kubernetes Network Policy
apiVersion: networking.k8.io/v1
kind: NetworkPolicy
metadata:
  name: telyx-backend-policy
spec:
  podSelector:
    matchLabels:
      app: telyx-backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: opensearch
    ports:
    - protocol: TCP
      port: 9200
```

### 5. Rate Limiting

Production rate limits (per minute):
- Unauthenticated users: 10 requests
- Authenticated users: 100 requests
- Admin users: 1000 requests

Configure via:
```bash
export DEFAULT_RATE_LIMIT=100
export BURST_SIZE=200
```

### 6. Input Validation

All inputs are validated for:
- SQL injection attempts
- XSS attacks
- Path traversal
- Command injection
- Size limits (1MB per log, 10MB per batch)

### 7. Security Headers

Automatic security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`
- `Content-Security-Policy: default-src 'self'`

---

## Performance

### 1. Optimization Strategies

#### Backend Optimizations

```go
// Connection pooling
httpClient := &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxConnsPerHost:     100,
        MaxIdleConnsPerHost: 100,
        IdleConnTimeout:     90 * time.Second,
    },
}
```

#### Database Optimization

```json
// OpenSearch index settings
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 2,
    "refresh_interval": "5s",
    "index.codec": "best_compression"
  },
  "mappings": {
    "properties": {
      "timestamp": { "type": "date" },
      "level": { "type": "keyword" },
      "message": { "type": "text" }
    }
  }
}
```

### 2. Caching Strategy

```bash
# Enable Redis for caching (optional)
export REDIS_ENABLED=true
export REDIS_URL=redis://redis:6379
export CACHE_TTL=300  # 5 minutes
```

### 3. Compression

```bash
# Enable gzip compression
export ENABLE_COMPRESSION=true
export COMPRESSION_LEVEL=6
```

### 4. Performance Targets

- **API Latency**: P95 < 500ms, P99 < 1000ms
- **Throughput**: 10,000+ requests/second
- **Log Ingestion**: 100,000+ logs/second
- **Query Response**: < 2 seconds for 1M records

---

## Reliability

### 1. Circuit Breakers

Configured automatically:
- Max failures: 5
- Reset timeout: 30 seconds
- Half-open state: 3 test requests

### 2. Retry Logic

```go
// Exponential backoff
retry := resilience.NewRetry(
    3,                      // max attempts
    100*time.Millisecond,   // initial delay
    5*time.Second,          // max delay
    2.0,                    // multiplier
)
```

### 3. Bulkhead Pattern

```bash
# Max concurrent requests
export MAX_CONCURRENT_REQUESTS=100
```

### 4. Health Checks

```bash
# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10

# Readiness probe
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 5. Graceful Shutdown

```bash
# Shutdown timeout
export SHUTDOWN_TIMEOUT=30  # seconds
```

---

## Monitoring & Alerting

### 1. Service Level Objectives (SLOs)

| SLO | Target | Window |
|-----|--------|--------|
| API Availability | 99.9% | 24 hours |
| API Latency (P95) | < 500ms | 1 hour |
| Log Ingestion Success | 99.95% | 24 hours |
| Query Success Rate | 99.9% | 24 hours |

### 2. Prometheus Metrics

Key metrics exposed:
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency histogram
- `http_request_size_bytes` - Request size histogram
- `http_response_size_bytes` - Response size histogram

### 3. Alerting Rules

```yaml
# prometheus-alerts.yml
groups:
  - name: telyx-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"

      - alert: LowAvailability
        expr: up{job="telyx-backend"} < 0.99
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Low availability detected"
```

### 4. Log Aggregation

```yaml
# FluentBit configuration for centralized logging
[OUTPUT]
    Name opensearch
    Match *
    Host opensearch
    Port 9200
    Index telyx-logs
    Type _doc
    Retry_Limit 5
```

### 5. Distributed Tracing

```bash
# Configure Jaeger for trace visualization
export JAEGER_ENABLED=true
export JAEGER_ENDPOINT=http://jaeger:14268/api/traces
```

---

## Deployment

### 1. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telyx-backend
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: telyx-backend
  template:
    metadata:
      labels:
        app: telyx-backend
        version: v1.0.0
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
      containers:
      - name: backend
        image: telyx/backend:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 8080
          protocol: TCP
        env:
        - name: SERVER_PORT
          value: "8080"
        - name: OPENSEARCH_URL
          value: "http://opensearch:9200/logs/_doc"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: telyx-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
```

### 2. Docker Compose (Production)

```bash
docker-compose -f docker/docker-compose.production.yml up -d
```

### 3. AWS ECS/Fargate

```json
{
  "family": "telyx-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "backend",
    "image": "telyx/backend:1.0.0",
    "portMappings": [{
      "containerPort": 8080,
      "protocol": "tcp"
    }],
    "environment": [],
    "secrets": [{
      "name": "JWT_SECRET",
      "valueFrom": "arn:aws:secretsmanager:region:account:secret:telyx/jwt-secret"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/telyx-backend",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

---

## Scaling

### 1. Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: telyx-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: telyx-backend
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 2. Database Scaling

```bash
# OpenSearch cluster scaling
export OPENSEARCH_NODES=3
export OPENSEARCH_MASTER_NODES=3
export OPENSEARCH_DATA_NODES=5
```

### 3. Load Testing

```bash
# Run k6 load test
k6 run --vus 100 --duration 10m tests/load/k6-load-test.js
```

---

## Disaster Recovery

### 1. Backup Strategy

```bash
# Automated OpenSearch snapshots
curl -X PUT "opensearch:9200/_snapshot/telyx_backup" -H 'Content-Type: application/json' -d'
{
  "type": "s3",
  "settings": {
    "bucket": "telyx-backups",
    "region": "us-east-1",
    "base_path": "opensearch-snapshots"
  }
}'

# Daily snapshot
curl -X PUT "opensearch:9200/_snapshot/telyx_backup/snapshot_$(date +%Y%m%d)" -H 'Content-Type: application/json' -d'
{
  "indices": "logs-*",
  "ignore_unavailable": true,
  "include_global_state": false
}'
```

### 2. Recovery Procedures

```bash
# Restore from snapshot
curl -X POST "opensearch:9200/_snapshot/telyx_backup/snapshot_20250117/_restore"
```

### 3. High Availability

- Multi-AZ deployment
- Database replication (3+ replicas)
- Automated failover
- Regular disaster recovery drills

---

## Production Checklist

- [ ] TLS/SSL certificates configured
- [ ] Secrets managed securely (not in code)
- [ ] Rate limiting configured
- [ ] Monitoring and alerting set up
- [ ] Backups automated
- [ ] Load testing completed
- [ ] Security scanning passed
- [ ] Documentation updated
- [ ] Runbooks created
- [ ] On-call rotation established

---

## Support

For production support:
- Documentation: https://docs.telyx.io
- Issues: https://github.com/sulthonzh/TelyX/issues
- Security: security@telyx.io

---

**Last Updated**: 2025-11-17
**Version**: 1.0.0
