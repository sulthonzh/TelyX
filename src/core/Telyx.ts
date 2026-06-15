import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { TelyxConfig, TelyxEvent, TelyxMetric, TelyxError, TelemetryBatch } from '../types';

export type { TelyxConfig, TelyxEvent, TelyxMetric, TelyxError, TelemetryBatch };

export class Telyx {
  private config: Required<TelyxConfig>;
  private httpClient: AxiosInstance;
  private batch: TelemetryBatch;
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;
  private _flushPromise?: Promise<void>;
  private shutdownHandler?: () => Promise<void>;
  private retryQueue: TelemetryBatch[] = [];
  private isRetrying = false;
  private readonly maxRetryQueueSize = 10;

  constructor(config: TelyxConfig) {
    if (typeof config.agentName !== 'string' || config.agentName.trim() === '') {
      throw new Error('agentName is required and must be a non-empty string');
    }
    
    if (typeof config.environment !== 'string' || config.environment.trim() === '') {
      throw new Error('environment is required and must be a non-empty string');
    }
    
    if (config.sampleRate !== undefined && 
        (typeof config.sampleRate !== 'number' || config.sampleRate < 0 || config.sampleRate > 1)) {
      throw new Error('sampleRate must be a number between 0 and 1');
    }
    
    if (config.maxBatchSize !== undefined && 
        (typeof config.maxBatchSize !== 'number' || config.maxBatchSize < 1)) {
      throw new Error('maxBatchSize must be a positive number');
    }
    
    if (config.flushInterval !== undefined && 
        (typeof config.flushInterval !== 'number' || config.flushInterval < 1000)) {
      throw new Error('flushInterval must be at least 1000ms');
    }
    
    if (config.enableConsole !== undefined && typeof config.enableConsole !== 'boolean') {
      throw new Error('enableConsole must be a boolean');
    }
    
    this.config = {
      endpoint: config.endpoint || 'https://api.telyx.example.com',
      agentName: config.agentName,
      environment: config.environment,
      sampleRate: config.sampleRate ?? 1.0,
      maxBatchSize: config.maxBatchSize ?? 100,
      flushInterval: config.flushInterval ?? 5000,
      enableConsole: config.enableConsole ?? false,
      maxAnalyticsRetention: config.maxAnalyticsRetention ?? 10000,
      maxHistoryAgeMs: config.maxHistoryAgeMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.httpClient = axios.create({
      baseURL: this.config.endpoint,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `telyx/${this.config.agentName}`,
      },
      validateStatus: (status: number) => status >= 200 && status < 300,
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
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
  public trackMethod<T>(methodName: string, fn: (input: unknown, next: () => Promise<T>) => Promise<T>): (input: unknown) => Promise<T> {
    return async (input: unknown): Promise<T> => {
      const shouldSample = Math.random() < this.config.sampleRate;

      if (!shouldSample) {
        const next = () => Promise.resolve(input as T);
        return fn(input, next);
      }

      const start = Date.now();

      try {
        // next() resolves with the input because the result is not yet available
        // when next() is called synchronously inside fn; this matches the
        // non-sampled behavior.
        const next = () => Promise.resolve(input as T);
        const result = await fn(input, next);
        this.recordSuccess(methodName, Date.now() - start, { input: this.sanitizeInput(input) });
        return result;
      } catch (err) {
        const duration = Date.now() - start;
        // Record a failure event so analytics (error rate, failed calls, anomaly
        // detection) work correctly. recordError() alone only pushes to the
        // errors array — it does not create a trackable event.
        this.recordFailure(methodName, duration, { input: this.sanitizeInput(input) });
        this.recordError(methodName, err, { input: this.sanitizeInput(input) });
        throw err;
      }
    };
  }

  /**
   * Record a custom event
   */
  public recordEvent(eventName: string, metadata?: Record<string, unknown>): void {
    if (typeof eventName !== 'string' || eventName.trim() === '') {
      throw new Error('eventName must be a non-empty string');
    }
    
    if (metadata && typeof metadata !== 'object') {
      throw new Error('metadata must be an object if provided');
    }
    
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
  public recordMetric(metricName: string, value: number, metadata?: Record<string, unknown>): void {
    if (typeof metricName !== 'string' || metricName.trim() === '') {
      throw new Error('metricName must be a non-empty string');
    }
    
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error('value must be a finite number');
    }
    
    if (metadata && typeof metadata !== 'object') {
      throw new Error('metadata must be an object if provided');
    }
    
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
  public recordSuccess(methodName: string, duration: number, metadata?: Record<string, unknown>): void {
    if (typeof methodName !== 'string' || methodName.trim() === '') {
      throw new Error('methodName must be a non-empty string');
    }
    
    if (typeof duration !== 'number' || duration < 0) {
      throw new Error('duration must be a non-negative number');
    }
    
    if (metadata && typeof metadata !== 'object') {
      throw new Error('metadata must be an object if provided');
    }
    
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
   * Record a method failure — creates a trackable event with success=false
   * so that analytics (error rate, failed calls, anomaly detection) work.
   */
  public recordFailure(methodName: string, duration: number, metadata?: Record<string, unknown>): void {
    if (typeof methodName !== 'string' || methodName.trim() === '') {
      throw new Error('methodName must be a non-empty string');
    }

    if (typeof duration !== 'number' || duration < 0) {
      throw new Error('duration must be a non-negative number');
    }

    if (metadata && typeof metadata !== 'object') {
      throw new Error('metadata must be an object if provided');
    }

    const event: TelyxEvent = {
      timestamp: new Date().toISOString(),
      agent: this.config.agentName,
      environment: this.config.environment,
      event: 'method_failure',
      method: methodName,
      duration,
      success: false,
      metadata,
    };

    this.batch.events.push(event);
    this.checkBatchSize();

    if (this.config.enableConsole) {
      console.log('[Telyx] Failure:', event);
    }
  }

  /**
   * Record an error
   */
  public recordError(methodName: string, error: unknown, metadata?: Record<string, unknown>): void {
    if (typeof methodName !== 'string' || methodName.trim() === '') {
      throw new Error('methodName must be a non-empty string');
    }
    
    if (metadata && typeof metadata !== 'object') {
      throw new Error('metadata must be an object if provided');
    }
    
    const errorEvent: TelyxError = {
      timestamp: new Date().toISOString(),
      agent: this.config.agentName,
      environment: this.config.environment,
      error: (error as Error)?.message || 'Unknown error',
      stack: (error as Error)?.stack,
      context: {
        method: methodName,
        ...(metadata as Record<string, unknown>),
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
  public track(agent: unknown): unknown {
    return new Proxy(agent as Record<string, unknown>, {
      get: (target, prop) => {
        if (typeof prop === 'symbol') {
          // Don't wrap symbol properties, return them as-is
          return (target as Record<PropertyKey, unknown>)[prop];
        }
        
        if (typeof target[prop] === 'function') {
          const originalMethod = target[prop] as (input: unknown) => unknown;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const trackedMethod = this.trackMethod(String(prop), async (input: unknown, next: () => Promise<unknown>) => {
            return originalMethod.call(target, input);
          });
          
          return trackedMethod;
        }
        return target[prop as string];
      },
    });
  }

  /**
   * Flush the current batch to the server
   */
  public async flush(): Promise<void> {
    if (!this._flushPromise) {
      this._flushPromise = this._flushInternal();
    }
    return this._flushPromise;
  }

  /**
   * Process retry queue with exponential backoff
   */
  private async processRetryQueue(): Promise<void> {
    if (this.isRetrying || this.retryQueue.length === 0) {
      return;
    }

    this.isRetrying = true;

    try {
      const batch = this.retryQueue[0];
      await this.httpClient.post('/telemetry', batch);
      
      this.retryQueue.shift();
      
      if (this.config.enableConsole) {
        console.log(`[Telyx] Successfully retried batch with ${batch.events.length} events, ${batch.metrics.length} metrics, ${batch.errors.length} errors`);
      }
      
      await this.processRetryQueue();
    } catch (error) {
      if (this.config.enableConsole) {
        console.error('[Telyx] Retry failed, will retry again later:', error);
      }
    } finally {
      this.isRetrying = false;
    }
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

    // Deep-snapshot: copy arrays so concurrent additions don't leak into the POST
    // and aren't lost when we clear the batch after success.
    const batchToSend: TelemetryBatch = {
      events: this.batch.events.slice(),
      metrics: this.batch.metrics.slice(),
      errors: this.batch.errors.slice(),
    };

    try {
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
        console.error('[Telyx] Failed to flush batch, adding to retry queue:', error);
      }
      
      if (this.retryQueue.length < this.maxRetryQueueSize) {
        this.retryQueue.push({
          events: batchToSend.events,
          metrics: batchToSend.metrics,
          errors: batchToSend.errors,
        });
      } else if (this.config.enableConsole) {
        console.warn('[Telyx] Retry queue full, dropping batch');
      }

      // Fire-and-forget; errors handled internally
      void this.processRetryQueue();    } finally {
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
    if (this._flushPromise) {
      try {
        await this._flushPromise;
      } catch (error) {
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
  private sanitizeInput(input: unknown): unknown {
    if (input === null || input === undefined) {
      return String(input);
    }
    
    if (typeof input === 'string') {
      return input.substring(0, 100) + (input.length > 100 ? '...' : '');
    }
    
    if (typeof input === 'object') {
      return '[object]';
    }
    
    return input;
  }
}