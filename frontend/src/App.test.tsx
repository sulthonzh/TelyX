import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders TelyX Observability Suite heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/TelyX Observability Suite/i);
  expect(headingElement).toBeInTheDocument();
});

test('renders HealthCheck component', () => {
  render(<App />);
  const statusElement = screen.getByText(/Backend Status:/i);
  expect(statusElement).toBeInTheDocument();
});
