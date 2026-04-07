const crypto = require('crypto');
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { migratePlaybookColumns, touchPlaybookLastUsed, ensureMTradesTable } = require('./schema');

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

function parseJsonObject(value, fallback = {}) {
  if (value == null || value === '') return { ...fallback };
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) return { ...fallback, ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...fallback, ...parsed } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function stringifyJson(val, fallback) {
  try {
    return JSON.stringify(val != null ? val : fallback);
  } catch {
    return JSON.stringify(fallback);
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
  await migratePlaybookColumns();
}

function mapRow(row) {
  if (!row) return null;
  const mc = parseJsonObject(row.marketConditions);
  const er = parseJsonObject(row.entryRules);
  const xr = parseJsonObject(row.exitRules);
  const rr = parseJsonObject(row.riskRules);
  const gr = parseJsonObject(row.guardrails);
  const ob = parseJsonObject(row.overviewBlocks);
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    marketType: row.marketType || '',
    setupType: row.setupType || '',
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
    description: row.description || '',
    icon: row.icon || '',
    color: row.color || '',
    status: row.status || 'active',
    tags: parseJsonField(row.tags),
    marketConditions: mc,
    entryRules: er,
    exitRules: xr,
    riskRules: rr,
    guardrails: gr,
    checklistSections: Array.isArray(row.checklistSections)
      ? row.checklistSections
      : parseJsonField(row.checklistSections, []),
    overviewBlocks: ob,
    reviewNotesCount: row.reviewNotesCount != null ? Number(row.reviewNotesCount) : 0,
    lastUsedAt: row.lastUsedAt || null,
    archivedAt: row.archivedAt || null,
  };
}

function sliceStr(v, max) {
  if (v == null) return null;
  const s = String(v);
  return s.slice(0, max);
}

function bodyToColumnValues(body, existingRow = null) {
  const e = existingRow || {};
  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string').map((t) => t.slice(0, 48)) : parseJsonField(e.tags);
  const checklistSections = Array.isArray(body.checklistSections)
    ? body.checklistSections
    : Array.isArray(e.checklistSections)
      ? e.checklistSections
      : parseJsonField(e.checklistSections, []);
  const marketConditions =
    body.marketConditions && typeof body.marketConditions === 'object' ? body.marketConditions : parseJsonObject(e.marketConditions);
  const entryRules = body.entryRules && typeof body.entryRules === 'object' ? body.entryRules : parseJsonObject(e.entryRules);
  const exitRules = body.exitRules && typeof body.exitRules === 'object' ? body.exitRules : parseJsonObject(e.exitRules);
  const riskRules = body.riskRules && typeof body.riskRules === 'object' ? body.riskRules : parseJsonObject(e.riskRules);
  const guardrails = body.guardrails && typeof body.guardrails === 'object' ? body.guardrails : parseJsonObject(e.guardrails);
  const overviewBlocks =
    body.overviewBlocks && typeof body.overviewBlocks === 'object' ? body.overviewBlocks : parseJsonObject(e.overviewBlocks);

  return {
    name: sliceStr(body.name !== undefined ? body.name : e.name, 160) || 'Custom setup',
    marketType: sliceStr(body.marketType !== undefined ? body.marketType : e.marketType, 40),
    setupType: sliceStr(body.setupType !== undefined ? body.setupType : e.setupType, 64),
    timeframes: sliceStr(body.timeframes !== undefined ? body.timeframes : e.timeframes, 120),
    assets: sliceStr(body.assets !== undefined ? body.assets : e.assets, 255),
    session: sliceStr(body.session !== undefined ? body.session : e.session, 80),
    description: body.description !== undefined ? sliceStr(body.description, 8000) : e.description,
    icon: body.icon !== undefined ? sliceStr(body.icon, 64) : e.icon,
    color: body.color !== undefined ? sliceStr(body.color, 32) : e.color,
    status: (() => {
      const s = String(body.status !== undefined ? body.status : e.status || 'active').toLowerCase();
      if (['active', 'archived', 'draft'].includes(s)) return s;
      return 'active';
    })(),
    tags: stringifyJson(tags, []),
    marketConditions: stringifyJson(marketConditions, {}),
    entryRules: stringifyJson(entryRules, {}),
    exitRules: stringifyJson(exitRules, {}),
    riskRules: stringifyJson(riskRules, {}),
    guardrails: stringifyJson(guardrails, {}),
    checklistSections: stringifyJson(checklistSections, []),
    overviewBlocks: stringifyJson(overviewBlocks, {}),
    biasRequirement: body.biasRequirement !== undefined ? sliceStr(body.biasRequirement, 6000) : e.biasRequirement,
    structureRequirement:
      body.structureRequirement !== undefined ? sliceStr(body.structureRequirement, 6000) : e.structureRequirement,
    volatilityCondition:
      body.volatilityCondition !== undefined ? sliceStr(body.volatilityCondition, 6000) : e.volatilityCondition,
    sessionTiming: body.sessionTiming !== undefined ? sliceStr(body.sessionTiming, 6000) : e.sessionTiming,
    confirmationType:
      body.confirmationType !== undefined ? sliceStr(body.confirmationType, 120) : e.confirmationType,
    entryTrigger: body.entryTrigger !== undefined ? sliceStr(body.entryTrigger, 180) : e.entryTrigger,
    entryChecklist: stringifyJson(
      Array.isArray(body.entryChecklist) ? body.entryChecklist : parseJsonField(e.entryChecklist),
      []
    ),
    stopPlacement: body.stopPlacement !== undefined ? sliceStr(body.stopPlacement, 6000) : e.stopPlacement,
    maxRisk:
      body.maxRisk !== undefined && body.maxRisk !== '' && body.maxRisk != null
        ? Number(body.maxRisk)
        : e.maxRisk != null
          ? Number(e.maxRisk)
          : null,
    positionSizing: body.positionSizing !== undefined ? sliceStr(body.positionSizing, 6000) : e.positionSizing,
    invalidationLogic:
      body.invalidationLogic !== undefined ? sliceStr(body.invalidationLogic, 6000) : e.invalidationLogic,
    partialsRule: body.partialsRule !== undefined ? sliceStr(body.partialsRule, 6000) : e.partialsRule,
    trailingLogic: body.trailingLogic !== undefined ? sliceStr(body.trailingLogic, 6000) : e.trailingLogic,
    holdVsExit: body.holdVsExit !== undefined ? sliceStr(body.holdVsExit, 6000) : e.holdVsExit,
    doNotTrade: stringifyJson(
      Array.isArray(body.doNotTrade) ? body.doNotTrade : parseJsonField(e.doNotTrade),
      []
    ),
    commonMistakes: stringifyJson(
      Array.isArray(body.commonMistakes) ? body.commonMistakes : parseJsonField(e.commonMistakes),
      []
    ),
    checklistNotes: body.checklistNotes !== undefined ? sliceStr(body.checklistNotes, 6000) : e.checklistNotes,
    winRate: body.winRate !== undefined ? sliceStr(body.winRate, 32) : e.winRate,
    avgR: body.avgR !== undefined ? sliceStr(body.avgR, 32) : e.avgR,
    bestPerformance: body.bestPerformance !== undefined ? sliceStr(body.bestPerformance, 4000) : e.bestPerformance,
    worstPerformance: body.worstPerformance !== undefined ? sliceStr(body.worstPerformance, 4000) : e.worstPerformance,
  };
}

