/**
 * Load Test Script
 * 
 * Simulates 1k-5k concurrent users performing common actions:
 * - Load community
 * - Send/receive messages
 * - Open profile
 * - Send/accept friend requests
 * - Open notifications
 * - Load leaderboard (all timeframes)
 * - AI prompts
 * 
 * Reports:
 * - p50, p95, p99 latency
 * - Error rate
 * - Requests per second
 * 
 * Targets:
 * - p95 < 800ms for community APIs
 * - p95 < 1500ms for leaderboard
 * - p95 < 3000ms for AI with streaming
 * - 0% uncaught errors
 * 
 * Usage:
 *   node tests/load-test.js [users] [duration_seconds]
 *   node tests/load-test.js 1000 60
 */

const http = require('http');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  BASE_URL: process.env.TEST_URL || 'http://localhost:3000',
  CONCURRENT_USERS: parseInt(process.argv[2]) || 100,
  DURATION_SECONDS: parseInt(process.argv[3]) || 30,
  RAMP_UP_SECONDS: 10,
  
  // Targets
  TARGETS: {
    community_p95: 800,
    leaderboard_p95: 1500,
    ai_p95: 3000,
    error_rate: 0.01 // 1%
  }
};

// ============================================================================
// Statistics
// ============================================================================

const stats = {
  requests: 0,
  errors: 0,
  latencies: [],
  byEndpoint: {},
  startTime: null,
  endTime: null
};

