/**
 * Leaderboard API - Real XP-based leaderboard with proper time boundaries
 * 
 * Timeframes:
 * - daily: XP earned today (midnight to now, UTC)
 * - weekly: XP earned this ISO week (Monday to Sunday)
 * - monthly: XP earned this calendar month
 * - all-time: Highest level/total XP
 * 
 * HARDENED:
 * - Rate limiting
 * - Request coalescing (prevents stampedes)
 * - Proper error responses
 * - Input validation
 * - Timeout protection
 */

const { executeQuery, executeQueryWithTimeout } = require('./db');
const { getCached, setCached, getOrFetch, DEFAULT_TTLS } = require('./cache');
const { generateRequestId, createLogger } = require('./utils/logger');
const { checkRateLimit, coalesceRequest, RATE_LIMIT_CONFIGS } = require('./utils/rate-limiter');
const { safeLimit, safeTimeframe } = require('./utils/validators');
const { withTimeout } = require('./utils/circuit-breaker');

// Trading-style usernames for demo users with activity profiles
const DEMO_USERS = [
  { name: 'Zephyr_FX', profile: 'grinder' },      // High daily activity
  { name: 'Kai_Trader', profile: 'grinder' },
  { name: 'Luna_Charts', profile: 'sprinter' },   // Bursts of activity
  { name: 'Orion_Pips', profile: 'sprinter' },
  { name: 'Phoenix_Gold', profile: 'weekend' },   // Weekend warrior
  { name: 'Atlas_Markets', profile: 'weekend' },
  { name: 'Nova_Scalper', profile: 'steady' },    // Steady daily
  { name: 'River_Swing', profile: 'steady' },
  { name: 'Sage_Technical', profile: 'course' },  // Course binger
  { name: 'Aurora_Signals', profile: 'course' },
  { name: 'Caspian_Forex', profile: 'grinder' },
  { name: 'Indigo_Trends', profile: 'sprinter' },
  { name: 'Lyra_Analyst', profile: 'weekend' },
  { name: 'Maverick_Risk', profile: 'steady' },
  { name: 'Seraphina_AI', profile: 'course' },
  { name: 'Titan_Macro', profile: 'grinder' },
  { name: 'Vesper_Algo', profile: 'sprinter' },
  { name: 'Willow_Day', profile: 'weekend' },
  { name: 'Xander_Quant', profile: 'steady' },
  { name: 'Yuki_SMC', profile: 'course' },
  { name: 'Blaze_Pips', profile: 'grinder' },
  { name: 'Crystal_Waves', profile: 'sprinter' },
  { name: 'Drake_Levels', profile: 'weekend' },
  { name: 'Echo_Trades', profile: 'steady' },
  { name: 'Frost_Markets', profile: 'grinder' },
  { name: 'Glacier_FX', profile: 'sprinter' },
  { name: 'Haven_Swings', profile: 'weekend' },
  { name: 'Iron_Setups', profile: 'steady' },
  { name: 'Jade_Patterns', profile: 'course' },
  { name: 'Krypton_Edge', profile: 'grinder' }
];

// Helper to get array from query result
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

// Calculate level from XP
function getLevelFromXP(xp) {
  if (xp <= 0) return 1;
  if (xp >= 1000000) return 1000;
  
  if (xp < 500) return Math.floor(Math.sqrt(xp / 50)) + 1;
  if (xp < 5000) return 10 + Math.floor(Math.sqrt((xp - 500) / 100)) + 1;
  if (xp < 20000) return 50 + Math.floor(Math.sqrt((xp - 5000) / 200)) + 1;
  if (xp < 100000) return 100 + Math.floor(Math.sqrt((xp - 20000) / 500)) + 1;
  if (xp < 500000) return 200 + Math.floor(Math.sqrt((xp - 100000) / 1000)) + 1;
  return Math.min(1000, 500 + Math.floor(Math.sqrt((xp - 500000) / 2000)) + 1);
}

