/**
 * Journal Notes API – multiple notes per day (under tasks).
 * GET ?date=YYYY-MM-DD (list), POST { date, content }, DELETE /:id
 */

const crypto = require('crypto');
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { XP, awardOnce } = require('./xp-helper');

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

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

async function ensureNotesTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_notes (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      date DATE NOT NULL,
      content TEXT NOT NULL,
      sortOrder INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_journal_notes_userId_date (userId, date)
    )
  `);
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);
  const pathname = getPathname(req);

  try {
    await ensureNotesTable();
  } catch (err) {
    console.error('Journal notes ensureNotesTable error:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  let queryDate = null;
  if (req.url) {
    if (req.url.startsWith('http')) {
      try {
        queryDate = new URL(req.url).searchParams.get('date');
      } catch (_) {}
    } else {
      const qs = req.url.split('?')[1] || '';
      const match = qs.split('&').find(s => s.startsWith('date='));
      queryDate = match ? decodeURIComponent(match.slice(5)).trim() : null;
    }
  }

  if (req.method === 'GET') {
    const date = queryDate || '';
    const dateStr = date.slice(0, 10);
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ success: false, message: 'date query (YYYY-MM-DD) required' });
    }
    const [rows] = await executeQuery(
      'SELECT id, date, content, sortOrder, createdAt FROM journal_notes WHERE userId = ? AND date = ? ORDER BY sortOrder ASC, createdAt ASC',
      [userId, dateStr]
    );
    const notes = (rows || []).map(r => ({
      id: r.id,
      date: r.date ? String(r.date).slice(0, 10) : dateStr,
      content: r.content ?? '',
      sortOrder: r.sortOrder ?? 0,
      createdAt: r.createdAt,
    }));
    return res.status(200).json({ success: true, notes });
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const date = body.date ? String(body.date).trim().slice(0, 10) : null;
    const content = body.content != null ? String(body.content).trim().slice(0, 8192) : '';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date (YYYY-MM-DD) required' });
    }
    if (!content) {
      return res.status(400).json({ success: false, message: 'content required' });
    }
    const id = crypto.randomUUID();
    await executeQuery(
      'INSERT INTO journal_notes (id, userId, date, content, sortOrder) VALUES (?, ?, ?, ?, 0)',
      [id, userId, date, content]
    );
    const xpResult = await awardOnce(userId, 'journal_note_saved', XP.SAVE_NOTE, null, date);
    const [rows] = await executeQuery(
      'SELECT id, date, content, sortOrder, createdAt FROM journal_notes WHERE id = ?',
      [id]
    );
    const note = rows && rows[0] ? {
      id: rows[0].id,
      date: rows[0].date ? String(rows[0].date).slice(0, 10) : date,
      content: rows[0].content ?? content,
      sortOrder: rows[0].sortOrder ?? 0,
      createdAt: rows[0].createdAt,
    } : { id, date, content, sortOrder: 0, createdAt: new Date().toISOString() };
    return res.status(200).json({
      success: true,
      note,
      xpAwarded: xpResult.awarded ? xpResult.xpAdded : null,
    });
  }

  if (req.method === 'DELETE') {
    const idMatch = pathname.match(/\/notes\/([a-f0-9-]+)/i) || pathname.match(/\/notes\/([^/?]+)/);
    const id = idMatch ? idMatch[1].trim() : null;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Note id required' });
    }
    const [result] = await executeQuery(
      'DELETE FROM journal_notes WHERE id = ? AND userId = ?',
      [id, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }
    return res.status(200).json({ success: true, deleted: true });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
