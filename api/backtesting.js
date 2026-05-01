/**
 * Aura Backtesting API — sessions, trades, notebook, reports.
 * Auth: Bearer JWT; all data scoped by userId.
 */

const crypto = require('crypto');
const axios = require('axios');
const { executeQuery } = require('./db');
const { verifyToken } = require('./utils/auth');
const { ensureBacktestTables } = require('./backtesting/schema');
const {
  aggregateTrades,
  breakdownMetrics,
  calendarHeatmap,
  rDistribution,
  buildDeterministicInsights,
  buildPremiumHubNarrative,
  completionRecap,
  classifyResult,
  parseJsonArray,
  num,
} = require('./backtesting/analytics');

const EPS = 1e-8;

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

function jsonVal(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function stringifyJson(v) {
  try {
    return JSON.stringify(v == null ? {} : v);
  } catch {
    return '{}';
  }
}

/**
 * MySQL DATETIME/TIMESTAMP reject ISO strings with `T`/`Z` under common strict modes (ER_TRUNCATED_WRONG_VALUE).
 * Bind `YYYY-MM-DD HH:MM:SS` using UTC calendar components so replay anchors stay aligned with prior ISO-UTC semantics.
 */
function toMysqlDatetimeUtc(value) {
  if (value == null || value === '') return null;
  let dt;
  if (value instanceof Date) {
    dt = value;
  } else {
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      dt = new Date(`${s}T00:00:00.000Z`);
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      dt = new Date(`${s}:00Z`);
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
      dt = new Date(`${s}Z`);
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)) {
      dt = new Date(s);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split('/');
      dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    } else {
      return null;
    }
  }
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const h = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  const sec = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}

function normalizeDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const dt = toMysqlDatetimeUtc(raw);
    return dt ? dt.slice(0, 10) : null;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 10);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const dd = String(Number(slash[1])).padStart(2, '0');
    const mm = String(Number(slash[2])).padStart(2, '0');
    const yyyy = slash[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    const test = new Date(`${iso}T00:00:00.000Z`);
    return Number.isNaN(test.getTime()) ? null : iso;
  }
  return null;
}

