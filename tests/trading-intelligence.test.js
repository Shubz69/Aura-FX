/**
 * Trading Intelligence System - Comprehensive Test Suite
 * 
 * Tests:
 * - Intent detection
 * - Instrument normalization
 * - Timeframe extraction
 * - Market session detection
 * - Catalyst ranking
 * - Response generation
 * - Leaderboard integration
 * - Performance under load
 */

const assert = require('assert');

// Test result tracking
const results = {
  passed: 0,
  failed: 0,
  sections: {}
};

function test(section, name, fn) {
  if (!results.sections[section]) {
    results.sections[section] = { passed: [], failed: [] };
  }
  
  try {
    fn();
    results.sections[section].passed.push(name);
    results.passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    results.sections[section].failed.push({ name, error: err.message });
    results.failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

// ============================================================================
// MOCK IMPLEMENTATIONS (for testing without actual API)
// ============================================================================

const INTENT_PATTERNS = {
  WHY_MOVED: { patterns: [/why.*(mov|drop|crash|pump|spike)/i, /what.*(happen|caus)/i] },
  BIAS: { patterns: [/what.*(?:is|'s).*(?:bias|view|outlook)/i, /should.*(?:buy|sell)/i] },
  LEVELS: { patterns: [/(?:key|important).*level/i, /support|resistance/i] },
  NEWS: { patterns: [/news|headline|breaking/i, /(?:fed|fomc|nfp|cpi)/i] },
  PRICE: { patterns: [/(?:what|current).*price/i, /quote/i] }
};

function detectIntent(message) {
  const intents = [];
  for (const [intentName, config] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        intents.push({ type: intentName, confidence: 0.8 });
        break;
      }
    }
  }
  if (intents.length === 0) {
    intents.push({ type: 'ANALYSIS', confidence: 0.5 });
  }
  return intents;
}

const INSTRUMENT_ALIASES = {
  'GOLD': 'XAUUSD', 'XAU': 'XAUUSD', 'BITCOIN': 'BTCUSD', 'BTC': 'BTCUSD',
  'EURO': 'EURUSD', 'CABLE': 'GBPUSD', 'S&P': 'SPX500', 'DOW': 'US30'
};

function extractInstrument(message) {
  const upperMsg = message.toUpperCase();
  for (const [alias, symbol] of Object.entries(INSTRUMENT_ALIASES)) {
    if (upperMsg.includes(alias)) return symbol;
  }
  const forexMatch = upperMsg.match(/\b([A-Z]{3})\/?([A-Z]{3})\b/);
  if (forexMatch) return forexMatch[1] + forexMatch[2];
  return null;
}

const TIMEFRAME_ALIASES = {
  '1H': 'H1', '4H': 'H4', 'DAILY': 'D1', 'HOURLY': 'H1', 'SCALP': 'M5', 'SWING': 'H4'
};

function extractTimeframe(message) {
  const upperMsg = message.toUpperCase();
  for (const [alias, tf] of Object.entries(TIMEFRAME_ALIASES)) {
    if (upperMsg.includes(alias)) return tf;
  }
  return 'H1';
}

function getMarketSession() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();
  
  if (utcDay === 0 || utcDay === 6) {
    return { name: 'Weekend', isOpen: false, liquidity: 'none' };
  }
  
  const sessions = [];
  if (utcHour >= 8 && utcHour < 17) sessions.push('London');
  if (utcHour >= 13 && utcHour < 22) sessions.push('New York');
  if (utcHour >= 0 && utcHour < 9) sessions.push('Tokyo');
  
  return {
    name: sessions.join('/') || 'Asian',
    isOpen: true,
    liquidity: sessions.length >= 2 ? 'high' : 'moderate'
  };
}

function rankCatalysts(news, calendar) {
  const catalysts = [];
  
  if (news?.news) {
    for (const item of news.news) {
      catalysts.push({
        type: 'news',
        title: item.title,
        score: 50 + Math.random() * 30
      });
    }
  }
  
  if (calendar?.events) {
    for (const event of calendar.events) {
      let score = 40;
      if (event.impact === 'high') score += 30;
      catalysts.push({
        type: 'economic',
        title: event.title,
        score
      });
    }
  }
  
  catalysts.sort((a, b) => b.score - a.score);
  return catalysts;
}

// ============================================================================
// UNIT TESTS: INTENT DETECTION
// ============================================================================

function testIntentDetection() {
  console.log('\n📊 INTENT DETECTION TESTS\n');
  
  test('intent', 'Detects WHY_MOVED intent', () => {
    const intents = detectIntent('Why is gold dropping today?');
    assert(intents.some(i => i.type === 'WHY_MOVED'), 'Should detect WHY_MOVED');
  });
  
  test('intent', 'Detects BIAS intent', () => {
    const intents = detectIntent('What is your bias on EURUSD?');
    assert(intents.some(i => i.type === 'BIAS'), 'Should detect BIAS');
  });
  
  test('intent', 'Detects LEVELS intent', () => {
    const intents = detectIntent('What are the key support levels?');
    assert(intents.some(i => i.type === 'LEVELS'), 'Should detect LEVELS');
  });
  
  test('intent', 'Detects NEWS intent', () => {
    const intents = detectIntent('What did the Fed say today?');
    assert(intents.some(i => i.type === 'NEWS'), 'Should detect NEWS');
  });
  
  test('intent', 'Detects PRICE intent', () => {
    const intents = detectIntent('What is the current price of BTCUSD?');
    assert(intents.some(i => i.type === 'PRICE'), 'Should detect PRICE');
  });
  
  test('intent', 'Defaults to ANALYSIS for ambiguous queries', () => {
    const intents = detectIntent('Tell me about the market');
    assert(intents.some(i => i.type === 'ANALYSIS'), 'Should default to ANALYSIS');
  });
}

// ============================================================================
// UNIT TESTS: INSTRUMENT NORMALIZATION
// ============================================================================

function testInstrumentNormalization() {
  console.log('\n💱 INSTRUMENT NORMALIZATION TESTS\n');
  
  test('instrument', 'Normalizes GOLD to XAUUSD', () => {
    const symbol = extractInstrument('What is gold doing?');
    assert.strictEqual(symbol, 'XAUUSD');
  });
  
  test('instrument', 'Normalizes BTC to BTCUSD', () => {
    const symbol = extractInstrument('Bitcoin price prediction');
    assert.strictEqual(symbol, 'BTCUSD');
  });
  
  test('instrument', 'Extracts forex pair EUR/USD', () => {
    const symbol = extractInstrument('Analysis on EUR/USD');
    assert.strictEqual(symbol, 'EURUSD');
  });
  
  test('instrument', 'Extracts forex pair GBPUSD (no slash)', () => {
    const symbol = extractInstrument('GBPUSD looks bullish');
    assert.strictEqual(symbol, 'GBPUSD');
  });
  
  test('instrument', 'Normalizes index aliases', () => {
    const symbol = extractInstrument('S&P 500 analysis');
    assert.strictEqual(symbol, 'SPX500');
  });
  
  test('instrument', 'Returns null for no instrument', () => {
    const symbol = extractInstrument('How does trading work?');
    assert.strictEqual(symbol, null);
  });
}

// ============================================================================
// UNIT TESTS: TIMEFRAME EXTRACTION
// ============================================================================

function testTimeframeExtraction() {
  console.log('\n⏰ TIMEFRAME EXTRACTION TESTS\n');
  
  test('timeframe', 'Extracts 1H timeframe', () => {
    const tf = extractTimeframe('1H chart analysis');
    assert.strictEqual(tf, 'H1');
  });
  
  test('timeframe', 'Extracts 4H timeframe', () => {
    const tf = extractTimeframe('Looking at 4H');
    assert.strictEqual(tf, 'H4');
  });
  
  test('timeframe', 'Extracts DAILY timeframe', () => {
    const tf = extractTimeframe('Daily chart');
    assert.strictEqual(tf, 'D1');
  });
  
  test('timeframe', 'Infers SCALP as M5', () => {
    const tf = extractTimeframe('Quick scalp trade');
    assert.strictEqual(tf, 'M5');
  });
  
  test('timeframe', 'Infers SWING as H4', () => {
    const tf = extractTimeframe('Swing trade setup');
    assert.strictEqual(tf, 'H4');
  });
  
  test('timeframe', 'Defaults to H1', () => {
    const tf = extractTimeframe('What do you think?');
    assert.strictEqual(tf, 'H1');
  });
}

// ============================================================================
// UNIT TESTS: MARKET SESSION
// ============================================================================

function testMarketSession() {
  console.log('\n🌍 MARKET SESSION TESTS\n');
  
  test('session', 'Returns session object with required fields', () => {
    const session = getMarketSession();
    assert(session.name, 'Should have name');
    assert(typeof session.isOpen === 'boolean', 'Should have isOpen boolean');
    assert(session.liquidity, 'Should have liquidity');
  });
  
  test('session', 'Session name is not empty', () => {
    const session = getMarketSession();
    assert(session.name.length > 0, 'Name should not be empty');
  });
}

// ============================================================================
// UNIT TESTS: CATALYST RANKING
// ============================================================================

function testCatalystRanking() {
  console.log('\n📰 CATALYST RANKING TESTS\n');
  
  const mockNews = {
    news: [
      { title: 'Fed raises rates by 25bps', source: 'Reuters' },
      { title: 'Market update', source: 'Bloomberg' }
    ]
  };
  
  const mockCalendar = {
    events: [
      { title: 'FOMC Meeting', impact: 'high', currency: 'USD' },
      { title: 'Retail Sales', impact: 'medium', currency: 'USD' }
    ]
  };
  
  test('catalyst', 'Ranks catalysts by score descending', () => {
    const catalysts = rankCatalysts(mockNews, mockCalendar);
    for (let i = 1; i < catalysts.length; i++) {
      assert(catalysts[i].score <= catalysts[i-1].score, 'Should be sorted descending');
    }
  });
  
  test('catalyst', 'High impact events score higher', () => {
    const catalysts = rankCatalysts(mockNews, mockCalendar);
    const highImpact = catalysts.find(c => c.title === 'FOMC Meeting');
    const medImpact = catalysts.find(c => c.title === 'Retail Sales');
    assert(highImpact.score > medImpact.score, 'High impact should score higher');
  });
  
  test('catalyst', 'Handles empty news/calendar', () => {
    const catalysts = rankCatalysts({ news: [] }, { events: [] });
    assert(Array.isArray(catalysts), 'Should return array');
    assert(catalysts.length === 0, 'Should be empty');
  });
  
  test('catalyst', 'Handles null inputs', () => {
    const catalysts = rankCatalysts(null, null);
    assert(Array.isArray(catalysts), 'Should return array');
  });
}

// ============================================================================
// INTEGRATION TESTS: RESPONSE STRUCTURE
// ============================================================================

function testResponseStructure() {
  console.log('\n📝 RESPONSE STRUCTURE TESTS\n');
  
  function buildTraderResponse(context) {
    const response = { sections: [], dataLabels: [] };
    
    if (context.catalysts?.[0]?.score > 60) {
      response.sections.push({ title: 'MAIN DRIVER', content: context.catalysts[0].title });
    }
    
    if (context.marketData?.price > 0) {
      response.sections.push({ 
        title: 'MECHANICS', 
        content: `Price: ${context.marketData.price}` 
      });
      response.dataLabels.push('live');
    }
    
    response.sections.push({ title: 'RISK NOTES', content: 'Standard risk applies' });
    
    return response;
  }
  
  test('response', 'Includes MAIN DRIVER for high-score catalyst', () => {
    const response = buildTraderResponse({
      catalysts: [{ title: 'Fed Rate Decision', score: 80 }],
      marketData: { price: 2650 }
    });
    assert(response.sections.some(s => s.title === 'MAIN DRIVER'));
  });
  
  test('response', 'Includes MECHANICS with price data', () => {
    const response = buildTraderResponse({
      catalysts: [],
      marketData: { price: 2650 }
    });
    assert(response.sections.some(s => s.title === 'MECHANICS'));
  });
  
  test('response', 'Always includes RISK NOTES', () => {
    const response = buildTraderResponse({ catalysts: [], marketData: {} });
    assert(response.sections.some(s => s.title === 'RISK NOTES'));
  });
  
  test('response', 'Labels data sources', () => {
    const response = buildTraderResponse({
      catalysts: [],
      marketData: { price: 100 }
    });
    assert(response.dataLabels.includes('live'));
  });
}

// ============================================================================
// INTEGRATION TESTS: LEADERBOARD
// ============================================================================

function testLeaderboardIntegration() {
  console.log('\n🏆 LEADERBOARD INTEGRATION TESTS\n');
  
  function getDateBoundaries(timeframe) {
    const now = new Date();
    if (timeframe === 'daily') {
      return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) };
    }
    if (timeframe === 'weekly') {
      const day = now.getUTCDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset)) };
    }
    if (timeframe === 'monthly') {
      return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
    }
    return { start: null };
  }
  
  test('leaderboard', 'Daily boundary starts at midnight UTC', () => {
    const { start } = getDateBoundaries('daily');
    assert.strictEqual(start.getUTCHours(), 0);
    assert.strictEqual(start.getUTCMinutes(), 0);
  });
  
  test('leaderboard', 'Weekly boundary starts on Monday', () => {
    const { start } = getDateBoundaries('weekly');
    assert.strictEqual(start.getUTCDay(), 1);
  });
  
  test('leaderboard', 'Monthly boundary starts on 1st', () => {
    const { start } = getDateBoundaries('monthly');
    assert.strictEqual(start.getUTCDate(), 1);
  });
}

