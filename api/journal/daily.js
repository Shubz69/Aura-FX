/**
 * Journal Daily Notes API – per-user daily notes and mood for the task journal.
 * GET ?date=YYYY-MM-DD, PUT body { date, notes?, mood? }
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { XP, awardOnce } = require('./xp-helper');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

async function ensureDailyTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_daily (
      userId INT NOT NULL,
      date DATE NOT NULL,
      notes TEXT DEFAULT NULL,
      mood VARCHAR(20) DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (userId, date),
      INDEX idx_journal_daily_userId (userId)
    )
  `);
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
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

  try {
    await ensureDailyTable();
  } catch (err) {
    console.error('Journal daily ensureDailyTable error:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const date = url.searchParams.get('date') || null;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date query required' });
    }
    const [rows] = await executeQuery(
      'SELECT date, notes, mood, updatedAt FROM journal_daily WHERE userId = ? AND date = ?',
      [userId, date.slice(0, 10)]
    );
    const row = rows[0];
    const note = row
      ? {
          date: row.date ? String(row.date).slice(0, 10) : date.slice(0, 10),
          notes: row.notes ?? '',
          mood: row.mood ?? null,
          updatedAt: row.updatedAt,
        }
      : { date: date.slice(0, 10), notes: '', mood: null, updatedAt: null };
    return res.status(200).json({ success: true, note });
  }

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const date = body.date ? String(body.date).trim().slice(0, 10) : null;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required' });
    }
    const notes = body.notes != null ? String(body.notes).slice(0, 8192) : null;
    const mood = body.mood != null ? String(body.mood).trim().slice(0, 20) : null;

    await executeQuery(
      `INSERT INTO journal_daily (userId, date, notes, mood) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = COALESCE(?, notes), mood = COALESCE(?, mood)`,
      [userId, date, notes || '', mood, notes, mood]
    );

    const xpResult = await awardOnce(userId, 'journal_note_saved', XP.SAVE_NOTE, null, date);

    const [rows] = await executeQuery(
      'SELECT date, notes, mood, updatedAt FROM journal_daily WHERE userId = ? AND date = ?',
      [userId, date]
    );
    const row = rows[0];
    const note = row
      ? {
          date: String(row.date).slice(0, 10),
          notes: row.notes ?? '',
          mood: row.mood ?? null,
          updatedAt: row.updatedAt,
        }
      : { date, notes: notes || '', mood, updatedAt: null };
    return res.status(200).json({
      success: true,
      note,
      xpAwarded: xpResult.awarded ? xpResult.xpAdded : null,
    });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
