/**
 * Journal Trades API – per-user trading journal CRUD.
 * All endpoints require auth. Users can only access their own trades.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');
const { getJournalContext, assertJournalWritableDate, normalizeYyyyMmDd } = require('../utils/journalWriteGuard');

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

async function ensureJournalTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_trades (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      date DATE NOT NULL,
      pair VARCHAR(64) NOT NULL,
      tradeType VARCHAR(64) DEFAULT NULL,
      session VARCHAR(32) DEFAULT NULL,
      riskPct DECIMAL(10,4) DEFAULT NULL,
      rResult DECIMAL(12,4) NOT NULL,
      dollarResult DECIMAL(16,2) DEFAULT NULL,
      followedRules TINYINT(1) DEFAULT 1,
      notes TEXT DEFAULT NULL,
      emotional TINYINT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_journal_userId (userId),
      INDEX idx_journal_userId_date (userId, date)
    )
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    date: row.date ? (row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)) : null,
    pair: row.pair,
    tradeType: row.tradeType ?? null,
    session: row.session ?? null,
    riskPct: row.riskPct != null ? Number(row.riskPct) : null,
    rResult: Number(row.rResult),
    dollarResult: row.dollarResult != null ? Number(row.dollarResult) : null,
    followedRules: Boolean(row.followedRules),
    notes: row.notes ?? null,
    emotional: row.emotional != null ? Number(row.emotional) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
    await ensureJournalTable();
  } catch (err) {
    console.error('Journal ensureJournalTable error:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  // PUT or DELETE /api/journal/trades/:id
  const idMatch = pathname.match(/\/api\/journal\/trades\/([a-f0-9-]{36})/i);
  const tradeId = idMatch ? idMatch[1] : null;

  if (req.method === 'GET' && tradeId) {
    const [rows] = await executeQuery(
      'SELECT * FROM journal_trades WHERE id = ? AND userId = ?',
      [tradeId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    return res.status(200).json({ success: true, trade: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const dateFrom = url.searchParams.get('dateFrom') || null;
    const dateTo = url.searchParams.get('dateTo') || null;
    const pair = url.searchParams.get('pair') || null;
    const session = url.searchParams.get('session') || null;
    const followedRules = url.searchParams.get('followedRules'); // 'true' | 'false' | ''

    let sql = 'SELECT * FROM journal_trades WHERE userId = ?';
    const params = [userId];

    if (dateFrom) {
      sql += ' AND date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND date <= ?';
      params.push(dateTo);
    }
    if (pair) {
      sql += ' AND pair = ?';
      params.push(pair);
    }
    if (session) {
      sql += ' AND session = ?';
      params.push(session);
    }
    if (followedRules === 'true' || followedRules === 'false') {
      sql += ' AND followedRules = ?';
      params.push(followedRules === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY date DESC, createdAt DESC';

    const [rows] = await executeQuery(sql, params);
    const trades = rows.map(mapRow);
    return res.status(200).json({ success: true, trades });
  }

  if (req.method === 'POST' && !tradeId) {
    const body = parseBody(req);
    const date = body.date ? String(body.date).trim().slice(0, 10) : null;
    const pair = body.pair ? String(body.pair).trim() : null;
    const rResult = body.rResult;

    if (!date || !pair) {
      return res.status(400).json({ success: false, message: 'date and pair are required' });
    }
    const jctxPost = await getJournalContext(userId);
    if (!assertJournalWritableDate(res, jctxPost, date)) return;

    const rNum = Number(rResult);
    if (Number.isNaN(rNum)) {
      return res.status(400).json({ success: false, message: 'rResult must be a number' });
    }
    const emotional = body.emotional != null ? Number(body.emotional) : null;
    if (emotional != null && (Number.isNaN(emotional) || emotional < 1 || emotional > 10)) {
      return res.status(400).json({ success: false, message: 'emotional must be between 1 and 10' });
    }

    const id = crypto.randomUUID();
    const tradeType = body.tradeType ? String(body.tradeType).trim().slice(0, 64) : null;
    const session = body.session ? String(body.session).trim().slice(0, 32) : null;
    const riskPct = body.riskPct != null && body.riskPct !== '' ? Number(body.riskPct) : null;
    const dollarResult = body.dollarResult != null && body.dollarResult !== '' ? Number(body.dollarResult) : null;
    const followedRules = body.followedRules === false || body.followedRules === 'false' ? 0 : 1;
    const notes = body.notes != null ? String(body.notes).trim().slice(0, 4096) : null;

    await executeQuery(
      `INSERT INTO journal_trades (id, userId, date, pair, tradeType, session, riskPct, rResult, dollarResult, followedRules, notes, emotional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, date, pair, tradeType, session, riskPct, rNum, dollarResult, followedRules, notes, emotional]
    );

    const [rows] = await executeQuery('SELECT * FROM journal_trades WHERE id = ?', [id]);
    return res.status(201).json({ success: true, trade: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && tradeId) {
    const [existing] = await executeQuery('SELECT id, date FROM journal_trades WHERE id = ? AND userId = ?', [
      tradeId,
      userId,
    ]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }
    const existingDate = existing[0].date
      ? existing[0].date instanceof Date
        ? existing[0].date.toISOString().slice(0, 10)
        : String(existing[0].date).slice(0, 10)
      : null;

    const jctx = await getJournalContext(userId);
    if (!assertJournalWritableDate(res, jctx, existingDate)) return;

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM journal_trades WHERE id = ? AND userId = ?', [tradeId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    const body = parseBody(req);
    const date = body.date != null ? String(body.date).trim().slice(0, 10) : null;
    const pair = body.pair != null ? String(body.pair).trim() : null;
    const rResult = body.rResult;

    if (body.date !== undefined) {
      const nextD = normalizeYyyyMmDd(body.date);
      if (nextD && existingDate && nextD !== existingDate) {
        return res.status(403).json({ success: false, message: 'Cannot change trade date.' });
      }
    }

    if (date != null && !date) {
      return res.status(400).json({ success: false, message: 'date is required' });
    }
    if (pair != null && !pair) {
      return res.status(400).json({ success: false, message: 'pair is required' });
    }
    if (rResult !== undefined) {
      const rNum = Number(rResult);
      if (Number.isNaN(rNum)) {
        return res.status(400).json({ success: false, message: 'rResult must be a number' });
      }
    }
    const emotional = body.emotional !== undefined ? (body.emotional == null || body.emotional === '' ? null : Number(body.emotional)) : undefined;
    if (emotional !== undefined && emotional != null && (Number.isNaN(emotional) || emotional < 1 || emotional > 10)) {
      return res.status(400).json({ success: false, message: 'emotional must be between 1 and 10' });
    }

    const updates = [];
    const params = [];

    if (date !== undefined) {
      updates.push('date = ?');
      params.push(date);
    }
    if (pair !== undefined) {
      updates.push('pair = ?');
      params.push(pair);
    }
    if (body.tradeType !== undefined) {
      updates.push('tradeType = ?');
      params.push(body.tradeType ? String(body.tradeType).trim().slice(0, 64) : null);
    }
    if (body.session !== undefined) {
      updates.push('session = ?');
      params.push(body.session ? String(body.session).trim().slice(0, 32) : null);
    }
    if (body.riskPct !== undefined) {
      updates.push('riskPct = ?');
      params.push(body.riskPct != null && body.riskPct !== '' ? Number(body.riskPct) : null);
    }
    if (rResult !== undefined) {
      updates.push('rResult = ?');
      params.push(Number(rResult));
    }
    if (body.dollarResult !== undefined) {
      updates.push('dollarResult = ?');
      params.push(body.dollarResult != null && body.dollarResult !== '' ? Number(body.dollarResult) : null);
    }
    if (body.followedRules !== undefined) {
      updates.push('followedRules = ?');
      params.push(body.followedRules === false || body.followedRules === 'false' ? 0 : 1);
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(body.notes != null ? String(body.notes).trim().slice(0, 4096) : null);
    }
    if (emotional !== undefined) {
      updates.push('emotional = ?');
      params.push(emotional);
    }

    if (updates.length === 0) {
      const [rows] = await executeQuery('SELECT * FROM journal_trades WHERE id = ?', [tradeId]);
      return res.status(200).json({ success: true, trade: mapRow(rows[0]) });
    }

    params.push(tradeId);
    await executeQuery(
      `UPDATE journal_trades SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      [...params, userId]
    );

    const [rows] = await executeQuery('SELECT * FROM journal_trades WHERE id = ?', [tradeId]);
    return res.status(200).json({ success: true, trade: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
