/**
 * Rate Limit Tests
 * Run: node tests/rate-limit.test.js
 */

const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../api/utils/rate-limiter');

let passed = 0, failed = 0;
function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); } catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message); }
}

const expect = (actual) => ({
  toBe: (expected) => { if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`); },
  toBeLessThanOrEqual: (n) => { if (actual > n) throw new Error(`Expected <= ${n}, got ${actual}`); },
  toBeGreaterThan: (n) => { if (actual <= n) throw new Error(`Expected > ${n}, got ${actual}`); },
  toBeDefined: () => { if (actual === undefined) throw new Error('Expected defined'); }
});

describe('Rate Limiter', () => {
  const key = 'test:rate-limit-' + Date.now();
  const max = 3;
  const window = 60000;

  it('allows requests under limit', () => {
    expect(checkRateLimit(key, max, window)).toBe(true);
    expect(checkRateLimit(key, max, window)).toBe(true);
    expect(checkRateLimit(key, max, window)).toBe(true);
  });

  it('blocks requests over limit', () => {
    // Already 3 from above
    expect(checkRateLimit(key, max, window)).toBe(false);
  });
});

describe('Rate Limit Configs', () => {
  it('STRICT config exists for auth endpoints', () => {
    expect(RATE_LIMIT_CONFIGS.STRICT).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.STRICT.requests).toBeLessThanOrEqual(10);
    expect(RATE_LIMIT_CONFIGS.STRICT.windowMs).toBeGreaterThan(0);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
