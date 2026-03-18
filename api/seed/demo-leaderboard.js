/**
 * Demo leaderboard seeding has been removed.
 * This endpoint only PURGES demo users (is_demo / @aurafx.demo) when called with auth.
 */

const { executeQuery } = require('../db');
const { purgeDemoUsers, getRows } = require('../utils/purge-demo-users');
const { invalidatePattern } = require('../cache');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  const isAuthorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    req.headers['x-vercel-cron'] === '1';

  if (req.method === 'GET') {
    try {
      const [r] = await executeQuery(
        `SELECT COUNT(*) as c FROM users WHERE is_demo = TRUE OR is_demo = 1 OR email LIKE '%@aurafx.demo'`
      );
      const count = getRows(r)[0]?.c ?? 0;
      return res.status(200).json({
        success: true,
        demoUsersRemaining: count,
        message:
          count > 0
            ? 'Demo users still in DB; POST with CRON_SECRET to purge.'
            : 'No demo users. Seeding is disabled; leaderboard uses real users only.'
      });
    } catch (e) {
      return res.status(200).json({ success: true, demoUsersRemaining: 0, message: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!isAuthorized) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const result = await purgeDemoUsers(executeQuery, { log: console.log });
    invalidatePattern('leaderboard_v10*');
    invalidatePattern('community_users*');
    return res.status(200).json({
      success: true,
      purged: true,
      deletedUsers: result.deletedUsers,
      steps: result.steps,
      message: 'Demo accounts removed from database.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports.purgeDemoUsers = () => purgeDemoUsers(executeQuery);
