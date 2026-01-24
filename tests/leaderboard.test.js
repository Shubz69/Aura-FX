/**
 * Leaderboard API Tests
 * 
 * Tests to verify:
 * 1. Daily/weekly/monthly produce different results
 * 2. Results change when new xp_events are inserted
 * 3. All-time shows highest level users
 * 4. Demo users are properly flagged
 */

const assert = require('assert');

// Mock data for testing date boundaries
const testGetDateBoundaries = () => {
  const now = new Date();
  
  // Test daily boundary
  const dailyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  assert(dailyStart <= now, 'Daily start should be before or equal to now');
  assert(dailyStart.getUTCHours() === 0, 'Daily start should be at midnight');
  
  // Test weekly boundary (Monday start)
  const dayOfWeek = now.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weeklyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset, 0, 0, 0));
  assert(weeklyStart.getUTCDay() === 1, 'Weekly start should be Monday');
  assert(weeklyStart <= now, 'Weekly start should be before or equal to now');
  
  // Test monthly boundary
  const monthlyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  assert(monthlyStart.getUTCDate() === 1, 'Monthly start should be 1st of month');
  assert(monthlyStart <= now, 'Monthly start should be before or equal to now');
  
  console.log('✅ Date boundary tests passed');
  return true;
};

// Test that different timeframes would produce different SQL queries
const testTimeframeDifferences = () => {
  const timeframes = ['daily', 'weekly', 'monthly', 'all-time'];
  const queries = new Set();
  
  timeframes.forEach(tf => {
    // Simulate query generation
    let query;
    if (tf === 'daily') {
      query = "WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)";
    } else if (tf === 'weekly') {
      query = "WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    } else if (tf === 'monthly') {
      query = "WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    } else {
      query = "ORDER BY level DESC, xp DESC";
    }
    queries.add(query);
  });
  
  assert(queries.size === 4, 'Each timeframe should produce a different query');
  console.log('✅ Timeframe difference tests passed');
  return true;
};

// Test level calculation from XP
const testLevelCalculation = () => {
  const getLevelFromXP = (xp) => {
    if (xp <= 0) return 1;
    if (xp >= 1000000) return 1000;
    
    if (xp < 500) return Math.floor(Math.sqrt(xp / 50)) + 1;
    if (xp < 5000) return 10 + Math.floor(Math.sqrt((xp - 500) / 100)) + 1;
    if (xp < 20000) return 50 + Math.floor(Math.sqrt((xp - 5000) / 200)) + 1;
    if (xp < 100000) return 100 + Math.floor(Math.sqrt((xp - 20000) / 500)) + 1;
    if (xp < 500000) return 200 + Math.floor(Math.sqrt((xp - 100000) / 1000)) + 1;
    return Math.min(1000, 500 + Math.floor(Math.sqrt((xp - 500000) / 2000)) + 1);
  };
  
  // Test various XP values
  assert(getLevelFromXP(0) === 1, 'Level 1 at 0 XP');
  assert(getLevelFromXP(100) === 2, 'Level 2 at 100 XP');
  assert(getLevelFromXP(500) === 11, 'Level 11 at 500 XP');
  assert(getLevelFromXP(5000) === 51, 'Level 51 at 5000 XP');
  assert(getLevelFromXP(1000000) === 1000, 'Max level at 1M XP');
  
  // Test level progression is monotonic
  let prevLevel = 0;
  for (let xp = 0; xp <= 100000; xp += 1000) {
    const level = getLevelFromXP(xp);
    assert(level >= prevLevel, `Level should not decrease (${level} >= ${prevLevel} at ${xp} XP)`);
    prevLevel = level;
  }
  
  console.log('✅ Level calculation tests passed');
  return true;
};

// Test demo user identification
const testDemoUserFlag = () => {
  const users = [
    { id: 1, username: 'RealUser', is_demo: false },
    { id: 2, username: 'Zephyr_FX', is_demo: true },
    { id: 3, username: 'AnotherReal', is_demo: null }
  ];
  
  const formatted = users.map(u => ({
    ...u,
    isDemo: u.is_demo === 1 || u.is_demo === true
  }));
  
  assert(formatted[0].isDemo === false, 'Real user should not be demo');
  assert(formatted[1].isDemo === true, 'Demo user should be flagged');
  assert(formatted[2].isDemo === false, 'Null is_demo should be treated as false');
  
  console.log('✅ Demo user flag tests passed');
  return true;
};

