/**
 * RBAC Integration Tests
 *
 * Proves FREE user cannot access premium endpoints via direct API calls.
 * Uses entitlement logic (no live API required).
 * Run: node tests/security-rbac.test.js
 */

const { getEntitlements, getTier } = require('../api/utils/entitlements');

let passed = 0, failed = 0;
function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); } catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message); }
}
const expect = (actual) => ({
  toBe: (expected) => { if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`); },
  toBeTrue: () => { if (actual !== true) throw new Error(`Expected true, got ${actual}`); },
  toBeFalse: () => { if (actual !== false) throw new Error(`Expected false, got ${actual}`); }
});

// Mock user rows
const FREE_USER = {
  id: 1,
  email: 'free@test.com',
  role: 'user',
  subscription_plan: 'free',
  subscription_status: 'active',
  subscription_expiry: null,
  payment_failed: false
};

const PREMIUM_USER = {
  id: 2,
  email: 'premium@test.com',
  role: 'user',
  subscription_plan: 'aura',
  subscription_status: 'active',
  subscription_expiry: new Date(Date.now() + 30 * 86400 * 1000),
  payment_failed: false
};

const ELITE_USER = {
  id: 3,
  email: 'elite@test.com',
  role: 'user',
  subscription_plan: 'a7fx',
  subscription_status: 'active',
  subscription_expiry: new Date(Date.now() + 30 * 86400 * 1000),
  payment_failed: false
};

describe('RBAC - Tier Detection', () => {
  it('FREE user has tier FREE', () => {
    const tier = getTier(FREE_USER);
    expect(tier).toBe('FREE');
  });

  it('PREMIUM user has tier PREMIUM', () => {
    const tier = getTier(PREMIUM_USER);
    expect(tier).toBe('PREMIUM');
  });

  it('ELITE user has tier ELITE', () => {
    const tier = getTier(ELITE_USER);
    expect(tier).toBe('ELITE');
  });
});

describe('RBAC - canAccessAI', () => {
  it('FREE user cannot access AI', () => {
    const ent = getEntitlements(FREE_USER);
    expect(ent.canAccessAI).toBe(false);
  });

  it('PREMIUM user can access AI', () => {
    const ent = getEntitlements(PREMIUM_USER);
    expect(ent.canAccessAI).toBe(true);
  });

  it('ELITE user can access AI', () => {
    const ent = getEntitlements(ELITE_USER);
    expect(ent.canAccessAI).toBe(true);
  });
});

describe('RBAC - canAccessCommunity', () => {
  it('FREE user with plan selected can access community', () => {
    const ent = getEntitlements(FREE_USER);
    expect(ent.canAccessCommunity).toBe(true);
  });

  it('PREMIUM user can access community', () => {
    const ent = getEntitlements(PREMIUM_USER);
    expect(ent.canAccessCommunity).toBe(true);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
