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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
require("./App.css");
const LogPanel_1 = __importDefault(require("./components/LogPanel"));
const MetricsPanel_1 = __importDefault(require("./components/MetricsPanel"));
const TracePanel_1 = __importDefault(require("./components/TracePanel"));
const Header_1 = __importDefault(require("./components/Header"));
const API_BASE = process.env.REACT_APP_API_URL || "";
function App() {
    const [activeTab, setActiveTab] = (0, react_1.useState)("logs");
    const [health, setHealth] = (0, react_1.useState)(null);
    const checkHealth = (0, react_1.useCallback)(async () => {
        try {
            const res = await fetch(`${API_BASE}/health`);
            const data = await res.json();
            setHealth(data);
        }
        catch {
            setHealth({ status: "error", message: "Backend unreachable", time: "" });
        }
    }, []);
    (0, react_1.useEffect)(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 30000);
        return () => clearInterval(interval);
    }, [checkHealth]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "app", children: [(0, jsx_runtime_1.jsx)(Header_1.default, { health: health }), (0, jsx_runtime_1.jsx)("nav", { className: "tabs", children: ["logs", "metrics", "traces"].map((tab) => ((0, jsx_runtime_1.jsxs)("button", { className: `tab-btn ${activeTab === tab ? "active" : ""}`, onClick: () => setActiveTab(tab), children: [tab === "logs" && "📋 ", tab === "metrics" && "📊 ", tab === "traces" && "🔍 ", tab.charAt(0).toUpperCase() + tab.slice(1)] }, tab))) }), (0, jsx_runtime_1.jsxs)("main", { className: "content", children: [activeTab === "logs" && (0, jsx_runtime_1.jsx)(LogPanel_1.default, { apiBase: API_BASE }), activeTab === "metrics" && (0, jsx_runtime_1.jsx)(MetricsPanel_1.default, { apiBase: API_BASE }), activeTab === "traces" && (0, jsx_runtime_1.jsx)(TracePanel_1.default, {})] })] }));
}
exports.default = App;
//# sourceMappingURL=App.js.map