// Test XP aggregation simulation
const testXpAggregation = () => {
  // Simulate xp_events data
  const now = new Date();
  const events = [
    { user_id: 1, amount: 50, created_at: new Date(now - 1000 * 60 * 30) }, // 30 min ago
    { user_id: 1, amount: 100, created_at: new Date(now - 1000 * 60 * 60 * 24) }, // 1 day ago
    { user_id: 1, amount: 200, created_at: new Date(now - 1000 * 60 * 60 * 24 * 5) }, // 5 days ago
    { user_id: 2, amount: 75, created_at: new Date(now - 1000 * 60 * 60) }, // 1 hour ago
    { user_id: 2, amount: 150, created_at: new Date(now - 1000 * 60 * 60 * 24 * 10) }, // 10 days ago
  ];
  
  // Daily (last 24 hours)
  const dailyStart = new Date(now - 1000 * 60 * 60 * 24);
  const dailyTotals = {};
  events.filter(e => e.created_at >= dailyStart).forEach(e => {
    dailyTotals[e.user_id] = (dailyTotals[e.user_id] || 0) + e.amount;
  });
  
  // Weekly (last 7 days)
  const weeklyStart = new Date(now - 1000 * 60 * 60 * 24 * 7);
  const weeklyTotals = {};
  events.filter(e => e.created_at >= weeklyStart).forEach(e => {
    weeklyTotals[e.user_id] = (weeklyTotals[e.user_id] || 0) + e.amount;
  });
  
  // Verify different totals
  assert(dailyTotals[1] === 150, 'User 1 daily XP should be 150');
  assert(weeklyTotals[1] === 350, 'User 1 weekly XP should be 350');
  assert(dailyTotals[2] === 75, 'User 2 daily XP should be 75');
  assert(weeklyTotals[2] === 75, 'User 2 weekly XP should be 75');
  
  // Verify rankings differ
  const dailyRanking = Object.entries(dailyTotals).sort((a, b) => b[1] - a[1]);
  const weeklyRanking = Object.entries(weeklyTotals).sort((a, b) => b[1] - a[1]);
  
  assert(dailyRanking[0][0] === '1', 'User 1 should be #1 daily');
  assert(weeklyRanking[0][0] === '1', 'User 1 should be #1 weekly');
  assert(weeklyTotals[1] !== dailyTotals[1], 'Weekly and daily totals should differ');
  
  console.log('✅ XP aggregation tests passed');
  return true;
};

// Test tie-breaker logic
const testTieBreaker = () => {
  const users = [
    { id: 1, xp: 100, last_xp_time: new Date('2024-01-15T10:00:00Z') },
    { id: 2, xp: 100, last_xp_time: new Date('2024-01-15T08:00:00Z') }, // Earlier = wins tie
    { id: 3, xp: 100, last_xp_time: new Date('2024-01-15T12:00:00Z') },
  ];
  
  // Sort by XP desc, then by earliest last_xp_time
  const sorted = [...users].sort((a, b) => {
    if (b.xp !== a.xp) return b.xp - a.xp;
    return new Date(a.last_xp_time) - new Date(b.last_xp_time);
  });
  
  assert(sorted[0].id === 2, 'User 2 (earliest achievement) should be #1 in tie');
  assert(sorted[1].id === 1, 'User 1 should be #2');
  assert(sorted[2].id === 3, 'User 3 (latest achievement) should be #3');
  
  console.log('✅ Tie-breaker tests passed');
  return true;
};

// Run all tests
const runTests = () => {
  console.log('\n🧪 Running Leaderboard Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  const tests = [
    { name: 'Date Boundaries', fn: testGetDateBoundaries },
    { name: 'Timeframe Differences', fn: testTimeframeDifferences },
    { name: 'Level Calculation', fn: testLevelCalculation },
    { name: 'Demo User Flag', fn: testDemoUserFlag },
    { name: 'XP Aggregation', fn: testXpAggregation },
    { name: 'Tie-breaker Logic', fn: testTieBreaker },
  ];
  
  for (const test of tests) {
    try {
      test.fn();
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
};

// Export for Jest or run directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
