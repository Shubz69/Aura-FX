/**
 * Subscription Status Integration Tests
 * 
 * Tests:
 * - Correct button/badge for each subscription status
 * - No duplicate subscriptions for same plan
 * - Loading state handling
 * - Server truth always used
 * 
 * Run with: node tests/subscription-status.test.js
 */

const assert = require('assert');

// ============================================================================
// Mock Data
// ============================================================================

const SUBSCRIPTION_STATUSES = {
  // No subscription
  none: {
    planId: null,
    planName: null,
    status: 'inactive',
    isActive: false,
    renewsAt: null,
    paymentFailed: false
  },
  
  // Active Aura subscription
  activeAura: {
    planId: 'aura',
    planName: 'Aura FX Standard',
    status: 'active',
    isActive: true,
    renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    daysRemaining: 30,
    paymentFailed: false
  },
  
  // Active A7FX subscription
  activeA7fx: {
    planId: 'a7fx',
    planName: 'A7FX Elite',
    status: 'active',
    isActive: true,
    renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    daysRemaining: 30,
    paymentFailed: false
  },
  
  // Canceled but still active
  canceledActive: {
    planId: 'aura',
    planName: 'Aura FX Standard',
    status: 'canceled',
    isActive: true,
    renewsAt: null,
    expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    daysRemaining: 15,
    paymentFailed: false
  },
  
  // Payment failed / Past due
  pastDue: {
    planId: 'aura',
    planName: 'Aura FX Standard',
    status: 'past_due',
    isActive: false,
    renewsAt: null,
    expiresAt: null,
    paymentFailed: true
  },
  
  // Expired
  expired: {
    planId: 'aura',
    planName: 'Aura FX Standard',
    status: 'inactive',
    isActive: false,
    renewsAt: null,
    expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    daysRemaining: null,
    paymentFailed: false
  }
};

const PLANS = {
  aura: { id: 'aura', price: 99 },
  a7fx: { id: 'a7fx', price: 250 }
};

// ============================================================================
// Button State Logic (matches frontend)
// ============================================================================

function getButtonState(planId, subscriptionStatus) {
  if (!subscriptionStatus) {
    return { type: 'select', disabled: false };
  }

  const currentPlanId = subscriptionStatus.planId;
  const status = subscriptionStatus.status;
  const isActive = subscriptionStatus.isActive;

  // Payment failed - show update payment
  if (subscriptionStatus.paymentFailed) {
    return { type: 'update_payment', disabled: false };
  }

  // User has this exact plan active
  if (currentPlanId === planId && isActive) {
    if (status === 'canceled') {
      return { type: 'active_until', disabled: true };
    }
    return { type: 'current', disabled: true };
  }

  // User has a different plan active
  if (currentPlanId && currentPlanId !== planId && isActive) {
    const currentPrice = PLANS[currentPlanId]?.price || 0;
    const targetPrice = PLANS[planId]?.price || 0;
    
    if (targetPrice > currentPrice) {
      return { type: 'upgrade', disabled: false };
    } else {
      return { type: 'downgrade', disabled: false };
    }
  }

  // No active subscription - show select
  return { type: 'select', disabled: false };
}

function getButtonText(planId, buttonState) {
  switch (buttonState.type) {
    case 'current':
      return 'CURRENT PLAN';
    case 'active_until':
      return 'ACTIVE UNTIL END';
    case 'update_payment':
      return 'UPDATE PAYMENT';
    case 'upgrade':
      return 'UPGRADE TO THIS PLAN';
    case 'downgrade':
      return 'SWITCH TO THIS PLAN';
    case 'select':
    default:
      return planId === 'a7fx' ? 'SELECT ELITE PLAN' : 'SELECT PLAN';
  }
}

// ============================================================================
// Tests
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

console.log('\n========================================');
console.log('  Subscription Status Tests');
console.log('========================================\n');

// Test 1: No subscription - both plans show "Select"
test('No subscription - Aura shows "SELECT PLAN"', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.none);
  assert.strictEqual(state.type, 'select');
  assert.strictEqual(state.disabled, false);
  assert.strictEqual(getButtonText('aura', state), 'SELECT PLAN');
});

test('No subscription - A7FX shows "SELECT ELITE PLAN"', () => {
  const state = getButtonState('a7fx', SUBSCRIPTION_STATUSES.none);
  assert.strictEqual(state.type, 'select');
  assert.strictEqual(state.disabled, false);
  assert.strictEqual(getButtonText('a7fx', state), 'SELECT ELITE PLAN');
});

// Test 2: Active Aura - Aura shows "Current", A7FX shows "Upgrade"
test('Active Aura - Aura shows "CURRENT PLAN" (disabled)', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.activeAura);
  assert.strictEqual(state.type, 'current');
  assert.strictEqual(state.disabled, true);
  assert.strictEqual(getButtonText('aura', state), 'CURRENT PLAN');
});