async function insertSetup(userId, col) {
  const uid = crypto.randomUUID();
  const reviewNotesCount = 0;
  const archivedAt = col.status === 'archived' ? new Date() : null;

  await executeQuery(
    `INSERT INTO trader_playbook_setups (
      id, userId, name, marketType, setupType, timeframes, assets, session, description, icon, color, status,
      tags, marketConditions, entryRules, exitRules, riskRules, guardrails, checklistSections, overviewBlocks,
      reviewNotesCount, lastUsedAt, archivedAt,
      biasRequirement, structureRequirement, volatilityCondition, sessionTiming, confirmationType, entryTrigger,
      entryChecklist, stopPlacement, maxRisk, positionSizing, invalidationLogic, partialsRule, trailingLogic,
      holdVsExit, doNotTrade, commonMistakes, checklistNotes, winRate, avgR, bestPerformance, worstPerformance
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      uid,
      userId,
      col.name,
      col.marketType || null,
      col.setupType || null,
      col.timeframes || null,
      col.assets || null,
      col.session || null,
      col.description || null,
      col.icon || null,
      col.color || null,
      col.status || 'active',
      col.tags,
      col.marketConditions,
      col.entryRules,
      col.exitRules,
      col.riskRules,
      col.guardrails,
      col.checklistSections,
      col.overviewBlocks,
      reviewNotesCount,
      null,
      archivedAt,
      col.biasRequirement || null,
      col.structureRequirement || null,
      col.volatilityCondition || null,
      col.sessionTiming || null,
      col.confirmationType || null,
      col.entryTrigger || null,
      col.entryChecklist,
      col.stopPlacement || null,
      col.maxRisk,
      col.positionSizing || null,
      col.invalidationLogic || null,
      col.partialsRule || null,
      col.trailingLogic || null,
      col.holdVsExit || null,
      col.doNotTrade,
      col.commonMistakes,
      col.checklistNotes || null,
      col.winRate || null,
      col.avgR || null,
      col.bestPerformance || null,
      col.worstPerformance || null,
    ]
  );
  const [rows] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ?', [uid]);
  return mapRow(rows[0]);
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

  const touchMatch = pathname.match(/\/api\/trader-playbook\/setups\/([a-f0-9-]{36})\/touch$/i);
  if (req.method === 'POST' && touchMatch) {
    const tid = touchMatch[1];
    const [ex] = await executeQuery('SELECT id FROM trader_playbook_setups WHERE id = ? AND userId = ?', [tid, userId]);
    if (!ex.length) return res.status(404).json({ success: false, message: 'Setup not found' });
    await touchPlaybookLastUsed(userId, tid);
    return res.status(200).json({ success: true });
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
    if (body.duplicateFromId) {
      const [src] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ? AND userId = ?', [
        String(body.duplicateFromId).trim(),
        userId,
      ]);
      if (!src.length) return res.status(404).json({ success: false, message: 'Source playbook not found' });
      const customName = body.name != null ? String(body.name).trim().slice(0, 160) : null;
      const sourceRow = src[0];
      const col = bodyToColumnValues({}, sourceRow);
      col.name = customName || sliceStr(`${sourceRow.name} (Copy)`, 160) || 'Copy';
      col.status = 'draft';
      col.winRate = null;
      col.avgR = null;
      const saved = await insertSetup(userId, col);
      return res.status(201).json({ success: true, setup: saved });
    }

    const col = bodyToColumnValues(body, null);
    const saved = await insertSetup(userId, col);
    return res.status(201).json({ success: true, setup: saved });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && setupId) {
    const [existingRows] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ? AND userId = ?', [
      setupId,
      userId,
    ]);
    if (!existingRows.length) return res.status(404).json({ success: false, message: 'Setup not found' });
    const existing = existingRows[0];

    if (req.method === 'DELETE') {
      await executeQuery('DELETE FROM trader_playbook_setups WHERE id = ? AND userId = ?', [setupId, userId]);
      try {
        await ensureMTradesTable();
        await executeQuery('UPDATE trader_playbook_m_trades SET playbookId = NULL WHERE userId = ? AND playbookId = ?', [
          userId,
          setupId,
        ]);
      } catch (_) {
        /* optional */
      }
      return res.status(200).json({ success: true, deleted: true });
    }

    const body = parseBody(req);
    const col = bodyToColumnValues(body, existing);
    let archivedAt = existing.archivedAt;
    if (col.status === 'archived') {
      archivedAt = archivedAt || new Date();
    } else if (col.status === 'active' || col.status === 'draft') {
      archivedAt = null;
    }

    await executeQuery(
      `UPDATE trader_playbook_setups SET
        name = ?, marketType = ?, setupType = ?, timeframes = ?, assets = ?, session = ?, description = ?, icon = ?, color = ?, status = ?,
        tags = ?, marketConditions = ?, entryRules = ?, exitRules = ?, riskRules = ?, guardrails = ?, checklistSections = ?, overviewBlocks = ?,
        archivedAt = ?,
        biasRequirement = ?, structureRequirement = ?, volatilityCondition = ?, sessionTiming = ?, confirmationType = ?,
        entryTrigger = ?, entryChecklist = ?, stopPlacement = ?, maxRisk = ?, positionSizing = ?,
        invalidationLogic = ?, partialsRule = ?, trailingLogic = ?, holdVsExit = ?, doNotTrade = ?,
        commonMistakes = ?, checklistNotes = ?, winRate = ?, avgR = ?, bestPerformance = ?, worstPerformance = ?
      WHERE id = ? AND userId = ?`,
      [
        col.name,
        col.marketType || null,
        col.setupType || null,
        col.timeframes || null,
        col.assets || null,
        col.session || null,
        col.description || null,
        col.icon || null,
        col.color || null,
        col.status,
        col.tags,
        col.marketConditions,
        col.entryRules,
        col.exitRules,
        col.riskRules,
        col.guardrails,
        col.checklistSections,
        col.overviewBlocks,
        archivedAt,
        col.biasRequirement || null,
        col.structureRequirement || null,
        col.volatilityCondition || null,
        col.sessionTiming || null,
        col.confirmationType || null,
        col.entryTrigger || null,
        col.entryChecklist,
        col.stopPlacement || null,
        col.maxRisk,
        col.positionSizing || null,
        col.invalidationLogic || null,
        col.partialsRule || null,
        col.trailingLogic || null,
        col.holdVsExit || null,
        col.doNotTrade,
        col.commonMistakes,
        col.checklistNotes || null,
        col.winRate || null,
        col.avgR || null,
        col.bestPerformance || null,
        col.worstPerformance || null,
        setupId,
        userId,
      ]
    );

    const [rows] = await executeQuery('SELECT * FROM trader_playbook_setups WHERE id = ?', [setupId]);
    return res.status(200).json({ success: true, setup: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
