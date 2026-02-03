/**
 * POST /api/community/accept-onboarding
 * Marks user as having accepted the Welcome channel rules (emoji reaction).
 * Assigns/refreshes roles and channel visibility based on current subscription.
 * Must be called when user's subscription changes (upgrade/downgrade) to re-unlock correct channels.
 */

const { getDbConnection } = require('../db');
const { getTier } = require('../utils/entitlements');

function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const padded = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = decodeToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const userId = decoded.id;

  try {
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database unavailable' });
    }

    try {
      const [userRows] = await db.execute(
        'SELECT id, subscription_plan, subscription_status, subscription_expiry, payment_failed, role FROM users WHERE id = ?',
        [userId]
      );
      if (!userRows || userRows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = userRows[0];
      const tier = getTier(user);
      const snapshot = (user.subscription_plan || user.role || 'free').toString().toLowerCase();

      await db.execute(
        'UPDATE users SET onboarding_accepted = TRUE, onboarding_accepted_at = NOW(), onboarding_subscription_snapshot = ? WHERE id = ?',
        [snapshot, userId]
      );

      return res.status(200).json({
        success: true,
        message: 'Onboarding accepted. Your channels have been unlocked.',
        tier,
        onboardingAccepted: true
      });
    } finally {
      try {
        if (db.release) db.release();
      } catch (e) { /* ignore */ }
    }
  } catch (error) {
    console.error('Accept onboarding error:', error);
    return res.status(500).json({ success: false, message: 'Failed to accept onboarding' });
  }
};
