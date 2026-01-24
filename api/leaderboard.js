/**
 * Leaderboard API - Real XP-based leaderboard with proper time boundaries
 * 
 * Timeframes:
 * - daily: XP earned today (midnight to now, UTC)
 * - weekly: XP earned this ISO week (Monday to Sunday)
 * - monthly: XP earned this calendar month
 * - all-time: Highest level/total XP
 */

const { executeQuery } = require('./db');
const { getCached, setCached } = require('./cache');

// Generate unique request ID for logging
function generateRequestId() {
  return `lb_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// Trading-style usernames for demo users
const DEMO_USERNAMES = [
  'Zephyr_FX', 'Kai_Trader', 'Luna_Charts', 'Orion_Pips', 'Phoenix_Gold',
  'Atlas_Markets', 'Nova_Scalper', 'River_Swing', 'Sage_Technical', 'Aurora_Signals',
  'Caspian_Forex', 'Indigo_Trends', 'Lyra_Analyst', 'Maverick_Risk', 'Seraphina_AI',
  'Titan_Macro', 'Vesper_Algo', 'Willow_Day', 'Xander_Quant', 'Yuki_SMC'
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
    // Today: midnight UTC to now
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    return { start, end: now };
  }
  
  if (timeframe === 'weekly') {
    // ISO week: Monday 00:00 UTC to Sunday 23:59 UTC
    const dayOfWeek = now.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, need to go back to Monday
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset, 0, 0, 0));
    return { start, end: now };
  }
  
  if (timeframe === 'monthly') {
    // Current calendar month: 1st of month 00:00 UTC to now
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    return { start, end: now };
  }
  
  // all-time: no boundaries
  return { start: null, end: null };
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
  } catch (e) {
    console.log('xp_events table check:', e.code || 'exists');
  }
}

// Ensure is_demo column exists on users
async function ensureDemoColumn() {
  try {
    await executeQuery(`ALTER TABLE users ADD COLUMN is_demo BOOLEAN DEFAULT FALSE`);
  } catch (e) {
    // Column likely exists
  }
}

// Import demo seeder
let seedDemoLeaderboard;
try {
  seedDemoLeaderboard = require('./seed/demo-leaderboard').seedDemoLeaderboard;
} catch (e) {
  seedDemoLeaderboard = null;
}

// Seed demo users with XP events for all timeframes
async function seedDemoUsers() {
  const seededKey = 'leaderboard_seeded_v5';
  const cached = getCached(seededKey, 3600000); // 1h cache
  if (cached) return;

  try {
    console.log('Checking if demo seeding needed...');
    
    // Use advanced seeder if available
    if (seedDemoLeaderboard) {
      await seedDemoLeaderboard({ minUsers: 30, maxUsers: 50, forceReseed: false });
      setCached(seededKey, true);
      return;
    }

    // Fallback: Create basic demo users with XP events
    for (let i = 0; i < DEMO_USERNAMES.length; i++) {
      const username = DEMO_USERNAMES[i];
      const email = `demo_${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@aurafx.demo`;
      
      const existingResult = await executeQuery('SELECT id, xp FROM users WHERE email = ?', [email]);
      const existing = getRows(existingResult);
      
      let userId;
      if (existing.length === 0) {
        const totalXP = Math.floor(500 + Math.random() * 10000);
        const level = getLevelFromXP(totalXP);
        
        const insertResult = await executeQuery(
          `INSERT INTO users (email, username, name, password, role, xp, level, is_demo, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [email, username, username, 'demo_' + Date.now(), 'free', totalXP, level, Math.floor(Math.random() * 60)]
        ).catch(() => null);
        
        if (insertResult?.insertId) {
          userId = insertResult.insertId;
        }
      } else {
        userId = existing[0].id;
      }
      
      // Ensure demo user has XP events for current timeframes
      if (userId) {
        await ensureDemoXpEvents(userId, i);
      }
    }
    
    setCached(seededKey, true);
  } catch (e) {
    console.error('Error seeding demo users:', e);
  }
}

