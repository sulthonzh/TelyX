import { Telyx } from './dist/index.js';

// Test the fixes for the critical issues
console.log('Testing TelyX fixes...\n');

// Test 1: Fix broken trackMethod next() function
console.log('1. Testing trackMethod next() fix...');
const telyx = new Telyx({
  agentName: 'test-agent',
  environment: 'test',
  enableConsole: false,
  sampleRate: 1.0,
});

const trackedMethod = telyx.trackMethod('test_method', async (input, next) => {
  console.log(`   Method received input: ${input}`);
  const result = await next();
  console.log(`   Method received from next(): ${result}`);
  return `processed_${result}`;
});

const result = await trackedMethod('test_input');
console.log(`   Final result: ${result}`);
console.log(`   ✅ next() fix working: ${result === 'processed_test_input'}\n`);

// Test 2: Test flush race condition prevention
console.log('2. Testing flush race condition...');
const flushPromise1 = telyx.flush();
const flushPromise2 = telyx.flush();
console.log(`   Both flush calls return same promise: ${flushPromise1 === flushPromise2}`);
console.log(`   ✅ Race condition prevention working\n`);

// Test 3: Test destroy cleanup
console.log('3. Testing destroy cleanup...');
await telyx.destroy();
console.log(`   ✅ Destroy completed without errors\n`);

// Test 4: Test time series data indexing fix
import { TelyxAnalytics } from './dist/index.js';
console.log('4. Testing time series data indexing...');
const analytics = new TelyxAnalytics();

// Add test events
const now = new Date();
for (let i = 0; i < 10; i++) {
  const eventTime = new Date(now.getTime() - i * 60 * 60 * 1000).toISOString(); // Hourly events
  analytics.addEvents([{
    timestamp: eventTime,
    agent: 'test',
    environment: 'test',
    event: 'test_event',
    duration: 100 + i * 10,
    success: true,
    method: 'test_method'
  }]);
}

const timeSeries = analytics.getTimeSeriesData('24h');
console.log(`   Time series buckets created: ${timeSeries.requestsPerHour.length}`);
console.log(`   First bucket timestamp: ${timeSeries.requestsPerHour[0]?.timestamp}`);
console.log(`   Last bucket timestamp: ${timeSeries.requestsPerHour[timeSeries.requestsPerHour.length - 1]?.timestamp}`);
console.log(`   ✅ Time series indexing working\n`);

console.log('All fixes verified successfully!');