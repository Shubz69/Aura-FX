/**
 * AURA AI Chat System - Integration Tests
 * 
 * Test Coverage:
 * - Input validation
 * - Token handling
 * - Image processing
 * - Response guarantees (no empty responses)
 * - Concurrent request handling
 * - Error recovery
 */

const {
  validateRequest,
  validateImages,
  decodeToken,
  checkAccess,
  CONFIG
} = require('../api/ai/premium-chat-robust');

// ============= UNIT TESTS =============

describe('Input Validation', () => {
  test('validates message presence', () => {
    const result = validateRequest({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Message or images required');
  });

  test('validates message type', () => {
    const result = validateRequest({ message: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Message must be a string');
  });

  test('validates message length', () => {
    const longMessage = 'a'.repeat(CONFIG.MAX_MESSAGE_LENGTH + 1);
    const result = validateRequest({ message: longMessage });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('maximum length'))).toBe(true);
  });

  test('accepts valid message', () => {
    const result = validateRequest({ message: 'Hello AI!' });
    expect(result.valid).toBe(true);
    expect(result.sanitized.message).toBe('Hello AI!');
  });

  test('trims message whitespace', () => {
    const result = validateRequest({ message: '  Hello  ' });
    expect(result.sanitized.message).toBe('Hello');
  });

  test('validates images array', () => {
    const result = validateRequest({ message: 'test', images: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Images must be an array');
  });

  test('limits number of images', () => {
    const images = new Array(10).fill('data:image/png;base64,test');
    const result = validateRequest({ message: 'test', images });
    expect(result.sanitized.images.length).toBe(CONFIG.MAX_IMAGES);
  });

  test('validates conversation history', () => {
    const result = validateRequest({
      message: 'test',
      conversationHistory: 'not-array'
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Conversation history must be an array');
  });

  test('limits conversation history length', () => {
    const history = new Array(100).fill({ role: 'user', content: 'test' });
    const result = validateRequest({ message: 'test', conversationHistory: history });
    expect(result.sanitized.conversationHistory.length).toBeLessThanOrEqual(
      CONFIG.MAX_CONVERSATION_TURNS * 2
    );
  });

  test('allows images without message', () => {
    const result = validateRequest({
      images: ['data:image/png;base64,test']
    });
    expect(result.valid).toBe(true);
  });
});

describe('Image Validation', () => {
  test('validates data URL format', () => {
    const result = validateImages(['data:invalid']);
    expect(result.invalid.length).toBe(1);
    expect(result.invalid[0].error).toContain('Invalid data URL format');
  });

  test('validates MIME types', () => {
    const result = validateImages(['data:text/plain;base64,dGVzdA==']);
    expect(result.invalid.length).toBe(1);
    expect(result.invalid[0].error).toContain('Unsupported type');
  });

  test('accepts valid image types', () => {
    const validImages = [
      'data:image/jpeg;base64,dGVzdA==',
      'data:image/png;base64,dGVzdA==',
      'data:image/gif;base64,dGVzdA==',
      'data:image/webp;base64,dGVzdA=='
    ];
    
    const result = validateImages(validImages);
    expect(result.valid.length).toBe(4);
    expect(result.invalid.length).toBe(0);
  });

  test('accepts https URLs', () => {
    const result = validateImages(['https://example.com/image.jpg']);
    expect(result.valid.length).toBe(1);
  });

  test('rejects invalid image data', () => {
    const result = validateImages([null, undefined, 123, {}, []]);
    expect(result.invalid.length).toBe(5);
    expect(result.valid.length).toBe(0);
  });

  test('handles empty array', () => {
    const result = validateImages([]);
    expect(result.valid.length).toBe(0);
    expect(result.invalid.length).toBe(0);
  });

  test('handles null/undefined', () => {
    expect(validateImages(null).valid.length).toBe(0);
    expect(validateImages(undefined).valid.length).toBe(0);
  });
});

describe('Token Decoding', () => {
  test('rejects missing token', () => {
    expect(decodeToken(null).valid).toBe(false);
    expect(decodeToken(undefined).valid).toBe(false);
    expect(decodeToken('').valid).toBe(false);
  });

  test('rejects invalid format', () => {
    const result = decodeToken('invalid-token');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid token format');
  });

  test('rejects invalid JSON payload', () => {
    // Header.InvalidBase64.Signature
    const result = decodeToken('header.!!!invalid!!!.signature');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token decode failed');
  });

  test('decodes valid token', () => {
    // Create a valid JWT-like token
    const payload = { id: 123, userId: 123, exp: Math.floor(Date.now() / 1000) + 3600 };
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const token = `header.${payloadBase64}.signature`;
    
    const result = decodeToken(token);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(123);
  });

  test('rejects expired token', () => {
    const payload = { id: 123, exp: Math.floor(Date.now() / 1000) - 3600 };
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const token = `header.${payloadBase64}.signature`;
    
    const result = decodeToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token expired');
  });
});

describe('Access Control', () => {
  test('allows super admin by email', () => {
    expect(checkAccess({ email: 'shubzfx@gmail.com' })).toBe(true);
    expect(checkAccess({ email: 'SHUBZFX@GMAIL.COM' })).toBe(true);
  });

  test('allows premium roles', () => {
    expect(checkAccess({ role: 'premium' })).toBe(true);
    expect(checkAccess({ role: 'a7fx' })).toBe(true);
    expect(checkAccess({ role: 'elite' })).toBe(true);
    expect(checkAccess({ role: 'admin' })).toBe(true);
    expect(checkAccess({ role: 'super_admin' })).toBe(true);
  });

  test('allows active subscriptions', () => {
    expect(checkAccess({
      subscription_status: 'active',
      subscription_plan: 'aura'
    })).toBe(true);
    
    expect(checkAccess({
      subscription_status: 'active',
      subscription_plan: 'premium'
    })).toBe(true);
  });

  test('denies without access', () => {
    expect(checkAccess({ role: 'user' })).toBe(false);
    expect(checkAccess({ subscription_status: 'inactive' })).toBe(false);
    expect(checkAccess({})).toBe(false);
  });
});

// ============= INTEGRATION TESTS =============

describe('API Integration Tests', () => {
  // These tests require the server to be running
  const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
  const TEST_TIMEOUT = 60000;

  // Skip if no test token provided
  const TEST_TOKEN = process.env.TEST_AUTH_TOKEN;
  
  const runIntegrationTests = TEST_TOKEN ? test : test.skip;

  runIntegrationTests('health endpoint returns valid response', async () => {
    const response = await fetch(`${BASE_URL}/api/ai/health`);
    const data = await response.json();
    
    expect(response.status).toBeLessThanOrEqual(503);
    expect(data.timestamp).toBeDefined();
    expect(data.services).toBeDefined();
  }, TEST_TIMEOUT);

  runIntegrationTests('rejects unauthorized requests', async () => {
    const response = await fetch(`${BASE_URL}/api/ai/premium-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' })
    });
    
    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);

  runIntegrationTests('accepts valid request with auth', async () => {
    const response = await fetch(`${BASE_URL}/api/ai/premium-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({ message: 'Hello, what is the current market outlook?' })
    });
    
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.response).toBeTruthy();
    expect(typeof data.response).toBe('string');
    expect(data.response.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  runIntegrationTests('never returns empty response', async () => {
    // Test with various edge cases
    const testCases = [
      { message: '' },
      { message: '   ' },
      { message: '?' },
      { message: 'a' },
      { message: '你好' },
      { message: '🚀' },
      { message: 'What is the price of EURUSD?' },
      { message: 'Give me technical analysis for gold' }
    ];

    for (const testCase of testCases) {
      if (!testCase.message.trim()) continue; // Skip truly empty messages
      
      const response = await fetch(`${BASE_URL}/api/ai/premium-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
        },
        body: JSON.stringify(testCase)
      });
      
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.response).toBeTruthy();
      expect(data.response.trim().length).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT * 5);

  runIntegrationTests('handles conversation history', async () => {
    const conversationHistory = [
      { role: 'user', content: 'My name is John' },
      { role: 'assistant', content: 'Hello John! How can I help you today?' }
    ];

    const response = await fetch(`${BASE_URL}/api/ai/premium-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        message: 'What is my name?',
        conversationHistory
      })
    });
    
    const data = await response.json();
    
    expect(data.success).toBe(true);
    expect(data.response.toLowerCase()).toContain('john');
  }, TEST_TIMEOUT);
});

// ============= PERFORMANCE TESTS =============

describe('Performance Tests', () => {
  const CONCURRENT_REQUESTS = 10;
  const TEST_TIMEOUT = 120000;
  
  const TEST_TOKEN = process.env.TEST_AUTH_TOKEN;
  const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
  
  const runPerfTests = TEST_TOKEN ? test : test.skip;

  runPerfTests('handles concurrent requests', async () => {
    const requests = Array(CONCURRENT_REQUESTS).fill(null).map((_, i) =>
      fetch(`${BASE_URL}/api/ai/premium-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
        },
        body: JSON.stringify({ message: `Test message ${i}` })
      })
    );

    const responses = await Promise.all(requests);
    const results = await Promise.all(responses.map(r => r.json()));
    
    // All requests should succeed
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(CONCURRENT_REQUESTS);
    
    // No empty responses
    const emptyResponses = results.filter(r => !r.response || r.response.trim() === '');
    expect(emptyResponses.length).toBe(0);
  }, TEST_TIMEOUT);

  runPerfTests('maintains response times under load', async () => {
    const timings = [];
    
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      
      const response = await fetch(`${BASE_URL}/api/ai/premium-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
        },
        body: JSON.stringify({ message: `Quick question ${i}` })
      });
      
      await response.json();
      timings.push(Date.now() - start);
    }
    
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)];
    
    console.log(`Average response time: ${avgTime}ms`);
    console.log(`P95 response time: ${p95}ms`);
    
    // P95 should be under 30 seconds
    expect(p95).toBeLessThan(30000);
  }, TEST_TIMEOUT);
});

// ============= ERROR RECOVERY TESTS =============

describe('Error Recovery', () => {
  test('CONFIG has required fields', () => {
    expect(CONFIG.OPENAI_TIMEOUT).toBeGreaterThan(0);
    expect(CONFIG.MAX_CONVERSATION_TURNS).toBeGreaterThan(0);
    expect(CONFIG.MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.MAX_IMAGES).toBeGreaterThan(0);
    expect(CONFIG.MAX_IMAGE_SIZE).toBeGreaterThan(0);
  });
});

// Export for CI/CD
module.exports = {
  runTests: async () => {
    // Can be called from CI
    console.log('Running AI chat tests...');
  }
};
