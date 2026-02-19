/**
 * Cron: Daily Journal notifications at 08:00 local time per user (IANA timezone, DST-safe).
 * Run every 15 minutes; for each user with timezone set, if their local time is 08:00–08:14,
 * send one idempotent "Daily Journal Question + Today's Tasks" notification.
 */
const { DateTime } = require('luxon');
const { executeQuery } = require('../db');
const { ensureTimezoneColumn } = require('../utils/ensure-timezone-column');
const { createDailyJournalNotificationIfNotSent } = require('../notifications/index');
const { pickPromptForUser } = require('../journal/daily-prompts');

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
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
  const sent = [];
  const skipped = [];
  const errors = [];

  try {
    await ensureTimezoneColumn();
    const [userRows] = await executeQuery(
      'SELECT id, username, timezone FROM users WHERE timezone IS NOT NULL AND timezone != ""'
    );
    const users = getRows(userRows);
    if (!users.length) {
      return res.status(200).json({
        success: true,
        message: 'No users with timezone',
        sent: 0,
        skipped: 0,
        ms: Date.now() - start
      });
    }

    const nowUtc = DateTime.utc();
    for (const user of users) {
      const tz = user.timezone;
      let local;
      try {
        local = nowUtc.setZone(tz);
      } catch (e) {
        errors.push({ userId: user.id, error: 'Invalid timezone: ' + tz });
        continue;
      }
      const hour = local.hour;
      const minute = local.minute;
      if (hour !== 8 || minute >= 15) {
        skipped.push({ userId: user.id, reason: 'not_08:00', local: local.toISO() });
        continue;
      }
      const localDate = local.toFormat('yyyy-MM-dd');
      let taskCount = 0;
      try {
        const [taskRows] = await executeQuery(
          'SELECT COUNT(*) as c FROM journal_tasks WHERE userId = ? AND date = ?',
          [user.id, localDate]
        );
        taskCount = getRows(taskRows)[0]?.c ?? 0;
      } catch (e) {
        // journal_tasks may not exist
      }
      const question = await pickPromptForUser(user.id, localDate);
      const taskLine = taskCount === 0
        ? 'You have no tasks yet for today — add some and keep your streak alive 🔥'
        : `You have ${taskCount} task${taskCount === 1 ? '' : 's'} today — keep your streak alive 🔥`;
      const title = 'Daily Journal';
      const body = `${question}\n\n${taskLine}`;
      try {
        const id = await createDailyJournalNotificationIfNotSent(
          user.id,
          localDate,
          title,
          body,
          { question, taskCount, timezone: tz }
        );
        if (id) {
          sent.push({ userId: user.id, username: user.username, localDate, notificationId: id });
          console.log(`[daily-journal] Sent to user ${user.id} (${user.username}) for ${localDate} (${tz})`);
        } else {
          skipped.push({ userId: user.id, reason: 'already_sent', localDate });
        }
      } catch (e) {
        errors.push({ userId: user.id, error: e.message });
        console.warn('[daily-journal] Error sending to user', user.id, e.message);
      }
    }

    return res.status(200).json({
      success: true,
      sent: sent.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { sent, skipped, errors },
      ms: Date.now() - start
    });
  } catch (e) {
    console.error('[daily-journal] Cron error:', e);
    return res.status(500).json({
      success: false,
      error: e.message,
      ms: Date.now() - start
    });
  }
};
