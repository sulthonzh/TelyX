const { Telyx } = require('../dist/index.js');

// Initialize telemetry
const telyx = new Telyx({
  endpoint: 'https://api.example.com/telemetry',
  agentName: 'my-chatbot',
  environment: 'development',
  enableConsole: true,
});

// Mock AI agent
class MockAgent {
  async sendMessage(input) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    
    if (Math.random() < 0.1) { // 10% chance of error
      throw new Error('Simulated AI error');
    }
    
    return `Response to: ${input}`;
  }

  async generateContent(prompt) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
    return `Generated content for: ${prompt}`;
  }
}

// Wrap agent with telemetry
const agent = new MockAgent();
const trackedAgent = telyx.track(agent);

// Usage example
async function main() {
  console.log('Testing Telyx with mock agent...');

  // Test multiple calls
  for (let i = 0; i < 5; i++) {
    try {
      const response = await trackedAgent.sendMessage(`Hello ${i}`);
      console.log(`Response ${i}:`, response);
    } catch (error) {
      console.error(`Error ${i}:`, error.message);
    }
  }

  // Test generate content method
  try {
    const content = await trackedAgent.generateContent('Write a poem about AI');
    console.log('Generated content:', content);
  } catch (error) {
    console.error('Content generation error:', error.message);
  }

  // Record custom events
  telyx.recordEvent('user_login', { userId: '123' });
  telyx.recordMetric('active_users', 42);
  telyx.recordEvent('api_call', { provider: 'openai', model: 'gpt-4' });

  // Flush and wait for completion
  await telyx.flush();
  console.log('Telemetry flushed successfully!');
}

main().catch(console.error);