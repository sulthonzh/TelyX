"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Telyx = void 0;
const axios_1 = __importDefault(require("axios"));
class Telyx {
    constructor(config) {
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
        });
        this.batch = {
            events: [],
            metrics: [],
            errors: [],
        };
        this.startFlushTimer();
    }
    /**
     * Track an agent method with automatic timing and success/failure detection
     */
    trackMethod(methodName, fn) {
        return async (input) => {
            const shouldSample = Math.random() < this.config.sampleRate;
            if (!shouldSample) {
                return fn(input, () => Promise.resolve(input));
            }
            const start = Date.now();
            let result;
            let success = false;
            let error = null;
            try {
                result = await fn(input, () => Promise.resolve(result));
                success = true;
                this.recordSuccess(methodName, Date.now() - start, { input: this.sanitizeInput(input) });
                return result;
            }
            catch (err) {
                error = err;
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
                    return this.trackMethod(String(prop), async (input, next) => {
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
    async flush() {
        if (this.batch.events.length === 0 && this.batch.metrics.length === 0 && this.batch.errors.length === 0) {
            return;
        }
        const batchToSend = { ...this.batch };
        try {
            await this.httpClient.post('/telemetry', batchToSend);
            // Clear the batch after successful send
            this.batch = {
                events: [],
                metrics: [],
                errors: [],
            };
            if (this.config.enableConsole) {
                console.log(`[Telyx] Flushed ${batchToSend.events.length} events, ${batchToSend.metrics.length} metrics, ${batchToSend.errors.length} errors`);
            }
        }
        catch (error) {
            if (this.config.enableConsole) {
                console.error('[Telyx] Failed to flush batch:', error);
            }
            // Don't clear the batch on failure - it will be retried on next flush
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
    }
    /**
     * Stop the flush timer and clean up
     */
    async destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        await this.flush();
    }
    /**
     * Sanitize input for privacy/size reasons
     */
    sanitizeInput(input) {
        if (typeof input === 'string') {
            return input.substring(0, 100) + (input.length > 100 ? '...' : '');
        }
        if (typeof input === 'object') {
            return '[object]';
        }
        return input;
    }
}
exports.Telyx = Telyx;
//# sourceMappingURL=Telyx.js.map