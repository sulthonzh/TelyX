import React, { useEffect } from "react";
import HealthCheck from "./components/HealthCheck";
import ErrorBoundary from "./components/ErrorBoundary";
import telemetry from "./services/telemetry";

function App() {
    useEffect(() => {
        // Track page view
        telemetry.trackPageView("Home");
        telemetry.logInfo("TelyX application started", {
            session_id: telemetry.getSessionId(),
        });
    }, []);

    return (
        <ErrorBoundary>
            <div style={styles.container}>
                <header style={styles.header}>
                    <h1 style={styles.title}>TelyX Observability Suite</h1>
                    <p style={styles.subtitle}>
                        Unified logs, metrics, and traces for modern applications
                    </p>
                </header>
                <main style={styles.main}>
                    <HealthCheck />
                    <div style={styles.infoCard}>
                        <h2>Features</h2>
                        <ul style={styles.featureList}>
                            <li>📊 Centralized log aggregation with OpenSearch</li>
                            <li>📈 Metrics collection with Prometheus</li>
                            <li>🔍 Distributed tracing with OpenTelemetry</li>
                            <li>📱 Real User Monitoring (RUM) with Web Vitals</li>
                            <li>⚡ Automatic error tracking</li>
                        </ul>
                    </div>
                    <div style={styles.infoCard}>
                        <h2>Quick Links</h2>
                        <ul style={styles.linkList}>
                            <li>
                                <a
                                    href="http://localhost:5601"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={styles.link}
                                >
                                    OpenSearch Dashboards
                                </a>
                            </li>
                            <li>
                                <a
                                    href="http://localhost:9090"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={styles.link}
                                >
                                    Prometheus
                                </a>
                            </li>
                            <li>
                                <a
                                    href="/metrics"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={styles.link}
                                >
                                    Metrics Endpoint
                                </a>
                            </li>
                        </ul>
                    </div>
                </main>
                <footer style={styles.footer}>
                    <p>Session ID: {telemetry.getSessionId()}</p>
                </footer>
            </div>
        </ErrorBoundary>
    );
}

const styles = {
    container: {
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    },
    header: {
        backgroundColor: "#1976d2",
        color: "white",
        padding: "40px 20px",
        textAlign: "center" as const,
    },
    title: {
        margin: "0 0 8px 0",
        fontSize: "36px",
        fontWeight: 600,
    },
    subtitle: {
        margin: 0,
        fontSize: "16px",
        opacity: 0.9,
    },
    main: {
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 20px",
    },
    infoCard: {
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    },
    featureList: {
        lineHeight: 2,
        fontSize: "16px",
    },
    linkList: {
        listStyle: "none",
        padding: 0,
        lineHeight: 2,
    },
    link: {
        color: "#1976d2",
        textDecoration: "none",
        fontSize: "16px",
    },
    footer: {
        textAlign: "center" as const,
        padding: "20px",
        color: "#666",
        fontSize: "12px",
    },
};

export default App;