async function listTableColumns(tableName) {
  const [rows] = await executeQuery(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set((rows || []).map((r) => String(r.COLUMN_NAME || r.column_name || '')));
}

/** Short TTL cache: cuts information_schema traffic on hot session-create path (helps under DB load). */
let backtestSessionsColumnsCache = null;
let backtestSessionsColumnsCacheAt = 0;
const BACKTEST_SESSION_COL_CACHE_MS = 120000;

async function listTableColumnsForInsert(tableName) {
  if (tableName === 'backtest_sessions') {
    const now = Date.now();
    if (backtestSessionsColumnsCache && now - backtestSessionsColumnsCacheAt < BACKTEST_SESSION_COL_CACHE_MS) {
      return backtestSessionsColumnsCache;
    }
    const set = await listTableColumns(tableName);
    backtestSessionsColumnsCache = set;
    backtestSessionsColumnsCacheAt = now;
    return set;
  }
  return listTableColumns(tableName);
}

async function insertWithExistingColumns(tableName, valuesByColumn) {
  const existing = await listTableColumnsForInsert(tableName);
  const cols = [];
  const vals = [];
  Object.keys(valuesByColumn).forEach((col) => {
    if (!existing.has(col)) return;
    cols.push(col);
    vals.push(valuesByColumn[col]);
  });
  if (!cols.length) throw new Error(`No matching columns for ${tableName}`);
  const placeholders = cols.map(() => '?').join(',');
  await executeQuery(
    `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`,
    vals
  );
}

async function insertBacktestSessionResilient(valuesByColumn) {
  try {
    await insertWithExistingColumns('backtest_sessions', valuesByColumn);
    return;
  } catch (err) {
    const msg = String(err?.message || '');
    // Unknown-column drift should never block session creation; retry with a strict minimal shape.
    if (!/unknown column/i.test(msg) && !/ER_BAD_FIELD_ERROR/i.test(msg)) throw err;
  }

  const minimal = {
    id: valuesByColumn.id,
    userId: valuesByColumn.userId,
    sessionName: valuesByColumn.sessionName || 'Untitled session',
    status: valuesByColumn.status || 'draft',
    initialBalance: valuesByColumn.initialBalance ?? 100000,
    currentBalance: valuesByColumn.currentBalance ?? valuesByColumn.initialBalance ?? 100000,
    dateStart: valuesByColumn.dateStart || null,
    dateEnd: valuesByColumn.dateEnd || null,
    replayTimeframe: valuesByColumn.replayTimeframe || 'M15',
    replayGranularity: valuesByColumn.replayGranularity || 'candle',
    tradingHoursMode: valuesByColumn.tradingHoursMode || 'all',
    riskModel: valuesByColumn.riskModel || 'fixed_percent',
    marketType: valuesByColumn.marketType || null,
    instrumentsJson: valuesByColumn.instrumentsJson || '[]',
    playbookId: valuesByColumn.playbookId || null,
    playbookName: valuesByColumn.playbookName || null,
    objective: valuesByColumn.objective || null,
    objectiveDetail: valuesByColumn.objectiveDetail || '',
    strategyContextJson: valuesByColumn.strategyContextJson || '{}',
    draftFormJson: valuesByColumn.draftFormJson || null,
    chartPrefsJson: valuesByColumn.chartPrefsJson || '{}',
    startedAt: valuesByColumn.startedAt || null,
    lastReplayAt: valuesByColumn.lastReplayAt || null,
    lastActiveInstrument: valuesByColumn.lastActiveInstrument || null,
  };

  await insertWithExistingColumns('backtest_sessions', minimal);
}

function mapSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    sessionName: row.sessionName,
    description: row.description ?? '',
    status: row.status,
    marketType: row.marketType ?? '',
    instruments: jsonVal(row.instrumentsJson, []),
    playbookId: row.playbookId ?? null,
    playbookName: row.playbookName ?? null,
    initialBalance: num(row.initialBalance, 0),
    currentBalance: num(row.currentBalance, 0),
    riskModel: row.riskModel ?? 'fixed_percent',
    dateStart: normalizeDateOnly(row.dateStart),
    dateEnd: normalizeDateOnly(row.dateEnd),
    replayTimeframe: row.replayTimeframe ?? 'M15',
    replayGranularity: row.replayGranularity ?? 'candle',
    tradingHoursMode: row.tradingHoursMode ?? 'all',
    objective: row.objective ?? null,
    objectiveDetail: row.objectiveDetail ?? '',
    strategyContext: jsonVal(row.strategyContextJson, {}),
    draftForm: jsonVal(row.draftFormJson, null),
    chartPrefs: jsonVal(row.chartPrefsJson, {}),
    notes: row.notes ?? '',
    totalTrades: Number(row.totalTrades ?? 0),
    totalWins: Number(row.totalWins ?? 0),
    totalLosses: Number(row.totalLosses ?? 0),
    totalBreakeven: Number(row.totalBreakeven ?? 0),
    grossProfit: num(row.grossProfit),
    grossLoss: num(row.grossLoss),
    netPnl: num(row.netPnl),
    winRate: row.winRate != null ? num(row.winRate) : null,
    profitFactor: row.profitFactor != null ? num(row.profitFactor) : null,
    expectancy: row.expectancy != null ? num(row.expectancy) : null,
    avgR: row.avgR != null ? num(row.avgR) : null,
    maxDrawdown: row.maxDrawdown != null ? num(row.maxDrawdown) : null,
    timeSpentSeconds: Number(row.timeSpentSeconds ?? 0),
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    lastReplayAt: row.lastReplayAt ?? null,
    lastActiveInstrument: row.lastActiveInstrument ?? null,
    replaySpeed: num(row.replaySpeed, 1),
    completionRecap: jsonVal(row.completionRecapJson, null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTradeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    instrument: row.instrument,
    marketType: row.marketType ?? null,
    direction: row.direction,
    entryPrice: num(row.entryPrice),
    stopLoss: row.stopLoss != null ? num(row.stopLoss) : null,
    takeProfit: row.takeProfit != null ? num(row.takeProfit) : null,
    exitPrice: row.exitPrice != null ? num(row.exitPrice) : null,
    positionSize: row.positionSize != null ? num(row.positionSize) : null,
    riskPercent: row.riskPercent != null ? num(row.riskPercent) : null,
    initialRiskAmount: row.initialRiskAmount != null ? num(row.initialRiskAmount) : null,
    pnlAmount: num(row.pnlAmount),
    pnlPercent: row.pnlPercent != null ? num(row.pnlPercent) : null,
    rMultiple: row.rMultiple != null ? num(row.rMultiple) : null,
    pipsOrPoints: row.pipsOrPoints != null ? num(row.pipsOrPoints) : null,
    openTime: row.openTime ?? null,
    closeTime: row.closeTime ?? null,
    durationSeconds: row.durationSeconds != null ? Number(row.durationSeconds) : null,
    timeframe: row.timeframe ?? null,
    sessionLabel: row.sessionLabel ?? null,
    playbookId: row.playbookId ?? null,
    playbookName: row.playbookName ?? null,
    setupName: row.setupName ?? null,
    entryModel: row.entryModel ?? null,
    confidenceScore: row.confidenceScore != null ? Number(row.confidenceScore) : null,
    bias: row.bias ?? null,
    marketCondition: row.marketCondition ?? null,
    checklistScore: row.checklistScore != null ? num(row.checklistScore) : null,
    ruleAdherenceScore: row.ruleAdherenceScore != null ? num(row.ruleAdherenceScore) : null,
    qualityGrade: row.qualityGrade ?? null,
    emotionalState: row.emotionalState ?? null,
    resultType: row.resultType ?? 'breakeven',
    notes: row.notes ?? '',
    mistakes: parseJsonArray(row.mistakesJson),
    tags: parseJsonArray(row.tagsJson),
    partials: jsonVal(row.partialsJson, []),
    checklistItems: jsonVal(row.checklistItemsJson, []),
    extraContext: jsonVal(row.extraContextJson, {}),
    screenshotUrl: row.screenshotUrl ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSavedTradeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    sessionId: row.sessionId || null,
    sourceTradeId: row.sourceTradeId || null,
    instrument: row.instrument,
    direction: row.direction,
    entryTime: row.entryTime || null,
    entryPrice: num(row.entryPrice),
    exitTime: row.exitTime || null,
    exitPrice: row.exitPrice != null ? num(row.exitPrice) : null,
    lotSize: row.lotSize != null ? num(row.lotSize) : null,
    pnlAmount: num(row.pnlAmount, 0),
    result: row.result || classifyResult(row.pnlAmount),
    timeframe: row.timeframe || null,
    replayReference: jsonVal(row.replayReferenceJson, {}),
    screenshotUrl: row.screenshotUrl || null,
    notes: row.notes || '',
    aiFeedback: row.aiFeedback || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function timeframeToChartInterval(tf) {
  const raw = String(tf || 'M15').toUpperCase();
  if (raw === 'M1' || raw === '1') return '1';
  if (raw === 'M5' || raw === '5') return '5';
  if (raw === 'M15' || raw === '15') return '15';
  if (raw === 'M30' || raw === '30') return '30';
  if (raw === 'M45' || raw === '45') return '45';
  if (raw === 'H1' || raw === '60') return '60';
  if (raw === 'H4' || raw === '240') return '240';
  if (raw === 'W1' || raw === '1W') return '1W';
  if (raw === 'MN1' || raw === '1M') return '1M';
  if (raw === 'Y1' || raw === '1Y') return '1Y';
  return '1D';
}

function buildAiCoaching(context) {
  const currentPrice = num(context?.currentPrice);
  const direction = String(context?.direction || '').toLowerCase();
  const openTrades = Array.isArray(context?.openTrades) ? context.openTrades : [];
  const accountBalance = num(context?.accountBalance, 0);
  const riskPct = accountBalance > 0 && openTrades.length
    ? (openTrades.reduce((acc, t) => acc + Math.max(0, Math.abs(num(t.entryPrice, 0) - num(t.stopLoss, num(t.entryPrice, 0))) * num(t.lotSize, 0)), 0) / accountBalance) * 100
    : 0;
  const top = [];
  if (Number.isFinite(currentPrice)) top.push(`Current replay price is ${currentPrice.toFixed(5)}.`);
  if (openTrades.length > 0) top.push(`You have ${openTrades.length} open simulated trade${openTrades.length > 1 ? 's' : ''}.`);
  if (riskPct > 0) top.push(`Estimated open risk is about ${riskPct.toFixed(2)}% of balance.`);
  if (direction === 'buy' || direction === 'long') top.push('For long ideas, prefer entries after structure confirms higher lows.');
  if (direction === 'sell' || direction === 'short') top.push('For short ideas, avoid fading clear bullish momentum without confirmation.');

  return {
    answer: top.join(' ') || 'Wait for clear structure confirmation, keep risk fixed, and avoid forcing entries.',
    strengths: ['You are replaying candle-by-candle, which is good deliberate practice.'],
    weaknesses: riskPct > 2 ? ['Risk appears elevated relative to balance.'] : ['No major risk breach detected in this snapshot.'],
    improvements: [
      'Define invalidation (SL) before entry.',
      'Target at least 1.5R when conditions allow.',
      'Log why the entry was valid at that timestamp.',
    ],
    rrAssessment: riskPct > 2 ? 'Risk profile is aggressive; reduce size or widen only with clear setup quality.' : 'Risk profile is acceptable for a training simulation.',
  };
}

async function loadSessionForUser(sessionId, userId) {
  const [rows] = await executeQuery('SELECT * FROM backtest_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
  return rows[0] || null;
}

async function recalculateSessionAggregates(sessionId, userId) {
  const session = await loadSessionForUser(sessionId, userId);
  if (!session) return null;
  const [trows] = await executeQuery(
    'SELECT * FROM backtest_trades WHERE sessionId = ? AND userId = ? ORDER BY closeTime ASC, createdAt ASC',
    [sessionId, userId]
  );
  const trades = trows.map(mapTradeRow);
  const ib = num(session.initialBalance, 0);
  const agg = aggregateTrades(trades, ib);
  const cur = ib + agg.netPnl;

  await executeQuery(
    `UPDATE backtest_sessions SET
      totalTrades = ?, totalWins = ?, totalLosses = ?, totalBreakeven = ?,
      grossProfit = ?, grossLoss = ?, netPnl = ?,
      winRate = ?, profitFactor = ?, expectancy = ?, avgR = ?, maxDrawdown = ?,
      currentBalance = ?,
      updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND userId = ?`,
    [
      agg.tradeCount,
      agg.winCount,
      agg.lossCount,
      agg.breakevenCount,
      agg.grossProfit,
      agg.grossLoss,
      agg.netPnl,
      agg.winRate,
      agg.profitFactor,
      agg.expectancy,
      agg.avgR,
      agg.maxDrawdown,
      cur,
      sessionId,
      userId,
    ]
  );
  return agg;
}

function normalizeDirection(d) {
  const s = String(d || '').toLowerCase();
  if (s === 'buy' || s === 'long') return 'long';
  if (s === 'sell' || s === 'short') return 'short';
  return s || 'long';
}

function validateTradeBody(body, partial = false) {
  const instrument = body.instrument != null ? String(body.instrument).trim().slice(0, 64) : '';
  if (!instrument && !partial) return 'instrument is required';
  const direction = normalizeDirection(body.direction);
  const entryPrice = body.entryPrice != null ? num(body.entryPrice) : NaN;
  if (!partial && !Number.isFinite(entryPrice)) return 'entryPrice must be a number';

  let openTime = body.openTime ? new Date(body.openTime) : null;
  let closeTime = body.closeTime ? new Date(body.closeTime) : null;
  if (openTime && Number.isNaN(openTime.getTime())) return 'openTime invalid';
  if (closeTime && Number.isNaN(closeTime.getTime())) return 'closeTime invalid';
  if (openTime && closeTime && closeTime < openTime) return 'closeTime must be on or after openTime';

  const exitPrice = body.exitPrice != null && body.exitPrice !== '' ? num(body.exitPrice) : null;
  const pnlAmount = body.pnlAmount != null ? num(body.pnlAmount) : 0;
  if (!Number.isFinite(pnlAmount)) return 'pnlAmount invalid';

  return null;
}

function coerceTradePayload(body, existing = {}) {
  const e = existing;
  const instrument = body.instrument != undefined ? String(body.instrument).trim().slice(0, 64) : e.instrument;
  const direction = body.direction != undefined ? normalizeDirection(body.direction) : e.direction || 'long';
  const entryPrice = body.entryPrice != undefined ? num(body.entryPrice) : num(e.entryPrice);
  const stopLoss = body.stopLoss != undefined && body.stopLoss !== '' ? num(body.stopLoss) : e.stopLoss ?? null;
  const takeProfit = body.takeProfit != undefined && body.takeProfit !== '' ? num(body.takeProfit) : e.takeProfit ?? null;
  const exitPrice = body.exitPrice != undefined && body.exitPrice !== '' ? num(body.exitPrice) : e.exitPrice ?? null;
  const positionSize = body.positionSize != undefined && body.positionSize !== '' ? num(body.positionSize) : e.positionSize ?? null;
  const riskPercent = body.riskPercent != undefined && body.riskPercent !== '' ? num(body.riskPercent) : e.riskPercent ?? null;
  const initialRiskAmount =
    body.initialRiskAmount != undefined && body.initialRiskAmount !== '' ? num(body.initialRiskAmount) : e.initialRiskAmount ?? null;
  let pnlAmount = body.pnlAmount != undefined ? num(body.pnlAmount) : num(e.pnlAmount);
  const pnlPercent = body.pnlPercent != undefined && body.pnlPercent !== '' ? num(body.pnlPercent) : e.pnlPercent ?? null;
  let rMultiple = body.rMultiple != undefined && body.rMultiple !== '' ? num(body.rMultiple) : e.rMultiple ?? null;
  const pipsOrPoints = body.pipsOrPoints != undefined && body.pipsOrPoints !== '' ? num(body.pipsOrPoints) : e.pipsOrPoints ?? null;
  const openTime = body.openTime != undefined ? body.openTime : e.openTime;
  const closeTime = body.closeTime != undefined ? body.closeTime : e.closeTime;
  const timeframe = body.timeframe != undefined ? String(body.timeframe).slice(0, 32) : e.timeframe ?? null;
  const sessionLabel = body.sessionLabel != undefined ? String(body.sessionLabel).slice(0, 64) : e.sessionLabel ?? null;
  const playbookId = body.playbookId != undefined ? String(body.playbookId).slice(0, 36) : e.playbookId ?? null;
  const playbookName = body.playbookName != undefined ? String(body.playbookName).slice(0, 160) : e.playbookName ?? null;
  const setupName = body.setupName != undefined ? String(body.setupName).slice(0, 160) : e.setupName ?? null;
  const entryModel = body.entryModel != undefined ? String(body.entryModel).slice(0, 160) : e.entryModel ?? null;
  const confidenceScore =
    body.confidenceScore != undefined && body.confidenceScore !== ''
      ? Math.max(1, Math.min(10, Math.round(Number(body.confidenceScore))))
      : e.confidenceScore ?? null;
  const bias = body.bias != undefined ? String(body.bias).slice(0, 120) : e.bias ?? null;
  const marketCondition = body.marketCondition != undefined ? String(body.marketCondition).slice(0, 120) : e.marketCondition ?? null;
  const checklistScore =
    body.checklistScore != undefined && body.checklistScore !== '' ? num(body.checklistScore) : e.checklistScore ?? null;
  const ruleAdherenceScore =
    body.ruleAdherenceScore != undefined && body.ruleAdherenceScore !== ''
      ? num(body.ruleAdherenceScore)
      : e.ruleAdherenceScore ?? null;
  const qualityGrade = body.qualityGrade != undefined ? String(body.qualityGrade).slice(0, 8) : e.qualityGrade ?? null;
  const emotionalState = body.emotionalState != undefined ? String(body.emotionalState).slice(0, 48) : e.emotionalState ?? null;
  const notes = body.notes != undefined ? String(body.notes).slice(0, 12000) : e.notes ?? '';
  const mistakesJson = stringifyJson(body.mistakes != undefined ? body.mistakes : e.mistakes ?? []);
  const tagsJson = stringifyJson(body.tags != undefined ? body.tags : e.tags ?? []);
  const partialsJson = stringifyJson(body.partials != undefined ? body.partials : e.partials ?? []);
  const checklistItemsJson = stringifyJson(body.checklistItems != undefined ? body.checklistItems : e.checklistItems ?? []);
  const extraContextJson = stringifyJson(body.extraContext != undefined ? body.extraContext : e.extraContext ?? {});
  const screenshotUrl =
    body.screenshotUrl != undefined ? String(body.screenshotUrl).slice(0, 512) : e.screenshotUrl ?? null;
  const marketType = body.marketType != undefined ? String(body.marketType).slice(0, 40) : e.marketType ?? null;

  const resultType = classifyResult(pnlAmount);

  let durationSeconds = null;
  if (openTime && closeTime) {
    const a = new Date(openTime).getTime();
    const b = new Date(closeTime).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) durationSeconds = Math.round((b - a) / 1000);
  }

  if (rMultiple == null && initialRiskAmount != null && Math.abs(initialRiskAmount) > EPS && Number.isFinite(pnlAmount)) {
    rMultiple = pnlAmount / initialRiskAmount;
  }

  return {
    instrument,
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    exitPrice,
    positionSize,
    riskPercent,
    initialRiskAmount,
    pnlAmount,
    pnlPercent,
    rMultiple,
    pipsOrPoints,
    openTime,
    closeTime,
    durationSeconds,
    timeframe,
    sessionLabel,
    playbookId,
    playbookName,
    setupName,
    entryModel,
    confidenceScore,
    bias,
    marketCondition,
    checklistScore,
    ruleAdherenceScore,
    qualityGrade,
    emotionalState,
    resultType,
    notes,
    mistakesJson,
    tagsJson,
    partialsJson,
    checklistItemsJson,
    extraContextJson,
    screenshotUrl,
    marketType,
  };
}

async function handleSummary(req, res, userId) {
  const [sessRows] = await executeQuery(
    'SELECT id, status, sessionName, timeSpentSeconds, updatedAt FROM backtest_sessions WHERE userId = ?',
    [userId]
  );
  const [tradeRows] = await executeQuery('SELECT * FROM backtest_trades WHERE userId = ?', [userId]);
  const trades = tradeRows.map(mapTradeRow);
  const [ibRows] = await executeQuery(
    'SELECT initialBalance FROM backtest_sessions WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
    [userId]
  );
  const ib0 = ibRows[0] != null ? num(ibRows[0].initialBalance, 100000) : 100000;
  const globalAgg = aggregateTrades(trades, ib0);
  const totalHours = sessRows.reduce((a, s) => a + Number(s.timeSpentSeconds || 0), 0) / 3600;

  let activeSession = null;
  for (const s of sessRows) {
    if (s.status === 'active' || s.status === 'paused') {
      const full = await loadSessionForUser(s.id, userId);
      activeSession = mapSessionRow(full);
      break;
    }
  }

  /** Current win streak: chronological all trades */
  const sorted = [...trades].sort((a, b) => {
    const ta = a.closeTime ? new Date(a.closeTime).getTime() : 0;
    const tb = b.closeTime ? new Date(b.closeTime).getTime() : 0;
    return ta - tb;
  });
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (classifyResult(sorted[i].pnlAmount) === 'win') streak++;
    else break;
  }

  const breakdown = breakdownMetrics(trades, ib0);
  const { bestKey: bestInstrument } = (() => {
    let k = null;
    let v = null;
    for (const [name, agg] of Object.entries(breakdown.byInstrument)) {
      if (!agg || name === '—') continue;
      const pf = agg.profitFactor;
      if (pf != null && (v == null || pf > v)) {
        v = pf;
        k = name;
      }
    }
    return { bestKey: k };
  })();

  const { bestKey: bestSessionWindow } = (() => {
    let k = null;
    let v = null;
    for (const [name, agg] of Object.entries(breakdown.bySession)) {
      if (!agg || name === '—') continue;
      const ar = agg.avgR;
      if (ar != null && (v == null || ar > v)) {
        v = ar;
        k = name;
      }
    }
    return { bestKey: k };
  })();

  const insights = buildDeterministicInsights(globalAgg, breakdown, '');
  const narrativeLines = buildPremiumHubNarrative(globalAgg, breakdown, bestInstrument, bestSessionWindow);

  const topSetups = Object.entries(breakdown.bySetup || {})
    .filter(([name, agg]) => name && name !== '—' && agg && agg.tradeCount >= 1)
    .map(([name, agg]) => ({
      name,
      tradeCount: agg.tradeCount,
      expectancy: agg.expectancy,
      profitFactor: agg.profitFactor,
      netPnl: agg.netPnl,
    }))
    .sort((a, b) => (Number(b.expectancy) || -1e12) - (Number(a.expectancy) || -1e12))
    .slice(0, 8);

  const topTags = Object.entries(breakdown.byTag || {})
    .filter(([name, agg]) => name && !name.includes(' + ') && agg && agg.tradeCount >= 2)
    .map(([name, agg]) => ({
      name,
      tradeCount: agg.tradeCount,
      expectancy: agg.expectancy,
      netPnl: agg.netPnl,
    }))
    .sort((a, b) => (Number(b.expectancy) || -1e12) - (Number(a.expectancy) || -1e12))
    .slice(0, 8);

  const topHours = Object.entries(breakdown.byHourOfDay || {})
    .filter(([hour, agg]) => hour && hour !== '—' && agg && agg.tradeCount >= 2)
    .map(([hour, agg]) => ({
      hour,
      tradeCount: agg.tradeCount,
      expectancy: agg.expectancy,
      netPnl: agg.netPnl,
    }))
    .sort((a, b) => (Number(b.expectancy) || -1e12) - (Number(a.expectancy) || -1e12))
    .slice(0, 6);

  let weakestSetup = null;
  let weakE = null;
  for (const [name, agg] of Object.entries(breakdown.bySetup || {})) {
    if (!name || name === '—' || !agg || agg.tradeCount < 2) continue;
    const e = agg.expectancy;
    if (e == null || !Number.isFinite(Number(e))) continue;
    if (weakE == null || Number(e) < weakE) {
      weakE = Number(e);
      weakestSetup = { name, expectancy: agg.expectancy, tradeCount: agg.tradeCount };
    }
  }

  const longAgg = breakdown.byDirection?.long;
  const shortAgg = breakdown.byDirection?.short;
  const longVsShort = {
    long:
      longAgg && longAgg.tradeCount > 0
        ? { trades: longAgg.tradeCount, netPnl: longAgg.netPnl, winRate: longAgg.winRate }
        : null,
    short:
      shortAgg && shortAgg.tradeCount > 0
        ? { trades: shortAgg.tradeCount, netPnl: shortAgg.netPnl, winRate: shortAgg.winRate }
        : null,
  };

  const hubDetail = {
    narrativeLines,
    insights,
    topSetups,
    topTags,
    topHours,
    weakestSetup,
    longVsShort,
    checklistCorrelation: breakdown.checklistCorrelation,
    confidenceCorrelation: breakdown.confidenceCorrelation,
  };

  return res.status(200).json({
    success: true,
    summary: {
      totalSessions: sessRows.length,
      totalTrades: globalAgg.tradeCount,
      winRate: globalAgg.winRate,
      profitFactor: globalAgg.profitFactor,
      avgR: globalAgg.avgR,
      netPnl: globalAgg.netPnl,
      bestInstrument: bestInstrument || null,
      bestSession: bestSessionWindow || null,
      currentStreak: streak,
      totalBacktestingHours: totalHours,
      activeSession,
      maxDrawdown: globalAgg.maxDrawdown,
      expectancy: globalAgg.expectancy,
      hubDetail,
    },
  });
}

async function handleReportsOverview(req, res, userId) {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const sessionId = url.searchParams.get('sessionId');
  let trades;
  let initialBalance = 100000;
  if (sessionId) {
    const s = await loadSessionForUser(sessionId, userId);
    if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
    initialBalance = num(s.initialBalance, 100000);
    const [trows] = await executeQuery('SELECT * FROM backtest_trades WHERE userId = ? AND sessionId = ?', [userId, sessionId]);
    trades = trows.map(mapTradeRow);
  } else {
    const [trows] = await executeQuery('SELECT * FROM backtest_trades WHERE userId = ?', [userId]);
    trades = trows.map(mapTradeRow);
    const [ibRows] = await executeQuery(
      'SELECT initialBalance FROM backtest_sessions WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
      [userId]
    );
    if (ibRows[0]) initialBalance = num(ibRows[0].initialBalance, 100000);
  }
  const globalAgg = aggregateTrades(trades, initialBalance);
  const breakdown = breakdownMetrics(trades, initialBalance);
  const insights = buildDeterministicInsights(globalAgg, breakdown);
  return res.status(200).json({
    success: true,
    metrics: globalAgg,
    insights,
    calendar: calendarHeatmap(trades),
    rHistogram: rDistribution(trades),
  });
}

async function handleReportsBreakdowns(req, res, userId) {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const sessionId = url.searchParams.get('sessionId');
  let trades;
  let initialBalance = 100000;
  if (sessionId) {
    const s = await loadSessionForUser(sessionId, userId);
    if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
    initialBalance = num(s.initialBalance, 100000);
    const [trows] = await executeQuery('SELECT * FROM backtest_trades WHERE userId = ? AND sessionId = ?', [userId, sessionId]);
    trades = trows.map(mapTradeRow);
  } else {
    const [trows] = await executeQuery('SELECT * FROM backtest_trades WHERE userId = ?', [userId]);
    trades = trows.map(mapTradeRow);
    const [ibRows] = await executeQuery(
      'SELECT initialBalance FROM backtest_sessions WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
      [userId]
    );
    if (ibRows[0]) initialBalance = num(ibRows[0].initialBalance, 100000);
  }
  const breakdown = breakdownMetrics(trades, initialBalance);
  return res.status(200).json({ success: true, breakdown });
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
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
  const pathname = getPathname(req).replace(/\/$/, '') || '/';

  try {
    await ensureBacktestTables();
  } catch (err) {
    console.error('backtesting ensureBacktestTables:', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  try {
    if (req.method === 'GET' && pathname === '/api/backtesting/summary') {
      return handleSummary(req, res, userId);
    }
    if (req.method === 'GET' && pathname === '/api/backtesting/reports/overview') {
      return handleReportsOverview(req, res, userId);
    }
    if (req.method === 'GET' && pathname === '/api/backtesting/reports/breakdowns') {
      return handleReportsBreakdowns(req, res, userId);
    }

    if (req.method === 'GET' && pathname === '/api/backtesting/candles') {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const symbol = String(url.searchParams.get('symbol') || '').trim().toUpperCase();
      const timeframe = String(url.searchParams.get('timeframe') || 'M15');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!symbol) return res.status(400).json({ success: false, message: 'symbol is required' });
      const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
      const baseUrl = `${proto}://${host}`;
      const interval = timeframeToChartInterval(timeframe);
      const { data } = await axios.get(`${baseUrl}/api/market/chart-history`, {
        params: { symbol, interval, ...(from ? { from } : {}), ...(to ? { to } : {}) },
        headers: { Authorization: req.headers.authorization || '' },
        timeout: 20000,
      });
      return res.status(200).json({
        success: Boolean(data?.success),
        symbol,
        timeframe,
        interval,
        bars: Array.isArray(data?.bars) ? data.bars : [],
        source: data?.source || data?.diagnostics?.provider || 'market-chart-history',
        diagnostics: data?.diagnostics || null,
      });
    }

    /** GET /api/backtesting/sessions */
    if (req.method === 'GET' && pathname === '/api/backtesting/sessions') {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const status = url.searchParams.get('status');
      const playbookId = url.searchParams.get('playbookId');
      const instrument = url.searchParams.get('instrument');
      let sql = 'SELECT * FROM backtest_sessions WHERE userId = ?';
      const p = [userId];
      if (status) {
        sql += ' AND status = ?';
        p.push(status);
      }
      if (playbookId) {
        sql += ' AND playbookId = ?';
        p.push(playbookId);
      }
      sql += ' ORDER BY updatedAt DESC';
      const [rows] = await executeQuery(sql, p);
      let list = rows.map(mapSessionRow);
      if (instrument) {
        list = list.filter((s) => Array.isArray(s.instruments) && s.instruments.includes(instrument));
      }
      return res.status(200).json({ success: true, sessions: list });
    }

    /** POST /api/backtesting/sessions */
    if (req.method === 'POST' && pathname === '/api/backtesting/sessions') {
      const body = parseBody(req);
      const id = crypto.randomUUID();
      const saveDraft = Boolean(body.saveDraft);
      const sessionName = body.sessionName ? String(body.sessionName).trim().slice(0, 255) : 'Untitled session';
      const description = body.description != null ? String(body.description).slice(0, 8000) : '';
      const marketType = body.marketType ? String(body.marketType).slice(0, 40) : null;
      const instruments = Array.isArray(body.instruments) ? body.instruments.map((x) => String(x).slice(0, 64)).slice(0, 5) : [];
      const playbookId = body.playbookId ? String(body.playbookId).slice(0, 36) : null;
      const playbookName = body.playbookName ? String(body.playbookName).slice(0, 160) : null;
      const initialBalance = body.initialBalance != null ? Number(body.initialBalance) : 100000;
      const riskModel = body.riskModel ? String(body.riskModel).slice(0, 32) : 'fixed_percent';
      const dateStart = normalizeDateOnly(body.dateStart);
      const dateEnd = normalizeDateOnly(body.dateEnd);
      const replayTimeframe = body.replayTimeframe ? String(body.replayTimeframe).slice(0, 32) : 'M15';
      const replayGranularity = body.replayGranularity ? String(body.replayGranularity).slice(0, 32) : 'candle';
      const tradingHoursMode = body.tradingHoursMode ? String(body.tradingHoursMode).slice(0, 32) : 'all';
      const objective = body.objective ? String(body.objective).slice(0, 64) : null;
      const objectiveDetail = body.objectiveDetail != null ? String(body.objectiveDetail).slice(0, 4000) : '';
      const strategyContext = body.strategyContext && typeof body.strategyContext === 'object' ? body.strategyContext : {};
      const chartPrefs = body.chartPrefs && typeof body.chartPrefs === 'object' ? body.chartPrefs : {};
      const draftFormJson = body.draftForm && typeof body.draftForm === 'object' ? body.draftForm : null;

      const replayStartAt = body.replayStartAt ? toMysqlDatetimeUtc(body.replayStartAt) : null;

      if (!Number.isFinite(initialBalance)) {
        return res.status(400).json({ success: false, message: 'initialBalance must be numeric' });
      }
      if (body.dateStart != null && !dateStart) {
        return res.status(400).json({ success: false, message: 'dateStart must be YYYY-MM-DD (or parseable date)' });
      }
      if (body.dateEnd != null && body.dateEnd !== '' && !dateEnd) {
        return res.status(400).json({ success: false, message: 'dateEnd must be YYYY-MM-DD (or parseable date)' });
      }
      if (body.replayStartAt != null && body.replayStartAt !== '' && !replayStartAt) {
        return res.status(400).json({ success: false, message: 'replayStartAt must be a valid datetime' });
      }

      if (!saveDraft) {
        if (!dateStart || !dateEnd || dateStart > dateEnd) {
          return res.status(400).json({ success: false, message: 'Valid date range is required' });
        }
        if (instruments.length === 0) {
          return res.status(400).json({ success: false, message: 'Select at least one instrument' });
        }
      }

      const status = saveDraft ? 'draft' : 'active';
      const startedAt = saveDraft ? null : toMysqlDatetimeUtc(new Date());
      const lastReplayAt = replayStartAt || (dateStart ? toMysqlDatetimeUtc(new Date(`${dateStart}T00:00:00.000Z`)) : null);

      await insertBacktestSessionResilient({
        id,
        userId,
        sessionName,
        description,
        status,
        marketType,
        instrumentsJson: stringifyJson(instruments),
        playbookId,
        playbookName,
        initialBalance,
        currentBalance: initialBalance,
        riskModel,
        dateStart,
        dateEnd,
        replayTimeframe,
        replayGranularity,
        tradingHoursMode,
        objective,
        objectiveDetail,
        strategyContextJson: stringifyJson(strategyContext),
        draftFormJson: draftFormJson ? stringifyJson(draftFormJson) : null,
        chartPrefsJson: stringifyJson(chartPrefs),
        startedAt,
        lastReplayAt,
        lastActiveInstrument: instruments[0] || null,
      });

      const row = await loadSessionForUser(id, userId);
      return res.status(201).json({ success: true, session: mapSessionRow(row) });
    }

    const sessionDetail = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})$/i);
    if (sessionDetail) {
      const sessionId = sessionDetail[1];
      if (req.method === 'GET') {
        const row = await loadSessionForUser(sessionId, userId);
        if (!row) return res.status(404).json({ success: false, message: 'Session not found' });
        return res.status(200).json({ success: true, session: mapSessionRow(row) });
      }
      if (req.method === 'PATCH') {
        const body = parseBody(req);
        const row = await loadSessionForUser(sessionId, userId);
        if (!row) return res.status(404).json({ success: false, message: 'Session not found' });

        const next = { ...mapSessionRow(row) };
        if (body.sessionName != null) next.sessionName = String(body.sessionName).slice(0, 255);
        if (body.description != null) next.description = String(body.description).slice(0, 8000);
        if (body.status != null) next.status = String(body.status).slice(0, 24);
        if (body.marketType != null) next.marketType = String(body.marketType).slice(0, 40);
        if (body.instruments != null) next.instruments = Array.isArray(body.instruments) ? body.instruments.slice(0, 5) : [];
        if (body.playbookId !== undefined) next.playbookId = body.playbookId ? String(body.playbookId).slice(0, 36) : null;
        if (body.playbookName !== undefined) next.playbookName = body.playbookName ? String(body.playbookName).slice(0, 160) : null;
        if (body.initialBalance != null) {
          const parsedBalance = Number(body.initialBalance);
          if (!Number.isFinite(parsedBalance)) {
            return res.status(400).json({ success: false, message: 'initialBalance must be numeric' });
          }
          next.initialBalance = parsedBalance;
        }
        if (body.riskModel != null) next.riskModel = String(body.riskModel).slice(0, 32);
        if (body.dateStart != null) {
          const normalized = normalizeDateOnly(body.dateStart);
          if (!normalized) return res.status(400).json({ success: false, message: 'dateStart must be YYYY-MM-DD (or parseable date)' });
          next.dateStart = normalized;
        }
        if (body.dateEnd != null) {
          if (body.dateEnd === '') {
            next.dateEnd = null;
          } else {
            const normalized = normalizeDateOnly(body.dateEnd);
            if (!normalized) return res.status(400).json({ success: false, message: 'dateEnd must be YYYY-MM-DD (or parseable date)' });
            next.dateEnd = normalized;
          }
        }
        if (body.replayTimeframe != null) next.replayTimeframe = String(body.replayTimeframe).slice(0, 32);
        if (body.replayGranularity != null) next.replayGranularity = String(body.replayGranularity).slice(0, 32);
        if (body.tradingHoursMode != null) next.tradingHoursMode = String(body.tradingHoursMode).slice(0, 32);
        if (body.objective != null) next.objective = String(body.objective).slice(0, 64);
        if (body.objectiveDetail != null) next.objectiveDetail = String(body.objectiveDetail).slice(0, 4000);
        if (body.strategyContext != null) next.strategyContext = body.strategyContext;
        if (body.chartPrefs != null) next.chartPrefs = body.chartPrefs;
        if (body.notes != null) next.notes = String(body.notes).slice(0, 12000);
        if (body.lastReplayAt != null) next.lastReplayAt = body.lastReplayAt;
        if (body.lastActiveInstrument != null) next.lastActiveInstrument = String(body.lastActiveInstrument).slice(0, 64);
        if (body.replaySpeed != null) next.replaySpeed = num(body.replaySpeed, 1);
        if (body.timeDeltaSeconds != null) {
          const add = Math.min(120, Math.max(0, Math.round(Number(body.timeDeltaSeconds))));
          next.timeSpentSeconds = Number(row.timeSpentSeconds || 0) + add;
        }

        const st = next.status;
        if (['draft', 'active', 'paused', 'completed', 'archived'].indexOf(st) === -1) {
          return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        if (next.dateStart && next.dateEnd && next.dateStart > next.dateEnd) {
          return res.status(400).json({ success: false, message: 'dateStart must be on or before dateEnd' });
        }
        const normalizedReplayStartAt =
          body.replayStartAt !== undefined
            ? (body.replayStartAt === '' || body.replayStartAt == null ? null : toMysqlDatetimeUtc(body.replayStartAt))
            : undefined;
        if (body.replayStartAt !== undefined && body.replayStartAt !== '' && body.replayStartAt != null && !normalizedReplayStartAt) {
          return res.status(400).json({ success: false, message: 'replayStartAt must be a valid datetime' });
        }
        const normalizedLastReplayAt =
          body.lastReplayAt !== undefined
            ? (body.lastReplayAt === '' || body.lastReplayAt == null ? null : toMysqlDatetimeUtc(body.lastReplayAt))
            : undefined;
        if (body.lastReplayAt !== undefined && body.lastReplayAt !== '' && body.lastReplayAt != null && !normalizedLastReplayAt) {
          return res.status(400).json({ success: false, message: 'lastReplayAt must be a valid datetime' });
        }

        await executeQuery(
          `UPDATE backtest_sessions SET
            sessionName = ?, description = ?, status = ?, marketType = ?, instrumentsJson = ?, playbookId = ?, playbookName = ?,
            initialBalance = ?, riskModel = ?, dateStart = ?, dateEnd = ?, replayTimeframe = ?, replayGranularity = ?,
            tradingHoursMode = ?, objective = ?, objectiveDetail = ?, strategyContextJson = ?, chartPrefsJson = ?, notes = ?,
            lastReplayAt = ?, lastActiveInstrument = ?, replaySpeed = ?, timeSpentSeconds = ?,
            updatedAt = CURRENT_TIMESTAMP
          WHERE id = ? AND userId = ?`,
          [
            next.sessionName,
            next.description,
            st,
            next.marketType || null,
            stringifyJson(next.instruments || []),
            next.playbookId,
            next.playbookName,
            next.initialBalance,
            next.riskModel,
            next.dateStart,
            next.dateEnd,
            next.replayTimeframe,
            next.replayGranularity,
            next.tradingHoursMode,
            next.objective,
            next.objectiveDetail,
            stringifyJson(next.strategyContext || {}),
            stringifyJson(next.chartPrefs || {}),
            next.notes,
            normalizedReplayStartAt !== undefined
              ? normalizedReplayStartAt
              : normalizedLastReplayAt !== undefined
                ? normalizedLastReplayAt
                : toMysqlDatetimeUtc(row.lastReplayAt),
            next.lastActiveInstrument,
            next.replaySpeed,
            next.timeSpentSeconds != null ? next.timeSpentSeconds : row.timeSpentSeconds,
            sessionId,
            userId,
          ]
        );
        if (st === 'active' && !row.startedAt) {
          await executeQuery(
            'UPDATE backtest_sessions SET startedAt = COALESCE(startedAt, CURRENT_TIMESTAMP) WHERE id = ? AND userId = ?',
            [sessionId, userId]
          );
        }
        await recalculateSessionAggregates(sessionId, userId);
        const updated = await loadSessionForUser(sessionId, userId);
        return res.status(200).json({ success: true, session: mapSessionRow(updated) });
      }
      if (req.method === 'DELETE') {
        const row = await loadSessionForUser(sessionId, userId);
        if (!row) return res.status(404).json({ success: false, message: 'Session not found' });
        await executeQuery('DELETE FROM backtest_trades WHERE sessionId = ? AND userId = ?', [sessionId, userId]);
        await executeQuery('DELETE FROM backtest_session_notes WHERE sessionId = ? AND userId = ?', [sessionId, userId]);
        await executeQuery('DELETE FROM backtest_sessions WHERE id = ? AND userId = ?', [sessionId, userId]);
        return res.status(200).json({ success: true });
      }
    }

    const sessionComplete = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/complete$/i);
    if (sessionComplete && req.method === 'POST') {
      const sessionId = sessionComplete[1];
      const row = await loadSessionForUser(sessionId, userId);
      if (!row) return res.status(404).json({ success: false, message: 'Session not found' });
      const [trows] = await executeQuery('SELECT * FROM backtest_trades WHERE sessionId = ? AND userId = ?', [sessionId, userId]);
      const trades = trows.map(mapTradeRow);
      const agg = aggregateTrades(trades, num(row.initialBalance));
      const bd = breakdownMetrics(trades, num(row.initialBalance));
      const recap = completionRecap(agg, bd);
      await executeQuery(
        `UPDATE backtest_sessions SET status = 'completed', completedAt = CURRENT_TIMESTAMP, completionRecapJson = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?`,
        [stringifyJson(recap), sessionId, userId]
      );
      await recalculateSessionAggregates(sessionId, userId);
      const updated = await loadSessionForUser(sessionId, userId);
      return res.status(200).json({ success: true, session: mapSessionRow(updated), recap });
    }

    const sessionArchive = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/archive$/i);
    if (sessionArchive && req.method === 'POST') {
      const sessionId = sessionArchive[1];
      await executeQuery(`UPDATE backtest_sessions SET status = 'archived', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?`, [
        sessionId,
        userId,
      ]);
      const updated = await loadSessionForUser(sessionId, userId);
      if (!updated) return res.status(404).json({ success: false, message: 'Session not found' });
      return res.status(200).json({ success: true, session: mapSessionRow(updated) });
    }

    const sessionResume = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/resume$/i);
    if (sessionResume && req.method === 'POST') {
      const sessionId = sessionResume[1];
      await executeQuery(`UPDATE backtest_sessions SET status = 'active', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?`, [
        sessionId,
        userId,
      ]);
      const updated = await loadSessionForUser(sessionId, userId);
      if (!updated) return res.status(404).json({ success: false, message: 'Session not found' });
      return res.status(200).json({ success: true, session: mapSessionRow(updated) });
    }

    const sessionPause = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/pause$/i);
    if (sessionPause && req.method === 'POST') {
      const sessionId = sessionPause[1];
      const body = parseBody(req);
      const add = body.timeDeltaSeconds != null ? Math.min(120, Math.max(0, Math.round(Number(body.timeDeltaSeconds)))) : 0;
      await executeQuery(
        `UPDATE backtest_sessions SET status = 'paused', timeSpentSeconds = timeSpentSeconds + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?`,
        [add, sessionId, userId]
      );
      const updated = await loadSessionForUser(sessionId, userId);
      if (!updated) return res.status(404).json({ success: false, message: 'Session not found' });
      return res.status(200).json({ success: true, session: mapSessionRow(updated) });
    }

    const sessionDuplicate = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/duplicate$/i);
    if (sessionDuplicate && req.method === 'POST') {
      const sid = sessionDuplicate[1];
      const row = await loadSessionForUser(sid, userId);
      if (!row) return res.status(404).json({ success: false, message: 'Session not found' });
      const nid = crypto.randomUUID();
      await executeQuery(
        `INSERT INTO backtest_sessions (
          id, userId, sessionName, description, status, marketType, instrumentsJson, playbookId, playbookName,
          initialBalance, currentBalance, riskModel, dateStart, dateEnd, replayTimeframe, replayGranularity,
          tradingHoursMode, objective, objectiveDetail, strategyContextJson, chartPrefsJson, notes
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          nid,
          userId,
          `${row.sessionName} (copy)`.slice(0, 255),
          row.description,
          'draft',
          row.marketType,
          row.instrumentsJson,
          row.playbookId,
          row.playbookName,
          row.initialBalance,
          row.initialBalance,
          row.riskModel,
          row.dateStart,
          row.dateEnd,
          row.replayTimeframe,
          row.replayGranularity,
          row.tradingHoursMode,
          row.objective,
          row.objectiveDetail,
          row.strategyContextJson || '{}',
          row.chartPrefsJson || '{}',
          row.notes,
        ]
      );
      const created = await loadSessionForUser(nid, userId);
      return res.status(201).json({ success: true, session: mapSessionRow(created) });
    }

    const sessionTrades = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/trades$/i);
    if (sessionTrades) {
      const sessionId = sessionTrades[1];
      const s = await loadSessionForUser(sessionId, userId);
      if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
      if (req.method === 'GET') {
        const [rows] = await executeQuery(
          'SELECT * FROM backtest_trades WHERE sessionId = ? AND userId = ? ORDER BY closeTime DESC, createdAt DESC',
          [sessionId, userId]
        );
        return res.status(200).json({ success: true, trades: rows.map(mapTradeRow) });
      }
      if (req.method === 'POST') {
        const body = parseBody(req);
        const err = validateTradeBody(body);
        if (err) return res.status(400).json({ success: false, message: err });
        const c = coerceTradePayload(body, {});
        const tid = crypto.randomUUID();
        await executeQuery(
          `INSERT INTO backtest_trades (
            id, sessionId, userId, instrument, marketType, direction, entryPrice, stopLoss, takeProfit, exitPrice,
            positionSize, riskPercent, initialRiskAmount, pnlAmount, pnlPercent, rMultiple, pipsOrPoints,
            openTime, closeTime, durationSeconds, timeframe, sessionLabel, playbookId, playbookName, setupName,
            entryModel, confidenceScore, bias, marketCondition, checklistScore, ruleAdherenceScore, qualityGrade,
            emotionalState, resultType, notes, mistakesJson, tagsJson, partialsJson, checklistItemsJson, extraContextJson, screenshotUrl
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            tid,
            sessionId,
            userId,
            c.instrument,
            c.marketType,
            c.direction,
            c.entryPrice,
            c.stopLoss,
            c.takeProfit,
            c.exitPrice,
            c.positionSize,
            c.riskPercent,
            c.initialRiskAmount,
            c.pnlAmount,
            c.pnlPercent,
            c.rMultiple,
            c.pipsOrPoints,
            c.openTime ? new Date(c.openTime) : null,
            c.closeTime ? new Date(c.closeTime) : null,
            c.durationSeconds,
            c.timeframe,
            c.sessionLabel,
            c.playbookId,
            c.playbookName,
            c.setupName,
            c.entryModel,
            c.confidenceScore,
            c.bias,
            c.marketCondition,
            c.checklistScore,
            c.ruleAdherenceScore,
            c.qualityGrade,
            c.emotionalState,
            c.resultType,
            c.notes,
            c.mistakesJson,
            c.tagsJson,
            c.partialsJson,
            c.checklistItemsJson,
            c.extraContextJson,
            c.screenshotUrl,
          ]
        );
        await recalculateSessionAggregates(sessionId, userId);
        const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ?', [tid]);
        return res.status(201).json({ success: true, trade: mapTradeRow(rows[0]) });
      }
    }

    const replaySession = pathname.match(/^\/api\/backtesting\/replay\/sessions\/([a-f0-9-]{36})$/i);
    if (replaySession && req.method === 'PATCH') {
      const sessionId = replaySession[1];
      const s = await loadSessionForUser(sessionId, userId);
      if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
      const body = parseBody(req);
      const currentPrefs = jsonVal(s.chartPrefsJson, {});
      const replayState = body.replayState && typeof body.replayState === 'object' ? body.replayState : {};
      const nextPrefs = { ...currentPrefs, replayState };
      await executeQuery(
        'UPDATE backtest_sessions SET chartPrefsJson = ?, lastReplayAt = COALESCE(?, lastReplayAt), updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?',
        [stringifyJson(nextPrefs), toMysqlDatetimeUtc(body.lastReplayAt), sessionId, userId]
      );
      const updated = await loadSessionForUser(sessionId, userId);
      return res.status(200).json({ success: true, session: mapSessionRow(updated), replayState });
    }

    const replayTradeCreate = pathname.match(/^\/api\/backtesting\/replay\/sessions\/([a-f0-9-]{36})\/trades$/i);
    if (replayTradeCreate && req.method === 'POST') {
      const sessionId = replayTradeCreate[1];
      const s = await loadSessionForUser(sessionId, userId);
      if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
      const body = parseBody(req);
      const side = normalizeDirection(body.direction || 'long');
      const entryPrice = num(body.entryPrice);
      const lotSize = num(body.lotSize, 0.01);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) return res.status(400).json({ success: false, message: 'entryPrice invalid' });
      const tid = crypto.randomUUID();
      await executeQuery(
        `INSERT INTO backtest_trades (
          id, sessionId, userId, instrument, marketType, direction, entryPrice, stopLoss, takeProfit,
          positionSize, initialRiskAmount, pnlAmount, openTime, timeframe, resultType, notes, checklistItemsJson, extraContextJson
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tid, sessionId, userId, String(body.instrument || s.lastActiveInstrument || 'EURUSD').slice(0, 64), s.marketType || null, side,
          entryPrice, body.stopLoss != null && body.stopLoss !== '' ? num(body.stopLoss) : null,
          body.takeProfit != null && body.takeProfit !== '' ? num(body.takeProfit) : null,
          lotSize, null, 0, toMysqlDatetimeUtc(body.openTime || new Date()),
          String(body.timeframe || s.replayTimeframe || 'M15').slice(0, 32), 'breakeven',
          String(body.notes || '').slice(0, 2000), stringifyJson([]), stringifyJson(body.replayReference || {})
        ]
      );
      const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND userId = ?', [tid, userId]);
      return res.status(201).json({ success: true, trade: mapTradeRow(rows[0]) });
    }

    const replayTradeClose = pathname.match(/^\/api\/backtesting\/replay\/sessions\/([a-f0-9-]{36})\/trades\/([a-f0-9-]{36})\/close$/i);
    if (replayTradeClose && req.method === 'POST') {
      const sessionId = replayTradeClose[1];
      const tradeId = replayTradeClose[2];
      const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND sessionId = ? AND userId = ?', [tradeId, sessionId, userId]);
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Trade not found' });
      const trade = mapTradeRow(rows[0]);
      const body = parseBody(req);
      const exitPrice = num(body.exitPrice);
      if (!Number.isFinite(exitPrice) || exitPrice <= 0) return res.status(400).json({ success: false, message: 'exitPrice invalid' });
      const lots = num(trade.positionSize, 0);
      const pnlRaw = trade.direction === 'short' ? (trade.entryPrice - exitPrice) * lots : (exitPrice - trade.entryPrice) * lots;
      const pnlAmount = Number.isFinite(num(body.pnlAmount)) ? num(body.pnlAmount) : pnlRaw;
      const resultType = classifyResult(pnlAmount);
      await executeQuery(
        `UPDATE backtest_trades SET exitPrice = ?, closeTime = ?, pnlAmount = ?, resultType = ?, notes = CONCAT(COALESCE(notes, ''), ?), updatedAt = CURRENT_TIMESTAMP
         WHERE id = ? AND sessionId = ? AND userId = ?`,
        [exitPrice, toMysqlDatetimeUtc(body.closeTime || new Date()), pnlAmount, resultType, body.notes ? `\n${String(body.notes).slice(0, 500)}` : '', tradeId, sessionId, userId]
      );
      await recalculateSessionAggregates(sessionId, userId);
      const [updatedRows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND userId = ?', [tradeId, userId]);
      return res.status(200).json({ success: true, trade: mapTradeRow(updatedRows[0]) });
    }

    if (pathname === '/api/backtesting/saved-trades') {
      if (req.method === 'GET') {
        const [rows] = await executeQuery('SELECT * FROM backtest_saved_trades WHERE userId = ? ORDER BY createdAt DESC LIMIT 1000', [userId]);
        return res.status(200).json({ success: true, trades: rows.map(mapSavedTradeRow) });
      }
      if (req.method === 'POST') {
        const body = parseBody(req);
        const sourceTradeId = String(body.sourceTradeId || '').trim();
        if (!sourceTradeId) return res.status(400).json({ success: false, message: 'sourceTradeId is required' });
        const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND userId = ?', [sourceTradeId, userId]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Trade not found' });
        const tr = mapTradeRow(rows[0]);
        const sid = crypto.randomUUID();
        await executeQuery(
          `INSERT INTO backtest_saved_trades (
            id, userId, sessionId, sourceTradeId, instrument, direction, entryTime, entryPrice, exitTime, exitPrice, lotSize,
            pnlAmount, result, timeframe, replayReferenceJson, screenshotUrl, notes, aiFeedback
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            sid, userId, tr.sessionId, tr.id, tr.instrument, tr.direction, toMysqlDatetimeUtc(tr.openTime), tr.entryPrice,
            toMysqlDatetimeUtc(tr.closeTime), tr.exitPrice, tr.positionSize, tr.pnlAmount, tr.resultType,
            tr.timeframe, stringifyJson(body.replayReference || tr.extraContext || {}), body.screenshotUrl ? String(body.screenshotUrl).slice(0, 512) : null,
            String(body.notes || tr.notes || '').slice(0, 4000), String(body.aiFeedback || '').slice(0, 8000),
          ]
        );
        const [saved] = await executeQuery('SELECT * FROM backtest_saved_trades WHERE id = ? AND userId = ?', [sid, userId]);
        return res.status(201).json({ success: true, trade: mapSavedTradeRow(saved[0]) });
      }
    }

    const savedTradeDetail = pathname.match(/^\/api\/backtesting\/saved-trades\/([a-f0-9-]{36})$/i);
    if (savedTradeDetail && req.method === 'GET') {
      const [rows] = await executeQuery('SELECT * FROM backtest_saved_trades WHERE id = ? AND userId = ?', [savedTradeDetail[1], userId]);
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Saved trade not found' });
      return res.status(200).json({ success: true, trade: mapSavedTradeRow(rows[0]) });
    }

    if (req.method === 'POST' && pathname === '/api/backtesting/ai-coach') {
      const body = parseBody(req);
      const coaching = buildAiCoaching(body.context || {});
      return res.status(200).json({ success: true, feedback: coaching });
    }

    const sessionNotebook = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/notebook$/i);
    if (sessionNotebook) {
      const sessionId = sessionNotebook[1];
      const s = await loadSessionForUser(sessionId, userId);
      if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
      if (req.method === 'GET') {
        const [rows] = await executeQuery('SELECT * FROM backtest_session_notes WHERE sessionId = ? AND userId = ?', [
          sessionId,
          userId,
        ]);
        const content = rows[0]?.content ? jsonVal(rows[0].content, {}) : {};
        return res.status(200).json({ success: true, notebook: content });
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = parseBody(req);
        const notebook = body.notebook && typeof body.notebook === 'object' ? body.notebook : body;
        const str = stringifyJson(notebook);
        const [existing] = await executeQuery('SELECT id FROM backtest_session_notes WHERE sessionId = ? AND userId = ?', [
          sessionId,
          userId,
        ]);
        if (existing[0]) {
          await executeQuery('UPDATE backtest_session_notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE sessionId = ? AND userId = ?', [
            str,
            sessionId,
            userId,
          ]);
        } else {
          const nid = crypto.randomUUID();
          await executeQuery('INSERT INTO backtest_session_notes (id, sessionId, userId, content) VALUES (?,?,?,?)', [
            nid,
            sessionId,
            userId,
            str,
          ]);
        }
        return res.status(200).json({ success: true, notebook: jsonVal(str, {}) });
      }
    }

    const sessionReports = pathname.match(/^\/api\/backtesting\/sessions\/([a-f0-9-]{36})\/reports$/i);
    if (sessionReports && req.method === 'GET') {
      const sessionId = sessionReports[1];
      const s = await loadSessionForUser(sessionId, userId);
      if (!s) return res.status(404).json({ success: false, message: 'Session not found' });
      const [trows] = await executeQuery('SELECT * FROM backtest_trades WHERE sessionId = ? AND userId = ?', [sessionId, userId]);
      const trades = trows.map(mapTradeRow);
      const ib = num(s.initialBalance);
      const agg = aggregateTrades(trades, ib);
      const breakdown = breakdownMetrics(trades, ib);
      const insights = buildDeterministicInsights(agg, breakdown, s.sessionName);
      return res.status(200).json({
        success: true,
        session: mapSessionRow(s),
        metrics: agg,
        breakdown,
        insights,
        calendar: calendarHeatmap(trades),
        rHistogram: rDistribution(trades),
      });
    }

    const tradeIdPath = pathname.match(/^\/api\/backtesting\/trades\/([a-f0-9-]{36})$/i);
    if (tradeIdPath) {
      const tradeId = tradeIdPath[1];
      if (req.method === 'GET') {
        const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND userId = ?', [tradeId, userId]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Trade not found' });
        return res.status(200).json({ success: true, trade: mapTradeRow(rows[0]) });
      }
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND userId = ?', [tradeId, userId]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Trade not found' });
        const existing = mapTradeRow(rows[0]);
        const body = parseBody(req);
        const c = coerceTradePayload(body, existing);
        const err = validateTradeBody(
          {
            instrument: c.instrument,
            direction: c.direction,
            entryPrice: c.entryPrice,
            openTime: c.openTime,
            closeTime: c.closeTime,
            exitPrice: c.exitPrice,
            pnlAmount: c.pnlAmount,
          },
          false
        );
        if (err) return res.status(400).json({ success: false, message: err });
        await executeQuery(
          `UPDATE backtest_trades SET
            instrument = ?, marketType = ?, direction = ?, entryPrice = ?, stopLoss = ?, takeProfit = ?, exitPrice = ?,
            positionSize = ?, riskPercent = ?, initialRiskAmount = ?, pnlAmount = ?, pnlPercent = ?, rMultiple = ?, pipsOrPoints = ?,
            openTime = ?, closeTime = ?, durationSeconds = ?, timeframe = ?, sessionLabel = ?, playbookId = ?, playbookName = ?,
            setupName = ?, entryModel = ?, confidenceScore = ?, bias = ?, marketCondition = ?, checklistScore = ?, ruleAdherenceScore = ?,
            qualityGrade = ?, emotionalState = ?, resultType = ?, notes = ?, mistakesJson = ?, tagsJson = ?, partialsJson = ?,
            checklistItemsJson = ?, extraContextJson = ?, screenshotUrl = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ? AND userId = ?`,
          [
            c.instrument,
            c.marketType,
            c.direction,
            c.entryPrice,
            c.stopLoss,
            c.takeProfit,
            c.exitPrice,
            c.positionSize,
            c.riskPercent,
            c.initialRiskAmount,
            c.pnlAmount,
            c.pnlPercent,
            c.rMultiple,
            c.pipsOrPoints,
            c.openTime ? new Date(c.openTime) : null,
            c.closeTime ? new Date(c.closeTime) : null,
            c.durationSeconds,
            c.timeframe,
            c.sessionLabel,
            c.playbookId,
            c.playbookName,
            c.setupName,
            c.entryModel,
            c.confidenceScore,
            c.bias,
            c.marketCondition,
            c.checklistScore,
            c.ruleAdherenceScore,
            c.qualityGrade,
            c.emotionalState,
            c.resultType,
            c.notes,
            c.mistakesJson,
            c.tagsJson,
            c.partialsJson,
            c.checklistItemsJson,
            c.extraContextJson,
            c.screenshotUrl,
            tradeId,
            userId,
          ]
        );
        await recalculateSessionAggregates(existing.sessionId, userId);
        const [updated] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ?', [tradeId]);
        return res.status(200).json({ success: true, trade: mapTradeRow(updated[0]) });
      }
      if (req.method === 'DELETE') {
        const [rows] = await executeQuery('SELECT * FROM backtest_trades WHERE id = ? AND userId = ?', [tradeId, userId]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Trade not found' });
        const sessionId = rows[0].sessionId;
        await executeQuery('DELETE FROM backtest_trades WHERE id = ? AND userId = ?', [tradeId, userId]);
        await recalculateSessionAggregates(sessionId, userId);
        return res.status(200).json({ success: true });
      }
    }

    /** GET /api/backtesting/trades — all trades for user with filters */
    if (req.method === 'GET' && pathname === '/api/backtesting/trades') {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const sessionId = url.searchParams.get('sessionId');
      const instrument = url.searchParams.get('instrument');
      const playbookId = url.searchParams.get('playbookId');
      const tag = url.searchParams.get('tag');
      let sql = 'SELECT * FROM backtest_trades WHERE userId = ?';
      const p = [userId];
      if (sessionId) {
        sql += ' AND sessionId = ?';
        p.push(sessionId);
      }
      if (instrument) {
        sql += ' AND instrument = ?';
        p.push(instrument);
      }
      if (playbookId) {
        sql += ' AND playbookId = ?';
        p.push(playbookId);
      }
      sql += ' ORDER BY closeTime DESC, createdAt DESC LIMIT 2000';
      const [rows] = await executeQuery(sql, p);
      let list = rows.map(mapTradeRow);
      if (tag) {
        list = list.filter((t) => Array.isArray(t.tags) && t.tags.includes(tag));
      }
      return res.status(200).json({ success: true, trades: list });
    }

    return res.status(404).json({ success: false, message: 'Not found' });
  } catch (e) {
    console.error('backtesting handler error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
