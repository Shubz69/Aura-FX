const { executeQuery } = require('../db');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { effectiveReportsRole } = require('../reports/resolveReportsRole');
const { generateMonthlyReportForUser, MIN_DATA_DAYS } = require('../reports/generate');

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function nextMonth(year, month) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function toYMD(d) {
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  return { year: y, month: m, day };
}

async function ensureReportsSchema() {
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
}

async function getUsersWithFirstActivity() {
  const [rows] = await executeQuery(
    `SELECT
      u.id AS user_id,
      (
        SELECT MIN(e) FROM (
          SELECT MIN(jt.date) AS e FROM journal_trades jt WHERE jt.userId = u.id
          UNION ALL
          SELECT MIN(jd.date) AS e FROM journal_daily jd WHERE jd.userId = u.id
          UNION ALL
          SELECT MIN(DATE(ac.created_at)) AS e FROM ai_chart_checks ac WHERE ac.user_id = u.id
        ) src
        WHERE e IS NOT NULL
      ) AS first_activity_date,
      (
        COALESCE((SELECT COUNT(*) FROM journal_trades jt2 WHERE jt2.userId = u.id), 0) +
        COALESCE((SELECT COUNT(*) FROM journal_daily jd2 WHERE jd2.userId = u.id), 0) +
        COALESCE((SELECT COUNT(*) FROM ai_chart_checks ac2 WHERE ac2.user_id = u.id), 0)
      ) AS total_points,
      DATEDIFF(
        CURDATE(),
        (
          SELECT MIN(e) FROM (
            SELECT MIN(jt3.date) AS e FROM journal_trades jt3 WHERE jt3.userId = u.id
            UNION ALL
            SELECT MIN(jd3.date) AS e FROM journal_daily jd3 WHERE jd3.userId = u.id
            UNION ALL
            SELECT MIN(DATE(ac3.created_at)) AS e FROM ai_chart_checks ac3 WHERE ac3.user_id = u.id
          ) src2
          WHERE e IS NOT NULL
        )
      ) AS data_days
    FROM users u
    HAVING first_activity_date IS NOT NULL
       AND total_points >= 5
       AND data_days >= ?`,
    [MIN_DATA_DAYS]
  ).catch(() => [[]]);
  return rows || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || process.env.CRON_KEY || '';
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const hasSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const allowed = isVercelCron || hasSecret || (req.headers['user-agent']?.includes('vercel-cron') && process.env.VERCEL);
  if (!allowed && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ success: false, message: 'Unauthorized cron' });
  }

  try {
    await ensureReportsSchema();
    const users = await getUsersWithFirstActivity();
    const now = new Date();
    const nowParts = toYMD(now);
    const maxReportsPerRun = 50;

    const generated = [];
    const skipped = [];
    let budgetUsed = 0;

    for (const row of users) {
      if (budgetUsed >= maxReportsPerRun) break;
      const userId = Number(row.user_id);
      if (!Number.isFinite(userId) || userId <= 0 || !row.first_activity_date) continue;

      const first = toYMD(row.first_activity_date);
      let cursor = { year: first.year, month: first.month };

      const [existingRows] = await executeQuery(
        `SELECT period_year, period_month, status
         FROM monthly_reports
         WHERE user_id = ?`,
        [userId]
      ).catch(() => [[]]);
      const existingMap = new Map(
        (existingRows || []).map((r) => [monthKey(Number(r.period_year), Number(r.period_month)), String(r.status || '')])
      );

      const user = await applyScheduledDowngrade(userId);
      if (!user) continue;
      const role = effectiveReportsRole(user);

      while (
        budgetUsed < maxReportsPerRun &&
        (cursor.year < nowParts.year || (cursor.year === nowParts.year && cursor.month <= nowParts.month))
      ) {
        const key = monthKey(cursor.year, cursor.month);
        const status = existingMap.get(key);
        if (status !== 'ready' && status !== 'generating') {
          const result = await generateMonthlyReportForUser({
            userId,
            role,
            user,
            year: cursor.year,
            month: cursor.month,
            forceRegenerate: false,
          });
          budgetUsed += 1;
          if (result?.success) {
            generated.push({ userId, year: cursor.year, month: cursor.month });
          } else {
            skipped.push({ userId, year: cursor.year, month: cursor.month, code: result?.code || 'SKIPPED' });
          }
        }
        cursor = nextMonth(cursor.year, cursor.month);
      }
    }

    return res.status(200).json({
      success: true,
      minDataDays: MIN_DATA_DAYS,
      scannedUsers: users.length,
      generatedCount: generated.length,
      skippedCount: skipped.length,
      generated,
      skipped,
      cappedAt: maxReportsPerRun,
    });
  } catch (err) {
    console.error('[cron/auto-monthly-reports]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to auto-generate monthly reports' });
  }
};

