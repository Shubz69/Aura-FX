const crypto = require('crypto');
const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');

const TABLE = 'trader_replay_sessions';

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

function toDateTimeValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  const s = String(value);
  if (!s) return null;
  return s.slice(0, 19).replace('T', ' ');
}

function parseJsonCol(value) {
  if (value == null || value === '') return null;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(value)) {
    try {
      return JSON.parse(value.toString('utf8'));
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const ALLOWED_MODES = new Set(['scenario', 'day', 'trade']);
const ALLOWED_STATUS = new Set(['draft', 'in_progress', 'completed']);

function normalizeMode(value) {
  const s = String(value || 'trade').trim().toLowerCase().slice(0, 24);
  if (ALLOWED_MODES.has(s)) return s;
  return 'trade';
}

function normalizeReplayStatus(value) {
  const s = String(value || 'draft').trim().toLowerCase().slice(0, 24).replace(/\s+/g, '_');
  const mapped = s === 'in-progress' ? 'in_progress' : s;
  if (ALLOWED_STATUS.has(mapped)) return mapped;
  return 'draft';
}

function clampPlaybackMsDb(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return 2500;
  return Math.min(60000, Math.max(400, Math.round(n)));
}

function markerCountFromRowMarkers(markersValue) {
  const parsed = parseJsonCol(markersValue);
  return Array.isArray(parsed) ? parsed.length : 0;
}

function clampReplayStepDb(step, markersValue) {
  const count = markerCountFromRowMarkers(markersValue);
  const maxIdx = Math.max(0, count - 1);
  const s = Number(step);
  const n = Number.isFinite(s) ? Math.round(s) : 0;
  return Math.min(maxIdx, Math.max(0, n));
}

function stringifyMarkers(markers) {
  if (markers == null) return null;
  if (typeof markers === 'string') return markers.slice(0, 120000) || null;
  try {
    return JSON.stringify(markers).slice(0, 120000);
  } catch {
    return null;
  }
}

function pickMarkersJson(body, existingRow) {
  if (!Object.prototype.hasOwnProperty.call(body, 'replayMarkers') && existingRow) {
    return existingRow.replay_markers;
  }
  return stringifyMarkers(body.replayMarkers);
}

async function ensureTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
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

async function ensureExtendedColumns() {
  await addColumnIfNotExists(TABLE, 'replay_mode', "VARCHAR(24) NOT NULL DEFAULT 'trade'");
  await addColumnIfNotExists(TABLE, 'scenario_type', 'VARCHAR(48) DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'replay_date', 'DATE DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'playback_speed_ms', 'INT NOT NULL DEFAULT 2500');
  await addColumnIfNotExists(TABLE, 'replay_status', "VARCHAR(24) NOT NULL DEFAULT 'draft'");
  await addColumnIfNotExists(TABLE, 'replay_markers', 'JSON DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'session_notes', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'emotional_state', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'what_i_saw', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'what_i_missed', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'improvement_plan', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'lesson_summary', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'rule_followed', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'trade_ref', 'VARCHAR(120) DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'source_date', 'DATE DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'completed_at', 'TIMESTAMP NULL DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'review_biggest_mistake', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'review_best_moment', 'TEXT DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'replay_ui', 'JSON DEFAULT NULL');
  await addColumnIfNotExists(TABLE, 'pnl_display', 'VARCHAR(32) DEFAULT NULL');
}

function mergeReplayUi(rowUi, body) {
  const parsed = parseJsonCol(rowUi);
  const base = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  let next = { ...base };
  if (body.replayUi && typeof body.replayUi === 'object') {
    next = { ...next, ...body.replayUi };
  }
  if (typeof body.autoFocusNotes === 'boolean') next.autoFocusNotes = body.autoFocusNotes;
  if (typeof body.showLessons === 'boolean') next.showLessons = body.showLessons;
  if (typeof body.learningExample === 'boolean') {
    next.learningExample = body.learningExample;
    if (!body.learningExample) next.learningExampleKind = null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'learningExampleKind')) {
    const k = body.learningExampleKind;
    if (k === 'model' || k === 'caution') {
      next.learningExampleKind = k;
      next.learningExample = true;
    } else if (k === null || k === '') {
      next.learningExampleKind = null;
    }
  }
  return next;
}

function mapRow(row) {
  if (!row) return null;
  const markersRaw = parseJsonCol(row.replay_markers);
  const markers = Array.isArray(markersRaw) ? markersRaw : null;
  const replayUiRaw = mergeReplayUi(row.replay_ui, {});
  const replayUi = replayUiRaw && typeof replayUiRaw === 'object' ? replayUiRaw : {};

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
    replayStep: clampReplayStepDb(row.replayStep, row.replay_markers),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mode: normalizeMode(row.replay_mode),
    scenarioType: row.scenario_type != null ? String(row.scenario_type).slice(0, 48) : '',
    replayDate: toDateString(row.replay_date),
    playbackSpeedMs: clampPlaybackMsDb(row.playback_speed_ms),
    replayStatus: normalizeReplayStatus(row.replay_status),
    replayMarkers: markers,
    notes: row.session_notes || '',
    emotionalState: row.emotional_state || '',
    whatISaw: row.what_i_saw || '',
    whatIMissed: row.what_i_missed || '',
    improvementPlan: row.improvement_plan || '',
    lessonSummary: row.lesson_summary || '',
    ruleFollowed: row.rule_followed || '',
    tradeRef: row.trade_ref || '',
    sourceDate: toDateString(row.source_date),
    completedAt: row.completed_at || null,
    reviewBiggestMistake: row.review_biggest_mistake || '',
    reviewBestMoment: row.review_best_moment || '',
    replayUi,
    autoFocusNotes: replayUi.autoFocusNotes !== false,
    showLessons: replayUi.showLessons !== false,
    learningExample: Boolean(replayUi.learningExample),
    learningExampleKind:
      replayUi.learningExampleKind === 'model' || replayUi.learningExampleKind === 'caution'
        ? replayUi.learningExampleKind
        : null,
    pnl: row.pnl_display || '',
    playbookLink: row.linkedPlaybook || '',
    labLink: row.linkedLabDate ? toDateString(row.linkedLabDate) : '',
    resultR: row.actualR || row.rResult || '',
    stopLoss: row.stopLevel || '',
    takeProfit: row.targetLevel || '',
  };
}

function bodyToInsertValues(body, existingRow = null) {
  const replayUi = mergeReplayUi(existingRow ? existingRow.replay_ui : null, body);
  const markersJson = pickMarkersJson(body, existingRow);
  const rawStep = body.replayStep != null ? Number(body.replayStep) : 0;
  const clampedStep = clampReplayStepDb(rawStep, markersJson);

  const completedAtVal = body.completedAt ? toDateTimeValue(body.completedAt) : null;

  return {
    title: String(body.title || '').trim().slice(0, 180) || 'Replay Session',
    symbol: String(body.symbol || '').trim().slice(0, 64) || null,
    intervalCode: String(body.interval || '').trim().slice(0, 12) || null,
    asset: String(body.asset || '').trim().slice(0, 64) || null,
    direction: String(body.direction || '').trim().slice(0, 16) || null,
    outcome: String(body.outcome || '').trim().slice(0, 24) || null,
    rResult: String(body.rResult || '').trim().slice(0, 32) || null,
    entryLevel: String(body.entry || '').trim().slice(0, 32) || null,
    stopLevel: String(body.stop || body.stopLoss || '').trim().slice(0, 32) || null,
    targetLevel: String(body.target || body.takeProfit || '').trim().slice(0, 32) || null,
    exitLevel: String(body.exit || '').trim().slice(0, 32) || null,
    marketState: String(body.marketState || '').trim().slice(0, 120) || null,
    biasAtTime: String(body.biasAtTime || body.bias || '').trim().slice(0, 120) || null,
    confidenceLevel: String(body.confidenceLevel || '').trim().slice(0, 32) || null,
    keyDrivers: body.keyDrivers != null ? String(body.keyDrivers).slice(0, 6000) : null,
    entryTiming: body.entryTiming != null ? Number(body.entryTiming) : null,
    discipline: body.discipline != null ? Number(body.discipline) : null,
    patience: body.patience != null ? Number(body.patience) : null,
    verdict: body.verdict != null ? String(body.verdict).slice(0, 6000) : null,
    mfe: String(body.mfe || '').trim().slice(0, 32) || null,
    mae: String(body.mae || '').trim().slice(0, 32) || null,
    missedR: String(body.missedR || '').trim().slice(0, 32) || null,
    actualR: String(body.actualR || body.resultR || '').trim().slice(0, 32) || null,
    insight: body.insight != null ? String(body.insight).slice(0, 6000) : null,
    patternInsight: body.patternInsight != null ? String(body.patternInsight).slice(0, 6000) : null,
    linkedPlaybook: String(body.linkedPlaybook || body.playbookLink || '').trim().slice(0, 180) || null,
    linkedLabDate: (body.linkedLabDate || body.labLink)
      ? String(body.linkedLabDate || body.labLink).slice(0, 10)
      : null,
    replayStep: body.replayStep != null ? Number(body.replayStep) : 0,
    replay_mode: String(body.mode || 'trade').trim().slice(0, 24) || 'trade',
    scenario_type: body.scenarioType != null ? String(body.scenarioType).slice(0, 48) : null,
    replay_date: body.replayDate ? String(body.replayDate).slice(0, 10) : null,
    playback_speed_ms: body.playbackSpeedMs != null ? Number(body.playbackSpeedMs) : 2500,
    replay_status: String(body.replayStatus || 'draft').trim().slice(0, 24) || 'draft',
    replay_markers: markersJson,
    session_notes: body.notes != null ? String(body.notes).slice(0, 12000) : null,
    emotional_state: body.emotionalState != null ? String(body.emotionalState).slice(0, 6000) : null,
    what_i_saw: body.whatISaw != null ? String(body.whatISaw).slice(0, 6000) : null,
    what_i_missed: body.whatIMissed != null ? String(body.whatIMissed).slice(0, 6000) : null,
    improvement_plan: body.improvementPlan != null ? String(body.improvementPlan).slice(0, 6000) : null,
    lesson_summary: body.lessonSummary != null ? String(body.lessonSummary).slice(0, 6000) : null,
    rule_followed: body.ruleFollowed != null ? String(body.ruleFollowed).slice(0, 2000) : null,
    trade_ref: body.tradeRef != null ? String(body.tradeRef).slice(0, 120) : null,
    source_date: body.sourceDate ? String(body.sourceDate).slice(0, 10) : null,
    completed_at: completedAtVal,
    review_biggest_mistake: body.reviewBiggestMistake != null ? String(body.reviewBiggestMistake).slice(0, 6000) : null,
    review_best_moment: body.reviewBestMoment != null ? String(body.reviewBestMoment).slice(0, 6000) : null,
    replay_ui: JSON.stringify(replayUi),
    pnl_display: body.pnl != null ? String(body.pnl).slice(0, 32) : null,
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
    await ensureExtendedColumns();
  } catch (error) {
    console.error('Trader replay schema error:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET' && sessionId) {
    const [rows] = await executeQuery(`SELECT * FROM ${TABLE} WHERE id = ? AND userId = ?`, [sessionId, userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Replay session not found' });
    return res.status(200).json({ success: true, session: mapRow(rows[0]) });
  }

  if (req.method === 'GET') {
    const [rows] = await executeQuery(
      `SELECT * FROM ${TABLE} WHERE userId = ? ORDER BY updatedAt DESC, createdAt DESC`,
      [userId]
    );
    return res.status(200).json({ success: true, sessions: rows.map(mapRow) });
  }

  const body = parseBody(req);

  if (req.method === 'POST' && !sessionId) {
    const id = crypto.randomUUID();
    const v = bodyToInsertValues(body, null);

    await executeQuery(
      `INSERT INTO ${TABLE} (
        id, userId, title, symbol, intervalCode, asset, direction, outcome, rResult, entryLevel, stopLevel, targetLevel,
        exitLevel, marketState, biasAtTime, confidenceLevel, keyDrivers, entryTiming, discipline, patience, verdict, mfe,
        mae, missedR, actualR, insight, patternInsight, linkedPlaybook, linkedLabDate, replayStep,
        replay_mode, scenario_type, replay_date, playback_speed_ms, replay_status, replay_markers, session_notes,
        emotional_state, what_i_saw, what_i_missed, improvement_plan, lesson_summary, rule_followed, trade_ref,
        source_date, completed_at, review_biggest_mistake, review_best_moment, replay_ui, pnl_display
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        v.title,
        v.symbol,
        v.intervalCode,
        v.asset,
        v.direction,
        v.outcome,
        v.rResult,
        v.entryLevel,
        v.stopLevel,
        v.targetLevel,
        v.exitLevel,
        v.marketState,
        v.biasAtTime,
        v.confidenceLevel,
        v.keyDrivers,
        v.entryTiming,
        v.discipline,
        v.patience,
        v.verdict,
        v.mfe,
        v.mae,
        v.missedR,
        v.actualR,
        v.insight,
        v.patternInsight,
        v.linkedPlaybook,
        v.linkedLabDate,
        v.replayStep,
        v.replay_mode,
        v.scenario_type,
        v.replay_date,
        v.playback_speed_ms,
        v.replay_status,
        v.replay_markers,
        v.session_notes,
        v.emotional_state,
        v.what_i_saw,
        v.what_i_missed,
        v.improvement_plan,
        v.lesson_summary,
        v.rule_followed,
        v.trade_ref,
        v.source_date,
        v.completed_at,
        v.review_biggest_mistake,
        v.review_best_moment,
        v.replay_ui,
        v.pnl_display,
      ]
    );

    const [rows] = await executeQuery(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return res.status(201).json({ success: true, session: mapRow(rows[0]) });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && sessionId) {
    const [existingRows] = await executeQuery(`SELECT * FROM ${TABLE} WHERE id = ? AND userId = ?`, [sessionId, userId]);
    if (!existingRows.length) return res.status(404).json({ success: false, message: 'Replay session not found' });
    const existing = existingRows[0];

    if (req.method === 'DELETE') {
      await executeQuery(`DELETE FROM ${TABLE} WHERE id = ? AND userId = ?`, [sessionId, userId]);
      return res.status(200).json({ success: true, deleted: true });
    }

    const merged = { ...mapRow(existing), ...body };
    const v = bodyToInsertValues(merged, existing);

    await executeQuery(
      `UPDATE ${TABLE} SET
        title = ?, symbol = ?, intervalCode = ?, asset = ?, direction = ?, outcome = ?, rResult = ?, entryLevel = ?, stopLevel = ?,
        targetLevel = ?, exitLevel = ?, marketState = ?, biasAtTime = ?, confidenceLevel = ?, keyDrivers = ?, entryTiming = ?,
        discipline = ?, patience = ?, verdict = ?, mfe = ?, mae = ?, missedR = ?, actualR = ?, insight = ?, patternInsight = ?,
        linkedPlaybook = ?, linkedLabDate = ?, replayStep = ?,
        replay_mode = ?, scenario_type = ?, replay_date = ?, playback_speed_ms = ?, replay_status = ?, replay_markers = ?,
        session_notes = ?, emotional_state = ?, what_i_saw = ?, what_i_missed = ?, improvement_plan = ?, lesson_summary = ?,
        rule_followed = ?, trade_ref = ?, source_date = ?, completed_at = ?, review_biggest_mistake = ?, review_best_moment = ?,
        replay_ui = ?, pnl_display = ?
      WHERE id = ? AND userId = ?`,
      [
        v.title,
        v.symbol,
        v.intervalCode,
        v.asset,
        v.direction,
        v.outcome,
        v.rResult,
        v.entryLevel,
        v.stopLevel,
        v.targetLevel,
        v.exitLevel,
        v.marketState,
        v.biasAtTime,
        v.confidenceLevel,
        v.keyDrivers,
        v.entryTiming,
        v.discipline,
        v.patience,
        v.verdict,
        v.mfe,
        v.mae,
        v.missedR,
        v.actualR,
        v.insight,
        v.patternInsight,
        v.linkedPlaybook,
        v.linkedLabDate,
        v.replayStep,
        v.replay_mode,
        v.scenario_type,
        v.replay_date,
        v.playback_speed_ms,
        v.replay_status,
        v.replay_markers,
        v.session_notes,
        v.emotional_state,
        v.what_i_saw,
        v.what_i_missed,
        v.improvement_plan,
        v.lesson_summary,
        v.rule_followed,
        v.trade_ref,
        v.source_date,
        v.completed_at,
        v.review_biggest_mistake,
        v.review_best_moment,
        v.replay_ui,
        v.pnl_display,
        sessionId,
        userId,
      ]
    );

    const [rows] = await executeQuery(`SELECT * FROM ${TABLE} WHERE id = ?`, [sessionId]);
    return res.status(200).json({ success: true, session: mapRow(rows[0]) });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
