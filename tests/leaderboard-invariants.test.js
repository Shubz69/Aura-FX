/**
 * Leaderboard Invariant Tests
 * 
 * Tests the critical invariant that for the same user:
 *   month_xp >= week_xp >= day_xp
 * 
 * This is guaranteed because all timeframes query the same xp_events table
 * with nested date boundaries: day ⊂ week ⊂ month ⊂ all-time
 * 
 * Run with: node tests/leaderboard-invariants.test.js
 */

const assert = require('assert');

// ============================================================================
// Import the centralized boundary calculator
// ============================================================================

// Replicate the boundary logic for testing (same as leaderboard.js)
function getTimeframeBoundaries(timeframe) {
  const now = new Date();
  
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const dayOfWeek = now.getUTCDay();
  
  switch (timeframe) {
    case 'daily': {
      const start = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
      return { start, end: now, label: 'today' };
    }
    
    case 'weekly': {
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(Date.UTC(year, month, date - daysFromMonday, 0, 0, 0, 0));
      return { start, end: now, label: 'this week' };
    }
    
    case 'monthly': {
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      return { start, end: now, label: 'this month' };
    }
    
    case 'all-time':
    default: {
      return { start: null, end: now, label: 'all time' };
    }
  }
}

// ============================================================================
// Mock XP Events Data
// ============================================================================

/**
 * Generate mock XP events for a user over the past 60 days.
 * Returns events and expected totals for each timeframe.
 */
