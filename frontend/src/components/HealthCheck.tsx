import React, { useState, useEffect } from "react";
import telemetry from "../services/telemetry";

interface HealthStatus {
    status: string;
    service: string;
    message: string;
    timestamp: string;
    version: string;
}

const HealthCheck = () => {
    const [status, setStatus] = useState<HealthStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkHealth = async () => {
            const startTime = performance.now();

            try {
                telemetry.logInfo("Checking backend health");

                const response = await fetch("/health");
                const duration = performance.now() - startTime;

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data: HealthStatus = await response.json();
                setStatus(data);
                setError(null);

                telemetry.trackPerformance("health_check", duration, {
                    status: "success",
                });
                telemetry.logInfo("Backend health check successful", {
                    backend_status: data.status,
                    response_time_ms: duration.toFixed(2),
                });
            } catch (err) {
                const duration = performance.now() - startTime;
                const errorMessage =
                    err instanceof Error ? err.message : "Unknown error";
                setError(errorMessage);
                setStatus(null);

                telemetry.trackPerformance("health_check", duration, {
                    status: "error",
                    error: errorMessage,
                });
                telemetry.logError("Backend health check failed", {
                    error: errorMessage,
                });
            } finally {
                setLoading(false);
            }
        };

        checkHealth();

        // Poll every 30 seconds
        const interval = setInterval(checkHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div style={styles.container}>
                <span style={styles.indicator}>⏳</span>
                <span>Checking backend status...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ ...styles.container, ...styles.error }}>
                <span style={styles.indicator}>❌</span>
                <span>Backend Status: Error - {error}</span>
            </div>
        );
    }

    if (status && status.status === "healthy") {
        return (
            <div style={{ ...styles.container, ...styles.success }}>
                <span style={styles.indicator}>✅</span>
                <div>
                    <div>Backend Status: {status.status}</div>
                    <div style={styles.details}>
                        {status.service} v{status.version}
                    </div>
                    <div style={styles.details}>
                        Last checked: {new Date(status.timestamp).toLocaleTimeString()}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <span style={styles.indicator}>❓</span>
            <span>Backend Status: Unknown</span>
        </div>
    );
};

const styles = {
    container: {
        padding: "16px",
        borderRadius: "8px",
        backgroundColor: "#f5f5f5",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "20px",
    },
    success: {
        backgroundColor: "#e8f5e9",
        border: "1px solid #4caf50",
    },
    error: {
        backgroundColor: "#ffebee",
        border: "1px solid #f44336",
    },
    indicator: {
        fontSize: "24px",
    },
    details: {
        fontSize: "12px",
        color: "#666",
        marginTop: "4px",
    },
};

export default HealthCheck;
