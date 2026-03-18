/**
 * GET /api/referral/stats — referral counts for the logged-in user (Bearer JWT).
 * Uses users.referred_by (referrer user id) when present.
 */

const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const userId = Number(decoded.id);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    await addColumnIfNotExists('users', 'referred_by', 'INT NULL DEFAULT NULL');
  } catch (_) {}

  try {
    const [totalR] = await executeQuery(
      'SELECT COUNT(*) AS c FROM users WHERE referred_by = ?',
      [userId]
    );
    const referrals = Number(getRows(totalR)[0]?.c ?? 0);

    let active = referrals;
    try {
      const [activeR] = await executeQuery(
        `SELECT COUNT(*) AS c FROM users u
         WHERE u.referred_by = ?
           AND LOWER(COALESCE(u.subscription_status, '')) IN ('active', 'trialing')`,
        [userId]
      );
      active = Number(getRows(activeR)[0]?.c ?? 0);
    } catch (_) {
      active = referrals;
    }

    return res.status(200).json({
      success: true,
      referrals,
      active,
      earned: 0,
    });
  } catch (e) {
    console.error('referral/stats:', e.message);
    return res.status(200).json({
      success: true,
      referrals: 0,
      active: 0,
      earned: 0,
    });
  }
};
