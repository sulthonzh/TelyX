import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders TelyX app header', () => {
  render(<App />);
  // The app should render without crashing
  // Check for one of the tab buttons
  const logsButton = screen.getByText(/logs/i);
  expect(logsButton).toBeInTheDocument();
});