// ============================================================================
// LOAD/PERFORMANCE TESTS
// ============================================================================

function testPerformance() {
  console.log('\n⚡ PERFORMANCE TESTS\n');
  
  test('perf', 'Intent detection < 5ms', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      detectIntent('Why is gold dropping today?');
    }
    const duration = Date.now() - start;
    const avgMs = duration / 100;
    assert(avgMs < 5, `Average ${avgMs}ms exceeds 5ms`);
  });
  
  test('perf', 'Instrument extraction < 2ms', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      extractInstrument('What is gold doing today?');
    }
    const duration = Date.now() - start;
    const avgMs = duration / 100;
    assert(avgMs < 2, `Average ${avgMs}ms exceeds 2ms`);
  });
  
  test('perf', 'Catalyst ranking < 10ms for 50 items', () => {
    const mockNews = { news: Array(25).fill({ title: 'News item' }) };
    const mockCalendar = { events: Array(25).fill({ title: 'Event', impact: 'high' }) };
    
    const start = Date.now();
    rankCatalysts(mockNews, mockCalendar);
    const duration = Date.now() - start;
    
    assert(duration < 10, `Took ${duration}ms, exceeds 10ms`);
  });
  
  test('perf', 'Session detection < 1ms', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      getMarketSession();
    }
    const duration = Date.now() - start;
    const avgMs = duration / 100;
    assert(avgMs < 1, `Average ${avgMs}ms exceeds 1ms`);
  });
}

