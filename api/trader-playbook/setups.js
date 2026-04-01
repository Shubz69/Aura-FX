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

async function ensureTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_playbook_setups (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      name VARCHAR(160) NOT NULL,
      marketType VARCHAR(40) DEFAULT NULL,
      timeframes VARCHAR(120) DEFAULT NULL,
      assets VARCHAR(255) DEFAULT NULL,
      session VARCHAR(80) DEFAULT NULL,
      biasRequirement TEXT DEFAULT NULL,
      structureRequirement TEXT DEFAULT NULL,
      volatilityCondition TEXT DEFAULT NULL,
      sessionTiming TEXT DEFAULT NULL,
      confirmationType VARCHAR(120) DEFAULT NULL,
      entryTrigger VARCHAR(180) DEFAULT NULL,
      entryChecklist JSON DEFAULT NULL,
      stopPlacement TEXT DEFAULT NULL,
      maxRisk DECIMAL(10,4) DEFAULT NULL,
      positionSizing TEXT DEFAULT NULL,
      invalidationLogic TEXT DEFAULT NULL,
      partialsRule TEXT DEFAULT NULL,
      trailingLogic TEXT DEFAULT NULL,
      holdVsExit TEXT DEFAULT NULL,
      doNotTrade JSON DEFAULT NULL,
      commonMistakes JSON DEFAULT NULL,
      checklistNotes TEXT DEFAULT NULL,
      winRate VARCHAR(32) DEFAULT NULL,
      avgR VARCHAR(32) DEFAULT NULL,
      bestPerformance TEXT DEFAULT NULL,
      worstPerformance TEXT DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_playbook_userId (userId),
      INDEX idx_playbook_userId_updatedAt (userId, updatedAt)
    )
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    marketType: row.marketType || '',
    timeframes: row.timeframes || '',
    assets: row.assets || '',
    session: row.session || '',
    biasRequirement: row.biasRequirement || '',
    structureRequirement: row.structureRequirement || '',
    volatilityCondition: row.volatilityCondition || '',
    sessionTiming: row.sessionTiming || '',
    confirmationType: row.confirmationType || '',
    entryTrigger: row.entryTrigger || '',
    entryChecklist: parseJsonField(row.entryChecklist),
    stopPlacement: row.stopPlacement || '',
    maxRisk: row.maxRisk != null ? String(row.maxRisk) : '',
    positionSizing: row.positionSizing || '',
    invalidationLogic: row.invalidationLogic || '',
    partialsRule: row.partialsRule || '',
    trailingLogic: row.trailingLogic || '',
    holdVsExit: row.holdVsExit || '',
    doNotTrade: parseJsonField(row.doNotTrade),
    commonMistakes: parseJsonField(row.commonMistakes),
    checklistNotes: row.checklistNotes || '',
    winRate: row.winRate || '',
    avgR: row.avgR || '',
    bestPerformance: row.bestPerformance || '',
    worstPerformance: row.worstPerformance || '',
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
  const idMatch = pathname.match(/\/api\/trader-playbook\/setups\/([a-f0-9-]{36})/i);
  const setupId = idMatch ? idMatch[1] : null;

  try {
    await ensureTable();
  } catch (error) {
    console.error('Trader playbook ensureTable error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET' && setupId) {
    const [rows] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ? AND userId = ?', [setupId, userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Setup not found' });
    return res.status(200).json({ success: true, setup: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const [rows] = await executeQuery(
      'SELECT * FROM trader_playbook_setups WHERE userId = ? ORDER BY updatedAt DESC, createdAt DESC',
      [userId]
    );
    return res.status(200).json({ success: true, setups: rows.map(mapRow) });
  }

  if (req.method === 'POST' && !setupId) {
    const body = parseBody(req);
    const id = crypto.randomUUID();
    const params = [
      id,
      userId,
      String(body.name || '').trim().slice(0, 160) || 'Custom setup',
      String(body.marketType || '').trim().slice(0, 40) || null,
      String(body.timeframes || '').trim().slice(0, 120) || null,
      String(body.assets || '').trim().slice(0, 255) || null,
      String(body.session || '').trim().slice(0, 80) || null,
      body.biasRequirement != null ? String(body.biasRequirement).slice(0, 6000) : null,
      body.structureRequirement != null ? String(body.structureRequirement).slice(0, 6000) : null,
      body.volatilityCondition != null ? String(body.volatilityCondition).slice(0, 6000) : null,
      body.sessionTiming != null ? String(body.sessionTiming).slice(0, 6000) : null,
      String(body.confirmationType || '').trim().slice(0, 120) || null,
      String(body.entryTrigger || '').trim().slice(0, 180) || null,
      JSON.stringify(Array.isArray(body.entryChecklist) ? body.entryChecklist : []),
      body.stopPlacement != null ? String(body.stopPlacement).slice(0, 6000) : null,
      body.maxRisk !== '' && body.maxRisk != null ? Number(body.maxRisk) : null,
      body.positionSizing != null ? String(body.positionSizing).slice(0, 6000) : null,
      body.invalidationLogic != null ? String(body.invalidationLogic).slice(0, 6000) : null,
      body.partialsRule != null ? String(body.partialsRule).slice(0, 6000) : null,
      body.trailingLogic != null ? String(body.trailingLogic).slice(0, 6000) : null,
      body.holdVsExit != null ? String(body.holdVsExit).slice(0, 6000) : null,
      JSON.stringify(Array.isArray(body.doNotTrade) ? body.doNotTrade : []),
      JSON.stringify(Array.isArray(body.commonMistakes) ? body.commonMistakes : []),
      body.checklistNotes != null ? String(body.checklistNotes).slice(0, 6000) : null,
      String(body.winRate || '').trim().slice(0, 32) || null,
      String(body.avgR || '').trim().slice(0, 32) || null,
      body.bestPerformance != null ? String(body.bestPerformance).slice(0, 4000) : null,
      body.worstPerformance != null ? String(body.worstPerformance).slice(0, 4000) : null,
    ];

    await executeQuery(
      `INSERT INTO trader_playbook_setups (
        id, userId, name, marketType, timeframes, assets, session, biasRequirement, structureRequirement,
        volatilityCondition, sessionTiming, confirmationType, entryTrigger, entryChecklist, stopPlacement,
        maxRisk, positionSizing, invalidationLogic, partialsRule, trailingLogic, holdVsExit, doNotTrade,
        commonMistakes, checklistNotes, winRate, avgR, bestPerformance, worstPerformance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );

    const [rows] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ?', [id]);
    return res.status(201).json({ success: true, setup: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && setupId) {
    const [existing] = await executeQuery('SELECT id FROM trader_playbook_setups WHERE id = ? AND userId = ?', [setupId, userId]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Setup not found' });

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM trader_playbook_setups WHERE id = ? AND userId = ?', [setupId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    const body = parseBody(req);
    await executeQuery(
      `UPDATE trader_playbook_setups SET
        name = ?, marketType = ?, timeframes = ?, assets = ?, session = ?, biasRequirement = ?,
        structureRequirement = ?, volatilityCondition = ?, sessionTiming = ?, confirmationType = ?,
        entryTrigger = ?, entryChecklist = ?, stopPlacement = ?, maxRisk = ?, positionSizing = ?,
        invalidationLogic = ?, partialsRule = ?, trailingLogic = ?, holdVsExit = ?, doNotTrade = ?,
        commonMistakes = ?, checklistNotes = ?, winRate = ?, avgR = ?, bestPerformance = ?, worstPerformance = ?
      WHERE id = ? AND userId = ?`,
      [
        String(body.name || '').trim().slice(0, 160) || 'Custom setup',
        String(body.marketType || '').trim().slice(0, 40) || null,
        String(body.timeframes || '').trim().slice(0, 120) || null,
        String(body.assets || '').trim().slice(0, 255) || null,
        String(body.session || '').trim().slice(0, 80) || null,
        body.biasRequirement != null ? String(body.biasRequirement).slice(0, 6000) : null,
        body.structureRequirement != null ? String(body.structureRequirement).slice(0, 6000) : null,
        body.volatilityCondition != null ? String(body.volatilityCondition).slice(0, 6000) : null,
        body.sessionTiming != null ? String(body.sessionTiming).slice(0, 6000) : null,
        String(body.confirmationType || '').trim().slice(0, 120) || null,
        String(body.entryTrigger || '').trim().slice(0, 180) || null,
        JSON.stringify(Array.isArray(body.entryChecklist) ? body.entryChecklist : []),
        body.stopPlacement != null ? String(body.stopPlacement).slice(0, 6000) : null,
        body.maxRisk !== '' && body.maxRisk != null ? Number(body.maxRisk) : null,
        body.positionSizing != null ? String(body.positionSizing).slice(0, 6000) : null,
        body.invalidationLogic != null ? String(body.invalidationLogic).slice(0, 6000) : null,
        body.partialsRule != null ? String(body.partialsRule).slice(0, 6000) : null,
        body.trailingLogic != null ? String(body.trailingLogic).slice(0, 6000) : null,
        body.holdVsExit != null ? String(body.holdVsExit).slice(0, 6000) : null,
        JSON.stringify(Array.isArray(body.doNotTrade) ? body.doNotTrade : []),
        JSON.stringify(Array.isArray(body.commonMistakes) ? body.commonMistakes : []),
        body.checklistNotes != null ? String(body.checklistNotes).slice(0, 6000) : null,
        String(body.winRate || '').trim().slice(0, 32) || null,
        String(body.avgR || '').trim().slice(0, 32) || null,
        body.bestPerformance != null ? String(body.bestPerformance).slice(0, 4000) : null,
        body.worstPerformance != null ? String(body.worstPerformance).slice(0, 4000) : null,
        setupId,
        userId,
      ]
    );

    const [rows] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ?', [setupId]);
    return res.status(200).json({ success: true, setup: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