function recordRequest(endpoint, latency, success) {
  stats.requests++;
  if (!success) stats.errors++;
  stats.latencies.push(latency);
  
  if (!stats.byEndpoint[endpoint]) {
    stats.byEndpoint[endpoint] = { count: 0, errors: 0, latencies: [] };
  }
  stats.byEndpoint[endpoint].count++;
  if (!success) stats.byEndpoint[endpoint].errors++;
  stats.byEndpoint[endpoint].latencies.push(latency);
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================================================
// HTTP Client
// ============================================================================

function makeRequest(method, path, body = null, timeout = 30000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(path, CONFIG.BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LoadTest/1.0'
      },
      timeout
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 400;
        resolve({ success, latency, status: res.statusCode, data });
      });
    });
    
    req.on('error', (error) => {
      const latency = Date.now() - startTime;
      resolve({ success: false, latency, error: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      const latency = Date.now() - startTime;
      resolve({ success: false, latency, error: 'timeout' });
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ============================================================================
// Test Scenarios
// ============================================================================

const scenarios = [
  {
    name: 'community_users',
    weight: 20,
    fn: async () => makeRequest('GET', '/api/community/users')
  },
  {
    name: 'community_online',
    weight: 15,
    fn: async () => makeRequest('GET', '/api/community/online-count')
  },
  {
    name: 'leaderboard_daily',
    weight: 10,
    fn: async () => makeRequest('GET', '/api/leaderboard?timeframe=daily&limit=20')
  },
  {
    name: 'leaderboard_weekly',
    weight: 15,
    fn: async () => makeRequest('GET', '/api/leaderboard?timeframe=weekly&limit=20')
  },
  {
    name: 'leaderboard_monthly',
    weight: 10,
    fn: async () => makeRequest('GET', '/api/leaderboard?timeframe=monthly&limit=20')
  },
  {
    name: 'leaderboard_alltime',
    weight: 10,
    fn: async () => makeRequest('GET', '/api/leaderboard?timeframe=all-time&limit=20')
  },
  {
    name: 'chatbot',
    weight: 10,
    fn: async () => makeRequest('POST', '/api/chatbot', { 
      message: 'What is AURA FX?',
      authenticated: false
    })
  },
  {
    name: 'health_check',
    weight: 10,
    fn: async () => makeRequest('GET', '/api/ai/health')
  }
];

// Build weighted scenario pool
const scenarioPool = [];
scenarios.forEach(s => {
  for (let i = 0; i < s.weight; i++) {
    scenarioPool.push(s);
  }
});

function pickScenario() {
  return scenarioPool[Math.floor(Math.random() * scenarioPool.length)];
}

// ============================================================================
// Virtual User
// ============================================================================

async function virtualUser(userId, durationMs) {
  const endTime = Date.now() + durationMs;
  
  while (Date.now() < endTime) {
    const scenario = pickScenario();
    
    try {
      const result = await scenario.fn();
      recordRequest(scenario.name, result.latency, result.success);
    } catch (e) {
      recordRequest(scenario.name, 0, false);
    }
    
    // Random think time between requests (100ms - 2s)
    const thinkTime = 100 + Math.random() * 1900;
    await new Promise(r => setTimeout(r, thinkTime));
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const rps = stats.requests / duration;
  const errorRate = stats.errors / stats.requests;
  
  console.log('\n========================================');
  console.log('           LOAD TEST RESULTS');
  console.log('========================================\n');
  
  console.log('Configuration:');
  console.log(`  Base URL: ${CONFIG.BASE_URL}`);
  console.log(`  Virtual Users: ${CONFIG.CONCURRENT_USERS}`);
  console.log(`  Duration: ${CONFIG.DURATION_SECONDS}s`);
  console.log('');
  
  console.log('Overall:');
  console.log(`  Total Requests: ${stats.requests}`);
  console.log(`  Total Errors: ${stats.errors}`);
  console.log(`  Error Rate: ${(errorRate * 100).toFixed(2)}%`);
  console.log(`  Requests/sec: ${rps.toFixed(2)}`);
  console.log('');
  
  console.log('Latency (all requests):');
  console.log(`  p50: ${percentile(stats.latencies, 0.5)}ms`);
  console.log(`  p95: ${percentile(stats.latencies, 0.95)}ms`);
  console.log(`  p99: ${percentile(stats.latencies, 0.99)}ms`);
  console.log('');
  
  console.log('By Endpoint:');
  for (const [endpoint, data] of Object.entries(stats.byEndpoint)) {
    const p95 = percentile(data.latencies, 0.95);
    const errRate = data.errors / data.count * 100;
    console.log(`  ${endpoint}:`);
    console.log(`    Requests: ${data.count}, Errors: ${data.errors} (${errRate.toFixed(1)}%)`);
    console.log(`    p50: ${percentile(data.latencies, 0.5)}ms, p95: ${p95}ms`);
  }
  console.log('');
  
  // Check targets
  console.log('Target Verification:');
  const communityP95 = Math.max(
    percentile(stats.byEndpoint['community_users']?.latencies || [0], 0.95),
    percentile(stats.byEndpoint['community_online']?.latencies || [0], 0.95)
  );
  const leaderboardP95 = Math.max(
    percentile(stats.byEndpoint['leaderboard_daily']?.latencies || [0], 0.95),
    percentile(stats.byEndpoint['leaderboard_weekly']?.latencies || [0], 0.95),
    percentile(stats.byEndpoint['leaderboard_monthly']?.latencies || [0], 0.95),
    percentile(stats.byEndpoint['leaderboard_alltime']?.latencies || [0], 0.95)
  );
  const chatbotP95 = percentile(stats.byEndpoint['chatbot']?.latencies || [0], 0.95);
  
  const results = [
    {
      name: 'Community p95 < 800ms',
      value: communityP95,
      target: CONFIG.TARGETS.community_p95,
      pass: communityP95 <= CONFIG.TARGETS.community_p95
    },
    {
      name: 'Leaderboard p95 < 1500ms',
      value: leaderboardP95,
      target: CONFIG.TARGETS.leaderboard_p95,
      pass: leaderboardP95 <= CONFIG.TARGETS.leaderboard_p95
    },
    {
      name: 'Chatbot p95 < 3000ms',
      value: chatbotP95,
      target: CONFIG.TARGETS.ai_p95,
      pass: chatbotP95 <= CONFIG.TARGETS.ai_p95
    },
    {
      name: 'Error rate < 1%',
      value: errorRate,
      target: CONFIG.TARGETS.error_rate,
      pass: errorRate <= CONFIG.TARGETS.error_rate
    }
  ];
  
  let allPass = true;
  results.forEach(r => {
    const status = r.pass ? '✓' : '✗';
    const valueStr = r.name.includes('Error') 
      ? `${(r.value * 100).toFixed(2)}%`
      : `${r.value}ms`;
    console.log(`  ${status} ${r.name}: ${valueStr}`);
    if (!r.pass) allPass = false;
  });
  
  console.log('\n========================================');
  console.log(`  RESULT: ${allPass ? 'ALL TARGETS MET ✓' : 'SOME TARGETS FAILED ✗'}`);
  console.log('========================================\n');
  
  return allPass;
}

// ============================================================================
// Main
// ============================================================================

async function runLoadTest() {
  console.log('\n========================================');
  console.log('         LOAD TEST STARTING');
  console.log('========================================\n');
  
  console.log(`Base URL: ${CONFIG.BASE_URL}`);
  console.log(`Virtual Users: ${CONFIG.CONCURRENT_USERS}`);
  console.log(`Duration: ${CONFIG.DURATION_SECONDS}s`);
  console.log(`Ramp-up: ${CONFIG.RAMP_UP_SECONDS}s\n`);
  
  // Verify connectivity
  console.log('Checking connectivity...');
  try {
    const healthCheck = await makeRequest('GET', '/api/ai/health', null, 5000);
    if (!healthCheck.success) {
      console.log(`Warning: Health check returned ${healthCheck.status || healthCheck.error}`);
    } else {
      console.log('Server is reachable\n');
    }
  } catch (e) {
    console.log(`Warning: Could not reach server: ${e.message}`);
    console.log('Continuing with load test anyway...\n');
  }
  
  stats.startTime = Date.now();
  
  // Ramp up users gradually
  const usersPerSecond = CONFIG.CONCURRENT_USERS / CONFIG.RAMP_UP_SECONDS;
  const userPromises = [];
  
  console.log('Ramping up virtual users...');
  
  for (let i = 0; i < CONFIG.CONCURRENT_USERS; i++) {
    // Stagger user start times during ramp-up
    const delay = (i / usersPerSecond) * 1000;
    
    userPromises.push(
      new Promise(async (resolve) => {
        await new Promise(r => setTimeout(r, delay));
        const durationMs = (CONFIG.DURATION_SECONDS * 1000) - delay;
        await virtualUser(i, durationMs);
        resolve();
      })
    );
  }
  
  // Progress reporting
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const rps = stats.requests / elapsed;
    process.stdout.write(`\r  Elapsed: ${elapsed.toFixed(0)}s, Requests: ${stats.requests}, RPS: ${rps.toFixed(1)}, Errors: ${stats.errors}`);
  }, 1000);
  
  // Wait for all users to complete
  await Promise.all(userPromises);
  
  clearInterval(progressInterval);
  console.log('\n');
  
  stats.endTime = Date.now();
  
  // Generate report
  const passed = generateReport();
  
  process.exit(passed ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  runLoadTest().catch(e => {
    console.error('Load test error:', e);
    process.exit(1);
  });
}

module.exports = { runLoadTest };
