export interface TelyxConfig {
  endpoint?: string;
  agentName: string;
  environment: string;
  sampleRate?: number;
  maxBatchSize?: number;
  flushInterval?: number;
  enableConsole?: boolean;
  maxAnalyticsRetention?: number; // Maximum analytics data points to retain (default: 10000)
  maxHistoryAgeMs?: number; // Maximum age of data to retain in milliseconds (default: 7 days)
}

export interface TelyxEvent {
  timestamp: string;
  agent: string;
  environment: string;
  event: string;
  method?: string;
  duration?: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TelyxMetric {
  timestamp: string;
  agent: string;
  environment: string;
  metric: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface TelyxError {
  timestamp: string;
  agent: string;
  environment: string;
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface TelemetryBatch {
  events: TelyxEvent[];
  metrics: TelyxMetric[];
  errors: TelyxError[];
}