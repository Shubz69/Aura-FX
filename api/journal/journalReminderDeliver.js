/**
 * Shared journal task reminder delivery: one inbox row + web push per task,
 * coordinated with reminder_sent_at so cron and client cannot double-deliver.
 */
const { executeQuery } = require('../db');
const { journalReminderUrl } = require('./journalReminderUrl');

function getAffectedRows(updateResult) {
  const r = Array.isArray(updateResult) ? updateResult[0] : updateResult;
  if (r && typeof r.affectedRows === 'number') return r.affectedRows;
  return 0;
}

async function getUserNotificationsEnabled(userId) {
  try {
    const [rows] = await executeQuery(
      'SELECT notifications_enabled FROM user_settings WHERE user_id = ? LIMIT 1',
      [userId],
      { suppressErrorLog: true }
    );
    if (!rows || !rows[0]) return true;
    const v = rows[0].notifications_enabled;
    if (v === null || v === undefined) return true;
    return Boolean(v);
  } catch (_) {
    return true;
  }
}

/**
 * @param {object} taskRow — needs id, userId, date, title (from DB row shape)
 * @param {'cron'|'client'} mode — client allows up to ~2 min ahead of server UTC for clock skew
 * @returns {Promise<{ claimed: boolean, alreadyDelivered?: boolean, inboxDelivered?: boolean, reason?: string }>}
 */
async function tryDeliverJournalTaskReminder(taskRow, mode) {
  const taskId = String(taskRow.id || '');
  const userId = Number(taskRow.userId != null ? taskRow.userId : taskRow.userid);
  if (!taskId || !Number.isFinite(userId) || userId <= 0) {
    return { claimed: false, reason: 'invalid_task' };
  }

  const dueClause =
    mode === 'cron'
      ? 'reminder_at <= UTC_TIMESTAMP()'
      : 'reminder_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 120 SECOND)';

  const [upd] = await executeQuery(
    `UPDATE journal_tasks SET reminder_sent_at = UTC_TIMESTAMP()
     WHERE id = ? AND userId = ? AND completed = 0
       AND reminder_at IS NOT NULL AND reminder_sent_at IS NULL
       AND (${dueClause})`,
    [taskId, userId]
  );

  const affected = getAffectedRows(upd);
  if (affected === 0) {
    const [checkRows] = await executeQuery(
      'SELECT reminder_sent_at FROM journal_tasks WHERE id = ? AND userId = ? LIMIT 1',
      [taskId, userId],
      { suppressErrorLog: true }
    );
    const sent = checkRows && checkRows[0] && checkRows[0].reminder_sent_at;
    return {
      claimed: false,
      alreadyDelivered: Boolean(sent),
      reason: sent ? 'already_delivered' : 'not_claimable',
    };
  }

  const title = (taskRow.title || 'Journal task').toString().slice(0, 220);
  const dateStr = String(taskRow.date || '').slice(0, 10);
  const url = journalReminderUrl(taskId, dateStr);
  const prefsOn = await getUserNotificationsEnabled(userId);

  if (!prefsOn) {
    return { claimed: true, inboxDelivered: false, alreadyDelivered: false, reason: 'notifications_disabled' };
  }

  const { createNotification } = require('../notifications/index');
  try {
    await createNotification({
      userId,
      type: 'SYSTEM',
      title: 'Task due',
      body: `Journal task due now: ${title}`,
      meta: {
        kind: 'JOURNAL_TASK_DUE',
        taskId,
        taskDate: dateStr,
        url,
      },
    });
  } catch (e) {
    try {
      await executeQuery(
        'UPDATE journal_tasks SET reminder_sent_at = NULL WHERE id = ? AND userId = ?',
        [taskId, userId]
      );
    } catch (_) {
      /* ignore */
    }
    throw e;
  }

  return { claimed: true, inboxDelivered: true, alreadyDelivered: false };
}

module.exports = {
  tryDeliverJournalTaskReminder,
  getUserNotificationsEnabled,
};
