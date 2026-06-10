export interface TelyxConfig {
  endpoint?: string;
  agentName: string;
  environment: string;
  sampleRate?: number;
  maxBatchSize?: number;
  flushInterval?: number;
  enableConsole?: boolean;
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

export interface AgentWrapper {
  sendMessage: (input: string) => Promise<string>;
  generateContent: (prompt: string) => Promise<string>;
  [key: string]: unknown;
}