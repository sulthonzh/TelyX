"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const LogPanel = ({ apiBase }) => {
    const [logs, setLogs] = (0, react_1.useState)([]);
    const [total, setTotal] = (0, react_1.useState)(0);
    const [search, setSearch] = (0, react_1.useState)("");
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)("");
    const fetchLogs = (0, react_1.useCallback)(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (search)
                params.set("q", search);
            params.set("limit", "50");
            const res = await fetch(`${apiBase}/logs/search?${params}`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setLogs(data.logs || []);
            setTotal(data.total || 0);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch logs");
            // If backend is down, show empty state
            if (!logs.length)
                setLogs([]);
        }
        finally {
            setLoading(false);
        }
    }, [apiBase, search, logs.length]);
    (0, react_1.useEffect)(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 10000);
        return () => clearInterval(interval);
    }, [fetchLogs]);
    const getLevelColor = (level) => {
        if (!level)
            return "#94a3b8";
        const l = level.toLowerCase();
        if (l === "error" || l === "fatal")
            return "#ef4444";
        if (l === "warn" || l === "warning")
            return "#f59e0b";
        if (l === "info")
            return "#3b82f6";
        if (l === "debug")
            return "#8b5cf6";
        return "#94a3b8";
    };
    return (<div className="panel">
      <div className="panel-header">
        <h2>Logs</h2>
        <div className="log-controls">
          <input type="text" className="search-input" placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchLogs()}/>
          <button className="btn btn-primary" onClick={fetchLogs}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      <div className="log-stats">
        <span>{total} total logs</span>
      </div>

      {loading && logs.length === 0 ? (<div className="empty-state">
          <p>Loading logs...</p>
        </div>) : logs.length === 0 ? (<div className="empty-state">
          <p>No logs yet. Send logs to <code>POST /logs</code> to get started.</p>
          <pre className="code-hint">
            {`curl -X POST http://localhost:8080/logs \\
  -H "Content-Type: application/json" \\
  -d '{"level":"info","message":"Hello TelyX!","service":"my-app"}'`}
          </pre>
        </div>) : (<div className="log-list">
          {logs.map((log, i) => (<div key={i} className="log-entry">
              {log.level && (<span className="log-level" style={{ color: getLevelColor(log.level) }}>
                  [{log.level}]
                </span>)}
              {log.timestamp && (<span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>)}
              <span className="log-message">
                {log.message || JSON.stringify(log)}
              </span>
              {log.service && (<span className="log-service">{log.service}</span>)}
            </div>))}
        </div>)}
    </div>);
};
exports.default = LogPanel;
//# sourceMappingURL=LogPanel.js.map