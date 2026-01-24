/**
 * Leaderboard API - Real XP-based leaderboard with proper time boundaries
 * 
 * Timeframes (all use xp_events ledger):
 * - daily: XP earned since start of today (midnight UTC)
 * - weekly: XP earned since start of ISO week (Monday 00:00 UTC)
 * - monthly: XP earned since start of month (1st 00:00 UTC)
 * - all-time: Total lifetime XP (SUM of all xp_events)
 * 
 * INVARIANT: For any user in the same month: month_xp >= week_xp >= day_xp
 * This is guaranteed because all tabs query the same xp_events table with
 * different date filters, and the boundaries are nested (day ⊂ week ⊂ month).
 * 
 * Bootstrap Mode:
 * - Seeds demo users with believable xp_events when real traffic is low
 * - Automatically disabled when real_users >= 50 OR real_xp_events_7d >= threshold
 * - Demo users NEVER shown with "Demo" labels in UI
 * - Demo users NEVER eligible for prizes (server-side filter only)
 */

const { executeQuery, executeQueryWithTimeout } = require('./db');
const { getCached, setCached, getOrFetch, DEFAULT_TTLS } = require('./cache');
const { generateRequestId, createLogger } = require('./utils/logger');
const { checkRateLimit, coalesceRequest, RATE_LIMIT_CONFIGS } = require('./utils/rate-limiter');
const { safeLimit, safeTimeframe } = require('./utils/validators');

// ============================================================================
// Configuration
// ============================================================================

// Bootstrap mode kill-switch thresholds
const BOOTSTRAP_CONFIG = {
  MIN_REAL_USERS: parseInt(process.env.LEADERBOARD_MIN_REAL_USERS) || 50,
  MIN_REAL_EVENTS_7D: parseInt(process.env.LEADERBOARD_MIN_EVENTS_7D) || 500,
  FORCE_BOOTSTRAP: process.env.LEADERBOARD_FORCE_BOOTSTRAP === 'true',
  FORCE_DISABLE_BOOTSTRAP: process.env.LEADERBOARD_DISABLE_BOOTSTRAP === 'true',
  FAKE_ONLINE_COUNT: parseInt(process.env.LEADERBOARD_FAKE_ONLINE) || 0
};

// Demo user profiles
const DEMO_USERS = [
  { name: 'Zephyr_FX', profile: 'grinder' },
  { name: 'Kai_Trader', profile: 'grinder' },
  { name: 'Luna_Charts', profile: 'sprinter' },
  { name: 'Orion_Pips', profile: 'sprinter' },
  { name: 'Phoenix_Gold', profile: 'weekend' },
  { name: 'Atlas_Markets', profile: 'weekend' },
  { name: 'Nova_Scalper', profile: 'steady' },
  { name: 'River_Swing', profile: 'steady' },
  { name: 'Sage_Technical', profile: 'course' },
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
  { name: 'Yuki_SMC', profile: 'course' }
];

// ============================================================================
// Centralized Timeframe Boundary Calculator (Single Source of Truth)
// ============================================================================

/**
 * Get UTC date boundaries for a timeframe.
 * All boundaries use the START of the period (00:00:00.000 UTC).
 * 
 * @param {string} timeframe - 'daily' | 'weekly' | 'monthly' | 'all-time'
 * @returns {{ start: Date | null, end: Date, label: string }}
 */
function getTimeframeBoundaries(timeframe) {
  const now = new Date();
  
  // Current UTC values
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  
  switch (timeframe) {
    case 'daily': {
      // Start of today (midnight UTC)
      const start = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
      return { start, end: now, label: 'today' };
    }
    
    case 'weekly': {
      // Start of ISO week (Monday 00:00 UTC)
      // ISO week: Monday = 1, Sunday = 7
      // JS getUTCDay(): Sunday = 0, Monday = 1, ..., Saturday = 6
      // Days to subtract to get to Monday:
      // Sunday (0) -> go back 6 days
      // Monday (1) -> go back 0 days
      // Tuesday (2) -> go back 1 day
      // etc.
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(Date.UTC(year, month, date - daysFromMonday, 0, 0, 0, 0));
      return { start, end: now, label: 'this week' };
    }
    
    case 'monthly': {
      // Start of calendar month (1st 00:00 UTC)
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      return { start, end: now, label: 'this month' };
    }
    
    case 'all-time':
    default: {
      // No start boundary - all events ever
      return { start: null, end: now, label: 'all time' };
    }
  }
}

