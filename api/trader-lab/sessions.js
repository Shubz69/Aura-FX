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

function parseJsonField(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toDateString(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function ensureTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_lab_sessions (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      sessionDate DATE NOT NULL,
      marketBias VARCHAR(160) DEFAULT NULL,
      marketState VARCHAR(40) DEFAULT NULL,
      auraConfidence INT DEFAULT NULL,
      todaysFocus TEXT DEFAULT NULL,
      sessionGoal TEXT DEFAULT NULL,
      maxTradesAllowed INT DEFAULT NULL,
      whatDoISee TEXT DEFAULT NULL,
      setupName VARCHAR(160) DEFAULT NULL,
      whyValid TEXT DEFAULT NULL,
      entryConfirmation TEXT DEFAULT NULL,
      confidence INT DEFAULT NULL,
      riskLevel VARCHAR(40) DEFAULT NULL,
      entryPrice DECIMAL(16,6) DEFAULT NULL,
      stopLoss DECIMAL(16,6) DEFAULT NULL,
      targetPrice DECIMAL(16,6) DEFAULT NULL,
      riskPercent DECIMAL(10,4) DEFAULT NULL,
      rrRatio DECIMAL(12,4) DEFAULT NULL,
      setupValid TINYINT(1) DEFAULT 0,
      biasAligned TINYINT(1) DEFAULT 0,
      entryConfirmed TINYINT(1) DEFAULT 0,
      riskDefined TINYINT(1) DEFAULT 0,
      livePnlR DECIMAL(12,4) DEFAULT NULL,
      livePnlPercent DECIMAL(12,4) DEFAULT NULL,
      currentPrice DECIMAL(16,6) DEFAULT NULL,
      distanceToSl DECIMAL(12,4) DEFAULT NULL,
      distanceToTp DECIMAL(12,4) DEFAULT NULL,
      emotions TEXT DEFAULT NULL,
      duringNotes TEXT DEFAULT NULL,
      outcome VARCHAR(24) DEFAULT NULL,
      resultR DECIMAL(12,4) DEFAULT NULL,
      durationMinutes INT DEFAULT NULL,
      followedRules TINYINT(1) DEFAULT 0,
      entryCorrect TINYINT(1) DEFAULT 0,
      exitCorrect TINYINT(1) DEFAULT 0,
      whatToChange TEXT DEFAULT NULL,
      emotionalIntensity INT DEFAULT NULL,
      mistakeTags JSON DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_trader_lab_userId (userId),
      INDEX idx_trader_lab_userId_sessionDate (userId, sessionDate)
    )
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    sessionDate: toDateString(row.sessionDate),
    marketBias: row.marketBias || '',
    marketState: row.marketState || '',
    auraConfidence: row.auraConfidence != null ? Number(row.auraConfidence) : 0,
    todaysFocus: row.todaysFocus || '',
    sessionGoal: row.sessionGoal || '',
    maxTradesAllowed: row.maxTradesAllowed != null ? Number(row.maxTradesAllowed) : 0,
    whatDoISee: row.whatDoISee || '',
    setupName: row.setupName || '',
    whyValid: row.whyValid || '',
    entryConfirmation: row.entryConfirmation || '',
    confidence: row.confidence != null ? Number(row.confidence) : 0,
    riskLevel: row.riskLevel || '',
    entryPrice: row.entryPrice != null ? Number(row.entryPrice) : '',
    stopLoss: row.stopLoss != null ? Number(row.stopLoss) : '',
    targetPrice: row.targetPrice != null ? Number(row.targetPrice) : '',
    riskPercent: row.riskPercent != null ? Number(row.riskPercent) : '',
    rrRatio: row.rrRatio != null ? Number(row.rrRatio) : '',
    setupValid: Boolean(row.setupValid),
    biasAligned: Boolean(row.biasAligned),
    entryConfirmed: Boolean(row.entryConfirmed),
    riskDefined: Boolean(row.riskDefined),
    livePnlR: row.livePnlR != null ? Number(row.livePnlR) : '',
    livePnlPercent: row.livePnlPercent != null ? Number(row.livePnlPercent) : '',
    currentPrice: row.currentPrice != null ? Number(row.currentPrice) : '',
    distanceToSl: row.distanceToSl != null ? Number(row.distanceToSl) : '',
    distanceToTp: row.distanceToTp != null ? Number(row.distanceToTp) : '',
    emotions: row.emotions || '',
    duringNotes: row.duringNotes || '',
    outcome: row.outcome || '',
    resultR: row.resultR != null ? Number(row.resultR) : '',
    durationMinutes: row.durationMinutes != null ? Number(row.durationMinutes) : '',
    followedRules: Boolean(row.followedRules),
    entryCorrect: Boolean(row.entryCorrect),
    exitCorrect: Boolean(row.exitCorrect),
    whatToChange: row.whatToChange || '',
    emotionalIntensity: row.emotionalIntensity != null ? Number(row.emotionalIntensity) : 0,
    mistakeTags: parseJsonField(row.mistakeTags),
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
  const idMatch = pathname.match(/\/api\/trader-lab\/sessions\/([a-f0-9-]{36})/i);
  const sessionId = idMatch ? idMatch[1] : null;

  try {
    await ensureTable();
  } catch (error) {
    console.error('Trader lab ensureTable error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET' && sessionId) {
    const [rows] = await executeQuery('SELECT * FROM trader_lab_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    return res.status(200).json({ success: true, session: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const [rows] = await executeQuery(
      'SELECT * FROM trader_lab_sessions WHERE userId = ? ORDER BY sessionDate DESC, updatedAt DESC',
      [userId]
    );
    return res.status(200).json({ success: true, sessions: rows.map(mapRow) });
  }

  const body = parseBody(req);

  if (req.method === 'POST' && !sessionId) {
    const id = crypto.randomUUID();
    await executeQuery(
      `INSERT INTO trader_lab_sessions (
        id, userId, sessionDate, marketBias, marketState, auraConfidence, todaysFocus, sessionGoal, maxTradesAllowed,
        whatDoISee, setupName, whyValid, entryConfirmation, confidence, riskLevel, entryPrice, stopLoss, targetPrice,
        riskPercent, rrRatio, setupValid, biasAligned, entryConfirmed, riskDefined, livePnlR, livePnlPercent, currentPrice,
        distanceToSl, distanceToTp, emotions, duringNotes, outcome, resultR, durationMinutes, followedRules, entryCorrect,
        exitCorrect, whatToChange, emotionalIntensity, mistakeTags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        String(body.sessionDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        body.marketBias != null ? String(body.marketBias).slice(0, 160) : null,
        body.marketState != null ? String(body.marketState).slice(0, 40) : null,
        body.auraConfidence != null ? Number(body.auraConfidence) : null,
        body.todaysFocus != null ? String(body.todaysFocus).slice(0, 6000) : null,
        body.sessionGoal != null ? String(body.sessionGoal).slice(0, 6000) : null,
        body.maxTradesAllowed != null ? Number(body.maxTradesAllowed) : null,
        body.whatDoISee != null ? String(body.whatDoISee).slice(0, 6000) : null,
        body.setupName != null ? String(body.setupName).slice(0, 160) : null,
        body.whyValid != null ? String(body.whyValid).slice(0, 6000) : null,
        body.entryConfirmation != null ? String(body.entryConfirmation).slice(0, 6000) : null,
        body.confidence != null ? Number(body.confidence) : null,
        body.riskLevel != null ? String(body.riskLevel).slice(0, 40) : null,
        body.entryPrice !== '' && body.entryPrice != null ? Number(body.entryPrice) : null,
        body.stopLoss !== '' && body.stopLoss != null ? Number(body.stopLoss) : null,
        body.targetPrice !== '' && body.targetPrice != null ? Number(body.targetPrice) : null,
        body.riskPercent !== '' && body.riskPercent != null ? Number(body.riskPercent) : null,
        body.rrRatio !== '' && body.rrRatio != null ? Number(body.rrRatio) : null,
        body.setupValid ? 1 : 0,
        body.biasAligned ? 1 : 0,
        body.entryConfirmed ? 1 : 0,
        body.riskDefined ? 1 : 0,
        body.livePnlR !== '' && body.livePnlR != null ? Number(body.livePnlR) : null,
        body.livePnlPercent !== '' && body.livePnlPercent != null ? Number(body.livePnlPercent) : null,
        body.currentPrice !== '' && body.currentPrice != null ? Number(body.currentPrice) : null,
        body.distanceToSl !== '' && body.distanceToSl != null ? Number(body.distanceToSl) : null,
        body.distanceToTp !== '' && body.distanceToTp != null ? Number(body.distanceToTp) : null,
        body.emotions != null ? String(body.emotions).slice(0, 6000) : null,
        body.duringNotes != null ? String(body.duringNotes).slice(0, 6000) : null,
        body.outcome != null ? String(body.outcome).slice(0, 24) : null,
        body.resultR !== '' && body.resultR != null ? Number(body.resultR) : null,
        body.durationMinutes != null ? Number(body.durationMinutes) : null,
        body.followedRules ? 1 : 0,
        body.entryCorrect ? 1 : 0,
        body.exitCorrect ? 1 : 0,
        body.whatToChange != null ? String(body.whatToChange).slice(0, 6000) : null,
        body.emotionalIntensity != null ? Number(body.emotionalIntensity) : null,
        JSON.stringify(Array.isArray(body.mistakeTags) ? body.mistakeTags : []),
      ]
    );

    const [rows] = await executeQuery('SELECT * FROM trader_lab_sessions WHERE id = ?', [id]);
    return res.status(201).json({ success: true, session: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && sessionId) {
    const [existing] = await executeQuery('SELECT id FROM trader_lab_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Session not found' });

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM trader_lab_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    await executeQuery(
      `UPDATE trader_lab_sessions SET
        sessionDate = ?, marketBias = ?, marketState = ?, auraConfidence = ?, todaysFocus = ?, sessionGoal = ?, maxTradesAllowed = ?,
        whatDoISee = ?, setupName = ?, whyValid = ?, entryConfirmation = ?, confidence = ?, riskLevel = ?, entryPrice = ?, stopLoss = ?,
        targetPrice = ?, riskPercent = ?, rrRatio = ?, setupValid = ?, biasAligned = ?, entryConfirmed = ?, riskDefined = ?, livePnlR = ?,
        livePnlPercent = ?, currentPrice = ?, distanceToSl = ?, distanceToTp = ?, emotions = ?, duringNotes = ?, outcome = ?, resultR = ?,
        durationMinutes = ?, followedRules = ?, entryCorrect = ?, exitCorrect = ?, whatToChange = ?, emotionalIntensity = ?, mistakeTags = ?
      WHERE id = ? AND userId = ?`,
      [
        String(body.sessionDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        body.marketBias != null ? String(body.marketBias).slice(0, 160) : null,
        body.marketState != null ? String(body.marketState).slice(0, 40) : null,
        body.auraConfidence != null ? Number(body.auraConfidence) : null,
        body.todaysFocus != null ? String(body.todaysFocus).slice(0, 6000) : null,
        body.sessionGoal != null ? String(body.sessionGoal).slice(0, 6000) : null,
        body.maxTradesAllowed != null ? Number(body.maxTradesAllowed) : null,
        body.whatDoISee != null ? String(body.whatDoISee).slice(0, 6000) : null,
        body.setupName != null ? String(body.setupName).slice(0, 160) : null,
        body.whyValid != null ? String(body.whyValid).slice(0, 6000) : null,
        body.entryConfirmation != null ? String(body.entryConfirmation).slice(0, 6000) : null,
        body.confidence != null ? Number(body.confidence) : null,
        body.riskLevel != null ? String(body.riskLevel).slice(0, 40) : null,
        body.entryPrice !== '' && body.entryPrice != null ? Number(body.entryPrice) : null,
        body.stopLoss !== '' && body.stopLoss != null ? Number(body.stopLoss) : null,
        body.targetPrice !== '' && body.targetPrice != null ? Number(body.targetPrice) : null,
        body.riskPercent !== '' && body.riskPercent != null ? Number(body.riskPercent) : null,
        body.rrRatio !== '' && body.rrRatio != null ? Number(body.rrRatio) : null,
        body.setupValid ? 1 : 0,
        body.biasAligned ? 1 : 0,
        body.entryConfirmed ? 1 : 0,
        body.riskDefined ? 1 : 0,
        body.livePnlR !== '' && body.livePnlR != null ? Number(body.livePnlR) : null,
        body.livePnlPercent !== '' && body.livePnlPercent != null ? Number(body.livePnlPercent) : null,
        body.currentPrice !== '' && body.currentPrice != null ? Number(body.currentPrice) : null,
        body.distanceToSl !== '' && body.distanceToSl != null ? Number(body.distanceToSl) : null,
        body.distanceToTp !== '' && body.distanceToTp != null ? Number(body.distanceToTp) : null,
        body.emotions != null ? String(body.emotions).slice(0, 6000) : null,
        body.duringNotes != null ? String(body.duringNotes).slice(0, 6000) : null,
        body.outcome != null ? String(body.outcome).slice(0, 24) : null,
        body.resultR !== '' && body.resultR != null ? Number(body.resultR) : null,
        body.durationMinutes != null ? Number(body.durationMinutes) : null,
        body.followedRules ? 1 : 0,
        body.entryCorrect ? 1 : 0,
        body.exitCorrect ? 1 : 0,
        body.whatToChange != null ? String(body.whatToChange).slice(0, 6000) : null,
        body.emotionalIntensity != null ? Number(body.emotionalIntensity) : null,
        JSON.stringify(Array.isArray(body.mistakeTags) ? body.mistakeTags : []),
        sessionId,
        userId,
      ]
    );

    const [rows] = await executeQuery('SELECT * FROM trader_lab_sessions WHERE id = ?', [sessionId]);
    return res.status(200).json({ success: true, session: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
