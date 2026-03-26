const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');
const {
  getAdminPayouts,
  processAdminPayout,
  reverseReferralBySource,
  releaseMaturedPendingCommissions,
  recalcAndCacheReferralWallet,
} = require('../referral/referralService');

async function assertAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return { ok: false, status: 401, message: 'Unauthorized' };
  const db = await getDbConnection();
  if (!db) return { ok: false, status: 500, message: 'Database connection error' };
  try {
    const [rows] = await db.execute('SELECT email, role FROM users WHERE id = ? LIMIT 1', [decoded.id]);
    const row = rows?.[0];
    if (!row) return { ok: false, status: 401, message: 'Unauthorized' };
    const role = String(row.role || '').toLowerCase();
    if (role === 'admin' || role === 'super_admin' || isSuperAdminEmail(row)) return { ok: true };
    return { ok: false, status: 403, message: 'Admin access required' };
  } finally {
    try { db.release(); } catch (_) {}
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gate = await assertAdmin(req);
  if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });

  const pathname = (req.url || '').split('?')[0];
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  try {
    if (req.method === 'GET' && (pathname.includes('/payouts') || (req.query?.action === 'payouts'))) {
      const items = await getAdminPayouts(req.query?.status || null, Number(req.query?.page || 1), Number(req.query?.pageSize || 50));
      return res.status(200).json({ success: true, items });
    }
    if (req.method === 'POST' && (pathname.includes('/payouts/process') || req.query?.action === 'payout-process' || body.action === 'process')) {
      const out = await processAdminPayout(body.id || req.query?.id, 'process', body);
      await recalcAndCacheReferralWallet(out.userId);
      return res.status(200).json({ success: true, ...out });
    }
    if (req.method === 'POST' && (pathname.includes('/payouts/paid') || req.query?.action === 'payout-paid' || body.action === 'paid')) {
      const out = await processAdminPayout(body.id || req.query?.id, 'paid', body);
      await recalcAndCacheReferralWallet(out.userId);
      return res.status(200).json({ success: true, ...out });
    }
    if (req.method === 'POST' && (pathname.includes('/payouts/fail') || req.query?.action === 'payout-fail' || body.action === 'fail')) {
      const out = await processAdminPayout(body.id || req.query?.id, 'fail', body);
      await recalcAndCacheReferralWallet(out.userId);
      return res.status(200).json({ success: true, ...out });
    }
    if (req.method === 'POST' && (pathname.includes('/events/reverse') || req.query?.action === 'event-reverse' || body.action === 'reverse')) {
      const out = await reverseReferralBySource({
        sourceTable: body.sourceTable,
        sourceId: body.sourceId,
        reason: body.reason || 'admin_reversal',
        metadata: { admin: true },
      });
      return res.status(200).json({ success: true, ...out });
    }
    if (req.method === 'POST' && (pathname.includes('/release') || req.query?.action === 'release')) {
      const out = await releaseMaturedPendingCommissions();
      return res.status(200).json({ success: true, ...out });
    }
    return res.status(404).json({ success: false, message: 'Admin referral endpoint not found' });
  } catch (e) {
    console.error('admin/referral:', e.message);
    return res.status(400).json({ success: false, message: e.message || 'Admin referral operation failed' });
  }
};
