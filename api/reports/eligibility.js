/**
 * GET /api/reports/eligibility
 * Returns role, data-day count, eligibility state, and existing reports for this user.
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');

const MIN_DATA_DAYS = 30;

async function ensureSchema() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS monthly_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      period_year INT NOT NULL,
      period_month INT NOT NULL,
      report_type VARCHAR(20) NOT NULL COMMENT 'free|premium|elite|admin',
      status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending|generating|ready|failed',
      content_json LONGTEXT,
      generated_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_period (user_id, period_year, period_month),
      INDEX idx_user_id (user_id),
      INDEX idx_status (status)
    )
  `).catch(() => {});

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS report_csv_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      period_year INT NOT NULL,
      period_month INT NOT NULL,
      filename VARCHAR(255),
      trade_count INT DEFAULT 0,
      upload_json LONGTEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_period_csv (user_id, period_year, period_month),
      INDEX idx_user_id (user_id)
    )
  `).catch(() => {});
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = decoded.id;

  try {
    await ensureSchema();

    // Load user record
    const [users] = await executeQuery(
      'SELECT id, role, subscription_plan, subscription_status, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (!users?.length) return res.status(404).json({ success: false, message: 'User not found' });
    const user = users[0];
    const role = resolveRole(user);

    // Count days of journal trade data
    const [tradeDays] = await executeQuery(
      `SELECT DATEDIFF(NOW(), MIN(date)) AS data_days, COUNT(*) AS trade_count
       FROM journal_trades WHERE userId = ?`,
      [userId]
    ).catch(() => [[{ data_days: 0, trade_count: 0 }]]);

    const dataDays = Math.max(0, tradeDays?.[0]?.data_days || 0);
    const tradeCount = tradeDays?.[0]?.trade_count || 0;
    const isEligible = dataDays >= MIN_DATA_DAYS;

    // Also check chart check history
    const [chartCheckRows] = await executeQuery(
      'SELECT COUNT(*) AS cnt FROM ai_chart_checks WHERE user_id = ? LIMIT 1',
      [userId]
    ).catch(() => [[{ cnt: 0 }]]);
    const chartCheckCount = chartCheckRows?.[0]?.cnt || 0;

    // Existing reports for this user
    const [reports] = await executeQuery(
      `SELECT id, period_year, period_month, report_type, status, generated_at
       FROM monthly_reports WHERE user_id = ? ORDER BY period_year DESC, period_month DESC`,
      [userId]
    ).catch(() => [[]]);

    // Current month eligibility
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Check if current month already has a report
    const currentMonthReport = (reports || []).find(
      r => r.period_year === currentYear && r.period_month === currentMonth
    );

    // Check CSV upload for current month (premium)
    let csvStatus = null;
    if (role === 'premium') {
      const [csv] = await executeQuery(
        'SELECT id, trade_count, uploaded_at FROM report_csv_uploads WHERE user_id = ? AND period_year = ? AND period_month = ?',
        [userId, currentYear, currentMonth]
      ).catch(() => [[]]);
      csvStatus = csv?.[0] || null;
    }

    return res.status(200).json({
      success: true,
      role,
      dataDays,
      tradeCount,
      chartCheckCount,
      isEligible,
      minDataDays: MIN_DATA_DAYS,
      currentPeriod: { year: currentYear, month: currentMonth },
      currentMonthReport: currentMonthReport || null,
      csvStatus,
      reports: reports || [],
    });
  } catch (err) {
    console.error('[reports/eligibility]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to check eligibility' });
  }
};
