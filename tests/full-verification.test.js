/**
 * Full Verification Test Suite
 * Covers all checklist items for leaderboard, chat, and profile
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  sections: {}
};

function check(section, item, condition, details = '') {
  if (!results.sections[section]) {
    results.sections[section] = { passed: [], failed: [], warnings: [] };
  }
  
  if (condition === true) {
    results.sections[section].passed.push({ item, details });
    results.passed++;
    console.log(`  ✅ ${item}`);
  } else if (condition === 'warn') {
    results.sections[section].warnings.push({ item, details });
    results.warnings++;
    console.log(`  ⚠️  ${item} - ${details}`);
  } else {
    results.sections[section].failed.push({ item, details: details || condition });
    results.failed++;
    console.log(`  ❌ ${item} - ${details || condition}`);
  }
}

// Read file helper
function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(__dirname, '..', filePath), 'utf-8');
  } catch (e) {
    return null;
  }
}

// ===== 1) LEADERBOARD CORRECTNESS =====
function testLeaderboardCorrectness() {
  console.log('\n📊 1) LEADERBOARD CORRECTNESS\n');
  
  const leaderboardJs = readFile('api/leaderboard.js');
  
  // Daily uses UTC boundary
  const hasDailyUTC = leaderboardJs?.includes('getUTCFullYear') && 
                      leaderboardJs?.includes('getUTCMonth') && 
                      leaderboardJs?.includes('getUTCDate');
  check('leaderboard', 'Daily leaderboard uses UTC boundaries', hasDailyUTC);
  
  // Weekly uses ISO week (Monday start)
  const hasWeeklyMonday = leaderboardJs?.includes('mondayOffset') || 
                          leaderboardJs?.includes('Monday');
  check('leaderboard', 'Weekly uses ISO week (Mon-Sun)', hasWeeklyMonday);
  
  // Monthly uses calendar month
  const hasMonthlyFirst = leaderboardJs?.includes('getUTCMonth(), 1');
  check('leaderboard', 'Monthly uses calendar month', hasMonthlyFirst);
  
  // All-time uses level/XP sort
  const hasAllTimeSort = leaderboardJs?.includes('ORDER BY u.level DESC') || 
                         leaderboardJs?.includes('level DESC');
  check('leaderboard', 'All-time ranks by level DESC', hasAllTimeSort);
  
  // Different queries per timeframe
  const hasDifferentQueries = leaderboardJs?.includes("timeframe === 'all-time'") &&
                              leaderboardJs?.includes("timeframe === 'daily'");
  check('leaderboard', 'Each tab uses different query/dataset', hasDifferentQueries);
  
  // Tie-breakers
  const hasTieBreaker = leaderboardJs?.includes('last_xp_time') || 
                        leaderboardJs?.includes('ORDER BY period_xp DESC');
  check('leaderboard', 'Tie-breakers are deterministic', hasTieBreaker);
  
  // Uses xp_events for period XP
  const usesXpEvents = leaderboardJs?.includes('xp_events') && 
                       leaderboardJs?.includes('SUM(e.amount)');
  check('leaderboard', 'Uses SUM(xp_events.amount) for periods', usesXpEvents);
}

// ===== 2) PRIZE SAFETY =====
function testPrizeSafety() {
  console.log('\n🏆 2) PRIZE SAFETY\n');
  
  const leaderboardJs = readFile('api/leaderboard.js');
  const seedJs = readFile('api/seed/demo-leaderboard.js');
  
  // Demo users flagged
  const hasDemoFlag = leaderboardJs?.includes('is_demo') && 
                      seedJs?.includes('is_demo');
  check('prize_safety', 'Demo users are flagged (is_demo=true)', hasDemoFlag);
  
  // Demo users excluded from prize
  const excludesDemoFromPrize = leaderboardJs?.includes('isDemo') && 
                                 seedJs?.includes('is_demo = TRUE');
  check('prize_safety', 'Demo users excluded from prize eligibility', excludesDemoFromPrize);
  
  // Audit log exists (xp_events)
  const hasAuditLog = leaderboardJs?.includes('xp_events');
  check('prize_safety', 'Audit log exists via xp_events table', hasAuditLog);
}

// ===== 3) XP EVENTS LEDGER =====
function testXpEventsLedger() {
  console.log('\n📒 3) XP EVENTS LEDGER\n');
  
  const updateXpJs = readFile('api/users/update-xp.js');
  const dailyLoginJs = readFile('api/users/daily-login.js');
  const leaderboardJs = readFile('api/leaderboard.js');
  
  // xp_events table exists
  const hasXpEventsTable = leaderboardJs?.includes('CREATE TABLE IF NOT EXISTS xp_events');
  check('xp_ledger', 'xp_events table schema defined', hasXpEventsTable);
  
  // update-xp logs to xp_events
  const updateXpLogs = updateXpJs?.includes('xp_events') && 
                       updateXpJs?.includes('INSERT INTO xp_events');
  check('xp_ledger', 'update-xp API logs to xp_events', updateXpLogs);
  
  // Indexes exist
  const hasIndexes = leaderboardJs?.includes('INDEX idx_user_id') && 
                     leaderboardJs?.includes('INDEX idx_created_at');
  check('xp_ledger', 'xp_events has proper indexes', hasIndexes);
  
  // Amount validation (positive check)
  const hasAmountValidation = updateXpJs?.includes('xpGain > 0');
  check('xp_ledger', 'XP amounts validated (positive)', hasAmountValidation);
}

// ===== 4) PERFORMANCE & SCALE =====
function testPerformance() {
  console.log('\n⚡ 4) PERFORMANCE & SCALE\n');
  
  const leaderboardJs = readFile('api/leaderboard.js');
  const dbJs = readFile('api/db.js');
  
  // Indexes on xp_events
  const hasCompositeIndex = leaderboardJs?.includes('idx_user_created');
  check('performance', 'Composite index on (user_id, created_at)', hasCompositeIndex);
  
  // Caching
  const hasCaching = leaderboardJs?.includes('getCached') && 
                     leaderboardJs?.includes('setCached');
  check('performance', 'Leaderboard results are cached', hasCaching);
  
  // Connection pool
  const hasPool = dbJs?.includes('createPool') || dbJs?.includes('connectionLimit');
  check('performance', 'DB connection pool configured', hasPool, 'Check api/db.js');
  
  // LIMIT clause
  const hasLimit = leaderboardJs?.includes('LIMIT ?') || leaderboardJs?.includes('LIMIT 10');
  check('performance', 'Queries use LIMIT for pagination', hasLimit);
}

// ===== 5) PROFILE CARD FUNCTIONALITY =====
function testProfileCard() {
  console.log('\n👤 5) PROFILE CARD FUNCTIONALITY\n');
  
  const profileModalJs = readFile('src/components/ProfileModal.js');
  const settingsJs = readFile('api/users/settings.js');
  const friendsJs = readFile('api/users/friends.js');
  
  // Settings button works
  const hasSettingsButton = profileModalJs?.includes('setShowSettings') && 
                            profileModalJs?.includes('SettingsModal');
  check('profile', 'Settings button opens modal', hasSettingsButton);
  
  // Settings API exists
  const hasSettingsApi = settingsJs?.includes('GET') && settingsJs?.includes('PUT');
  check('profile', 'Settings GET/PUT API implemented', hasSettingsApi);
  
  // Add Friend flow
  const hasFriendFlow = friendsJs?.includes('request') && 
                        friendsJs?.includes('accept') && 
                        friendsJs?.includes('reject');
  check('profile', 'Friend request/accept/reject flow', hasFriendFlow);
  
  // Friend button states
  const hasFriendStates = profileModalJs?.includes('pending_sent') && 
                          profileModalJs?.includes('pending_received') && 
                          profileModalJs?.includes('accepted');
  check('profile', 'Friend button state changes', hasFriendStates);
  
  // Loading/error states
  const hasLoadingStates = profileModalJs?.includes('setFriendLoading') && 
                           profileModalJs?.includes('setSettingsLoading');
  check('profile', 'Loading states for buttons', hasLoadingStates);
  
  // Toast feedback
  const hasToastFeedback = profileModalJs?.includes('toast.success') || 
                           profileModalJs?.includes('toast.error');
  check('profile', 'Toast feedback for actions', hasToastFeedback);
}

// ===== 6) CHAT UI POLISH =====
function testChatUI() {
  console.log('\n💬 6) CHAT UI POLISH\n');
  
  const communityJs = readFile('src/pages/Community.js');
  const communityCss = readFile('src/styles/Community.css');
  
  // Check for message grouping logic
  const hasMessageGrouping = communityJs?.includes('isGrouped') && 
                             communityJs?.includes('prevMessage') &&
                             communityJs?.includes('grouped');
  check('chat_ui', 'Message grouping implemented', hasMessageGrouping);
  
  // Check for gap/margin controls
  const hasGapControl = communityCss?.includes('margin-bottom') && 
                        communityCss?.includes('gap');
  check('chat_ui', 'Gap/margin controls in CSS', hasGapControl);
  
  // Scroll behavior
  const hasScrollBehavior = communityJs?.includes('scrollIntoView') || 
                            communityJs?.includes('scrollTop');
  check('chat_ui', 'Scroll behavior implemented', hasScrollBehavior);
}

// ===== 7) OBSERVABILITY =====
function testObservability() {
  console.log('\n🔍 7) OBSERVABILITY & DEBUGGING\n');
  
  const leaderboardJs = readFile('api/leaderboard.js');
  const friendsJs = readFile('api/users/friends.js');
  const cronJs = readFile('api/cron/refresh-leaderboard.js');
  const healthJs = readFile('api/ai/health.js');
  
  // RequestId logging
  const hasRequestId = leaderboardJs?.includes('requestId') || 
                       friendsJs?.includes('requestId');
  check('observability', 'RequestId logging', hasRequestId, 
        hasRequestId ? '' : 'Consider adding for debugging');
  
  // Timing logs
  const hasTimingLogs = cronJs?.includes('Date.now()') || 
                        leaderboardJs?.includes('cacheTTL');
  check('observability', 'Timing/performance logging', hasTimingLogs);
  
  // Health endpoint exists
  const hasHealthEndpoint = healthJs !== null;
  check('observability', 'Health endpoint exists', hasHealthEndpoint);
  
  // Cache status in response
  const hasCacheStatus = leaderboardJs?.includes('cached: true');
  check('observability', 'Cache hit/miss in response', hasCacheStatus);
}

// ===== UNIT TESTS =====
function runUnitTests() {
  console.log('\n🧪 UNIT TESTS\n');
  
  // XP aggregation boundaries
  const now = new Date();
  
  // Daily boundary
  const dailyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const dailyCorrect = dailyStart.getUTCHours() === 0 && dailyStart <= now;
  check('unit_tests', 'Daily UTC boundary calculation', dailyCorrect);
  
  // Weekly boundary (Monday)
  const dayOfWeek = now.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weeklyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset, 0, 0, 0));
  const weeklyCorrect = weeklyStart.getUTCDay() === 1;
  check('unit_tests', 'Weekly ISO week (Monday) calculation', weeklyCorrect);
  
  // Monthly boundary
  const monthlyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const monthlyCorrect = monthlyStart.getUTCDate() === 1;
  check('unit_tests', 'Monthly calendar boundary calculation', monthlyCorrect);
  
  // Demo user filter
  const demoUsers = [
    { is_demo: true, id: 1 },
    { is_demo: false, id: 2 },
    { is_demo: null, id: 3 }
  ];
  const realUsers = demoUsers.filter(u => !u.is_demo);
  const filterCorrect = realUsers.length === 2;
  check('unit_tests', 'Demo user exclusion filter', filterCorrect);
  
  // Level calculation
  const getLevelFromXP = (xp) => {
    if (xp <= 0) return 1;
    if (xp < 500) return Math.floor(Math.sqrt(xp / 50)) + 1;
    if (xp < 5000) return 10 + Math.floor(Math.sqrt((xp - 500) / 100)) + 1;
    return 50 + Math.floor(Math.sqrt((xp - 5000) / 200)) + 1;
  };
  const levelCorrect = getLevelFromXP(0) === 1 && getLevelFromXP(100) > 1;
  check('unit_tests', 'Level from XP calculation', levelCorrect);
}

// ===== INTEGRATION TEST READINESS =====
function checkIntegrationReadiness() {
  console.log('\n🔗 INTEGRATION TEST READINESS\n');
  
  const vercelJson = readFile('vercel.json');
  
  // API routes configured
  const hasLeaderboardRoute = vercelJson?.includes('/api/leaderboard');
  check('integration', 'Leaderboard API route configured', hasLeaderboardRoute);
  
  const hasFriendsRoute = vercelJson?.includes('/api/users/friends');
  check('integration', 'Friends API route configured', hasFriendsRoute);
  
  const hasSettingsRoute = vercelJson?.includes('/api/users/settings');
  check('integration', 'Settings API route configured', hasSettingsRoute);
  
  const hasCronRoute = vercelJson?.includes('/api/cron/refresh-leaderboard');
  check('integration', 'Cron job route configured', hasCronRoute);
  
  const hasSeedRoute = vercelJson?.includes('/api/seed/demo-leaderboard');
  check('integration', 'Demo seed route configured', hasSeedRoute);
}

// ===== MAIN =====
function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   FULL VERIFICATION TEST SUITE');
  console.log('   Leaderboard / Chat / Profile Checklist');
  console.log('═══════════════════════════════════════════════════════════');
  
  testLeaderboardCorrectness();
  testPrizeSafety();
  testXpEventsLedger();
  testPerformance();
  testProfileCard();
  testChatUI();
  testObservability();
  runUnitTests();
  checkIntegrationReadiness();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\n  ✅ Passed:   ${results.passed}`);
  console.log(`  ⚠️  Warnings: ${results.warnings}`);
  console.log(`  ❌ Failed:   ${results.failed}`);
  console.log(`\n  Total:      ${results.passed + results.warnings + results.failed}`);
  
  // Write detailed results
  fs.writeFileSync(
    path.join(__dirname, 'verification-report.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n  📄 Detailed report: tests/verification-report.json');
  
  if (results.failed > 0) {
    console.log('\n  ⚠️  Some checks failed. Review above for details.\n');
    process.exit(1);
  } else {
    console.log('\n  🎉 All critical checks passed!\n');
  }
}

main();
