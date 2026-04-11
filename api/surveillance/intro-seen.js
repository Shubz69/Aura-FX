const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { assertSurveillanceEntitlement } = require('./assertEntitlement');
const { ensureUsersSchema } = require('../utils/ensure-users-schema');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function utcDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);
  const today = utcDateString();

  try {
    await ensureUsersSchema();
    const entitled = await assertSurveillanceEntitlement(userId, res);
    if (!entitled) return;

    await executeQuery(
      `UPDATE users SET surveillance_intro_seen_utc_date = ?, surveillance_last_briefing_at = UTC_TIMESTAMP() WHERE id = ?`,
      [today, userId]
    );

    return res.status(200).json({ success: true, showIntro: false, markedDate: today });
  } catch (e) {
    console.error('[surveillance/intro-seen]', e);
    return res.status(500).json({ success: false, message: 'Failed to update intro state' });
  }
};
