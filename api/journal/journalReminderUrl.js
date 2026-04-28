/**
 * Deep link for journal task reminder notifications (inbox + web push open URL).
 */
function journalReminderUrl(taskId, dateStr) {
  const tid = encodeURIComponent(String(taskId || '').trim());
  const d = String(dateStr || '').slice(0, 10);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `/journal?reminderTask=${tid}&reminderDate=${encodeURIComponent(d)}`;
  }
  return `/journal?reminderTask=${tid}`;
}

module.exports = { journalReminderUrl };
