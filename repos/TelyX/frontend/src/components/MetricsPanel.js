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
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const MetricsPanel = ({ apiBase }) => {
    const [metrics, setMetrics] = (0, react_1.useState)("");
    const [parsed, setParsed] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)("");
    const fetchMetrics = (0, react_1.useCallback)(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${apiBase}/metrics`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            setMetrics(text);
            // Parse prometheus metrics
            const lines = text.split("\n");
            const pathCounts = {};
            const pathDurations = {};
            let total = 0;
            for (const line of lines) {
                if (line.startsWith("http_requests_total{")) {
                    const match = line.match(/http_requests_total\{path="([^"]+)"\}\s+(\d+)/);
                    if (match) {
                        pathCounts[match[1]] = parseInt(match[2]);
                        total += parseInt(match[2]);
                    }
                }
                if (line.startsWith("http_request_duration_seconds_bucket{")) {
                    const match = line.match(/http_request_duration_seconds_bucket\{path="([^"]+)",le="([^"]+)"\}\s+(\d+)/);
                    if (match) {
                        if (!pathDurations[match[1]])
                            pathDurations[match[1]] = [];
                    }
                }
            }
            const paths = Object.entries(pathCounts).map(([path, count]) => ({
                path,
                count,
                avgDuration: 0,
            }));
            setParsed({ totalRequests: total, paths });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch metrics");
        }
        finally {
            setLoading(false);
        }
    }, [apiBase]);
    (0, react_1.useEffect)(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 15000);
        return () => clearInterval(interval);
    }, [fetchMetrics]);
    const maxCount = parsed
        ? Math.max(...parsed.paths.map((p) => p.count), 1)
        : 1;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "panel-header", children: [(0, jsx_runtime_1.jsx)("h2", { children: "Metrics" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: fetchMetrics, children: "Refresh" })] }), error && (0, jsx_runtime_1.jsxs)("div", { className: "error-banner", children: ["\u26A0 ", error] }), loading && !parsed ? ((0, jsx_runtime_1.jsx)("div", { className: "empty-state", children: (0, jsx_runtime_1.jsx)("p", { children: "Loading metrics..." }) })) : parsed ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "metric-cards", children: [(0, jsx_runtime_1.jsxs)("div", { className: "metric-card", children: [(0, jsx_runtime_1.jsx)("div", { className: "metric-value", children: parsed.totalRequests }), (0, jsx_runtime_1.jsx)("div", { className: "metric-label", children: "Total Requests" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "metric-card", children: [(0, jsx_runtime_1.jsx)("div", { className: "metric-value", children: parsed.paths.length }), (0, jsx_runtime_1.jsx)("div", { className: "metric-label", children: "Active Endpoints" })] })] }), (0, jsx_runtime_1.jsx)("h3", { children: "Requests by Endpoint" }), (0, jsx_runtime_1.jsx)("div", { className: "bar-chart", children: parsed.paths.map((p) => ((0, jsx_runtime_1.jsxs)("div", { className: "bar-row", children: [(0, jsx_runtime_1.jsx)("div", { className: "bar-label", children: p.path }), (0, jsx_runtime_1.jsx)("div", { className: "bar-track", children: (0, jsx_runtime_1.jsx)("div", { className: "bar-fill", style: {
                                            width: `${(p.count / maxCount) * 100}%`,
                                        } }) }), (0, jsx_runtime_1.jsx)("div", { className: "bar-value", children: p.count })] }, p.path))) }), (0, jsx_runtime_1.jsxs)("details", { className: "raw-metrics", children: [(0, jsx_runtime_1.jsx)("summary", { children: "Raw Prometheus Output" }), (0, jsx_runtime_1.jsx)("pre", { children: metrics })] })] })) : ((0, jsx_runtime_1.jsx)("div", { className: "empty-state", children: (0, jsx_runtime_1.jsx)("p", { children: "No metrics available yet." }) }))] }));
};
exports.default = MetricsPanel;
//# sourceMappingURL=MetricsPanel.js.map