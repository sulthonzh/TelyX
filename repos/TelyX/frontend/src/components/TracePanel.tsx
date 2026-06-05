import React from "react";

const TracePanel: React.FC = () => {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Distributed Traces</h2>
      </div>
      <div className="empty-state">
        <p>
          Traces are collected via <strong>OpenTelemetry</strong> and sent to the
          OTel Collector.
        </p>
        <p>Connect a Jaeger or Zipkin backend to visualize traces.</p>
        <div className="trace-setup">
          <h3>Quick Setup with Jaeger</h3>
          <p>Add to your <code>docker-compose.yml</code>:</p>
          <pre className="code-hint">
{`# Jaeger all-in-one for trace visualization
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"  # Jaeger UI
    - "14250:14250"  # gRPC for OTel Collector
  networks:
    - telyx-net`}
          </pre>
          <p>
            Then open{" "}
            <a
              href="http://localhost:16686"
              target="_blank"
              rel="noopener noreferrer"
            >
              http://localhost:16686
            </a>{" "}
            to explore traces.
          </p>
        </div>
        <div className="trace-features">
          <h3>What gets traced</h3>
          <ul>
            <li>
              <strong>HTTP Handlers</strong> — every request to{" "}
              <code>/logs</code>, <code>/health</code>
            </li>
            <li>
              <strong>OpenSearch calls</strong> — log ingestion and search
              queries
            </li>
            <li>
              <strong>Error spans</strong> — failed requests are tagged with
              error details
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TracePanel;
