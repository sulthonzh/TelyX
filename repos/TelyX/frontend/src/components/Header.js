"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importDefault(require("react"));
const Header = ({ health }) => {
    const statusColor = health?.status === "healthy"
        ? "#22c55e"
        : health?.status === "error"
            ? "#ef4444"
            : "#f59e0b";
    return ((0, jsx_runtime_1.jsxs)("header", { className: "header", children: [(0, jsx_runtime_1.jsxs)("div", { className: "header-left", children: [(0, jsx_runtime_1.jsxs)("h1", { className: "logo", children: [(0, jsx_runtime_1.jsx)("span", { className: "logo-icon", children: "\u25C8" }), " TelyX"] }), (0, jsx_runtime_1.jsx)("span", { className: "tagline", children: "Observability Suite" })] }), (0, jsx_runtime_1.jsx)("div", { className: "header-right", children: (0, jsx_runtime_1.jsxs)("div", { className: "health-badge", style: { borderColor: statusColor }, children: [(0, jsx_runtime_1.jsx)("span", { className: "health-dot", style: { backgroundColor: statusColor } }), (0, jsx_runtime_1.jsx)("span", { className: "health-text", children: health?.status === "healthy"
                                ? "All Systems Go"
                                : health?.status === "error"
                                    ? "Backend Down"
                                    : "Checking..." })] }) })] }));
};
exports.default = Header;
//# sourceMappingURL=Header.js.map