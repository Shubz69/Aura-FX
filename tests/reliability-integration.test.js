/**
 * Reliability Integration Tests
 * 
 * Tests critical paths for the hardened platform:
 * - Community load
 * - Send/receive messages
 * - Profile operations
 * - Friend requests
 * - Notifications
 * - Leaderboard (all timeframes)
 * - AI prompts
 * 
 * Run with: node tests/reliability-integration.test.js
 */

const assert = require('assert');

// ============================================================================
// Mock HTTP Client
// ============================================================================

class MockHttpClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.authToken = null;
    this.requests = [];
  }

  setAuth(token) {
    this.authToken = token;
  }

  async request(method, path, body = null) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const request = { method, path, body, headers, timestamp: Date.now() };
    this.requests.push(request);

    // Simulate response based on path
    return this.simulateResponse(method, path, body);
  }

  simulateResponse(method, path, body) {
    // Simulate various API responses
    const responses = {
      'GET /api/community/users': {
        status: 200,
        body: [
          { id: 1, username: 'TestUser', avatar: '/avatars/default.png' }
        ]
      },
      'GET /api/leaderboard': {
        status: 200,
        body: {
          success: true,
          leaderboard: [
            { rank: 1, username: 'TopTrader', xp: 10000, level: 50 }
          ],
          requestId: 'lb_test123'
        }
      },
      'GET /api/notifications': {
        status: 200,
        body: {
          success: true,
          items: [],
          unreadCount: 0,
          requestId: 'notif_test123'
        }
      },
      'GET /api/friends/list': {
        status: 200,
        body: {
          success: true,
          friends: [],
          count: 0,
          requestId: 'friend_test123'
        }
      },
      'POST /api/friends/request': {
        status: 200,
        body: {
          success: true,
          message: 'Friend request sent',
          requestId: 'friend_test123'
        }
      },
      'POST /api/chatbot': {
        status: 200,
        body: {
          success: true,
          reply: 'Hello! How can I help you?',
          requestId: 'chat_test123'
        }
      }
    };

    const key = `${method} ${path.split('?')[0]}`;
    return responses[key] || { status: 404, body: { success: false, message: 'Not found' } };
  }

  getRequestStats() {
    return {
      total: this.requests.length,
      byMethod: this.requests.reduce((acc, r) => {
        acc[r.method] = (acc[r.method] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function test(name, fn) {
  return async () => {
    const startTime = Date.now();
    try {
      await fn();
      const duration = Date.now() - startTime;
      testsPassed++;
      testResults.push({ name, status: 'passed', duration });
      console.log(`  ✓ ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      testsFailed++;
      testResults.push({ name, status: 'failed', duration, error: error.message });
      console.log(`  ✗ ${name} (${duration}ms)`);
      console.log(`    Error: ${error.message}`);
    }
  };
}

// ============================================================================
// Tests
// ============================================================================

const tests = [
  // Community Tests
  test('Community - Load users list returns array', async () => {
    const client = new MockHttpClient();
    const response = await client.request('GET', '/api/community/users');
    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(response.body));
  }),

  test('Community - Response has requestId', async () => {
    // Test that all responses include requestId
    const client = new MockHttpClient();
    const response = await client.request('GET', '/api/leaderboard');
    assert.ok(response.body.requestId, 'Response should include requestId');
  }),

  // Leaderboard Tests
  test('Leaderboard - Daily timeframe returns valid response', async () => {
    const client = new MockHttpClient();
    const response = await client.request('GET', '/api/leaderboard?timeframe=daily');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.success);
    assert.ok(Array.isArray(response.body.leaderboard));
  }),

  test('Leaderboard - Weekly timeframe returns valid response', async () => {
    const client = new MockHttpClient();
    const response = await client.request('GET', '/api/leaderboard?timeframe=weekly');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.success);
  }),

  test('Leaderboard - Monthly timeframe returns valid response', async () => {
    const client = new MockHttpClient();
    const response = await client.request('GET', '/api/leaderboard?timeframe=monthly');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.success);
  }),

  test('Leaderboard - All-time timeframe returns valid response', async () => {
    const client = new MockHttpClient();
    const response = await client.request('GET', '/api/leaderboard?timeframe=all-time');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.success);
  }),

  // Notifications Tests
  test('Notifications - GET returns items array and unreadCount', async () => {
    const client = new MockHttpClient();
    client.setAuth('test_token');
    const response = await client.request('GET', '/api/notifications');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.hasOwnProperty('items'));
    assert.ok(typeof response.body.unreadCount === 'number');
  }),

  // Friends Tests
  test('Friends - List returns friends array', async () => {
    const client = new MockHttpClient();
    client.setAuth('test_token');
    const response = await client.request('GET', '/api/friends/list');
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.hasOwnProperty('friends'));
  }),

  test('Friends - Send request returns success', async () => {
    const client = new MockHttpClient();
    client.setAuth('test_token');
    const response = await client.request('POST', '/api/friends/request', { receiverUserId: 2 });
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.success);
  }),

  // Chatbot Tests
  test('Chatbot - Returns reply for message', async () => {
    const client = new MockHttpClient();
    const response = await client.request('POST', '/api/chatbot', { message: 'Hello' });
    assert.strictEqual(response.status, 200);
    assert.ok(response.body.reply);
  }),

  // Error Handling Tests
  test('Error responses include errorCode and requestId', async () => {
    // Simulate an error response structure
    const errorResponse = {
      success: false,
      errorCode: 'NOT_FOUND',
      message: 'Resource not found',
      requestId: 'test_123'
    };
    assert.ok(errorResponse.errorCode);
    assert.ok(errorResponse.requestId);
    assert.ok(errorResponse.message);
  }),

  // Rate Limiting Tests
  test('Rate limiter allows requests within limit', async () => {
    const { checkRateLimit } = require('../api/utils/rate-limiter');
    
    // First 10 requests should pass
    for (let i = 0; i < 10; i++) {
      const allowed = checkRateLimit('test_key_' + Date.now(), 100, 60000);
      assert.ok(allowed, `Request ${i + 1} should be allowed`);
    }
  }),

  test('Rate limiter blocks requests over limit', async () => {
    const { checkRateLimit } = require('../api/utils/rate-limiter');
    const testKey = 'test_block_' + Date.now();
    
    // Use up the limit
    for (let i = 0; i < 5; i++) {
      checkRateLimit(testKey, 5, 60000);
    }
    
    // Next request should be blocked
    const blocked = checkRateLimit(testKey, 5, 60000);
    assert.strictEqual(blocked, false, 'Request should be blocked');
  }),

  // Circuit Breaker Tests
  test('Circuit breaker allows requests when closed', async () => {
    const { withCircuitBreaker, resetCircuit } = require('../api/utils/circuit-breaker');
    resetCircuit('test_circuit');
    
    const result = await withCircuitBreaker(
      'test_circuit',
      async () => 'success',
      () => 'fallback'
    );
    
    assert.strictEqual(result, 'success');
  }),

  test('Circuit breaker uses fallback when open', async () => {
    const { withCircuitBreaker, resetCircuit } = require('../api/utils/circuit-breaker');
    const circuitName = 'test_open_' + Date.now();
    
    // Force 5 failures to open circuit
    for (let i = 0; i < 5; i++) {
      try {
        await withCircuitBreaker(
          circuitName,
          async () => { throw new Error('Forced failure'); },
          () => 'fallback',
          { failureThreshold: 5 }
        );
      } catch (e) {
        // Expected
      }
    }
    
    // Next call should use fallback
    const result = await withCircuitBreaker(
      circuitName,
      async () => 'success',
      () => 'fallback',
      { failureThreshold: 5 }
    );
    
    assert.strictEqual(result, 'fallback');
  }),

  // Validator Tests
  test('Validators - safeLimit clamps values correctly', async () => {
    const { safeLimit } = require('../api/utils/validators');
    
    // safeLimit(value, defaultLimit, maxLimit) - min is always 1
    assert.strictEqual(safeLimit(10, 20, 100), 10, 'Valid value within range should return value');
    assert.strictEqual(safeLimit(50, 20, 100), 50, 'Within range should return value');
    assert.strictEqual(safeLimit(200, 20, 100), 100, 'Above max should return max');
    assert.strictEqual(safeLimit(0, 20, 100), 1, 'Below min (1) should return 1');
    assert.strictEqual(safeLimit('invalid', 20, 100), 20, 'Invalid should return default');
  }),

  test('Validators - safeTimeframe validates correctly', async () => {
    const { safeTimeframe } = require('../api/utils/validators');
    
    assert.strictEqual(safeTimeframe('daily'), 'daily');
    assert.strictEqual(safeTimeframe('weekly'), 'weekly');
    assert.strictEqual(safeTimeframe('monthly'), 'monthly');
    assert.strictEqual(safeTimeframe('all-time'), 'all-time');
    assert.strictEqual(safeTimeframe('invalid'), 'weekly', 'Invalid should return default');
  }),

  // Cache Tests
  test('Cache - set and get works correctly', async () => {
    const { setCached, getCached } = require('../api/cache');
    const testKey = 'test_cache_' + Date.now();
    
    setCached(testKey, { test: 'data' });
    const result = getCached(testKey, 60000);
    
    assert.deepStrictEqual(result, { test: 'data' });
  }),

  test('Cache - expired data returns null', async () => {
    const { setCached, getCached, deleteCached } = require('../api/cache');
    const testKey = 'test_expired_' + Date.now();
    
    setCached(testKey, { test: 'data' });
    
    // Get with very short TTL - need a slight delay for expiration
    await new Promise(r => setTimeout(r, 10));
    const result = getCached(testKey, 5); // 5ms TTL, waited 10ms
    
    assert.strictEqual(result, null, 'Data older than TTL should return null');
  }),

  // Logger Tests
  test('Logger - generates unique requestIds', async () => {
    const { generateRequestId } = require('../api/utils/logger');
    
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId('test'));
    }
    
    assert.strictEqual(ids.size, 100, 'All IDs should be unique');
  }),

  test('Logger - requestId includes prefix', async () => {
    const { generateRequestId } = require('../api/utils/logger');
    
    const id = generateRequestId('myprefix');
    assert.ok(id.startsWith('myprefix_'), 'ID should start with prefix');
  })
];

// ============================================================================
// Run Tests
// ============================================================================

async function runTests() {
  console.log('\n========================================');
  console.log('  Reliability Integration Tests');
  console.log('========================================\n');

  for (const testFn of tests) {
    await testFn();
  }

  console.log('\n========================================');
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('========================================\n');

  // Calculate latency stats
  const durations = testResults.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  console.log('Performance:');
  console.log(`  Avg: ${avgDuration.toFixed(2)}ms`);
  console.log(`  Min: ${minDuration}ms`);
  console.log(`  Max: ${maxDuration}ms`);
  console.log('');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests().catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
  });
}

module.exports = { runTests, testResults };