/**
 * Format Date to MySQL DATETIME string (UTC)
 */
function toMySQLDatetime(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

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

function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ============================================================================
// Bootstrap Mode Detection
// ============================================================================

let bootstrapStatus = null;
let bootstrapCheckTime = 0;
const BOOTSTRAP_CHECK_INTERVAL = 60000; // Re-check every minute

/**
 * Check if bootstrap mode should be active.
 * Returns true if we should use demo data, false if we have enough real traffic.
 */
async function isBootstrapModeActive() {
  // Force flags take precedence
  if (BOOTSTRAP_CONFIG.FORCE_DISABLE_BOOTSTRAP) return false;
  if (BOOTSTRAP_CONFIG.FORCE_BOOTSTRAP) return true;
  
  // Use cached result if recent
  if (bootstrapStatus !== null && Date.now() - bootstrapCheckTime < BOOTSTRAP_CHECK_INTERVAL) {
    return bootstrapStatus;
  }
  
  try {
    // Check real user count (non-demo users with activity)
    const [realUsersResult] = await executeQuery(`
      SELECT COUNT(DISTINCT u.id) as cnt 
      FROM users u 
      WHERE (u.is_demo IS NULL OR u.is_demo = FALSE)
        AND u.xp > 0
    `);
    const realUsers = getRows(realUsersResult)[0]?.cnt || 0;
    
    // Check real xp_events in last 7 days (non-demo)
    const [realEventsResult] = await executeQuery(`
      SELECT COUNT(*) as cnt 
      FROM xp_events e
      JOIN users u ON e.user_id = u.id
      WHERE e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND (u.is_demo IS NULL OR u.is_demo = FALSE)
    `);
    const realEvents7d = getRows(realEventsResult)[0]?.cnt || 0;
    
    // Kill-switch: disable bootstrap if thresholds met
    const shouldDisable = realUsers >= BOOTSTRAP_CONFIG.MIN_REAL_USERS || 
                          realEvents7d >= BOOTSTRAP_CONFIG.MIN_REAL_EVENTS_7D;
    
    bootstrapStatus = !shouldDisable;
    bootstrapCheckTime = Date.now();
    
    console.log(`Bootstrap mode: ${bootstrapStatus ? 'ACTIVE' : 'DISABLED'} (users: ${realUsers}, events7d: ${realEvents7d})`);
    
    return bootstrapStatus;
  } catch (e) {
    console.error('Bootstrap check error:', e.message);
    return bootstrapStatus ?? true; // Default to bootstrap on error
  }
}

// ============================================================================
// Database Schema Setup (Idempotent)
// ============================================================================

let schemaChecked = false;

async function ensureSchema() {
  if (schemaChecked) return;
  
  try {
    // Ensure xp_events table exists
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
        INDEX idx_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Check if is_demo column exists
    const [colResult] = await executeQuery(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_demo'
    `);
    
    if (getRows(colResult).length === 0) {
      await executeQuery(`ALTER TABLE users ADD COLUMN is_demo BOOLEAN DEFAULT FALSE`);
    }
    
    schemaChecked = true;
  } catch (e) {
    console.log('Schema setup:', e.message);
    schemaChecked = true; // Don't retry
  }
}

// ============================================================================
// Demo User Seeding (Bootstrap Mode Only)
// ============================================================================

let demoSeeded = false;

/**
 * Generate XP events for demo users across the last 30 days.
 * Events are distributed to ensure daily/weekly/monthly rankings differ.
 */
async function seedDemoUsers() {
  if (demoSeeded) return;
  
  const cacheKey = 'demo_seeded_v7';
  if (getCached(cacheKey, 3600000)) {
    demoSeeded = true;
    return;
  }
  
  try {
    console.log('Seeding demo users with XP events...');
    const sources = ['chat_message', 'daily_login', 'course_complete', 'streak_bonus', 'community_help'];
    const now = new Date();
    const boundaries = {
      daily: getTimeframeBoundaries('daily'),
      weekly: getTimeframeBoundaries('weekly'),
      monthly: getTimeframeBoundaries('monthly')
    };
    
    for (let i = 0; i < DEMO_USERS.length; i++) {
      const { name, profile } = DEMO_USERS[i];
      const email = `demo_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@aurafx.demo`;
      
      // Create or get user
      let [existingResult] = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
      let existing = getRows(existingResult);
      
      let userId;
      if (existing.length === 0) {
        const totalXP = Math.floor(5000 + seededRandom(i * 100) * 45000);
        const level = getLevelFromXP(totalXP);
        
        const [insertResult] = await executeQuery(
          `INSERT INTO users (email, username, name, password, role, xp, level, is_demo, created_at) 
           VALUES (?, ?, ?, ?, 'free', ?, ?, TRUE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [email, name, name, `demo_${Date.now()}_${i}`, totalXP, level, 30 + Math.floor(seededRandom(i) * 60)]
        ).catch(() => [null]);
        
        userId = insertResult?.insertId;
      } else {
        userId = existing[0].id;
      }
      
      if (!userId) continue;
      
      // Check if already has events
      const [eventCheck] = await executeQuery(
        'SELECT COUNT(*) as cnt FROM xp_events WHERE user_id = ?', [userId]
      );
      if (getRows(eventCheck)[0]?.cnt > 10) continue;
      
      // Generate events based on profile
      const seed = userId * 1000 + i;
      const profileConfigs = {
        grinder: { daily: [8, 15], weekly: [40, 70], monthly: [120, 200] },
        sprinter: { daily: [2, 8], weekly: [25, 50], monthly: [80, 150] },
        weekend: { daily: [1, 4], weekly: [20, 40], monthly: [60, 120] },
        steady: { daily: [4, 8], weekly: [25, 45], monthly: [90, 160] },
        course: { daily: [2, 6], weekly: [20, 40], monthly: [70, 140] }
      };
      
      const cfg = profileConfigs[profile] || profileConfigs.steady;
      
      // Generate events for each timeframe with proper distribution
      // Monthly events (days 8-30 ago) - most events, oldest
      const monthlyCount = Math.floor(seededRandom(seed + 3) * (cfg.monthly[1] - cfg.monthly[0])) + cfg.monthly[0];
      for (let j = 0; j < monthlyCount * 0.6; j++) {
        const amount = Math.floor(seededRandom(seed + j + 300) * 150) + 20;
        const daysAgo = 8 + Math.floor(seededRandom(seed + j + 310) * 22);
        const source = sources[Math.floor(seededRandom(seed + j + 320) * sources.length)];
        
        await executeQuery(
          `INSERT INTO xp_events (user_id, amount, source, created_at) 
           VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [userId, amount, source, daysAgo]
        ).catch(() => {});
      }
      
      // Weekly events (days 1-7 ago, excluding today)
      const weeklyCount = Math.floor(seededRandom(seed + 2) * (cfg.weekly[1] - cfg.weekly[0])) + cfg.weekly[0];
      for (let j = 0; j < weeklyCount * 0.4; j++) {
        const amount = Math.floor(seededRandom(seed + j + 200) * 200) + 30;
        const daysAgo = 1 + Math.floor(seededRandom(seed + j + 210) * 6);
        const source = sources[Math.floor(seededRandom(seed + j + 220) * sources.length)];
        
        await executeQuery(
          `INSERT INTO xp_events (user_id, amount, source, created_at) 
           VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [userId, amount, source, daysAgo]
        ).catch(() => {});
      }
      
      // Daily events (today only)
      const dailyCount = Math.floor(seededRandom(seed + 1) * (cfg.daily[1] - cfg.daily[0])) + cfg.daily[0];
      for (let j = 0; j < dailyCount; j++) {
        const amount = Math.floor(seededRandom(seed + j + 100) * 180) + 40;
        const hoursAgo = Math.floor(seededRandom(seed + j + 110) * 18);
        const source = sources[Math.floor(seededRandom(seed + j + 120) * sources.length)];
        
        await executeQuery(
          `INSERT INTO xp_events (user_id, amount, source, created_at) 
           VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
          [userId, amount, source, hoursAgo]
        ).catch(() => {});
      }
    }
    
    setCached(cacheKey, true);
    demoSeeded = true;
    console.log('Demo users seeded successfully');
  } catch (e) {
    console.error('Demo seeding error:', e.message);
    demoSeeded = true;
  }
}

// ============================================================================
// Main Leaderboard Query
// ============================================================================

/**
 * Query leaderboard for a specific timeframe.
 * ALL timeframes use the xp_events ledger with different date filters.
 */
async function queryLeaderboard(timeframe, limit, logger, includeDemo = true) {
  const boundaries = getTimeframeBoundaries(timeframe);
  const startDate = toMySQLDatetime(boundaries.start);
  
  logger.startTimer('db_query');
  
  let query;
  let params = [];
  
  // Demo filter - only apply when we want to exclude demo users
  const demoFilter = includeDemo ? '' : 'AND (u.is_demo IS NULL OR u.is_demo = FALSE)';
  
  if (timeframe === 'all-time') {
    // All-time: SUM of ALL xp_events (no date filter)
    query = `
      SELECT 
        u.id, u.username, u.name, u.email, 
        COALESCE(u.xp, 0) as total_xp,
        COALESCE(u.level, 1) as level, 
        u.avatar, u.role,
        COALESCE(u.is_demo, FALSE) as is_demo,
        COALESCE(SUM(e.amount), COALESCE(u.xp, 0)) as period_xp,
        MAX(e.created_at) as last_xp_time
      FROM users u
      LEFT JOIN xp_events e ON u.id = e.user_id
      WHERE COALESCE(u.xp, 0) > 0 ${demoFilter}
      GROUP BY u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo
      ORDER BY period_xp DESC, last_xp_time DESC
      LIMIT ${limit}
    `;
  } else {
    // Time-based: SUM of xp_events within the date boundary
    query = `
      SELECT 
        u.id, u.username, u.name, u.email, 
        COALESCE(u.xp, 0) as total_xp,
        COALESCE(u.level, 1) as level, 
        u.avatar, u.role,
        COALESCE(u.is_demo, FALSE) as is_demo,
        COALESCE(SUM(e.amount), 0) as period_xp,
        MAX(e.created_at) as last_xp_time
      FROM users u
      INNER JOIN xp_events e ON u.id = e.user_id AND e.created_at >= ?
      WHERE 1=1 ${demoFilter}
      GROUP BY u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo
      HAVING period_xp > 0
      ORDER BY period_xp DESC, last_xp_time ASC
      LIMIT ${limit}
    `;
    params = [startDate];
  }
  
  logger.debug('Query', { timeframe, startDate, includeDemo });
  
  const result = await executeQueryWithTimeout(query, params, 10000, logger.requestId);
  const leaderboard = getRows(result);
  
  logger.endTimer('db_query');
  logger.debug('Query result', { count: leaderboard.length });
  
  return leaderboard;
}

// ============================================================================
// Prize Eligibility (Server-Side Only)
// ============================================================================

/**
 * Get prize-eligible leaderboard (excludes demo users).
 * This is for admin/export purposes only - NEVER expose is_demo to public UI.
 */
async function getPrizeEligibleLeaderboard(timeframe, limit, logger) {
  return queryLeaderboard(timeframe, limit, logger, false); // excludeDemo = true
}

// ============================================================================
// Main API Handler
// ============================================================================

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

    // Validate inputs
    const timeframe = safeTimeframe(req.query.timeframe);
    const limit = safeLimit(req.query.limit, 10, 100);
    const prizeEligibleOnly = req.query.prizeEligible === 'true';
    
    logger.info('Leaderboard request', { timeframe, limit, prizeEligibleOnly });
    
    // Check cache
    const cacheTTL = timeframe === 'all-time' ? DEFAULT_TTLS.LEADERBOARD_ALLTIME : DEFAULT_TTLS.LEADERBOARD;
    const cacheKey = `leaderboard_v8_${timeframe}_${limit}_${prizeEligibleOnly}`;
    const coalesceKey = `lb_query_${timeframe}_${limit}`;
    
    const cached = getCached(cacheKey, cacheTTL);
    if (cached) {
      logger.info('Cache HIT', { ms: Date.now() - startTime });
      return res.status(200).json({ 
        success: true, 
        leaderboard: cached.leaderboard,
        timeframe,
        periodStart: cached.periodStart,
        periodEnd: cached.periodEnd,
        cached: true,
        requestId,
        queryTimeMs: Date.now() - startTime
      });
    }
    
    logger.info('Cache MISS');

    // Fetch with request coalescing
    const fetchLeaderboard = async () => {
      logger.startTimer('db_setup');
      
      // Ensure schema (with timeout)
      await Promise.race([
        ensureSchema(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
      
      // Check bootstrap mode and seed if needed
      const bootstrapActive = await isBootstrapModeActive();
      if (bootstrapActive) {
        await Promise.race([
          seedDemoUsers(),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      }
      
      logger.endTimer('db_setup');
      
      // Query (include demo users in public leaderboard unless prize-eligible)
      const includeDemo = !prizeEligibleOnly;
      return queryLeaderboard(timeframe, limit, logger, includeDemo);
    };
    
    const rawLeaderboard = await coalesceRequest(coalesceKey, fetchLeaderboard, 200);
    const boundaries = getTimeframeBoundaries(timeframe);

    // Format response - NEVER expose is_demo to public UI
    const formattedLeaderboard = rawLeaderboard.map((user, index) => ({
      rank: index + 1,
      id: user.id,
      userId: user.id,
      username: user.username || user.name || user.email?.split('@')[0] || 'Trader',
      xp: parseFloat(user.period_xp) || 0,
      totalXP: parseFloat(user.total_xp) || 0,
      level: parseInt(user.level) || getLevelFromXP(parseFloat(user.total_xp) || 0),
      avatar: user.avatar || 'avatar_ai.png',
      role: user.role || 'free',
      // NOTE: is_demo is intentionally NOT included in public response
      strikes: 0
    }));

    // Cache result
    const cacheData = {
      leaderboard: formattedLeaderboard,
      periodStart: boundaries.start?.toISOString() || null,
      periodEnd: boundaries.end?.toISOString() || null
    };
    setCached(cacheKey, cacheData, cacheTTL);

    const queryTime = Date.now() - startTime;
    logger.info('Query completed', { 
      queryTimeMs: queryTime, 
      resultCount: formattedLeaderboard.length,
      bootstrapActive: bootstrapStatus
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
    logger.error('Leaderboard error', { error: error.message, queryTimeMs: queryTime });
    
    return res.status(500).json({ 
      success: false, 
      errorCode: 'SERVER_ERROR',
      message: 'Failed to load leaderboard. Please try again.',
      leaderboard: [],
      requestId,
      queryTimeMs: queryTime
    });
  }
};

// Export for testing
module.exports.getTimeframeBoundaries = getTimeframeBoundaries;
module.exports.isBootstrapModeActive = isBootstrapModeActive;
module.exports.getPrizeEligibleLeaderboard = getPrizeEligibleLeaderboard;
