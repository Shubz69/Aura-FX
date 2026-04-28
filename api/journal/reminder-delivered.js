/**
 * POST /api/journal/tasks/:taskId/reminder-delivered
 * Client-side reminder timer: claim delivery atomically (same as cron) so inbox + VAPID push
 * happen once; returns flags for UI (toast vs OS notification fallback).
 */
const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');
const { tryDeliverJournalTaskReminder } = require('./journalReminderDeliver');

function getPathname(req) {
  if (!req.url) return '';
  const path = req.url.split('?')[0];
  if (path.startsWith('http')) {
    try {
      return new URL(path).pathname;
    } catch {
      return path;
    }
  }
  return path;
}

function getTaskIdFromReq(req) {
  const pathname = getPathname(req);
  const m = pathname.match(/\/api\/journal\/tasks\/([a-f0-9-]{36})\/reminder-delivered/i);
  if (m) return m[1];
  try {
    const u = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const q = u.searchParams.get('taskId');
    if (q && /^[a-f0-9-]{36}$/i.test(String(q).trim())) return String(q).trim();
  } catch (_) {
    /* ignore */
  }
  return null;
}

async function ensureReminderColumns() {
  try {
    await addColumnIfNotExists('journal_tasks', 'reminder_at', 'DATETIME NULL');
  } catch (_) {}
  try {
    await addColumnIfNotExists('journal_tasks', 'reminder_sent_at', 'DATETIME NULL');
  } catch (_) {}
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);

  const taskId = getTaskIdFromReq(req);
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'Invalid task id' });
  }

  try {
    await ensureReminderColumns();
  } catch (e) {
    console.error('[reminder-delivered] schema:', e.message);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  const [rows] = await executeQuery(
    'SELECT id, userId, date, title, reminder_at, reminder_sent_at, completed FROM journal_tasks WHERE id = ? AND userId = ? LIMIT 1',
    [taskId, userId]
  );
  const row = rows && rows[0];
  if (!row) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }

  try {
    const out = await tryDeliverJournalTaskReminder(row, 'client');
    return res.status(200).json({
      success: true,
      claimed: out.claimed,
      alreadyDelivered: Boolean(out.alreadyDelivered),
      inboxDelivered: Boolean(out.inboxDelivered),
      reason: out.reason || null,
    });
  } catch (e) {
    console.error('[reminder-delivered]', e.message);
    return res.status(500).json({ success: false, message: e.message || 'Delivery failed' });
  }
};