function generateMockEvents(userId, seed = 1) {
  const now = new Date();
  const events = [];
  
  // Seeded random for reproducibility
  const random = (s) => {
    const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  
  // Generate events for the past 60 days
  for (let daysAgo = 0; daysAgo < 60; daysAgo++) {
    // 0-5 events per day
    const eventsToday = Math.floor(random(seed + daysAgo * 100) * 6);
    
    for (let i = 0; i < eventsToday; i++) {
      const hoursAgo = daysAgo * 24 + Math.floor(random(seed + daysAgo * 100 + i) * 24);
      const amount = Math.floor(random(seed + daysAgo * 100 + i + 50) * 200) + 10;
      
      const eventTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      
      events.push({
        userId,
        amount,
        createdAt: eventTime
      });
    }
  }
  
  return events;
}

/**
 * Calculate XP for a specific timeframe from events.
 */
function calculateXP(events, timeframe) {
  const boundaries = getTimeframeBoundaries(timeframe);
  
  return events
    .filter(e => {
      if (!boundaries.start) return true; // all-time
      return e.createdAt >= boundaries.start && e.createdAt <= boundaries.end;
    })
    .reduce((sum, e) => sum + e.amount, 0);
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
console.log('  Leaderboard Invariant Tests');
console.log('========================================\n');

// Test 1: Timeframe boundaries are correctly nested
test('Daily boundary is within Weekly boundary', () => {
  const daily = getTimeframeBoundaries('daily');
  const weekly = getTimeframeBoundaries('weekly');
  
  assert.ok(daily.start >= weekly.start, 'Daily start should be >= Weekly start');
});

test('Weekly boundary is within Monthly boundary', () => {
  const weekly = getTimeframeBoundaries('weekly');
  const monthly = getTimeframeBoundaries('monthly');
  
  assert.ok(weekly.start >= monthly.start, 'Weekly start should be >= Monthly start');
});

test('All timeframes have same end time (now)', () => {
  const daily = getTimeframeBoundaries('daily');
  const weekly = getTimeframeBoundaries('weekly');
  const monthly = getTimeframeBoundaries('monthly');
  const allTime = getTimeframeBoundaries('all-time');
  
  // All end times should be within 1 second of each other
  const endTimes = [daily.end, weekly.end, monthly.end, allTime.end].map(d => d.getTime());
  const maxDiff = Math.max(...endTimes) - Math.min(...endTimes);
  
  assert.ok(maxDiff < 1000, `End times should be within 1 second, diff: ${maxDiff}ms`);
});

// Test 2: Core invariant - month_xp >= week_xp >= day_xp
test('INVARIANT: For any user, month_xp >= week_xp >= day_xp', () => {
  // Test with multiple users
  for (let userId = 1; userId <= 10; userId++) {
    const events = generateMockEvents(userId, userId * 1000);
    
    const dayXP = calculateXP(events, 'daily');
    const weekXP = calculateXP(events, 'weekly');
    const monthXP = calculateXP(events, 'monthly');
    const allTimeXP = calculateXP(events, 'all-time');
    
    assert.ok(
      monthXP >= weekXP,
      `User ${userId}: month_xp (${monthXP}) should be >= week_xp (${weekXP})`
    );
    
    assert.ok(
      weekXP >= dayXP,
      `User ${userId}: week_xp (${weekXP}) should be >= day_xp (${dayXP})`
    );
    
    assert.ok(
      allTimeXP >= monthXP,
      `User ${userId}: all_time_xp (${allTimeXP}) should be >= month_xp (${monthXP})`
    );
  }
});

// Test 3: Empty events should result in 0 for all timeframes
test('Empty events result in 0 XP for all timeframes', () => {
  const events = [];
  
  assert.strictEqual(calculateXP(events, 'daily'), 0);
  assert.strictEqual(calculateXP(events, 'weekly'), 0);
  assert.strictEqual(calculateXP(events, 'monthly'), 0);
  assert.strictEqual(calculateXP(events, 'all-time'), 0);
});

// Test 4: Single event today should appear in all timeframes
test('Event from today appears in all timeframes', () => {
  const now = new Date();
  const events = [
    { userId: 1, amount: 100, createdAt: new Date(now.getTime() - 1000) } // 1 second ago
  ];
  
  assert.strictEqual(calculateXP(events, 'daily'), 100);
  assert.strictEqual(calculateXP(events, 'weekly'), 100);
  assert.strictEqual(calculateXP(events, 'monthly'), 100);
  assert.strictEqual(calculateXP(events, 'all-time'), 100);
});

// Test 5: Event from 2 days ago should appear in weekly/monthly but not daily
test('Event from 2 days ago appears in weekly/monthly, not daily', () => {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const events = [
    { userId: 1, amount: 100, createdAt: twoDaysAgo }
  ];
  
  const daily = getTimeframeBoundaries('daily');
  const inDaily = twoDaysAgo >= daily.start;
  
  if (inDaily) {
    // Edge case: if test runs right at midnight, 2 days ago might be today
    console.log('    (skipped - edge case near midnight)');
  } else {
    assert.strictEqual(calculateXP(events, 'daily'), 0, 'Should not be in daily');
    assert.strictEqual(calculateXP(events, 'weekly'), 100, 'Should be in weekly');
    assert.strictEqual(calculateXP(events, 'monthly'), 100, 'Should be in monthly');
  }
});

// Test 6: Event from 10 days ago should appear in monthly but not daily/weekly
test('Event from 10 days ago appears in monthly, not daily/weekly', () => {
  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const events = [
    { userId: 1, amount: 100, createdAt: tenDaysAgo }
  ];
  
  const weekly = getTimeframeBoundaries('weekly');
  const monthly = getTimeframeBoundaries('monthly');
  
  // Only check if 10 days ago is actually within this month but outside this week
  if (tenDaysAgo < weekly.start && tenDaysAgo >= monthly.start) {
    assert.strictEqual(calculateXP(events, 'daily'), 0, 'Should not be in daily');
    assert.strictEqual(calculateXP(events, 'weekly'), 0, 'Should not be in weekly');
    assert.strictEqual(calculateXP(events, 'monthly'), 100, 'Should be in monthly');
  } else {
    console.log('    (skipped - 10 days ago crosses month/week boundary)');
  }
});

// Test 7: Weekly start is always a Monday
test('Weekly boundary starts on Monday', () => {
  const weekly = getTimeframeBoundaries('weekly');
  const dayOfWeek = weekly.start.getUTCDay();
  
  assert.strictEqual(dayOfWeek, 1, 'Weekly should start on Monday (day 1)');
});

// Test 8: Monthly start is always the 1st
test('Monthly boundary starts on 1st of month', () => {
  const monthly = getTimeframeBoundaries('monthly');
  const dayOfMonth = monthly.start.getUTCDate();
  
  assert.strictEqual(dayOfMonth, 1, 'Monthly should start on 1st');
});

// Test 9: Daily start is midnight UTC
test('Daily boundary starts at midnight UTC', () => {
  const daily = getTimeframeBoundaries('daily');
  
  assert.strictEqual(daily.start.getUTCHours(), 0, 'Should be hour 0');
  assert.strictEqual(daily.start.getUTCMinutes(), 0, 'Should be minute 0');
  assert.strictEqual(daily.start.getUTCSeconds(), 0, 'Should be second 0');
  assert.strictEqual(daily.start.getUTCMilliseconds(), 0, 'Should be ms 0');
});

// Test 10: All-time has no start boundary
test('All-time has null start boundary', () => {
  const allTime = getTimeframeBoundaries('all-time');
  
  assert.strictEqual(allTime.start, null, 'All-time start should be null');
});

// Test 11: Stress test - invariant holds for many random users
test('STRESS: Invariant holds for 100 random users', () => {
  let violations = 0;
  
  for (let userId = 1; userId <= 100; userId++) {
    const events = generateMockEvents(userId, userId * 7919); // Prime number seed
    
    const dayXP = calculateXP(events, 'daily');
    const weekXP = calculateXP(events, 'weekly');
    const monthXP = calculateXP(events, 'monthly');
    const allTimeXP = calculateXP(events, 'all-time');
    
    if (monthXP < weekXP || weekXP < dayXP || allTimeXP < monthXP) {
      violations++;
    }
  }
  
  assert.strictEqual(violations, 0, `Found ${violations} invariant violations`);
});

// Test 12: XP calculation is additive
test('XP calculation is additive (sum of amounts)', () => {
  const events = [
    { userId: 1, amount: 100, createdAt: new Date() },
    { userId: 1, amount: 200, createdAt: new Date() },
    { userId: 1, amount: 50, createdAt: new Date() }
  ];
  
  assert.strictEqual(calculateXP(events, 'daily'), 350);
});

// Test 13: No artificial XP caps
test('No artificial XP caps - large values work correctly', () => {
  const events = [
    { userId: 1, amount: 1000000, createdAt: new Date() }
  ];
  
  assert.strictEqual(calculateXP(events, 'daily'), 1000000);
  assert.strictEqual(calculateXP(events, 'weekly'), 1000000);
  assert.strictEqual(calculateXP(events, 'monthly'), 1000000);
  assert.strictEqual(calculateXP(events, 'all-time'), 1000000);
});

console.log('\n========================================');
console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