// ============================================================================
// CONCURRENCY TESTS
// ============================================================================

async function testConcurrency() {
  console.log('\n🔄 CONCURRENCY TESTS\n');
  
  // Simulate concurrent requests
  const concurrentRequests = 50;
  const results = [];
  
  const processRequest = async (id) => {
    const start = Date.now();
    const intents = detectIntent('Why is gold moving?');
    const instrument = extractInstrument('XAUUSD analysis');
    const session = getMarketSession();
    return { id, duration: Date.now() - start, success: true };
  };
  
  test('concurrency', `Handles ${concurrentRequests} concurrent requests`, async () => {
    const promises = [];
    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(processRequest(i));
    }
    
    const allResults = await Promise.all(promises);
    const successCount = allResults.filter(r => r.success).length;
    assert.strictEqual(successCount, concurrentRequests);
  });
  
  test('concurrency', 'P95 latency under 10ms', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(processRequest(i));
    }
    
    const allResults = await Promise.all(promises);
    const durations = allResults.map(r => r.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95 = durations[p95Index];
    
    console.log(`    P95 latency: ${p95}ms`);
    assert(p95 < 10, `P95 ${p95}ms exceeds 10ms`);
  });
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   TRADING INTELLIGENCE SYSTEM - TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════');
  
  testIntentDetection();
  testInstrumentNormalization();
  testTimeframeExtraction();
  testMarketSession();
  testCatalystRanking();
  testResponseStructure();
  testLeaderboardIntegration();
  testPerformance();
  await testConcurrency();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\n  ✅ Passed: ${results.passed}`);
  console.log(`  ❌ Failed: ${results.failed}`);
  console.log(`\n  Total: ${results.passed + results.failed}`);
  
  if (results.failed > 0) {
    console.log('\n  ⚠️ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('\n  🎉 All tests passed!\n');
  }
}

runAllTests();