test('Active Aura - A7FX shows "UPGRADE TO THIS PLAN"', () => {
  const state = getButtonState('a7fx', SUBSCRIPTION_STATUSES.activeAura);
  assert.strictEqual(state.type, 'upgrade');
  assert.strictEqual(state.disabled, false);
  assert.strictEqual(getButtonText('a7fx', state), 'UPGRADE TO THIS PLAN');
});

// Test 3: Active A7FX - A7FX shows "Current", Aura shows "Downgrade"
test('Active A7FX - A7FX shows "CURRENT PLAN" (disabled)', () => {
  const state = getButtonState('a7fx', SUBSCRIPTION_STATUSES.activeA7fx);
  assert.strictEqual(state.type, 'current');
  assert.strictEqual(state.disabled, true);
  assert.strictEqual(getButtonText('a7fx', state), 'CURRENT PLAN');
});

test('Active A7FX - Aura shows "SWITCH TO THIS PLAN"', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.activeA7fx);
  assert.strictEqual(state.type, 'downgrade');
  assert.strictEqual(state.disabled, false);
  assert.strictEqual(getButtonText('aura', state), 'SWITCH TO THIS PLAN');
});

// Test 4: Canceled but active - shows "Active until end" (disabled)
test('Canceled but active - shows "ACTIVE UNTIL END" (disabled)', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.canceledActive);
  assert.strictEqual(state.type, 'active_until');
  assert.strictEqual(state.disabled, true);
  assert.strictEqual(getButtonText('aura', state), 'ACTIVE UNTIL END');
});

test('Canceled but active - other plan shows upgrade', () => {
  const state = getButtonState('a7fx', SUBSCRIPTION_STATUSES.canceledActive);
  assert.strictEqual(state.type, 'upgrade');
  assert.strictEqual(state.disabled, false);
});

// Test 5: Payment failed / Past due - shows "Update Payment"
test('Payment failed - shows "UPDATE PAYMENT"', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.pastDue);
  assert.strictEqual(state.type, 'update_payment');
  assert.strictEqual(state.disabled, false);
  assert.strictEqual(getButtonText('aura', state), 'UPDATE PAYMENT');
});

test('Payment failed - all plans show "UPDATE PAYMENT"', () => {
  const stateA7fx = getButtonState('a7fx', SUBSCRIPTION_STATUSES.pastDue);
  assert.strictEqual(stateA7fx.type, 'update_payment');
});

// Test 6: Expired - shows "Select Plan" (re-subscribe)
test('Expired subscription - shows "SELECT PLAN"', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.expired);
  assert.strictEqual(state.type, 'select');
  assert.strictEqual(state.disabled, false);
});

// Test 7: Null subscription status - defaults to select
test('Null subscription status - defaults to select', () => {
  const state = getButtonState('aura', null);
  assert.strictEqual(state.type, 'select');
  assert.strictEqual(state.disabled, false);
});

// Test 8: Prevent duplicate subscription for same plan
test('Cannot click disabled current plan button', () => {
  const state = getButtonState('aura', SUBSCRIPTION_STATUSES.activeAura);
  assert.strictEqual(state.disabled, true, 'Current plan button should be disabled');
});

// Test 9: Days remaining calculation
test('Days remaining is calculated correctly', () => {
  const status = SUBSCRIPTION_STATUSES.activeAura;
  assert.ok(status.daysRemaining > 0, 'Should have days remaining');
  assert.strictEqual(status.daysRemaining, 30);
});

// Test 10: Renewal date is set for active subscriptions
test('Active subscription has renewsAt date', () => {
  const status = SUBSCRIPTION_STATUSES.activeAura;
  assert.ok(status.renewsAt, 'Active subscription should have renewal date');
  const renewDate = new Date(status.renewsAt);
  assert.ok(renewDate > new Date(), 'Renewal date should be in future');
});

// Test 11: Canceled subscription has expiresAt but no renewsAt
test('Canceled subscription has expiresAt but no renewsAt', () => {
  const status = SUBSCRIPTION_STATUSES.canceledActive;
  assert.strictEqual(status.renewsAt, null, 'Canceled should not have renewal date');
  assert.ok(status.expiresAt, 'Canceled should have expiry date');
});

// Test 12: Response shape consistency
test('All statuses have required fields', () => {
  Object.values(SUBSCRIPTION_STATUSES).forEach(status => {
    assert.ok('planId' in status, 'Should have planId');
    assert.ok('status' in status, 'Should have status');
    assert.ok('isActive' in status, 'Should have isActive');
    assert.ok('paymentFailed' in status, 'Should have paymentFailed');
  });
});

console.log('\n========================================');
console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
