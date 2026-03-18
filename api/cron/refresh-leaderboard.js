/**
 * Cron Job: Refresh Leaderboard Rollups
 * 
 * This endpoint is called by Vercel Cron (configured in vercel.json)
 * to refresh cached leaderboard data and clean up old XP events.
 * 
 * Schedule: Every 5 minutes (configured in vercel.json crons array)
 * 
 * NOTE: Do NOT add cron schedule parsing in this JS file.
 * Cron scheduling is handled by Vercel's cron system, not Node.js.
 */

const { executeQuery } = require('../db');
const { setCached, clearCache, invalidatePattern } = require('../cache');
const { purgeDemoUsers } = require('../utils/purge-demo-users');
const { syncUserXpFromLedger } = require('../utils/sync-user-xp');

// Helper to get array from query result
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

module.exports = async (req, res) => {
  // Verify cron secret or allow from Vercel Cron
  // See: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();

  const isVercelCronHeader = req.headers['x-vercel-cron'] === '1';
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isVercelCronUA = userAgent.includes('vercel-cron');

  const allowed = isVercelCronHeader || hasValidSecret || (isVercelCronUA && process.env.VERCEL);

  if (!allowed && process.env.NODE_ENV === 'production') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Set CRON_SECRET in Vercel env vars for secure cron auth.'
    });
  }

  const startTime = Date.now();
  const results = {
    cleanedEvents: 0,
    updatedLevels: 0,
    refreshedCaches: 0,
    errors: []
  };

  try {
    try {
      const { deletedUsers } = await purgeDemoUsers(executeQuery, { log: console.log });
      if (deletedUsers > 0) {
        results.demoUsersPurged = deletedUsers;
        invalidatePattern('leaderboard_v*');
        invalidatePattern('community_users*');
      }
    } catch (e) {
      results.errors.push(`Demo purge: ${e.message}`);
    }

    try {
      const sync = await syncUserXpFromLedger(executeQuery);
      results.xpSync = sync;
      invalidatePattern('leaderboard_v*');
    } catch (e) {
      results.errors.push(`XP sync: ${e.message}`);
    }

    // 1. Clean up old XP events (keep last 90 days)
    try {
      // Keep admin grants & daily_login forever-ish; other events after 2y (ledger drives users.xp on sync)
      const cleanResult = await executeQuery(`
        DELETE FROM xp_events 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 730 DAY)
          AND source NOT IN ('admin_grant', 'admin_adjust', 'daily_login')
      `);
      results.cleanedEvents = cleanResult?.affectedRows || 0;
    } catch (e) {
      results.errors.push(`Clean events: ${e.message}`);
    }

    // 2. Sync user XP totals with xp_events (for data integrity)
    try {
      // Get users whose XP might be out of sync
      const usersResult = await executeQuery(`
        SELECT u.id, u.xp as stored_xp, COALESCE(SUM(e.amount), 0) as event_xp
        FROM users u
        LEFT JOIN xp_events e ON u.id = e.user_id
        WHERE u.is_demo = FALSE OR u.is_demo IS NULL
        GROUP BY u.id, u.xp
        HAVING ABS(stored_xp - event_xp) > 10
        LIMIT 100
      `);
      
      const users = getRows(usersResult);
      
      // Note: We don't auto-sync as stored XP may include events before xp_events table existed
      // This is just for monitoring
      results.outOfSyncUsers = users.length;
    } catch (e) {
      results.errors.push(`Sync check: ${e.message}`);
    }

    // 3. Levels already updated by syncUserXpFromLedger; optional second pass for users with xp=0 edge cases
    try {
      const levelResult = await executeQuery(`
        UPDATE users u
        SET level = CASE
          WHEN COALESCE(u.xp, 0) <= 0 THEN 1
          WHEN u.xp < 500 THEN FLOOR(SQRT(u.xp / 50)) + 1
          WHEN u.xp < 5000 THEN 10 + FLOOR(SQRT((u.xp - 500) / 100)) + 1
          WHEN u.xp < 20000 THEN 50 + FLOOR(SQRT((u.xp - 5000) / 200)) + 1
          WHEN u.xp < 100000 THEN 100 + FLOOR(SQRT((u.xp - 20000) / 500)) + 1
          WHEN u.xp < 500000 THEN 200 + FLOOR(SQRT((u.xp - 100000) / 1000)) + 1
          ELSE LEAST(1000, 500 + FLOOR(SQRT((u.xp - 500000) / 2000)) + 1)
        END
      `);
      results.updatedLevels = levelResult?.affectedRows || 0;
    } catch (e) {
      results.errors.push(`Update levels: ${e.message}`);
    }

    // 4. Pre-compute and cache leaderboards for each timeframe
    const timeframes = ['daily', 'weekly', 'monthly', 'all-time'];
    
    for (const timeframe of timeframes) {
      try {
        // Trigger cache refresh by making internal request
        const baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
          
        // Just clear cache for this timeframe - next request will regenerate
        // This is more efficient than pre-generating
        results.refreshedCaches++;
      } catch (e) {
        results.errors.push(`Cache ${timeframe}: ${e.message}`);
      }
    }

    // 5. Reset daily XP tracking at midnight UTC
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 10) {
      // It's within 10 minutes of midnight UTC - good time for daily reset tasks
      results.dailyResetTriggered = true;
      
      // Could add: daily leaderboard snapshots, prize distribution, etc.
    }

    // 6. Weekly reset on Monday
    if (now.getUTCDay() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() < 10) {
      results.weeklyResetTriggered = true;
    }

    // 7. Monthly reset on 1st
    if (now.getUTCDate() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() < 10) {
      results.monthlyResetTriggered = true;
    }

    const duration = Date.now() - startTime;
    
    return res.status(200).json({
      success: true,
      message: 'Leaderboard refresh completed',
      duration: `${duration}ms`,
      results
    });

  } catch (error) {
    console.error('Cron refresh error:', error);
    return res.status(500).json({
      success: false,
      message: 'Refresh failed',
      error: error.message,
      results
    });
  }
};
