import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { TelyxConfig, TelyxEvent, TelyxMetric, TelyxError, TelemetryBatch } from '../types';

// Re-export types for convenience
export type { TelyxConfig, TelyxEvent, TelyxMetric, TelyxError, TelemetryBatch };

export class Telyx {
  private config: Required<TelyxConfig>;
  private httpClient: AxiosInstance;
  private batch: TelemetryBatch;
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;
  private _flushPromise?: Promise<void>;
  private agentWrapper?: any;
  private shutdownHandler?: () => Promise<void>;

  constructor(config: TelyxConfig) {
    this.config = {
      endpoint: config.endpoint || 'https://api.telyx.example.com',
      agentName: config.agentName,
      environment: config.environment,
      sampleRate: config.sampleRate ?? 1.0,
      maxBatchSize: config.maxBatchSize ?? 100,
      flushInterval: config.flushInterval ?? 5000,
      enableConsole: config.enableConsole ?? false,
    };

    this.httpClient = axios.create({
      baseURL: this.config.endpoint,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `telyx/${this.config.agentName}`,
      },
      // Validate response to prevent silent failures
      validateStatus: (status: number) => status >= 200 && status < 300,
    });

    this.batch = {
      events: [],
      metrics: [],
      errors: [],
    };

    this.startFlushTimer();
    this.registerShutdownHandler();
  }

  /**
   * Track an agent method with automatic timing and success/failure detection
   */
  public trackMethod<T>(methodName: string, fn: (input: any, next: () => Promise<T>) => Promise<T>): any {
    return async (input: any): Promise<T> => {
      const shouldSample = Math.random() < this.config.sampleRate;

      if (!shouldSample) {
        // Create a proper next function that resolves with the input
        const next = () => Promise.resolve(input as T);
        return fn(input, next);
      }

      const start = Date.now();

      try {
        // Create a proper next function that resolves with the input
        const next = () => Promise.resolve(input as T);
        const result = await fn(input, next);
        this.recordSuccess(methodName, Date.now() - start, { input: this.sanitizeInput(input) });
        return result;
      } catch (err) {
        this.recordError(methodName, err, { input: this.sanitizeInput(input) });
        throw err;
      }
    };
  }

  /**
   * Record a custom event
   */
  public recordEvent(eventName: string, metadata?: Record<string, any>): void {
    const shouldSample = Math.random() < this.config.sampleRate;
    
    if (!shouldSample) return;

    const event: TelyxEvent = {
      timestamp: new Date().toISOString(),
      agent: this.config.agentName,
      environment: this.config.environment,
      event: eventName,
      metadata,
    };

    this.batch.events.push(event);
    this.checkBatchSize();
    
    if (this.config.enableConsole) {
      console.log('[Telyx] Event:', event);
    }
  }

  /**
   * Record a metric
   */
  public recordMetric(metricName: string, value: number, metadata?: Record<string, any>): void {
    const shouldSample = Math.random() < this.config.sampleRate;
    
    if (!shouldSample) return;

    const metric: TelyxMetric = {
      timestamp: new Date().toISOString(),
      agent: this.config.agentName,
      environment: this.config.environment,
      metric: metricName,
      value,
      metadata,
    };

    this.batch.metrics.push(metric);
    this.checkBatchSize();
    
    if (this.config.enableConsole) {
      console.log('[Telyx] Metric:', metric);
    }
  }

  /**
   * Record a success event
   */
  public recordSuccess(methodName: string, duration: number, metadata?: Record<string, any>): void {
    const event: TelyxEvent = {
      timestamp: new Date().toISOString(),
      agent: this.config.agentName,
      environment: this.config.environment,
      event: 'method_success',
      method: methodName,
      duration,
      success: true,
      metadata,
    };

    this.batch.events.push(event);
    this.checkBatchSize();
    
    if (this.config.enableConsole) {
      console.log('[Telyx] Success:', event);
    }
  }

  /**
   * Record an error
   */
  public recordError(methodName: string, error: any, metadata?: Record<string, any>): void {
    const errorEvent: TelyxError = {
      timestamp: new Date().toISOString(),
      agent: this.config.agentName,
      environment: this.config.environment,
      error: error.message || 'Unknown error',
      stack: error.stack,
      context: {
        method: methodName,
        ...metadata,
      },
    };

    this.batch.errors.push(errorEvent);
    this.checkBatchSize();
    
    if (this.config.enableConsole) {
      console.log('[Telyx] Error:', errorEvent);
    }
  }

  /**
   * Wrap an agent with telemetry
   */
  public track(agent: any): any {
    this.agentWrapper = agent;
    
    return new Proxy(agent, {
      get: (target, prop) => {
        if (typeof target[prop] === 'function') {
          return this.trackMethod(String(prop), async (input: any, next: () => any) => {
            return target[prop](input);
          });
        }
        return target[prop];
      },
    });
  }

  /**
   * Flush the current batch to the server
   */
  public async flush(): Promise<void> {
    // Use a queue to handle concurrent flush calls properly
    if (!this._flushPromise) {
      this._flushPromise = this._flushInternal();
    }
    return this._flushPromise;
  }

  /**
   * Internal flush implementation with proper race condition handling
   */
  private async _flushInternal(): Promise<void> {
    if (this.flushing) {
      return;
    }

    if (this.batch.events.length === 0 && this.batch.metrics.length === 0 && this.batch.errors.length === 0) {
      this._flushPromise = undefined;
      return;
    }

    this.flushing = true;

    try {
      // Deep-snapshot: copy arrays so concurrent additions don't leak into the POST
      // and aren't lost when we clear the batch after success.
      const batchToSend: TelemetryBatch = {
        events: this.batch.events.slice(),
        metrics: this.batch.metrics.slice(),
        errors: this.batch.errors.slice(),
      };

      // Remove only the items we're about to send; keep anything added since snapshot.
      const sentEvents = batchToSend.events.length;
      const sentMetrics = batchToSend.metrics.length;
      const sentErrors = batchToSend.errors.length;

      await this.httpClient.post('/telemetry', batchToSend);

      // Trim only the items we actually sent
      this.batch.events.splice(0, sentEvents);
      this.batch.metrics.splice(0, sentMetrics);
      this.batch.errors.splice(0, sentErrors);
      
      if (this.config.enableConsole) {
        console.log(`[Telyx] Flushed ${batchToSend.events.length} events, ${batchToSend.metrics.length} metrics, ${batchToSend.errors.length} errors`);
      }
    } catch (error) {
      if (this.config.enableConsole) {
        console.error('[Telyx] Failed to flush batch:', error);
      }
      // Don't re-queue failed items - let them be retried on next flush
      // This prevents infinite retry loops on persistent failures
    } finally {
      this.flushing = false;
      this._flushPromise = undefined;
    }
  }

  /**
   * Check if batch size has been exceeded and flush if necessary
   */
  private checkBatchSize(): void {
    const totalItems = this.batch.events.length + this.batch.metrics.length + this.batch.errors.length;
    
    if (totalItems >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
    // Don't keep the process alive just for the flush timer.
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop the flush timer and clean up
   */
  public async destroy(): Promise<void> {
    // Cancel any pending flush operation
    if (this._flushPromise) {
      try {
        await this._flushPromise;
      } catch (error) {
        // Ignore flush errors during cleanup
        if (this.config.enableConsole) {
          console.warn('[Telyx] Flush error during destroy:', error);
        }
      }
      this._flushPromise = undefined;
    }
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    if (this.shutdownHandler) {
      process.removeListener('beforeExit', this.shutdownHandler);
      this.shutdownHandler = undefined;
    }
    
    try {
      await this.flush();
    } catch (error) {
      // Ignore flush errors during cleanup
      if (this.config.enableConsole) {
        console.warn('[Telyx] Final flush failed:', error);
      }
    }
  }

  /**
   * Register a shutdown handler so buffered telemetry isn't silently lost
   * if the process exits without calling destroy().
   */
  private registerShutdownHandler(): void {
    this.shutdownHandler = async () => {
      process.removeListener('beforeExit', this.shutdownHandler!);
      await this.destroy();
    };
    process.on('beforeExit', this.shutdownHandler);
  }

  /**
   * Sanitize input for privacy/size reasons
   */
  private sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input.substring(0, 100) + (input.length > 100 ? '...' : '');
    }
    if (typeof input === 'object') {
      return '[object]';
    }
    return input;
  }
}