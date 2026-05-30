import React, { useState, useEffect, useCallback } from "react";

interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  service?: string;
  [key: string]: unknown;
}

interface LogPanelProps {
  apiBase: string;
}

const LogPanel: React.FC<LogPanelProps> = ({ apiBase }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("limit", "50");

      const res = await fetch(`${apiBase}/logs/search?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
      // If backend is down, show empty state
      if (!logs.length) setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, search, logs.length]);

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const onVis = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [fetchLogs, isVisible]);

  const getLevelColor = (level?: string) => {
    if (!level) return "#94a3b8";
    const l = level.toLowerCase();
    if (l === "error" || l === "fatal") return "#ef4444";
    if (l === "warn" || l === "warning") return "#f59e0b";
    if (l === "info") return "#3b82f6";
    if (l === "debug") return "#8b5cf6";
    return "#94a3b8";
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Logs</h2>
        <div className="log-controls">
          <input
            type="text"
            className="search-input"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
          />
          <button className="btn btn-primary" onClick={fetchLogs}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      <div className="log-stats">
        <span>{total} total logs</span>
      </div>

      {loading && logs.length === 0 ? (
        <div className="empty-state">
          <p>Loading logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <p>No logs yet. Send logs to <code>POST /logs</code> to get started.</p>
          <pre className="code-hint">
{`curl -X POST http://localhost:8080/logs \\
  -H "Content-Type: application/json" \\
  -d '{"level":"info","message":"Hello TelyX!","service":"my-app"}'`}
          </pre>
        </div>
      ) : (
        <div className="log-list">
          {logs.map((log, i) => (
            <div key={i} className="log-entry">
              {log.level && (
                <span
                  className="log-level"
                  style={{ color: getLevelColor(log.level as string) }}
                >
                  [{log.level}]
                </span>
              )}
              {log.timestamp && (
                <span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              )}
              <span className="log-message">
                {(log.message as string) || JSON.stringify(log)}
              </span>
              {log.service && (
                <span className="log-service">{log.service as string}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LogPanel;