// Create XP events for demo user across all timeframes
async function ensureDemoXpEvents(userId, seedIndex) {
  try {
    // Check if user already has recent events
    const recentResult = await executeQuery(
      'SELECT COUNT(*) as count FROM xp_events WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)',
      [userId]
    );
    const recentCount = getRows(recentResult)[0]?.count || 0;
    
    if (recentCount > 0) return; // Already has recent events
    
    // Seeded random based on userId for consistency
    const seededRandom = (seed) => {
      const x = Math.sin(seed * 12.9898 + seedIndex * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    
    const sources = ['chat_message', 'daily_login', 'course_complete', 'streak_bonus', 'community_help'];
    const now = new Date();
    
    // Create events for today (daily)
    const todayEvents = Math.floor(seededRandom(1) * 5) + 1;
    for (let i = 0; i < todayEvents; i++) {
      const amount = Math.floor(seededRandom(i + 10) * 30) + 5;
      const source = sources[Math.floor(seededRandom(i + 20) * sources.length)];
      const hoursAgo = Math.floor(seededRandom(i + 30) * 12);
      
      await executeQuery(
        `INSERT INTO xp_events (user_id, amount, source, meta, created_at) 
         VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
        [userId, amount, source, JSON.stringify({ demo: true }), hoursAgo]
      ).catch(() => {});
    }
    
    // Create events for this week
    const weekEvents = Math.floor(seededRandom(2) * 10) + 3;
    for (let i = 0; i < weekEvents; i++) {
      const amount = Math.floor(seededRandom(i + 40) * 50) + 10;
      const source = sources[Math.floor(seededRandom(i + 50) * sources.length)];
      const daysAgo = Math.floor(seededRandom(i + 60) * 6) + 1;
      
      await executeQuery(
        `INSERT INTO xp_events (user_id, amount, source, meta, created_at) 
         VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [userId, amount, source, JSON.stringify({ demo: true }), daysAgo]
      ).catch(() => {});
    }
    
    // Create events for this month
    const monthEvents = Math.floor(seededRandom(3) * 15) + 5;
    for (let i = 0; i < monthEvents; i++) {
      const amount = Math.floor(seededRandom(i + 70) * 75) + 15;
      const source = sources[Math.floor(seededRandom(i + 80) * sources.length)];
      const daysAgo = Math.floor(seededRandom(i + 90) * 25) + 7;
      
      await executeQuery(
        `INSERT INTO xp_events (user_id, amount, source, meta, created_at) 
         VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [userId, amount, source, JSON.stringify({ demo: true }), daysAgo]
      ).catch(() => {});
    }
  } catch (e) {
    // Silently fail for individual users
  }
}

module.exports = async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed', requestId });

  try {
    const timeframe = req.query.timeframe || 'all-time';
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
    console.log(`[${requestId}] Leaderboard request: timeframe=${timeframe}, limit=${limit}`);
    
    // Check cache (1 minute for time-based, 5 minutes for all-time)
    const cacheTTL = timeframe === 'all-time' ? 300000 : 60000;
    const cacheKey = `leaderboard_v3_${timeframe}_${limit}`;
    const cached = getCached(cacheKey, cacheTTL);
    if (cached) {
      console.log(`[${requestId}] Cache HIT (${Date.now() - startTime}ms)`);
      return res.status(200).json({ success: true, leaderboard: cached, cached: true, timeframe, requestId });
    }
    
    console.log(`[${requestId}] Cache MISS, querying database...`);

    // Ensure tables exist
    await ensureXpEventsTable();
    await ensureDemoColumn();
    
    // Seed demo users if needed
    await seedDemoUsers();

    const boundaries = getDateBoundaries(timeframe);
    let leaderboard = [];

    if (timeframe === 'all-time') {
      // All-time: Sort by level DESC, then total XP DESC
      // Handle NULL is_demo safely with COALESCE
      const result = await executeQuery(`
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
        LIMIT ?
      `, [limit]);
      
      leaderboard = getRows(result);
    } else {
      // Time-based: Aggregate XP from xp_events
      const startDate = boundaries.start.toISOString().slice(0, 19).replace('T', ' ');
      
      console.log(`[${requestId}] Querying xp_events since: ${startDate}`);
      
      const result = await executeQuery(`
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
        LIMIT ?
      `, [startDate, limit]);
      
      leaderboard = getRows(result);
      
      console.log(`[${requestId}] Time-based query returned ${leaderboard.length} users`);
      
      // Fallback: If no time-based results, show all-time instead
      if (leaderboard.length < 3) {
        console.log(`[${requestId}] Insufficient time-based data, falling back to all-time`);
        
        const fallbackResult = await executeQuery(`
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
          LIMIT ?
        `, [limit]);
        
        leaderboard = getRows(fallbackResult);
        console.log(`[${requestId}] Fallback returned ${leaderboard.length} users`);
      }
    }

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
    setCached(cacheKey, formattedLeaderboard);

    const queryTime = Date.now() - startTime;
    console.log(`[${requestId}] Query completed in ${queryTime}ms, returning ${formattedLeaderboard.length} users`);
    
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
    console.error(`[${requestId}] Leaderboard error:`, error);
    return res.status(200).json({ success: true, leaderboard: [], error: error.message, requestId });
  }
};
