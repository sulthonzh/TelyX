import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const logIngestionDuration = new Trend('log_ingestion_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 50 },   // Ramp up to 50 users
    { duration: '10m', target: 100 }, // Stay at 100 users
    { duration: '5m', target: 200 },  // Peak at 200 users
    { duration: '5m', target: 100 },  // Ramp down to 100
    { duration: '2m', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% of requests under 500ms
    'http_req_failed': ['rate<0.05'],                  // Error rate below 5%
    'errors': ['rate<0.05'],
    'log_ingestion_duration': ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'tlx_test_key';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  // Test 1: Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response has status field': (r) => JSON.parse(r.body).status === 'healthy',
  }) || errorRate.add(1);

  sleep(1);

  // Test 2: Log ingestion
  const logData = {
    level: 'info',
    message: `Load test log message ${Date.now()}`,
    service: 'k6-load-test',
    user_id: `user-${__VU}`,
    iteration: __ITER,
  };

  const logStart = Date.now();
  const logRes = http.post(`${BASE_URL}/logs`, JSON.stringify(logData), params);
  logIngestionDuration.add(Date.now() - logStart);

  check(logRes, {
    'log ingestion status is 201': (r) => r.status === 201 || r.status === 200,
    'log response has status field': (r) => {
      try {
        return JSON.parse(r.body).status === 'success';
      } catch (e) {
        return false;
      }
    },
  }) || errorRate.add(1);

  sleep(1);

  // Test 3: Batch log ingestion
  if (__ITER % 10 === 0) {
    const batch = [];
    for (let i = 0; i < 10; i++) {
      batch.push({
        level: ['info', 'warn', 'error'][Math.floor(Math.random() * 3)],
        message: `Batch log ${i}`,
        service: 'k6-batch-test',
      });
    }

    const batchRes = http.post(`${BASE_URL}/api/logs/batch`, JSON.stringify(batch), params);
    check(batchRes, {
      'batch ingestion status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  }

  sleep(1);

  // Test 4: Query logs
  if (__ITER % 5 === 0) {
    const query = {
      query: '*',
      size: 10,
    };

    const queryRes = http.post(`${BASE_URL}/api/logs/query`, JSON.stringify(query), params);
    check(queryRes, {
      'query status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  }

  sleep(2);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '';
  summary += `${indent}Test Summary:\n`;
  summary += `${indent}  Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}  Duration: ${data.state.testRunDurationMs}ms\n`;
  summary += `${indent}  Requests/sec: ${data.metrics.http_reqs.values.rate.toFixed(2)}\n`;
  summary += `${indent}  Error Rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  summary += `${indent}  Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += `${indent}  P95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}  P99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;

  return summary;
}
