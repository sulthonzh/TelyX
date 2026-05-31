import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock fetch for health check and log polling
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', message: 'TelyX Backend is running!', time: '2026-01-01T00:00:00Z' }),
      text: () => Promise.resolve(''),
    }) as unknown as Response
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders TelyX header', () => {
  render(<App />);
  expect(screen.getByText(/TelyX/)).toBeInTheDocument();
});

test('renders tab navigation', () => {
  render(<App />);
  expect(screen.getByText('Logs')).toBeInTheDocument();
  expect(screen.getByText('Metrics')).toBeInTheDocument();
  expect(screen.getByText('Traces')).toBeInTheDocument();
});
