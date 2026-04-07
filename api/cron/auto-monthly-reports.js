const { executeQuery } = require('../db');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { effectiveReportsRole } = require('../reports/resolveReportsRole');
const { generateMonthlyReportForUser, MIN_DATA_DAYS } = require('../reports/generate');
const { ensureReportSchema } = require('../reports/ensureReportSchema');

function monthKey(year, month, phase) {
  const ph = phase === 'month_open' ? 'month_open' : 'month_close';
  return `${year}-${String(month).padStart(2, '0')}:${ph}`;
}

function nextMonth(year, month) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/** Calendar month strictly before (a.year, a.month) */
function prevCalendarMonth(year, month) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function toYMD(d) {
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  return { year: y, month: m, day };
}

function lastDayOfCalendarMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthBeforeOrEqual(a, b) {
  return a.year < b.year || (a.year === b.year && a.month <= b.month);
}

async function getExistingReportKeys(userId) {
  const [rows] = await executeQuery(
    `SELECT period_year, period_month, report_phase, status FROM monthly_reports WHERE user_id = ?`,
    [userId]
  ).catch(() => [[]]);
  const map = new Map();
  for (const r of rows || []) {
    const ph = r.report_phase && String(r.report_phase).trim() === 'month_open' ? 'month_open' : 'month_close';
    map.set(monthKey(Number(r.period_year), Number(r.period_month), ph), String(r.status || ''));
  }
  return map;
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
    await ensureReportSchema(executeQuery);
    const users = await getUsersWithFirstActivity();
    const now = new Date();
    const nowParts = toYMD(now);
    const maxReportsPerRun = 50;

    const generated = [];
    const skipped = [];
    let budgetUsed = 0;

    const endBackfill = prevCalendarMonth(nowParts.year, nowParts.month);

    for (const row of users) {
      if (budgetUsed >= maxReportsPerRun) break;
      const userId = Number(row.user_id);
      if (!Number.isFinite(userId) || userId <= 0 || !row.first_activity_date) continue;

      const first = toYMD(row.first_activity_date);
      let cursor = { year: first.year, month: first.month };

      const existingMap = await getExistingReportKeys(userId);

      const user = await applyScheduledDowngrade(userId);
      if (!user) continue;
      const role = effectiveReportsRole(user);

      // Backfill: month_close only for completed calendar months before the current month
      while (budgetUsed < maxReportsPerRun && monthBeforeOrEqual(cursor, endBackfill)) {
        const key = monthKey(cursor.year, cursor.month, 'month_close');
        const status = existingMap.get(key);
        if (status !== 'ready' && status !== 'generating') {
          const result = await generateMonthlyReportForUser({
            userId,
            role,
            user,
            year: cursor.year,
            month: cursor.month,
            phase: 'month_close',
            forceRegenerate: false,
          });
          budgetUsed += 1;
          if (result?.success) {
            existingMap.set(key, 'ready');
            generated.push({ userId, year: cursor.year, month: cursor.month, phase: 'month_close' });
          } else {
            skipped.push({
              userId,
              year: cursor.year,
              month: cursor.month,
              phase: 'month_close',
              code: result?.code || 'SKIPPED',
            });
          }
        }
        cursor = nextMonth(cursor.year, cursor.month);
      }

      if (budgetUsed >= maxReportsPerRun) continue;

      // Month opener for the current calendar month (data = previous month). Prefer the 1st; retry daily if still pending/failed or user became eligible mid-month.
      {
        const kOpen = monthKey(nowParts.year, nowParts.month, 'month_open');
        const stOpen = existingMap.get(kOpen);
        if (stOpen !== 'ready' && stOpen !== 'generating') {
          const result = await generateMonthlyReportForUser({
            userId,
            role,
            user,
            year: nowParts.year,
            month: nowParts.month,
            phase: 'month_open',
            forceRegenerate: false,
          });
          budgetUsed += 1;
          if (result?.success) {
            existingMap.set(kOpen, 'ready');
            generated.push({ userId, year: nowParts.year, month: nowParts.month, phase: 'month_open' });
          } else {
            skipped.push({
              userId,
              year: nowParts.year,
              month: nowParts.month,
              phase: 'month_open',
              code: result?.code || 'SKIPPED',
            });
          }
        }
      }

      if (budgetUsed >= maxReportsPerRun) continue;

      // Last calendar day: month close for the current month
      const lastDay = lastDayOfCalendarMonth(nowParts.year, nowParts.month);
      if (nowParts.day === lastDay) {
        const kClose = monthKey(nowParts.year, nowParts.month, 'month_close');
        const stClose = existingMap.get(kClose);
        if (stClose !== 'ready' && stClose !== 'generating') {
          const result = await generateMonthlyReportForUser({
            userId,
            role,
            user,
            year: nowParts.year,
            month: nowParts.month,
            phase: 'month_close',
            forceRegenerate: false,
          });
          budgetUsed += 1;
          if (result?.success) {
            existingMap.set(kClose, 'ready');
            generated.push({ userId, year: nowParts.year, month: nowParts.month, phase: 'month_close' });
          } else {
            skipped.push({
              userId,
              year: nowParts.year,
              month: nowParts.month,
              phase: 'month_close',
              code: result?.code || 'SKIPPED',
            });
          }
        }
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
