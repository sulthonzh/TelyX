import React from "react";

interface HeaderProps {
  health: { status: string; message: string; time: string } | null;
}

const Header: React.FC<HeaderProps> = ({ health }) => {
  const statusColor =
    health?.status === "healthy"
      ? "#22c55e"
      : health?.status === "error"
      ? "#ef4444"
      : "#f59e0b";

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">
          <span className="logo-icon">◈</span> TelyX
        </h1>
        <span className="tagline">Observability Suite</span>
      </div>
      <div className="header-right">
        <div className="health-badge" style={{ borderColor: statusColor }}>
          <span
            className="health-dot"
            style={{ backgroundColor: statusColor }}
          />
          <span className="health-text">
            {health?.status === "healthy"
              ? "All Systems Go"
              : health?.status === "error"
              ? "Backend Down"
              : "Checking..."}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
