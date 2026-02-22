/**
 * Cron: Journal wellness alerts (admin-only, background).
 * Runs daily. When a user is below 20% daily task completion (for that day)
 * or below 50% monthly task completion (for the current month), admins are
 * notified so they can message the user. Not visible to non-admins.
 */
const { executeQuery } = require('../db');

let createNotification;
try {
  createNotification = require('../notifications/index').createNotification;
} catch (e) {
  createNotification = null;
}

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

async function ensureWellnessAlertsTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_wellness_alerts_sent (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      alert_type VARCHAR(32) NOT NULL,
      period_key VARCHAR(32) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_alert (user_id, alert_type, period_key),
      INDEX idx_period (period_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/** Return true if we already sent this alert (so we skip). */
async function wasAlertSent(userId, alertType, periodKey) {
  const [rows] = await executeQuery(
    'SELECT 1 FROM journal_wellness_alerts_sent WHERE user_id = ? AND alert_type = ? AND period_key = ? LIMIT 1',
    [userId, alertType, periodKey]
  );
  return getRows(rows).length > 0;
}

/** Record that we sent this alert (dedupe). */
async function markAlertSent(userId, alertType, periodKey) {
  await executeQuery(
    'INSERT IGNORE INTO journal_wellness_alerts_sent (user_id, alert_type, period_key) VALUES (?, ?, ?)',
    [userId, alertType, periodKey]
  );
}

/** Get admin user ids (ADMIN, SUPER_ADMIN). */
async function getAdminUserIds() {
  const [rows] = await executeQuery(
    `SELECT id FROM users WHERE UPPER(TRIM(role)) IN ('ADMIN', 'SUPER_ADMIN')`
  );
  return (getRows(rows) || []).map((r) => r.id).filter(Boolean);
}

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const hasSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const allowed = isVercelCron || hasSecret || (req.headers['user-agent']?.includes('vercel-cron') && process.env.VERCEL);

  if (!allowed && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ success: false, message: 'Unauthorized cron' });
  }

  const start = Date.now();
  const dailyAlerts = [];
  const monthlyAlerts = [];
  const errors = [];

  try {
    await ensureWellnessAlertsTable();

    const adminIds = await getAdminUserIds();
    if (!adminIds.length) {
      return res.status(200).json({
        success: true,
        message: 'No admins to notify',
        dailyAlerts: 0,
        monthlyAlerts: 0,
        ms: Date.now() - start,
      });
    }

    if (!createNotification) {
      return res.status(200).json({
        success: true,
        message: 'Notifications not available',
        dailyAlerts: 0,
        monthlyAlerts: 0,
        ms: Date.now() - start,
      });
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const monthEndStr = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);

    // Daily: users with tasks yesterday and completion < 20%
    const [dailyRows] = await executeQuery(
      `SELECT t.userId AS userId,
              COUNT(*) AS total,
              SUM(t.completed) AS done
       FROM journal_tasks t
       WHERE t.date = ?
       GROUP BY t.userId
       HAVING total > 0 AND (done * 100 / total) < 20`,
      [yesterdayStr]
    );
    const dailyUsers = getRows(dailyRows) || [];

    for (const row of dailyUsers) {
      const userId = row.userId ?? row.user_id;
      const total = Number(row.total) || 0;
      const done = Number(row.done) || 0;
      const pct = total ? Math.round((done / total) * 100) : 0;
      if (pct >= 20) continue;

      const periodKey = yesterdayStr;
      if (await wasAlertSent(userId, 'daily_20', periodKey)) continue;

      let username = 'User';
      try {
        const [u] = await executeQuery('SELECT username FROM users WHERE id = ? LIMIT 1', [userId]);
        const uRows = getRows(u);
        if (uRows && uRows[0]) username = uRows[0].username || username;
      } catch (_) {}

      const title = 'Wellness check: low daily task completion';
      const body = `${username} completed only ${pct}% of their tasks on ${yesterdayStr}. Consider reaching out to see if everything is okay.`;
      const meta = { targetUserId: userId, targetUsername: username, percentage: pct, periodType: 'daily', date: yesterdayStr };

      for (const adminId of adminIds) {
        try {
          await createNotification({
            userId: adminId,
            type: 'SYSTEM',
            title,
            body,
            meta,
          });
        } catch (e) {
          errors.push({ adminId, targetUserId: userId, error: e.message });
        }
      }
      await markAlertSent(userId, 'daily_20', periodKey);
      dailyAlerts.push({ userId, username, pct, date: yesterdayStr });
    }

    // Monthly: users with tasks this month and completion < 50%
    const [monthlyRows] = await executeQuery(
      `SELECT t.userId AS userId,
              COUNT(*) AS total,
              SUM(t.completed) AS done
       FROM journal_tasks t
       WHERE t.date >= ? AND t.date <= ?
       GROUP BY t.userId
       HAVING total > 0 AND (done * 100 / total) < 50`,
      [monthStartStr, monthEndStr]
    );
    const monthlyUsers = getRows(monthlyRows) || [];

    for (const row of monthlyUsers) {
      const userId = row.userId ?? row.user_id;
      const total = Number(row.total) || 0;
      const done = Number(row.done) || 0;
      const pct = total ? Math.round((done / total) * 100) : 0;
      if (pct >= 50) continue;

      const periodKey = monthKey;
      if (await wasAlertSent(userId, 'month_50', periodKey)) continue;

      let username = 'User';
      try {
        const [u] = await executeQuery('SELECT username FROM users WHERE id = ? LIMIT 1', [userId]);
        const uRows = getRows(u);
        if (uRows && uRows[0]) username = uRows[0].username || username;
      } catch (_) {}

      const title = 'Wellness check: low monthly task completion';
      const body = `${username} completed only ${pct}% of their tasks this month (${monthKey}). Consider reaching out to see if everything is okay.`;
      const meta = { targetUserId: userId, targetUsername: username, percentage: pct, periodType: 'monthly', monthKey };

      for (const adminId of adminIds) {
        try {
          await createNotification({
            userId: adminId,
            type: 'SYSTEM',
            title,
            body,
            meta,
          });
        } catch (e) {
          errors.push({ adminId, targetUserId: userId, error: e.message });
        }
      }
      await markAlertSent(userId, 'month_50', periodKey);
      monthlyAlerts.push({ userId, username, pct, monthKey });
    }

    return res.status(200).json({
      success: true,
      dailyAlerts: dailyAlerts.length,
      monthlyAlerts: monthlyAlerts.length,
      details: { dailyAlerts, monthlyAlerts, errors: errors.length ? errors.slice(0, 20) : [] },
      ms: Date.now() - start,
    });
  } catch (e) {
    console.error('[journal-wellness-alerts] Cron error:', e);
    return res.status(500).json({
      success: false,
      error: e.message,
      ms: Date.now() - start,
    });
  }
};
