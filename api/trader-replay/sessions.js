const crypto = require('crypto');
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');

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

function toDateString(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function ensureTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_replay_sessions (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      title VARCHAR(180) NOT NULL,
      symbol VARCHAR(64) DEFAULT NULL,
      intervalCode VARCHAR(12) DEFAULT NULL,
      asset VARCHAR(64) DEFAULT NULL,
      direction VARCHAR(16) DEFAULT NULL,
      outcome VARCHAR(24) DEFAULT NULL,
      rResult VARCHAR(32) DEFAULT NULL,
      entryLevel VARCHAR(32) DEFAULT NULL,
      stopLevel VARCHAR(32) DEFAULT NULL,
      targetLevel VARCHAR(32) DEFAULT NULL,
      exitLevel VARCHAR(32) DEFAULT NULL,
      marketState VARCHAR(120) DEFAULT NULL,
      biasAtTime VARCHAR(120) DEFAULT NULL,
      confidenceLevel VARCHAR(32) DEFAULT NULL,
      keyDrivers TEXT DEFAULT NULL,
      entryTiming INT DEFAULT NULL,
      discipline INT DEFAULT NULL,
      patience INT DEFAULT NULL,
      verdict TEXT DEFAULT NULL,
      mfe VARCHAR(32) DEFAULT NULL,
      mae VARCHAR(32) DEFAULT NULL,
      missedR VARCHAR(32) DEFAULT NULL,
      actualR VARCHAR(32) DEFAULT NULL,
      insight TEXT DEFAULT NULL,
      patternInsight TEXT DEFAULT NULL,
      linkedPlaybook VARCHAR(180) DEFAULT NULL,
      linkedLabDate DATE DEFAULT NULL,
      replayStep INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_trader_replay_userId (userId),
      INDEX idx_trader_replay_userId_updatedAt (userId, updatedAt)
    )
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title || '',
    symbol: row.symbol || '',
    interval: row.intervalCode || '',
    asset: row.asset || '',
    direction: row.direction || '',
    outcome: row.outcome || '',
    rResult: row.rResult || '',
    entry: row.entryLevel || '',
    stop: row.stopLevel || '',
    target: row.targetLevel || '',
    exit: row.exitLevel || '',
    marketState: row.marketState || '',
    biasAtTime: row.biasAtTime || '',
    confidenceLevel: row.confidenceLevel || '',
    keyDrivers: row.keyDrivers || '',
    entryTiming: row.entryTiming != null ? Number(row.entryTiming) : 0,
    discipline: row.discipline != null ? Number(row.discipline) : 0,
    patience: row.patience != null ? Number(row.patience) : 0,
    verdict: row.verdict || '',
    mfe: row.mfe || '',
    mae: row.mae || '',
    missedR: row.missedR || '',
    actualR: row.actualR || '',
    insight: row.insight || '',
    patternInsight: row.patternInsight || '',
    linkedPlaybook: row.linkedPlaybook || '',
    linkedLabDate: toDateString(row.linkedLabDate),
    replayStep: row.replayStep != null ? Number(row.replayStep) : 0,
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
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);
  const pathname = getPathname(req);
  const idMatch = pathname.match(/\/api\/trader-replay\/sessions\/([a-f0-9-]{36})/i);
  const sessionId = idMatch ? idMatch[1] : null;

  try {
    await ensureTable();
  } catch (error) {
    console.error('Trader replay ensureTable error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET' && sessionId) {
    const [rows] = await executeQuery('SELECT * FROM trader_replay_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Replay session not found' });
    return res.status(200).json({ success: true, session: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const [rows] = await executeQuery(
      'SELECT * FROM trader_replay_sessions WHERE userId = ? ORDER BY updatedAt DESC, createdAt DESC',
      [userId]
    );
    return res.status(200).json({ success: true, sessions: rows.map(mapRow) });
  }

  const body = parseBody(req);

  if (req.method === 'POST' && !sessionId) {
    const id = crypto.randomUUID();
    await executeQuery(
      `INSERT INTO trader_replay_sessions (
        id, userId, title, symbol, intervalCode, asset, direction, outcome, rResult, entryLevel, stopLevel, targetLevel,
        exitLevel, marketState, biasAtTime, confidenceLevel, keyDrivers, entryTiming, discipline, patience, verdict, mfe,
        mae, missedR, actualR, insight, patternInsight, linkedPlaybook, linkedLabDate, replayStep
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        String(body.title || '').trim().slice(0, 180) || 'Replay Session',
        String(body.symbol || '').trim().slice(0, 64) || null,
        String(body.interval || '').trim().slice(0, 12) || null,
        String(body.asset || '').trim().slice(0, 64) || null,
        String(body.direction || '').trim().slice(0, 16) || null,
        String(body.outcome || '').trim().slice(0, 24) || null,
        String(body.rResult || '').trim().slice(0, 32) || null,
        String(body.entry || '').trim().slice(0, 32) || null,
        String(body.stop || '').trim().slice(0, 32) || null,
        String(body.target || '').trim().slice(0, 32) || null,
        String(body.exit || '').trim().slice(0, 32) || null,
        String(body.marketState || '').trim().slice(0, 120) || null,
        String(body.biasAtTime || '').trim().slice(0, 120) || null,
        String(body.confidenceLevel || '').trim().slice(0, 32) || null,
        body.keyDrivers != null ? String(body.keyDrivers).slice(0, 6000) : null,
        body.entryTiming != null ? Number(body.entryTiming) : null,
        body.discipline != null ? Number(body.discipline) : null,
        body.patience != null ? Number(body.patience) : null,
        body.verdict != null ? String(body.verdict).slice(0, 6000) : null,
        String(body.mfe || '').trim().slice(0, 32) || null,
        String(body.mae || '').trim().slice(0, 32) || null,
        String(body.missedR || '').trim().slice(0, 32) || null,
        String(body.actualR || '').trim().slice(0, 32) || null,
        body.insight != null ? String(body.insight).slice(0, 6000) : null,
        body.patternInsight != null ? String(body.patternInsight).slice(0, 6000) : null,
        String(body.linkedPlaybook || '').trim().slice(0, 180) || null,
        body.linkedLabDate ? String(body.linkedLabDate).slice(0, 10) : null,
        body.replayStep != null ? Number(body.replayStep) : 0,
      ]
    );

    const [rows] = await executeQuery('SELECT * FROM trader_replay_sessions WHERE id = ?', [id]);
    return res.status(201).json({ success: true, session: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && sessionId) {
    const [existing] = await executeQuery('SELECT id FROM trader_replay_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Replay session not found' });

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM trader_replay_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    await executeQuery(
      `UPDATE trader_replay_sessions SET
        title = ?, symbol = ?, intervalCode = ?, asset = ?, direction = ?, outcome = ?, rResult = ?, entryLevel = ?, stopLevel = ?,
        targetLevel = ?, exitLevel = ?, marketState = ?, biasAtTime = ?, confidenceLevel = ?, keyDrivers = ?, entryTiming = ?,
        discipline = ?, patience = ?, verdict = ?, mfe = ?, mae = ?, missedR = ?, actualR = ?, insight = ?, patternInsight = ?,
        linkedPlaybook = ?, linkedLabDate = ?, replayStep = ?
      WHERE id = ? AND userId = ?`,
      [
        String(body.title || '').trim().slice(0, 180) || 'Replay Session',
        String(body.symbol || '').trim().slice(0, 64) || null,
        String(body.interval || '').trim().slice(0, 12) || null,
        String(body.asset || '').trim().slice(0, 64) || null,
        String(body.direction || '').trim().slice(0, 16) || null,
        String(body.outcome || '').trim().slice(0, 24) || null,
        String(body.rResult || '').trim().slice(0, 32) || null,
        String(body.entry || '').trim().slice(0, 32) || null,
        String(body.stop || '').trim().slice(0, 32) || null,
        String(body.target || '').trim().slice(0, 32) || null,
        String(body.exit || '').trim().slice(0, 32) || null,
        String(body.marketState || '').trim().slice(0, 120) || null,
        String(body.biasAtTime || '').trim().slice(0, 120) || null,
        String(body.confidenceLevel || '').trim().slice(0, 32) || null,
        body.keyDrivers != null ? String(body.keyDrivers).slice(0, 6000) : null,
        body.entryTiming != null ? Number(body.entryTiming) : null,
        body.discipline != null ? Number(body.discipline) : null,
        body.patience != null ? Number(body.patience) : null,
        body.verdict != null ? String(body.verdict).slice(0, 6000) : null,
        String(body.mfe || '').trim().slice(0, 32) || null,
        String(body.mae || '').trim().slice(0, 32) || null,
        String(body.missedR || '').trim().slice(0, 32) || null,
        String(body.actualR || '').trim().slice(0, 32) || null,
        body.insight != null ? String(body.insight).slice(0, 6000) : null,
        body.patternInsight != null ? String(body.patternInsight).slice(0, 6000) : null,
        String(body.linkedPlaybook || '').trim().slice(0, 180) || null,
        body.linkedLabDate ? String(body.linkedLabDate).slice(0, 10) : null,
        body.replayStep != null ? Number(body.replayStep) : 0,
        sessionId,
        userId,
      ]
    );

    const [rows] = await executeQuery('SELECT * FROM trader_replay_sessions WHERE id = ?', [sessionId]);
    return res.status(200).json({ success: true, session: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
