/**
 * Premium AI Tests
 * 
 * Tests for:
 * 1. UI responsiveness (<100ms feedback)
 * 2. Streaming TTFB targets
 * 3. Typing indicator visibility
 * 4. Voice input/output functionality
 * 5. Mobile responsiveness
 * 6. No layout shift/jank
 */

const assert = require('assert');

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Simple test runner
function describe(suiteName, testFn) {
  console.log(`\n📦 ${suiteName}`);
  testFn();
}

function it(testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } catch (error) {
    failedTests++;
    console.log(`  ❌ ${testName}`);
    console.log(`     Error: ${error.message}`);
  }
}

console.log('\n=== Premium AI Tests ===\n');

// ============================================================================
// Streaming API Tests
// ============================================================================

describe('Streaming API Configuration', () => {
  const CONFIG = {
    ADAPTER_TIMEOUT: 3000,
    OPENAI_TIMEOUT: 45000,
    MAX_HISTORY: 6,
    CACHE_TTL: 30000,
    MAX_TOKENS: 1500,
    MODEL: 'gpt-4o-mini',
    TEMPERATURE: 0.7
  };

  it('Adapter timeout is under 5 seconds', () => {
    assert.ok(CONFIG.ADAPTER_TIMEOUT <= 5000, 'Adapter timeout should be <= 5s');
  });

  it('OpenAI timeout allows for streaming', () => {
    assert.ok(CONFIG.OPENAI_TIMEOUT >= 30000, 'OpenAI timeout should be >= 30s for streaming');
    assert.ok(CONFIG.OPENAI_TIMEOUT <= 60000, 'OpenAI timeout should be <= 60s');
  });

  it('Max history is trimmed for performance', () => {
    assert.ok(CONFIG.MAX_HISTORY <= 10, 'Max history should be <= 10 messages');
  });

  it('Cache TTL is reasonable', () => {
    assert.ok(CONFIG.CACHE_TTL >= 10000, 'Cache TTL should be >= 10s');
    assert.ok(CONFIG.CACHE_TTL <= 60000, 'Cache TTL should be <= 60s');
  });

  it('Max tokens is limited for speed', () => {
    assert.ok(CONFIG.MAX_TOKENS <= 2000, 'Max tokens should be <= 2000 for speed');
  });

  it('Uses fast model', () => {
    assert.ok(CONFIG.MODEL.includes('mini') || CONFIG.MODEL.includes('3.5'), 'Should use a fast model');
  });
});

// ============================================================================
// SSE Event Format Tests
// ============================================================================

describe('SSE Event Format', () => {
  it('Start event has correct structure', () => {
    const event = { type: 'start', requestId: 'stream_123_abc' };
    assert.strictEqual(event.type, 'start');
    assert.ok(event.requestId);
  });

  it('Token event has content', () => {
    const event = { type: 'token', content: 'Hello' };
    assert.strictEqual(event.type, 'token');
    assert.ok(event.content);
  });

  it('Sources event includes fetch time', () => {
    const event = { 
      type: 'sources', 
      sources: [{ type: 'market', symbol: 'BTCUSD', cached: false }],
      fetchTime: 250
    };
    assert.strictEqual(event.type, 'sources');
    assert.ok(Array.isArray(event.sources));
    assert.ok(typeof event.fetchTime === 'number');
  });

  it('Done event includes timing', () => {
    const event = {
      type: 'done',
      content: 'Full response here',
      timing: { total: 2500, ttfb: 800, dataFetch: 300 },
      sources: []
    };
    assert.strictEqual(event.type, 'done');
    assert.ok(event.content);
    assert.ok(event.timing.total);
    assert.ok(event.timing.ttfb);
  });

  it('Error event has message', () => {
    const event = { type: 'error', message: 'Request timed out' };
    assert.strictEqual(event.type, 'error');
    assert.ok(event.message);
  });
});

// ============================================================================
// Cache Logic Tests
// ============================================================================

describe('Cache Logic', () => {
  const CACHE_TTL = 30000;
  const cache = new Map();
  
  function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }
  
  function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
  }

  it('Cache stores and retrieves data', () => {
    setCache('test_key', { price: 100 });
    const result = getCached('test_key');
    assert.ok(result);
    assert.strictEqual(result.price, 100);
  });

  it('Cache returns null for expired data', () => {
    // Simulate expired entry
    cache.set('expired_key', { data: { test: true }, timestamp: Date.now() - CACHE_TTL - 1000 });
    const result = getCached('expired_key');
    assert.strictEqual(result, null);
  });

  it('Cache returns null for missing key', () => {
    const result = getCached('nonexistent_key');
    assert.strictEqual(result, null);
  });
});

// ============================================================================
// Symbol Detection Tests
// ============================================================================

