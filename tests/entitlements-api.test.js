/**
 * Entitlements API Tests
 * Run: node tests/entitlements-api.test.js
 */

const { getEntitlements } = require('../api/utils/entitlements');
const { setCached, getCached, invalidateEntitlementsCache } = require('../api/cache');

let passed = 0, failed = 0;
function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); } catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message); }
}
const expect = (actual) => ({
  toBe: (expected) => { if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`); },
  toEqual: (expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
  toBeNull: () => { if (actual !== null) throw new Error(`Expected null, got ${actual}`); }
});

describe('Entitlements Logic', () => {
  it('returns tier FREE for free user', () => {
    const user = {
      id: 1,
      role: 'user',
      subscription_plan: 'free',
      subscription_status: 'active',
      subscription_expiry: null,
      payment_failed: false
    };
    const ent = getEntitlements(user);
    expect(ent.tier).toBe('FREE');
    expect(ent.canAccessAI).toBe(false);
  });

  it('returns tier PREMIUM for aura subscriber', () => {
    const user = {
      id: 2,
      role: 'user',
      subscription_plan: 'aura',
      subscription_status: 'active',
      subscription_expiry: new Date(Date.now() + 86400000),
      payment_failed: false
    };
    const ent = getEntitlements(user);
    expect(ent.tier).toBe('PREMIUM');
    expect(ent.canAccessAI).toBe(true);
  });

  it('returns tier ELITE for a7fx subscriber', () => {
    const user = {
      id: 3,
      role: 'user',
      subscription_plan: 'a7fx',
      subscription_status: 'active',
      subscription_expiry: new Date(Date.now() + 86400000),
      payment_failed: false
    };
    const ent = getEntitlements(user);
    expect(ent.tier).toBe('ELITE');
  });
});

describe('Entitlements Cache', () => {
  it('invalidateEntitlementsCache removes cached entitlements', () => {
    setCached('entitlements:999', { tier: 'FREE' }, 60000);
    expect(getCached('entitlements:999', 60000)).toEqual({ tier: 'FREE' });
    invalidateEntitlementsCache(999);
    expect(getCached('entitlements:999', 60000)).toBeNull();
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
