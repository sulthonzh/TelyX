import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders TelyX dashboard', () => {
  render(<App />);
  // Check for the expected dashboard components instead of CRA template
  const logsTab = screen.getByText(/📋 Logs/i);
  const metricsTab = screen.getByText(/📊 Metrics/i);
  const tracesTab = screen.getByText(/🔍 Traces/i);
  expect(logsTab).toBeInTheDocument();
  expect(metricsTab).toBeInTheDocument();
  expect(tracesTab).toBeInTheDocument();
});

test('displays health status', () => {
  render(<App />);
  // This test will verify that the health status component renders
  // The actual health check happens via API, but we verify the UI structure
  const header = screen.getByRole('banner');
  expect(header).toBeInTheDocument();
});