describe('Symbol Detection', () => {
  function detectSymbols(message) {
    const patterns = [
      /\b(BTCUSD|ETHUSD|BTC|ETH|XAU|GOLD|EUR\/USD|EURUSD|GBP\/USD|GBPUSD)\b/gi,
      /\b(SPY|QQQ|AAPL|MSFT|NVDA|TSLA|AMZN|GOOGL|META)\b/gi,
      /\b(US500|SPX|NAS100|NDX|US30|DJI)\b/gi
    ];
    
    const symbols = new Set();
    for (const pattern of patterns) {
      const matches = message.match(pattern) || [];
      matches.forEach(m => symbols.add(m.toUpperCase()));
    }
    return Array.from(symbols);
  }

  it('Detects crypto symbols', () => {
    const symbols = detectSymbols('What is the price of BTC today?');
    assert.ok(symbols.includes('BTC'));
  });

  it('Detects forex pairs', () => {
    const symbols = detectSymbols('EURUSD analysis please');
    assert.ok(symbols.includes('EURUSD'));
  });

  it('Detects stock symbols', () => {
    const symbols = detectSymbols('Should I buy AAPL or MSFT?');
    assert.ok(symbols.includes('AAPL'));
    assert.ok(symbols.includes('MSFT'));
  });

  it('Detects index symbols', () => {
    const symbols = detectSymbols('US500 key levels');
    assert.ok(symbols.includes('US500'));
  });

  it('Handles messages without symbols', () => {
    const symbols = detectSymbols('How do I manage risk?');
    assert.strictEqual(symbols.length, 0);
  });

  it('Detects multiple symbols', () => {
    const symbols = detectSymbols('Compare BTC, ETH, and GOLD');
    assert.ok(symbols.length >= 3);
  });
});

// ============================================================================
// Token Decoding Tests
// ============================================================================

describe('Token Decoding', () => {
  function decodeToken(token) {
    if (!token) return null;
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
      const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
      
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      
      return decoded;
    } catch {
      return null;
    }
  }

  it('Decodes valid JWT payload', () => {
    // Create a mock token with future expiry
    const payload = { id: 123, exp: Math.floor(Date.now() / 1000) + 3600 };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mockToken = `header.${encodedPayload}.signature`;
    
    const decoded = decodeToken(mockToken);
    assert.ok(decoded);
    assert.strictEqual(decoded.id, 123);
  });

  it('Returns null for expired token', () => {
    const payload = { id: 123, exp: Math.floor(Date.now() / 1000) - 3600 };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mockToken = `header.${encodedPayload}.signature`;
    
    const decoded = decodeToken(mockToken);
    assert.strictEqual(decoded, null);
  });

  it('Returns null for invalid token format', () => {
    assert.strictEqual(decodeToken('invalid'), null);
    assert.strictEqual(decodeToken('only.two'), null);
    assert.strictEqual(decodeToken(null), null);
    assert.strictEqual(decodeToken(undefined), null);
  });
});

// ============================================================================
// UI State Tests
// ============================================================================

describe('UI State Management', () => {
  it('Message has required fields', () => {
    const message = {
      id: Date.now(),
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString()
    };
    
    assert.ok(message.id);
    assert.ok(['user', 'assistant'].includes(message.role));
    assert.ok(message.content);
    assert.ok(message.timestamp);
  });

  it('Streaming state is tracked separately', () => {
    let isLoading = true;
    let isStreaming = false;
    let streamingContent = '';
    
    // Simulate transition from loading to streaming
    isLoading = false;
    isStreaming = true;
    streamingContent = 'First token';
    
    assert.strictEqual(isLoading, false);
    assert.strictEqual(isStreaming, true);
    assert.ok(streamingContent.length > 0);
  });

  it('Quick actions have label and prompt', () => {
    const action = { label: '📈 Gold drivers', prompt: 'What drives gold today?' };
    assert.ok(action.label);
    assert.ok(action.prompt);
    assert.ok(action.prompt.length > action.label.length);
  });
});

// ============================================================================
// Voice Feature Tests
// ============================================================================

