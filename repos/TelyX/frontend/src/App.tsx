import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import LogPanel from "./components/LogPanel";
import MetricsPanel from "./components/MetricsPanel";
import TracePanel from "./components/TracePanel";
import Header from "./components/Header";

const API_BASE = process.env.REACT_APP_API_URL || "";

type Tab = "logs" | "metrics" | "traces";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [health, setHealth] = useState<{
    status: string;
    message: string;
    time: string;
  } | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: "error", message: "Backend unreachable", time: "" });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <div className="app">
      <Header health={health} />
      <nav className="tabs">
        {(["logs", "metrics", "traces"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "logs" && "📋 "}
            {tab === "metrics" && "📊 "}
            {tab === "traces" && "🔍 "}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      <main className="content">
        {activeTab === "logs" && <LogPanel apiBase={API_BASE} />}
        {activeTab === "metrics" && <MetricsPanel apiBase={API_BASE} />}
        {activeTab === "traces" && <TracePanel />}
      </main>
    </div>
  );
}

export default App;
