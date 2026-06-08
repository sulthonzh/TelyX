"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Telyx = void 0;
const axios_1 = __importDefault(require("axios"));
class Telyx {
    constructor(config) {
        this.flushing = false;
        this.config = {
            endpoint: config.endpoint || 'https://api.telyx.example.com',
            agentName: config.agentName,
            environment: config.environment,
            sampleRate: config.sampleRate ?? 1.0,
            maxBatchSize: config.maxBatchSize ?? 100,
            flushInterval: config.flushInterval ?? 5000,
            enableConsole: config.enableConsole ?? false,
        };
        this.httpClient = axios_1.default.create({
            baseURL: this.config.endpoint,
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `telyx/${this.config.agentName}`,
            },
            // Validate response to prevent silent failures
            validateStatus: (status) => status >= 200 && status < 300,
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
    trackMethod(methodName, fn) {
        return async (input) => {
            const shouldSample = Math.random() < this.config.sampleRate;
            if (!shouldSample) {
                // Create a next function that resolves with the input
                const next = () => Promise.resolve(input);
                return fn(input, next);
            }
            const start = Date.now();
            try {
                // Create a next function that resolves with the actual result
                let result;
                const next = () => Promise.resolve(result);
                result = await fn(input, next);
                this.recordSuccess(methodName, Date.now() - start, { input: this.sanitizeInput(input) });
                return result;
            }
            catch (err) {
                this.recordError(methodName, err, { input: this.sanitizeInput(input) });
                throw err;
            }
        };
    }
    /**
     * Record a custom event
     */
    recordEvent(eventName, metadata) {
        const shouldSample = Math.random() < this.config.sampleRate;
        if (!shouldSample)
            return;
        const event = {
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
    recordMetric(metricName, value, metadata) {
        const shouldSample = Math.random() < this.config.sampleRate;
        if (!shouldSample)
            return;
        const metric = {
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
    recordSuccess(methodName, duration, metadata) {
        const event = {
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
    recordError(methodName, error, metadata) {
        const errorEvent = {
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
    track(agent) {
        this.agentWrapper = agent;
        return new Proxy(agent, {
            get: (target, prop) => {
                if (typeof target[prop] === 'function') {
                    // Create a wrapper that preserves the original function signature
                    const originalMethod = target[prop];
                    const trackedMethod = this.trackMethod(String(prop), async (input, next) => {
                        // Call the original method with the input
                        return originalMethod.call(target, input);
                    });
                    // Return the tracked method
                    return trackedMethod;
                }
                return target[prop];
            },
        });
    }
    /**
     * Flush the current batch to the server
     */
    async flush() {
        // Use a queue to handle concurrent flush calls properly
        if (!this._flushPromise) {
            this._flushPromise = this._flushInternal();
        }
        return this._flushPromise;
    }
    /**
     * Internal flush implementation with proper race condition handling
     */
    async _flushInternal() {
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
            const batchToSend = {
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
        }
        catch (error) {
            if (this.config.enableConsole) {
                console.error('[Telyx] Failed to flush batch:', error);
            }
            // Don't re-queue failed items - let them be retried on next flush
            // This prevents infinite retry loops on persistent failures
        }
        finally {
            this.flushing = false;
            this._flushPromise = undefined;
        }
    }
    /**
     * Check if batch size has been exceeded and flush if necessary
     */
    checkBatchSize() {
        const totalItems = this.batch.events.length + this.batch.metrics.length + this.batch.errors.length;
        if (totalItems >= this.config.maxBatchSize) {
            this.flush();
        }
    }
    /**
     * Start the periodic flush timer
     */
    startFlushTimer() {
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
    async destroy() {
        // Cancel any pending flush operation
        if (this._flushPromise) {
            try {
                await this._flushPromise;
            }
            catch (error) {
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
        }
        catch (error) {
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
    registerShutdownHandler() {
        this.shutdownHandler = async () => {
            process.removeListener('beforeExit', this.shutdownHandler);
            await this.destroy();
        };
        process.on('beforeExit', this.shutdownHandler);
    }
    /**
     * Sanitize input for privacy/size reasons
     */
    sanitizeInput(input) {
        // Handle null/undefined
        if (input === null || input === undefined) {
            return String(input);
        }
        // Handle strings
        if (typeof input === 'string') {
            return input.substring(0, 100) + (input.length > 100 ? '...' : '');
        }
        // Handle objects (including arrays)
        if (typeof input === 'object') {
            return '[object]';
        }
        // Handle numbers, booleans, etc.
        return input;
    }
}
exports.Telyx = Telyx;
//# sourceMappingURL=Telyx.js.map