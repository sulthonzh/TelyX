import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import HealthCheck from './HealthCheck';

// Mock telemetry service
jest.mock('../services/telemetry', () => ({
  __esModule: true,
  default: {
    logInfo: jest.fn(),
    logError: jest.fn(),
    trackPerformance: jest.fn(),
  },
}));

describe('HealthCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    global.fetch = jest.fn(() =>
      new Promise(() => {}) // Never resolves
    ) as jest.Mock;

    render(<HealthCheck />);
    expect(screen.getByText(/checking backend status/i)).toBeInTheDocument();
  });

  it('renders healthy status when backend is healthy', async () => {
    const mockResponse = {
      status: 'healthy',
      service: 'telyx-backend',
      message: 'TelyX Backend is running!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    ) as jest.Mock;

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText(/backend status: healthy/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/telyx-backend v1.0.0/i)).toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('Network error'))
    ) as jest.Mock;

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText(/backend status: error/i)).toBeInTheDocument();
    });
  });

  it('renders error state when response is not ok', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      })
    ) as jest.Mock;

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText(/backend status: error/i)).toBeInTheDocument();
    });
  });
});
