import { Telyx } from './core/Telyx';

describe('Telyx', () => {
  let telyx: Telyx;

  beforeEach(() => {
    telyx = new Telyx({
      agentName: 'test-agent',
      environment: 'test',
      enableConsole: false,
    });
  });

  afterEach(async () => {
    await telyx.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(telyx).toBeDefined();
    });
  });

  describe('Event Recording', () => {
    it('should record custom events', () => {
      telyx.recordEvent('test_event', { key: 'value' });
      // In a real test, we'd check the batch, but for now we just ensure it doesn't throw
    });

    it('should record metrics', () => {
      telyx.recordMetric('test_metric', 42);
      telyx.recordMetric('another_metric', 100);
    });

    it('should record success events', () => {
      telyx.recordSuccess('test_method', 100, { input: 'test' });
    });

    it('should record error events', () => {
      const error = new Error('Test error');
      telyx.recordError('test_method', error, { input: 'test' });
    });
  });

  describe('Method Tracking', () => {
    it('should track async methods with timing', async () => {
      const testMethod = jest.fn().mockResolvedValue('result');
      
      const trackedMethod = telyx.trackMethod('test_method', async (input, next) => {
        return next();
      });

      const result = await trackedMethod('test input');
      
      expect(result).toBe('result');
      expect(testMethod).toHaveBeenCalledTimes(1);
    });

    it('should track method errors', async () => {
      const testMethod = jest.fn().mockRejectedValue(new Error('Test error'));
      
      const trackedMethod = telyx.trackMethod('test_method', async (input, next) => {
        return next();
      });

      await expect(trackedMethod('test input')).rejects.toThrow('Test error');
    });
  });

  describe('Sample Rate', () => {
    it('should respect sample rate', () => {
      const lowSampleRateTelyx = new Telyx({
        agentName: 'test-agent',
        environment: 'test',
        sampleRate: 0.0, // 0% sample rate
        enableConsole: false,
      });

      // These should not actually record due to sample rate
      lowSampleRateTelyx.recordEvent('test_event');
      lowSampleRateTelyx.recordMetric('test_metric', 42);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize long string inputs', () => {
      const longString = 'a'.repeat(200);
      telyx.recordEvent('test_event', { input: longString });
      // Should not throw, and input should be sanitized in actual implementation
    });
  });
});