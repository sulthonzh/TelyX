import React, { useState, useEffect, useCallback } from "react";

interface MetricsPanelProps {
  apiBase: string;
}

interface MetricData {
  totalRequests: number;
  paths: { path: string; count: number; avgDuration: number }[];
}

const MetricsPanel: React.FC<MetricsPanelProps> = ({ apiBase }) => {
  const [metrics, setMetrics] = useState<string>("");
  const [parsed, setParsed] = useState<MetricData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/metrics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setMetrics(text);

      // Parse prometheus metrics
      const lines = text.split("\n");
      const pathCounts: Record<string, number> = {};
      const pathSum: Record<string, number> = {};
      const pathCount2: Record<string, number> = {};
      let total = 0;

      for (const line of lines) {
        if (line.startsWith("http_requests_total{")) {
          const match = line.match(
            /http_requests_total\{path="([^"]+)"\}\s+(\d+)/
          );
          if (match) {
            pathCounts[match[1]] = parseInt(match[2]);
            total += parseInt(match[2]);
          }
        }
        // Parse histogram _sum and _count to compute average duration
        if (line.startsWith("http_request_duration_seconds_sum{")) {
          const match = line.match(
            /http_request_duration_seconds_sum\{path="([^"]+)"\}\s+([\d.eE+-]+)/
          );
          if (match) {
            pathSum[match[1]] = parseFloat(match[2]);
          }
        }
        if (line.startsWith("http_request_duration_seconds_count{")) {
          const match = line.match(
            /http_request_duration_seconds_count\{path="([^"]+)"\}\s+(\d+)/
          );
          if (match) {
            pathCount2[match[1]] = parseInt(match[2]);
          }
        }
      }

      const paths = Object.entries(pathCounts).map(([path, count]) => ({
        path,
        count,
        avgDuration:
          pathCount2[path] > 0 && pathSum[path] !== undefined
            ? (pathSum[path] / pathCount2[path]) * 1000 // convert seconds → ms
            : 0,
      }));

      setParsed({ totalRequests: total, paths });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch metrics"
      );
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const maxCount = parsed
    ? Math.max(...parsed.paths.map((p) => p.count), 1)
    : 1;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Metrics</h2>
        <button className="btn btn-primary" onClick={fetchMetrics}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      {loading && !parsed ? (
        <div className="empty-state">
          <p>Loading metrics...</p>
        </div>
      ) : parsed ? (
        <>
          <div className="metric-cards">
            <div className="metric-card">
              <div className="metric-value">{parsed.totalRequests}</div>
              <div className="metric-label">Total Requests</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{parsed.paths.length}</div>
              <div className="metric-label">Active Endpoints</div>
            </div>
          </div>

          <h3>Requests by Endpoint</h3>
          <div className="bar-chart">
            {parsed.paths.map((p) => (
              <div key={p.path} className="bar-row">
                <div className="bar-label">{p.path}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(p.count / maxCount) * 100}%`,
                    }}
                  />
                </div>
                <div className="bar-value">{p.count}</div>
              </div>
            ))}
          </div>

          <details className="raw-metrics">
            <summary>Raw Prometheus Output</summary>
            <pre>{metrics}</pre>
          </details>
        </>
      ) : (
        <div className="empty-state">
          <p>No metrics available yet.</p>
        </div>
      )}
    </div>
  );
};

export default MetricsPanel;
