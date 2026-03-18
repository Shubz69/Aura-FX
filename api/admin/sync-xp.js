/**
 * POST /api/admin/sync-xp — sync users.xp from xp_events + recalc levels, clear leaderboard cache.
 * Auth: Bearer CRON_SECRET or Super Admin JWT.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { syncUserXpFromLedger } = require('../utils/sync-user-xp');
const { invalidatePattern } = require('../cache');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST only' });
  }

  const auth = req.headers.authorization || '';
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const dec = verifyToken(auth);
  const role = (dec?.role || '').toString().toUpperCase();
  const adminOk = dec?.id && (role === 'SUPER_ADMIN' || role === 'ADMIN');

  if (!cronOk && !adminOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const result = await syncUserXpFromLedger(executeQuery);
    invalidatePattern('leaderboard_v*');
    invalidatePattern('community_users*');
    return res.status(200).json({
      success: true,
      message: 'XP synced from xp_events where applicable; levels recalculated; leaderboard cache cleared.',
      ...result,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};
