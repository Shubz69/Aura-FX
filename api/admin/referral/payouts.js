const { getDbConnection } = require('../../db');
const { verifyToken } = require('../../utils/auth');
const { isSuperAdminEmail } = require('../../utils/entitlements');
const { getAdminPayouts, processAdminPayout, recalcAndCacheReferralWallet } = require('../../referral/referralService');

async function assertAdmin(authHeader) {
  const decoded = verifyToken(authHeader);
  if (!decoded?.id) return { ok: false, status: 401, message: 'Unauthorized' };
  const db = await getDbConnection();
  if (!db) return { ok: false, status: 500, message: 'Database connection error' };
  try {
    const [rows] = await db.execute('SELECT email, role FROM users WHERE id = ? LIMIT 1', [decoded.id]);
    const row = rows?.[0];
    if (!row) return { ok: false, status: 401, message: 'Unauthorized' };
    const role = String(row.role || '').toLowerCase();
    return (role === 'admin' || role === 'super_admin' || isSuperAdminEmail(row))
      ? { ok: true }
      : { ok: false, status: 403, message: 'Admin access required' };
  } finally {
    try { db.release(); } catch (_) {}
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gate = await assertAdmin(req.headers.authorization);
  if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });

  try {
    if (req.method === 'GET') {
      const items = await getAdminPayouts(req.query?.status || null, Number(req.query?.page || 1), Number(req.query?.pageSize || 50));
      return res.status(200).json({ success: true, items });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const action = String(body.action || '').toLowerCase();
      const out = await processAdminPayout(body.id, action, body);
      await recalcAndCacheReferralWallet(out.userId);
      return res.status(200).json({ success: true, ...out });
    }
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'Payout action failed' });
  }
};
