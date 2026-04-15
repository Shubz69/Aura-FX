/**
 * RBAC Integration Tests
 *
 * Proves FREE user cannot access premium endpoints via direct API calls.
 * Uses entitlement logic (no live API required).
 * Run: node tests/security-rbac.test.js
 */

const { getEntitlements, getTier, ENTITLEMENT_TIER } = require('../api/utils/entitlements');

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

/** Elite with Stripe/admin row missing expiry — still entitled when status is active */
const ELITE_USER_ACTIVE_NO_EXPIRY = {
  id: 30,
  email: 'elite-no-expiry@test.com',
  role: 'user',
  subscription_plan: 'elite',
  subscription_status: 'active',
  subscription_expiry: null,
  payment_failed: false
};

const ADMIN_USER = {
  id: 4,
  email: 'admin@test.com',
  role: 'ADMIN',
  subscription_plan: '',
  subscription_status: 'inactive',
  subscription_expiry: null,
  payment_failed: false
};

const SUPER_ADMIN_USER = {
  id: 5,
  email: 'super@test.com',
  role: 'super_admin',
  subscription_plan: 'free',
  subscription_status: 'inactive',
  subscription_expiry: null,
  payment_failed: false
};

/** Matches api/utils/entitlements SUPER_ADMIN_EMAIL_FALLBACK_LOWER — DB role USER, staff by email list */
const SUPER_ADMIN_BY_EMAIL_ROW = {
  id: 6,
  email: 'slutherfx@gmail.com',
  role: 'user',
  subscription_plan: 'free',
  subscription_status: 'inactive',
  subscription_expiry: null,
  payment_failed: false
};

describe('RBAC - Tier Detection', () => {
  it('Access user has tier ACCESS', () => {
    const tier = getTier(FREE_USER);
    expect(tier).toBe(ENTITLEMENT_TIER.ACCESS);
  });

  it('Pro (aura) user has tier PRO', () => {
    const tier = getTier(PREMIUM_USER);
    expect(tier).toBe(ENTITLEMENT_TIER.PRO);
  });

  it('Legacy a7fx subscription plan maps to tier ELITE', () => {
    const tier = getTier(ELITE_USER);
    expect(tier).toBe(ENTITLEMENT_TIER.ELITE);
  });

  it('Elite plan active with null expiry maps to tier ELITE', () => {
    const tier = getTier(ELITE_USER_ACTIVE_NO_EXPIRY);
    expect(tier).toBe(ENTITLEMENT_TIER.ELITE);
  });
});

describe('RBAC - canAccessAI', () => {
  it('Access user cannot access AI', () => {
    const ent = getEntitlements(FREE_USER);
    expect(ent.canAccessAI).toBe(false);
  });

  it('Pro user can access AI', () => {
    const ent = getEntitlements(PREMIUM_USER);
    expect(ent.canAccessAI).toBe(true);
  });

  it('ELITE user can access AI', () => {
    const ent = getEntitlements(ELITE_USER);
    expect(ent.canAccessAI).toBe(true);
  });

  it('ELITE user with active status and null expiry can access AI', () => {
    const ent = getEntitlements(ELITE_USER_ACTIVE_NO_EXPIRY);
    expect(ent.canAccessAI).toBe(true);
  });
});

describe('RBAC - canAccessSurveillance', () => {
  it('Access user cannot access Surveillance', () => {
    const ent = getEntitlements(FREE_USER);
    expect(ent.canAccessSurveillance).toBe(false);
  });

  it('Pro user cannot access Surveillance', () => {
    const ent = getEntitlements(PREMIUM_USER);
    expect(ent.canAccessSurveillance).toBe(false);
  });

  it('Elite user can access Surveillance', () => {
    const ent = getEntitlements(ELITE_USER);
    expect(ent.canAccessSurveillance).toBe(true);
  });

  it('Elite user with active status and null subscription_expiry can access Surveillance', () => {
    const ent = getEntitlements(ELITE_USER_ACTIVE_NO_EXPIRY);
    expect(ent.canAccessSurveillance).toBe(true);
  });

  it('Admin user can access Surveillance', () => {
    const ent = getEntitlements(ADMIN_USER);
    expect(ent.canAccessSurveillance).toBe(true);
  });

  it('Super Admin user can access Surveillance', () => {
    const ent = getEntitlements(SUPER_ADMIN_USER);
    expect(ent.canAccessSurveillance).toBe(true);
  });

  it('Env-listed super-admin email with USER DB role can access Surveillance', () => {
    const ent = getEntitlements(SUPER_ADMIN_BY_EMAIL_ROW);
    expect(ent.canAccessSurveillance).toBe(true);
  });
});

describe('RBAC - canAccessCommunity', () => {
  it('Access user with plan selected can access community', () => {
    const ent = getEntitlements(FREE_USER);
    expect(ent.canAccessCommunity).toBe(true);
  });

  it('Pro user can access community', () => {
    const ent = getEntitlements(PREMIUM_USER);
    expect(ent.canAccessCommunity).toBe(true);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