// Get date boundaries for timeframes (UTC)
function getDateBoundaries(timeframe) {
  const now = new Date();
  
  if (timeframe === 'daily') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    return { start, end: now };
  }
  
  if (timeframe === 'weekly') {
    const dayOfWeek = now.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset, 0, 0, 0));
    return { start, end: now };
  }
  
  if (timeframe === 'monthly') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    return { start, end: now };
  }
  
  return { start: null, end: null };
}

// Format date for MySQL datetime
function toMySQLDatetime(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Ensure xp_events table exists
async function ensureXpEventsTable() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS xp_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        source VARCHAR(50) NOT NULL,
        meta JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        INDEX idx_source (source),
        INDEX idx_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return true;
  } catch (e) {
    // Table exists or other non-critical error
    return true;
  }
}

// Idempotent: Check if is_demo column exists before adding
let demoColumnChecked = false;
async function ensureDemoColumn() {
  if (demoColumnChecked) return true;
  
  try {
    // Check information_schema to see if column exists
    const result = await executeQuery(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'is_demo'
    `);
    
    const rows = getRows(result);
    
    if (rows.length === 0) {
      // Column doesn't exist, add it
      await executeQuery(`ALTER TABLE users ADD COLUMN is_demo BOOLEAN DEFAULT FALSE`);
      console.log('Added is_demo column to users table');
    }
    
    demoColumnChecked = true;
    return true;
  } catch (e) {
    // Don't block request on column check failure
    console.log('is_demo column check:', e.message);
    demoColumnChecked = true;
    return true;
  }
}

// Seeded random for consistent demo data
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Generate XP events for a demo user based on their activity profile
async function generateDemoXpEvents(userId, userIndex, profile) {
  const sources = ['chat_message', 'daily_login', 'course_complete', 'streak_bonus', 'community_help'];
  const now = new Date();
  
  // Profile-specific XP generation
  const profiles = {
    grinder: {
      // Daily: 900-2800, Weekly: 6k-18k, Monthly: 25k-85k
      dailyEvents: { count: [8, 15], amount: [50, 200] },
      weeklyEvents: { count: [15, 30], amount: [100, 400] },
      monthlyEvents: { count: [30, 60], amount: [150, 600] }
    },
    sprinter: {
      // Burst activity - high some days, low others
      dailyEvents: { count: [0, 5], amount: [100, 500] },
      weeklyEvents: { count: [20, 40], amount: [200, 800] },
      monthlyEvents: { count: [25, 50], amount: [300, 1000] }
    },
    weekend: {
      // Mostly weekend activity
      dailyEvents: { count: [1, 3], amount: [20, 80] },
      weeklyEvents: { count: [10, 25], amount: [150, 500] },
      monthlyEvents: { count: [20, 45], amount: [200, 700] }
    },
    steady: {
      // Consistent daily activity
      dailyEvents: { count: [3, 6], amount: [30, 120] },
      weeklyEvents: { count: [12, 25], amount: [80, 300] },
      monthlyEvents: { count: [25, 50], amount: [100, 400] }
    },
    course: {
      // Course completion spikes
      dailyEvents: { count: [1, 4], amount: [50, 150] },
      weeklyEvents: { count: [8, 18], amount: [100, 500] },
      monthlyEvents: { count: [15, 35], amount: [200, 1000] }
    }
  };
  
  const cfg = profiles[profile] || profiles.steady;
  const seed = userId * 1000 + userIndex;
  
  try {
    // Check if user already has events for today
    const existingResult = await executeQuery(
      'SELECT COUNT(*) as cnt FROM xp_events WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)',
      [userId]
    );
    const existing = getRows(existingResult);
    if (existing[0]?.cnt > 0) return; // Already has recent events
    
    // Generate daily events (today)
    const dailyCount = Math.floor(seededRandom(seed + 1) * (cfg.dailyEvents.count[1] - cfg.dailyEvents.count[0])) + cfg.dailyEvents.count[0];
    for (let i = 0; i < dailyCount; i++) {
      const amount = Math.floor(seededRandom(seed + i + 10) * (cfg.dailyEvents.amount[1] - cfg.dailyEvents.amount[0])) + cfg.dailyEvents.amount[0];
      const hoursAgo = Math.floor(seededRandom(seed + i + 20) * 20);
      const source = sources[Math.floor(seededRandom(seed + i + 30) * sources.length)];
      
      await executeQuery(
        `INSERT INTO xp_events (user_id, amount, source, meta, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
        [userId, amount, source, JSON.stringify({ demo: true }), hoursAgo]
      ).catch(() => {});
    }
    
    // Generate weekly events (past 7 days, excluding today)
    const weeklyCount = Math.floor(seededRandom(seed + 2) * (cfg.weeklyEvents.count[1] - cfg.weeklyEvents.count[0])) + cfg.weeklyEvents.count[0];
    for (let i = 0; i < weeklyCount; i++) {
      const amount = Math.floor(seededRandom(seed + i + 100) * (cfg.weeklyEvents.amount[1] - cfg.weeklyEvents.amount[0])) + cfg.weeklyEvents.amount[0];
      const daysAgo = Math.floor(seededRandom(seed + i + 110) * 6) + 1;
      const source = sources[Math.floor(seededRandom(seed + i + 120) * sources.length)];
      
      await executeQuery(
        `INSERT INTO xp_events (user_id, amount, source, meta, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [userId, amount, source, JSON.stringify({ demo: true }), daysAgo]
      ).catch(() => {});
    }
    
    // Generate monthly events (past 30 days, excluding past week)
    const monthlyCount = Math.floor(seededRandom(seed + 3) * (cfg.monthlyEvents.count[1] - cfg.monthlyEvents.count[0])) + cfg.monthlyEvents.count[0];
    for (let i = 0; i < monthlyCount; i++) {
      const amount = Math.floor(seededRandom(seed + i + 200) * (cfg.monthlyEvents.amount[1] - cfg.monthlyEvents.amount[0])) + cfg.monthlyEvents.amount[0];
      const daysAgo = Math.floor(seededRandom(seed + i + 210) * 23) + 7;
      const source = sources[Math.floor(seededRandom(seed + i + 220) * sources.length)];
      
      await executeQuery(
        `INSERT INTO xp_events (user_id, amount, source, meta, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [userId, amount, source, JSON.stringify({ demo: true }), daysAgo]
      ).catch(() => {});
    }
    
  } catch (e) {
    // Silently continue - don't block on individual user failures
  }
}

// Seed demo users with activity profile-based XP
let demoSeeded = false;
async function seedDemoUsers() {
  if (demoSeeded) return;
  
  const cacheKey = 'demo_seeded_v6';
  const cached = getCached(cacheKey, 3600000);
  if (cached) {
    demoSeeded = true;
    return;
  }
  
  try {
    console.log('Seeding demo users...');
    
    for (let i = 0; i < DEMO_USERS.length; i++) {
      const { name, profile } = DEMO_USERS[i];
      const email = `demo_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@aurafx.demo`;
      
      // Check if user exists
      const existingResult = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
      const existing = getRows(existingResult);
      
      let userId;
      if (existing.length === 0) {
        // Create demo user
        const totalXP = Math.floor(1000 + seededRandom(i * 100) * 50000);
        const level = getLevelFromXP(totalXP);
        
        const insertResult = await executeQuery(
          `INSERT INTO users (email, username, name, password, role, xp, level, is_demo, created_at) 
           VALUES (?, ?, ?, ?, 'free', ?, ?, TRUE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [email, name, name, `demo_${Date.now()}_${i}`, totalXP, level, Math.floor(30 + seededRandom(i) * 60)]
        ).catch(() => null);
        
        userId = insertResult?.insertId;
      } else {
        userId = existing[0].id;
      }
      
      // Generate XP events for this user
      if (userId) {
        await generateDemoXpEvents(userId, i, profile);
      }
    }
    
    setCached(cacheKey, true);
    demoSeeded = true;
    console.log('Demo users seeded successfully');
  } catch (e) {
    console.error('Demo seeding error:', e.message);
    demoSeeded = true; // Don't retry on failure
  }
}

module.exports = async (req, res) => {
  const requestId = generateRequestId('lb');
  const logger = createLogger(requestId);
  const startTime = Date.now();
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      errorCode: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed', 
      requestId 
    });
  }

  try {
    // Rate limiting
    const clientId = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const rateLimitKey = `leaderboard_${clientId}`;
    
    if (!checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.HIGH.requests, RATE_LIMIT_CONFIGS.HIGH.windowMs)) {
      logger.warn('Rate limited', { clientId });
      return res.status(429).json({
        success: false,
        errorCode: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        requestId,
        retryAfter: 60
      });
    }

    // Validate and sanitize inputs
    const timeframe = safeTimeframe(req.query.timeframe);
    const limit = safeLimit(req.query.limit, 10, 100);
    
    logger.info('Leaderboard request', { timeframe, limit, clientId });
    
    // Check cache with request coalescing (prevents stampede)
    const cacheTTL = timeframe === 'all-time' ? DEFAULT_TTLS.LEADERBOARD_ALLTIME : DEFAULT_TTLS.LEADERBOARD;
    const cacheKey = `leaderboard_v5_${timeframe}_${limit}`;
    
    // Use coalesceRequest to prevent multiple concurrent queries for the same data
    const coalesceKey = `lb_query_${timeframe}_${limit}`;
    
    const cached = getCached(cacheKey, cacheTTL);
    if (cached) {
      logger.info('Cache HIT', { ms: Date.now() - startTime });
      return res.status(200).json({ 
        success: true, 
        leaderboard: cached, 
        cached: true, 
        timeframe, 
        requestId,
        queryTimeMs: Date.now() - startTime
      });
    }
    
    logger.info('Cache MISS, querying database');

    // Use request coalescing to prevent stampede
    const fetchLeaderboard = async () => {
      logger.startTimer('db_setup');
      
      // Ensure tables exist (non-blocking, with timeout)
      await Promise.race([
        Promise.all([
          ensureXpEventsTable(),
          ensureDemoColumn()
        ]),
        new Promise(resolve => setTimeout(resolve, 2000)) // 2s timeout
      ]);
      
      // Seed demo users if needed (with timeout)
      await Promise.race([
        seedDemoUsers(),
        new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
      ]);
      
      logger.endTimer('db_setup');
      
      return await queryLeaderboard(timeframe, limit, logger);
    };
    
    // Coalesce concurrent requests for same data
    const leaderboard = await coalesceRequest(coalesceKey, fetchLeaderboard, 200);

    const boundaries = getDateBoundaries(timeframe);

    // Format response
    const formattedLeaderboard = leaderboard.map((user, index) => ({
      rank: index + 1,
      id: user.id,
      userId: user.id,
      username: user.username || user.name || user.email?.split('@')[0] || 'Trader',
      xp: timeframe === 'all-time' ? parseFloat(user.xp) || 0 : parseFloat(user.period_xp) || 0,
      xpGain: timeframe !== 'all-time' ? parseFloat(user.period_xp) || 0 : null,
      totalXP: parseFloat(user.xp) || 0,
      level: parseInt(user.level) || getLevelFromXP(parseFloat(user.xp) || 0),
      avatar: user.avatar || 'avatar_ai.png',
      role: user.role || 'free',
      isDemo: user.is_demo === 1 || user.is_demo === true,
      strikes: 0
    }));

    // Cache result
    setCached(cacheKey, formattedLeaderboard, cacheTTL);

    const queryTime = Date.now() - startTime;
    logger.info('Query completed', { 
      queryTimeMs: queryTime, 
      resultCount: formattedLeaderboard.length,
      latency: logger.getLatencyBreakdown()
    });
    
    return res.status(200).json({ 
      success: true, 
      leaderboard: formattedLeaderboard,
      timeframe,
      periodStart: boundaries.start?.toISOString() || null,
      periodEnd: boundaries.end?.toISOString() || null,
      requestId,
      queryTimeMs: queryTime
    });

  } catch (error) {
    const queryTime = Date.now() - startTime;
    logger.error('Leaderboard error', { error, queryTimeMs: queryTime });
    
    // Return proper error response (not success: true)
    return res.status(500).json({ 
      success: false, 
      errorCode: 'SERVER_ERROR',
      message: 'Failed to load leaderboard. Please try again.',
      leaderboard: [], // Empty fallback for UI
      requestId,
      queryTimeMs: queryTime
    });
  }
};

// Extracted query logic for coalescing
async function queryLeaderboard(timeframe, limit, logger) {
  const boundaries = getDateBoundaries(timeframe);
  let leaderboard = [];

  logger.startTimer('db_query');
  
  if (timeframe === 'all-time') {
    // All-time: Sort by level DESC, then total XP DESC
    // Use inline LIMIT to avoid mysql2 parameter issues
    const result = await executeQueryWithTimeout(`
      SELECT 
        u.id, u.username, u.name, u.email, 
        COALESCE(u.xp, 0) as xp, 
        COALESCE(u.level, 1) as level, 
        u.avatar, u.role, 
        COALESCE(u.is_demo, FALSE) as is_demo,
        COALESCE(u.xp, 0) as period_xp
      FROM users u
      WHERE COALESCE(u.xp, 0) > 0
      ORDER BY COALESCE(u.level, 1) DESC, COALESCE(u.xp, 0) DESC
      LIMIT ${limit}
    `, [], 10000, logger.requestId);
    
    leaderboard = getRows(result);
  } else {
    // Time-based: Aggregate XP from xp_events
    const startDate = toMySQLDatetime(boundaries.start);
    
    logger.debug('Querying xp_events', { since: startDate });
    
    // Use inline LIMIT to avoid mysql2 prepared statement issues
    const result = await executeQueryWithTimeout(`
      SELECT 
        u.id, u.username, u.name, u.email, 
        COALESCE(u.xp, 0) as xp, 
        COALESCE(u.level, 1) as level, 
        u.avatar, u.role, 
        COALESCE(u.is_demo, FALSE) as is_demo,
        COALESCE(SUM(e.amount), 0) as period_xp,
        MAX(e.created_at) as last_xp_time
      FROM users u
      INNER JOIN xp_events e ON u.id = e.user_id AND e.created_at >= ?
      GROUP BY u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo
      HAVING period_xp > 0
      ORDER BY period_xp DESC, last_xp_time ASC
      LIMIT ${limit}
    `, [startDate], 10000, logger.requestId);
    
    leaderboard = getRows(result);
    
    logger.debug('Time-based query result', { count: leaderboard.length });
    
    // Fallback: If insufficient time-based results, use all-time
    if (leaderboard.length < 3) {
      logger.debug('Insufficient data, falling back to all-time', { count: leaderboard.length });
      
      const fallbackResult = await executeQueryWithTimeout(`
        SELECT 
          u.id, u.username, u.name, u.email, 
          COALESCE(u.xp, 0) as xp, 
          COALESCE(u.level, 1) as level, 
          u.avatar, u.role, 
          COALESCE(u.is_demo, FALSE) as is_demo,
          COALESCE(u.xp, 0) as period_xp
        FROM users u
        WHERE COALESCE(u.xp, 0) > 0
        ORDER BY COALESCE(u.level, 1) DESC, COALESCE(u.xp, 0) DESC
        LIMIT ${limit}
      `, [], 10000, logger.requestId);
      
      leaderboard = getRows(fallbackResult);
      logger.debug('Fallback result', { count: leaderboard.length });
    }
  }
  
  logger.endTimer('db_query');
  return leaderboard;
}
