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

// Seed demo users with realistic XP distributions
async function seedDemoUsers() {
  const seededKey = 'leaderboard_seeded_v3';
  const cached = getCached(seededKey, 86400000); // 24h
  if (cached) return;

  try {
    // Check if we have enough real users
    const realUsersResult = await executeQuery(
      'SELECT COUNT(*) as count FROM users WHERE is_demo = FALSE OR is_demo IS NULL'
    );
    const realCount = getRows(realUsersResult)[0]?.count || 0;
    
    // Only seed if we have very few real users
    if (realCount >= 10) {
      setCached(seededKey, true);
      return;
    }

    // Create demo users
    for (let i = 0; i < DEMO_USERNAMES.length; i++) {
      const username = DEMO_USERNAMES[i];
      const email = `demo_${username.toLowerCase()}@aurafx.demo`;
      
      // Check if exists
      const existingResult = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
      const existing = getRows(existingResult);
      
      let userId;
      if (existing.length === 0) {
        // Create user with is_demo = true
        const totalXP = Math.floor(1000 + Math.random() * 49000); // 1k-50k XP
        const level = getLevelFromXP(totalXP);
        
        const insertResult = await executeQuery(
          `INSERT INTO users (email, username, name, password, role, xp, level, is_demo, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [email, username, username, 'demo_user_' + Date.now(), 'free', totalXP, level, Math.floor(Math.random() * 60)]
        );
        const insertRows = getRows(insertResult);
        userId = insertRows.insertId || insertResult.insertId;
      } else {
        userId = existing[0].id;
        // Mark as demo if not already
        await executeQuery('UPDATE users SET is_demo = TRUE WHERE id = ?', [userId]);
      }
      
      if (!userId) continue;
      
      // Generate XP events for different timeframes with varied distributions
      const now = new Date();
      
      // Today's XP: 10-150 XP (beatable)
      const todayXP = Math.floor(10 + (20 - i) * 7 + Math.random() * 30);
      const todayEvents = Math.floor(1 + Math.random() * 5);
      for (let j = 0; j < todayEvents; j++) {
        const eventTime = new Date(now);
        eventTime.setUTCHours(Math.floor(Math.random() * now.getUTCHours()), Math.floor(Math.random() * 60));
        
        await executeQuery(
          `INSERT INTO xp_events (user_id, amount, source, created_at) 
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = amount`,
          [userId, Math.floor(todayXP / todayEvents), 'message', eventTime]
        ).catch(() => {});
      }
      
      // This week's XP: 50-500 XP (beatable)
      const weekXP = Math.floor(50 + (20 - i) * 22 + Math.random() * 100);
      const weekEvents = Math.floor(3 + Math.random() * 10);
      for (let j = 0; j < weekEvents; j++) {
        const daysAgo = Math.floor(Math.random() * 7);
        const eventTime = new Date(now);
        eventTime.setUTCDate(eventTime.getUTCDate() - daysAgo);
        eventTime.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
        
        await executeQuery(
          `INSERT INTO xp_events (user_id, amount, source, created_at) VALUES (?, ?, ?, ?)`,
          [userId, Math.floor(weekXP / weekEvents), 'activity', eventTime]
        ).catch(() => {});
      }
      
      // This month's XP: 200-2000 XP (beatable)
      const monthXP = Math.floor(200 + (20 - i) * 90 + Math.random() * 500);
      const monthEvents = Math.floor(10 + Math.random() * 30);
      for (let j = 0; j < monthEvents; j++) {
        const daysAgo = Math.floor(Math.random() * 28);
        const eventTime = new Date(now);
        eventTime.setUTCDate(eventTime.getUTCDate() - daysAgo);
        eventTime.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
        
        await executeQuery(
          `INSERT INTO xp_events (user_id, amount, source, created_at) VALUES (?, ?, ?, ?)`,
          [userId, Math.floor(monthXP / monthEvents), 'login', eventTime]
        ).catch(() => {});
      }
    }
    
    setCached(seededKey, true);
  } catch (e) {
    console.error('Error seeding demo users:', e);
  }
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const timeframe = req.query.timeframe || 'all-time';
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
    // Check cache (1 minute for time-based, 5 minutes for all-time)
    const cacheTTL = timeframe === 'all-time' ? 300000 : 60000;
    const cacheKey = `leaderboard_v3_${timeframe}_${limit}`;
    const cached = getCached(cacheKey, cacheTTL);
    if (cached) {
      return res.status(200).json({ success: true, leaderboard: cached, cached: true, timeframe });
    }

    // Ensure tables exist
    await ensureXpEventsTable();
    await ensureDemoColumn();
    
    // Seed demo users if needed
    await seedDemoUsers();

    const boundaries = getDateBoundaries(timeframe);
    let leaderboard = [];

    if (timeframe === 'all-time') {
      // All-time: Sort by level DESC, then total XP DESC
      const result = await executeQuery(`
        SELECT 
          u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo,
          u.xp as period_xp
        FROM users u
        WHERE u.xp > 0
        ORDER BY u.level DESC, u.xp DESC
        LIMIT ?
      `, [limit]);
      
      leaderboard = getRows(result);
    } else {
      // Time-based: Aggregate XP from xp_events
      const startDate = boundaries.start.toISOString().slice(0, 19).replace('T', ' ');
      
      const result = await executeQuery(`
        SELECT 
          u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo,
          COALESCE(SUM(e.amount), 0) as period_xp,
          MAX(e.created_at) as last_xp_time
        FROM users u
        LEFT JOIN xp_events e ON u.id = e.user_id AND e.created_at >= ?
        GROUP BY u.id, u.username, u.name, u.email, u.xp, u.level, u.avatar, u.role, u.is_demo
        HAVING period_xp > 0
        ORDER BY period_xp DESC, last_xp_time ASC
        LIMIT ?
      `, [startDate, limit]);
      
      leaderboard = getRows(result);
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

    return res.status(200).json({ 
      success: true, 
      leaderboard: formattedLeaderboard,
      timeframe,
      periodStart: boundaries.start?.toISOString() || null,
      periodEnd: boundaries.end?.toISOString() || null
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(200).json({ success: true, leaderboard: [], error: error.message });
  }
};