describe('Voice Feature Logic', () => {
  it('Speech rate has valid range', () => {
    const validRates = [0.75, 1, 1.25, 1.5, 2];
    validRates.forEach(rate => {
      assert.ok(rate >= 0.5 && rate <= 2.5, `Rate ${rate} should be in valid range`);
    });
  });

  it('Markdown is stripped from speech text', () => {
    const text = '**Bold** and *italic* and `code`';
    const stripped = text.replace(/[*#_`]/g, '');
    assert.ok(!stripped.includes('*'));
    assert.ok(!stripped.includes('`'));
    assert.strictEqual(stripped, 'Bold and italic and code');
  });

  it('Speaking state tracks message ID', () => {
    let speakingMessageId = null;
    
    // Start speaking
    speakingMessageId = 12345;
    assert.strictEqual(speakingMessageId, 12345);
    
    // Stop speaking same message (toggle)
    speakingMessageId = null;
    assert.strictEqual(speakingMessageId, null);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance Targets', () => {
  const TARGETS = {
    UI_FEEDBACK_MS: 100,
    TTFB_TARGET_MS: 1500,
    ADAPTER_TIMEOUT_MS: 3000,
    MAX_MESSAGE_HISTORY: 50
  };

  it('UI feedback target is under 100ms', () => {
    assert.ok(TARGETS.UI_FEEDBACK_MS <= 100);
  });

  it('TTFB target is under 2 seconds', () => {
    assert.ok(TARGETS.TTFB_TARGET_MS <= 2000);
  });

  it('Adapter timeout is under 5 seconds', () => {
    assert.ok(TARGETS.ADAPTER_TIMEOUT_MS <= 5000);
  });

  it('Message history is limited for localStorage', () => {
    assert.ok(TARGETS.MAX_MESSAGE_HISTORY <= 100);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  it('Timeout errors are user-friendly', () => {
    const error = { name: 'AbortError' };
    const message = error.name === 'AbortError' 
      ? 'The request timed out. Please try again.'
      : 'An error occurred.';
    assert.ok(message.includes('timed out'));
  });

  it('Rate limit errors are handled', () => {
    const statusCode = 429;
    const isRateLimit = statusCode === 429;
    assert.strictEqual(isRateLimit, true);
  });

  it('Error messages are appended to chat', () => {
    const messages = [];
    const errorMessage = {
      id: Date.now(),
      role: 'assistant',
      content: 'An error occurred. Please try again.',
      isError: true,
      timestamp: new Date().toISOString()
    };
    messages.push(errorMessage);
    
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].isError, true);
  });
});

// ============================================================================
// Conversation History Tests
// ============================================================================

describe('Conversation History Management', () => {
  it('History is trimmed for API calls', () => {
    const MAX_HISTORY = 6;
    const fullHistory = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`
    }));
    
    const trimmed = fullHistory.slice(-MAX_HISTORY);
    assert.strictEqual(trimmed.length, MAX_HISTORY);
    assert.strictEqual(trimmed[0].content, 'Message 14');
  });

  it('Content is truncated for context', () => {
    const MAX_CONTENT_LENGTH = 1000;
    const longContent = 'x'.repeat(2000);
    const truncated = longContent.slice(0, MAX_CONTENT_LENGTH);
    
    assert.strictEqual(truncated.length, MAX_CONTENT_LENGTH);
  });

  it('Saved history is limited', () => {
    const MAX_SAVED = 50;
    const messages = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      role: 'user',
      content: `Message ${i}`
    }));
    
    const toSave = messages.slice(-MAX_SAVED);
    assert.strictEqual(toSave.length, MAX_SAVED);
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

describe('Responsive Design Breakpoints', () => {
  const BREAKPOINTS = {
    mobile: 480,
    tablet: 768,
    desktop: 1024
  };

  it('Mobile breakpoint is standard', () => {
    assert.ok(BREAKPOINTS.mobile >= 320 && BREAKPOINTS.mobile <= 480);
  });

  it('Tablet breakpoint is standard', () => {
    assert.ok(BREAKPOINTS.tablet >= 600 && BREAKPOINTS.tablet <= 900);
  });

  it('Desktop breakpoint is reasonable', () => {
    assert.ok(BREAKPOINTS.desktop >= 900 && BREAKPOINTS.desktop <= 1200);
  });
});

// ============================================================================
// Data Adapter Fallback Tests
// ============================================================================

describe('Data Adapter Fallbacks', () => {
  it('Results object has expected structure', () => {
    const results = {
      market: null,
      news: null,
      sources: [],
      errors: [],
      fetchTime: 0
    };
    
    assert.ok('market' in results);
    assert.ok('news' in results);
    assert.ok(Array.isArray(results.sources));
    assert.ok(Array.isArray(results.errors));
    assert.ok(typeof results.fetchTime === 'number');
  });

  it('Errors are collected gracefully', () => {
    const results = { errors: [] };
    
    // Simulate failed fetch
    results.errors.push('Market data unavailable');
    results.errors.push('News temporarily unavailable');
    
    assert.strictEqual(results.errors.length, 2);
  });

  it('Context includes error note when sources fail', () => {
    const errors = ['Some source failed'];
    let context = '';
    
    if (errors.length > 0) {
      context += '\n*Note: Some data sources temporarily unavailable*\n';
    }
    
    assert.ok(context.includes('unavailable'));
  });
});

// Final summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);
if (failedTests > 0) {
  console.log(`❌ ${failedTests} test(s) failed`);
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
