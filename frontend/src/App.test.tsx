import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the TelyX header", () => {
    render(<App />);
    expect(screen.getByText(/TelyX/i)).toBeInTheDocument();
  });

  it("renders tab navigation with Logs, Metrics, Traces", () => {
    render(<App />);
    const tabs = screen.getAllByRole("button");
    const tabTexts = tabs.map((t) => t.textContent);
    expect(tabTexts.some((t) => t?.includes("Logs"))).toBe(true);
    expect(tabTexts.some((t) => t?.includes("Metrics"))).toBe(true);
    expect(tabTexts.some((t) => t?.includes("Traces"))).toBe(true);
  });

  it("switches to Metrics tab on click", () => {
    render(<App />);
    // Initially on Logs tab — panel header says "Logs"
    expect(screen.getByRole("heading", { name: "Logs" })).toBeInTheDocument();

    // Click the Metrics tab button
    const metricsTab = screen.getAllByRole("button").find(
      (btn) => btn.textContent?.includes("Metrics")
    );
    expect(metricsTab).toBeDefined();
    fireEvent.click(metricsTab!);

    // Now Metrics panel should be visible
    expect(screen.getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
  });

  it("switches to Traces tab on click", () => {
    render(<App />);
    const tracesTab = screen.getAllByRole("button").find(
      (btn) => btn.textContent?.includes("Traces")
    );
    fireEvent.click(tracesTab!);
    expect(
      screen.getByText(/OpenTelemetry/i)
    ).toBeInTheDocument();
  });
});
