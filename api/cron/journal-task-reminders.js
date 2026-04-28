/**
 * Cron: send due task reminders (device push + notifications tab).
 * Runs every minute; creates SYSTEM notifications for journal tasks where reminder_at is due and reminder_sent_at is null.
 */
const { executeQuery } = require('../db');
const { tryDeliverJournalTaskReminder } = require('../journal/journalReminderDeliver');

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

  const startedAt = Date.now();
  const sent = [];
  const errors = [];
  try {
    try {
      await executeQuery('ALTER TABLE journal_tasks ADD COLUMN reminder_at DATETIME NULL');
    } catch (_) {}
    try {
      await executeQuery('ALTER TABLE journal_tasks ADD COLUMN reminder_sent_at DATETIME NULL');
    } catch (_) {}

    const [dueRows] = await executeQuery(
      `SELECT id, userId, date, title, reminder_at
         FROM journal_tasks
        WHERE reminder_at IS NOT NULL
          AND reminder_sent_at IS NULL
          AND completed = 0
          AND reminder_at <= UTC_TIMESTAMP()
        ORDER BY reminder_at ASC
        LIMIT 500`
    );
    const tasks = getRows(dueRows);

    for (const t of tasks) {
      try {
        const out = await tryDeliverJournalTaskReminder(t, 'cron');
        if (out.claimed) {
          sent.push({ taskId: String(t.id || ''), userId: Number(t.userId != null ? t.userId : t.userid) });
        }
      } catch (err) {
        errors.push({ taskId: t.id, message: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      due: tasks.length,
      sent: sent.length,
      errors: errors.length,
      details: { sent, errors },
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[journal-task-reminders] cron error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      ms: Date.now() - startedAt,
    });
  }
};
