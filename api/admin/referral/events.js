const { getDbConnection } = require('../../db');
const { verifyToken } = require('../../utils/auth');
const { isSuperAdminEmail } = require('../../utils/entitlements');
const { reverseReferralBySource } = require('../../referral/referralService');

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
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 20)));
      const sourceTableFilter = String(req.query?.sourceTable || '').trim();
      const windowDays = Number(req.query?.windowDays || 0);
      const hasWindow = Number.isFinite(windowDays) && windowDays > 0;
      const db = await getDbConnection();
      if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });
      try {
        let sql = `SELECT re.id, re.referrer_user_id, re.referred_user_id, re.commission_amount_pence, re.currency, re.occurred_at, re.source_id, re.source_table,
                          ru.email AS referrer_email, uu.email AS referee_email
                   FROM referral_events re
                   LEFT JOIN users ru ON ru.id = re.referrer_user_id
                   LEFT JOIN users uu ON uu.id = re.referred_user_id
                   WHERE re.event_type = 'reversal'`;
        const params = [];
        if (sourceTableFilter) {
          sql += ' AND re.source_table = ?';
          params.push(sourceTableFilter);
        }
        if (hasWindow) {
          sql += ' AND re.occurred_at >= (UTC_TIMESTAMP() - INTERVAL ? DAY)';
          params.push(Math.min(365, Math.max(1, Math.floor(windowDays))));
        }
        sql += ' ORDER BY re.occurred_at DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.execute(sql, params);
        return res.status(200).json({
          success: true,
          items: (rows || []).map((r) => ({
            id: Number(r.id),
            referrer: r.referrer_email || `user:${r.referrer_user_id}`,
            referee: r.referee_email || `user:${r.referred_user_id}`,
            amountPence: Number(r.commission_amount_pence || 0),
            currency: r.currency || 'GBP',
            sourceTable: r.source_table || null,
            sourceId: r.source_id || null,
            occurredAt: r.occurred_at,
          })),
        });
      } finally {
        try { db.release(); } catch (_) {}
      }
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const out = await reverseReferralBySource({
      sourceTable: body.sourceTable,
      sourceId: body.sourceId,
      reason: body.reason || 'admin_reversal',
      metadata: { admin: true },
    });
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'Reverse action failed' });
  }
};
