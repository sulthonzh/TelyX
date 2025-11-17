import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';

const TELEMETRY_ENDPOINT = process.env.REACT_APP_TELEMETRY_ENDPOINT || '/logs';

export interface LogData {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  [key: string]: any;
}

export interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

class TelemetryService {
  private enabled: boolean = true;
  private sessionId: string;
  private traceId: string | null = null;

  constructor() {
    this.sessionId = this.generateId();
    this.initWebVitals();
    this.initErrorTracking();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTraceId(): string {
    // Generate a valid W3C trace ID (32 hex characters)
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateSpanId(): string {
    // Generate a valid W3C span ID (16 hex characters)
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private initWebVitals() {
    const handleMetric = (metric: Metric) => {
      this.sendWebVital(metric);
    };

    getCLS(handleMetric);
    getFID(handleMetric);
    getFCP(handleMetric);
    getLCP(handleMetric);
    getTTFB(handleMetric);
  }

  private initErrorTracking() {
    window.addEventListener('error', (event) => {
      this.logError('Uncaught error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.logError('Unhandled promise rejection', {
        reason: event.reason,
        promise: event.promise,
      });
    });
  }

  private async sendLog(data: LogData): Promise<void> {
    if (!this.enabled) return;

    try {
      // Generate trace context for distributed tracing
      if (!this.traceId) {
        this.traceId = this.generateTraceId();
      }
      const spanId = this.generateSpanId();

      const enrichedData = {
        ...data,
        timestamp: new Date().toISOString(),
        session_id: this.sessionId,
        trace_id: this.traceId,
        span_id: spanId,
        source: 'telyx-frontend',
        user_agent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      };

      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add W3C Trace Context header for distributed tracing
          'traceparent': `00-${this.traceId}-${spanId}-01`,
        },
        body: JSON.stringify(enrichedData),
      });

      if (!response.ok) {
        console.warn('Failed to send telemetry:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending telemetry:', error);
      // Don't throw - we don't want telemetry failures to break the app
    }
  }

  private sendWebVital(metric: Metric): void {
    this.sendLog({
      level: 'info',
      message: 'Web Vital metric',
      metric_name: metric.name,
      metric_value: metric.value,
      metric_rating: metric.rating,
      metric_delta: metric.delta,
      metric_id: metric.id,
      metric_type: 'web_vital',
    });
  }

  public logDebug(message: string, data?: Record<string, any>): void {
    this.sendLog({ level: 'debug', message, ...data });
  }

  public logInfo(message: string, data?: Record<string, any>): void {
    this.sendLog({ level: 'info', message, ...data });
  }

  public logWarn(message: string, data?: Record<string, any>): void {
    this.sendLog({ level: 'warn', message, ...data });
  }

  public logError(message: string, data?: Record<string, any>): void {
    this.sendLog({ level: 'error', message, ...data });
  }

  public trackEvent(eventName: string, properties?: Record<string, any>): void {
    this.sendLog({
      level: 'info',
      message: `Event: ${eventName}`,
      event_name: eventName,
      event_type: 'custom',
      ...properties,
    });
  }

  public trackPageView(pageName: string, properties?: Record<string, any>): void {
    this.sendLog({
      level: 'info',
      message: `Page view: ${pageName}`,
      page_name: pageName,
      event_type: 'page_view',
      ...properties,
    });
  }

  public trackPerformance(name: string, duration: number, properties?: Record<string, any>): void {
    this.sendLog({
      level: 'info',
      message: `Performance: ${name}`,
      performance_name: name,
      performance_duration: duration,
      event_type: 'performance',
      ...properties,
    });
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public startTrace(): string {
    this.traceId = this.generateTraceId();
    return this.traceId;
  }

  public getTraceId(): string | null {
    return this.traceId;
  }
}

// Export singleton instance
export const telemetry = new TelemetryService();

// Export for React integration
export default telemetry;
