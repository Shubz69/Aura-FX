/**
 * GET  /api/reports/history          → list reports for user
 * GET  /api/reports/history?id=N     → get single report content
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');

function resolveRole(user) {
  const role = (user.role || '').toLowerCase();
  const plan = (user.subscription_plan || '').toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return 'admin';
  if (['elite', 'a7fx'].includes(role) || ['elite', 'a7fx'].includes(plan)) return 'elite';
  if (['premium', 'aura'].includes(role) || ['premium', 'aura'].includes(plan)) return 'premium';
  return 'free';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = decoded.id;

  try {
    const [users] = await executeQuery(
      'SELECT id, role, subscription_plan FROM users WHERE id = ?', [userId]
    );
    if (!users?.length) return res.status(404).json({ success: false, message: 'User not found' });
    const role = resolveRole(users[0]);

    if (role === 'free') {
      return res.status(403).json({ success: false, code: 'FREE_PLAN', message: 'Reports are a Premium/Elite feature.' });
    }

    const reportId = req.query?.id;

    // DELETE single report (user can remove their own)
    if (req.method === 'DELETE' && reportId) {
      await executeQuery(
        'DELETE FROM monthly_reports WHERE id = ? AND user_id = ?', [reportId, userId]
      );
      return res.status(200).json({ success: true });
    }

    // GET single report
    if (reportId) {
      const [rows] = await executeQuery(
        `SELECT id, period_year, period_month, report_type, status, content_json, generated_at
         FROM monthly_reports WHERE id = ? AND user_id = ?`,
        [reportId, userId]
      );
      if (!rows?.length) return res.status(404).json({ success: false, message: 'Report not found' });
      const report = rows[0];
      let content = null;
      try { content = JSON.parse(report.content_json); } catch {}
      return res.status(200).json({ success: true, report: { ...report, content_json: undefined, content } });
    }

    // GET list
    const [rows] = await executeQuery(
      `SELECT id, period_year, period_month, report_type, status, generated_at
       FROM monthly_reports WHERE user_id = ? ORDER BY period_year DESC, period_month DESC LIMIT 24`,
      [userId]
    );
    return res.status(200).json({ success: true, reports: rows || [] });
  } catch (err) {
    console.error('[reports/history]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load reports' });
  }
};
