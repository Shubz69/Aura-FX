/**
 * Leaderboard API - Real XP-based leaderboard with proper time boundaries
 *
 * Timeframes (all use xp_events ledger):
 * - daily / weekly / monthly: SUM(xp_events) in period
 * - all-time: users.xp (canonical total)
 *
 * Demo/seed accounts are purged on load (see purge-demo-users) and never listed.
 */

const { executeQuery, executeQueryWithTimeout } = require('./db');
const { getCached, setCached, getOrFetch, DEFAULT_TTLS, invalidatePattern } = require('./cache');
const { generateRequestId, createLogger } = require('./utils/logger');
const { checkRateLimit, coalesceRequest, RATE_LIMIT_CONFIGS } = require('./utils/rate-limiter');
const { safeLimit, safeTimeframe } = require('./utils/validators');
const { purgeDemoUsers } = require('./utils/purge-demo-users');
const { getLevelFromXP, MAX_LEVEL } = require('./utils/xp-system');

/** Latest activity for leaderboard presence (ISO or null). */
function toIso(d) {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

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

// ============================================================================
// Database Schema Setup (Idempotent) + demo user purge
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
        amount DECIMAL(14, 4) NOT NULL,
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

    try {
      const { deletedUsers, steps } = await purgeDemoUsers(executeQuery, { log: console.log });
      if (deletedUsers > 0) {
        console.log('Demo users purged from DB:', steps.join(', '));
        invalidatePattern('leaderboard_v*');
      }
    } catch (cleanupErr) {
      console.log('Demo purge (non-fatal):', cleanupErr.message);
    }

    schemaChecked = true;
  } catch (e) {
    console.log('Schema setup:', e.message);
    schemaChecked = true; // Don't retry
  }
}

// ============================================================================
// Main Leaderboard Query
// ============================================================================

/**
 * Query leaderboard for a specific timeframe.
 * ALL timeframes use the xp_events ledger with different date filters.
 */
async function queryLeaderboard(timeframe, limit, logger, includeDemo = false) {
  const boundaries = getTimeframeBoundaries(timeframe);
  const startDate = toMySQLDatetime(boundaries.start);
  
  logger.startTimer('db_query');
  
  let query;
  let params = [];
  
  // Demo filter - only apply when we want to exclude demo users
  const demoFilter = includeDemo
    ? ''
    : `AND (u.is_demo IS NULL OR u.is_demo = FALSE)
       AND (u.email IS NULL OR u.email NOT LIKE '%@aurafx.demo')`;
  
  if (timeframe === 'all-time') {
    // All-time: rank by users.xp (canonical total). Includes all roles (admin/super_admin included).
    // No role filter – admins/superadmins with high XP appear like any other user.
    query = `
      SELECT 
        u.id, u.username, u.name, u.email, 
        COALESCE(u.xp, 0) as total_xp,
        COALESCE(u.level, 1) as level, 
        u.avatar, u.role,
        COALESCE(u.is_demo, FALSE) as is_demo,
        COALESCE(u.xp, 0) as period_xp,
        u.last_seen as last_seen,
        (SELECT MAX(e.created_at) FROM xp_events e WHERE e.user_id = u.id) as last_xp_time
      FROM users u
      WHERE COALESCE(u.xp, 0) > 0 ${demoFilter}
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
        MAX(e.created_at) as last_xp_time,
        u.last_seen as last_seen
      FROM users u
      INNER JOIN xp_events e ON u.id = e.user_id AND e.created_at >= ?
      WHERE 1=1 ${demoFilter}
      GROUP BY u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo, u.last_seen
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
    const cacheKey = `leaderboard_v13_${timeframe}_${limit}_${prizeEligibleOnly}`;
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
      
      logger.endTimer('db_setup');

      return queryLeaderboard(timeframe, limit, logger, false);
    };
    
    const rawLeaderboard = await coalesceRequest(coalesceKey, fetchLeaderboard, 200);
    const boundaries = getTimeframeBoundaries(timeframe);

    // Format response - NEVER expose is_demo to public UI
    // Level always derived from canonical users.xp (MAX_LEVEL 100); ignore stale DB level column.
    const formattedLeaderboard = rawLeaderboard.map((user, index) => {
      const totalXp = parseFloat(user.total_xp) || 0;
      const lastXpAt = toIso(user.last_xp_time);
      const lastSeenAt = toIso(user.last_seen);
      const lastActivityAt = maxIso(lastSeenAt, lastXpAt);
      return {
        rank: index + 1,
        id: user.id,
        userId: user.id,
        username: user.username || user.name || user.email?.split('@')[0] || 'Trader',
        xp: parseFloat(user.period_xp) || 0,
        totalXP: totalXp,
        level: Math.min(MAX_LEVEL, getLevelFromXP(totalXp)),
        avatar: user.avatar ?? null,
        role: user.role || 'free',
        lastSeenAt,
        lastXpAt,
        lastActivityAt,
        // NOTE: is_demo is intentionally NOT included in public response
        strikes: 0
      };
    });

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
      resultCount: formattedLeaderboard.length
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
module.exports.getPrizeEligibleLeaderboard = getPrizeEligibleLeaderboard;
module.exports.purgeDemoUsers = () => purgeDemoUsers(executeQuery);
