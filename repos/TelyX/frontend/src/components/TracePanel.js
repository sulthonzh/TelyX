"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importDefault(require("react"));
const TracePanel = () => {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "panel", children: [(0, jsx_runtime_1.jsx)("div", { className: "panel-header", children: (0, jsx_runtime_1.jsx)("h2", { children: "Distributed Traces" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "empty-state", children: [(0, jsx_runtime_1.jsxs)("p", { children: ["Traces are collected via ", (0, jsx_runtime_1.jsx)("strong", { children: "OpenTelemetry" }), " and sent to the OTel Collector."] }), (0, jsx_runtime_1.jsx)("p", { children: "Connect a Jaeger or Zipkin backend to visualize traces." }), (0, jsx_runtime_1.jsxs)("div", { className: "trace-setup", children: [(0, jsx_runtime_1.jsx)("h3", { children: "Quick Setup with Jaeger" }), (0, jsx_runtime_1.jsxs)("p", { children: ["Add to your ", (0, jsx_runtime_1.jsx)("code", { children: "docker-compose.yml" }), ":"] }), (0, jsx_runtime_1.jsx)("pre", { className: "code-hint", children: `# Jaeger all-in-one for trace visualization
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"  # Jaeger UI
    - "14250:14250"  # gRPC for OTel Collector
  networks:
    - telyx-net` }), (0, jsx_runtime_1.jsxs)("p", { children: ["Then open", " ", (0, jsx_runtime_1.jsx)("a", { href: "http://localhost:16686", target: "_blank", rel: "noopener noreferrer", children: "http://localhost:16686" }), " ", "to explore traces."] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "trace-features", children: [(0, jsx_runtime_1.jsx)("h3", { children: "What gets traced" }), (0, jsx_runtime_1.jsxs)("ul", { children: [(0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "HTTP Handlers" }), " \u2014 every request to", " ", (0, jsx_runtime_1.jsx)("code", { children: "/logs" }), ", ", (0, jsx_runtime_1.jsx)("code", { children: "/health" })] }), (0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "OpenSearch calls" }), " \u2014 log ingestion and search queries"] }), (0, jsx_runtime_1.jsxs)("li", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Error spans" }), " \u2014 failed requests are tagged with error details"] })] })] })] })] }));
};
exports.default = TracePanel;
//# sourceMappingURL=TracePanel.js.map