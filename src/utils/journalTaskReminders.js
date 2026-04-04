/**
 * Client-side journal task reminders (localStorage, per logged-in user).
 * Fired by JournalReminderScheduler + browser Notification API + toast.
 */

const STORAGE_KEY = 'aura_journal_task_reminders_v1';
export const JOURNAL_REMINDERS_CHANGED = 'aura-journal-reminders-changed';

function parseAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw);
    return Array.isArray(o?.reminders) ? o.reminders : [];
  } catch {
    return [];
  }
}

function writeAll(reminders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ reminders }));
  window.dispatchEvent(new Event(JOURNAL_REMINDERS_CHANGED));
}

export function loadRemindersForUser(userId) {
  if (userId == null) return [];
  const uid = Number(userId);
  return parseAll().filter((r) => Number(r.userId) === uid);
}

export function getReminderForTask(userId, taskId) {
  const tid = Number(taskId);
  return loadRemindersForUser(userId).find((r) => Number(r.taskId) === tid) || null;
}

export function upsertReminder({ userId, taskId, taskTitle, fireAtMs }) {
  const uid = Number(userId);
  const tid = Number(taskId);
  const fireAt = Number(fireAtMs);
  if (!uid || !tid || !Number.isFinite(fireAt)) return null;

  let all = parseAll();
  all = all.filter((r) => !(Number(r.userId) === uid && Number(r.taskId) === tid));
  const id = `jr_${uid}_${tid}_${Date.now()}`;
  all.push({
    id,
    userId: uid,
    taskId: tid,
    taskTitle: String(taskTitle || 'Journal task').slice(0, 220),
    fireAt,
  });
  writeAll(all);
  return id;
}

export function removeReminderByTask(userId, taskId) {
  const uid = Number(userId);
  const tid = Number(taskId);
  const all = parseAll().filter((r) => !(Number(r.userId) === uid && Number(r.taskId) === tid));
  writeAll(all);
}

export function removeReminderById(reminderId) {
  const all = parseAll().filter((r) => r.id !== reminderId);
  writeAll(all);
}

/** Single write when clearing several reminders (avoids many scheduler resyncs). */
export function removeRemindersByIds(ids) {
  if (!ids?.length) return;
  const drop = new Set(ids);
  const all = parseAll().filter((r) => !drop.has(r.id));
  writeAll(all);
}
