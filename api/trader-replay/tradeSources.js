const { executeQuery } = require('../db');

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTradeJson(raw) {
  try {
    if (!raw) return null;
    if (typeof raw === 'string') return JSON.parse(raw);
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8'));
    if (typeof raw === 'object') return raw;
    return null;
  } catch {
    return null;
  }
}

function buildReplayId(source, id) {
  return `${source}:${String(id || '')}`;
}

/** Safe decode for query params / legacy double-encoding (e.g. csv%253A...). */
function decodeReplayIdParam(value) {
  if (value == null || value === '') return '';
  let s = String(value).trim();
  if (!s) return '';
  try {
    for (let i = 0; i < 4; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* keep s */
  }
  return String(s).trim();
}

function parseReplayId(value) {
  const raw = String(value || '').trim();
  const parts = raw.split(':');
  if (parts.length < 2) return null;
  const source = parts[0];
  const sourceId = parts.slice(1).join(':');
  if (!source || !sourceId) return null;
  return { source, sourceId };
}

/** Legacy Aura CSV UI used `csv-123` (1-based index in raw upload_json row order, latest snapshot). */
async function loadLegacyCsvDashTrade(userId, oneBased) {
  const n = Number(oneBased);
  if (!Number.isFinite(n) || n < 1) return null;
  const idx = n - 1;
  const [rows] = await executeQuery(
    `SELECT period_year, period_month, upload_json FROM report_csv_uploads WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  const row = rows?.[0];
  if (!row) return null;
  const parsed = parseTradeJson(row.upload_json);
  const trades = Array.isArray(parsed?.trades) ? parsed.trades : [];
  if (idx < 0 || idx >= trades.length) return null;
  const normalized = normalizeCsvTrade(row.period_year, row.period_month, trades[idx], idx);
  return normalized.symbol ? normalized : null;
}

function normalizeMtTrade(raw, platformId) {
  const source = String(platformId || 'mt').toLowerCase();
  const srcId = String(raw.id || raw.ticket || raw.dealId || raw.orderId || raw.created_at || Math.random());
  const openTime = toIso(raw.openTime || raw.created_at || raw.time);
  const closeTime = toIso(raw.closeTime || raw.updated_at || raw.time);
  const entry = toNum(raw.entryPrice || raw.openPrice || raw.price_open || raw.price);
  const exit = toNum(raw.closePrice || raw.exitPrice || raw.price_current);
  const direction = String(raw.direction || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
  return {
    replayId: buildReplayId(source, srcId),
    source,
    sourceId: srcId,
    symbol: String(raw.pair || raw.symbol || '').toUpperCase(),
    direction,
    openTime,
    closeTime,
    entry,
    exit,
    stopLoss: toNum(raw.stopLoss || raw.sl),
    takeProfit: toNum(raw.takeProfit || raw.tp),
    lotSize: toNum(raw.volume || raw.lots || raw.size || raw.qty, 0),
    pnl: toNum(raw.netPnl != null ? raw.netPnl : raw.pnl, 0),
    durationSeconds:
      openTime && closeTime
        ? Math.max(0, Math.floor((new Date(closeTime).getTime() - new Date(openTime).getTime()) / 1000))
        : null,
    raw,
  };
}

function normalizeAuraTrade(row) {
  const srcId = String(row.id);
  const direction = String(row.direction || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
  const openTime = toIso(row.created_at);
  const closeTime = toIso(row.updated_at);
  const entry = toNum(row.entry_price);
  const exit = entry;
  return {
    replayId: buildReplayId('aura', srcId),
    source: 'aura',
    sourceId: srcId,
    symbol: String(row.pair || '').toUpperCase(),
    direction,
    openTime,
    closeTime,
    entry,
    exit,
    stopLoss: toNum(row.stop_loss),
    takeProfit: toNum(row.take_profit),
    lotSize: toNum(row.position_size, 0),
    pnl: toNum(row.pnl, 0),
    durationSeconds:
      openTime && closeTime
        ? Math.max(0, Math.floor((new Date(closeTime).getTime() - new Date(openTime).getTime()) / 1000))
        : null,
    raw: row,
  };
}

function normalizeCsvTrade(periodYear, periodMonth, row, index) {
  const srcId = `${periodYear}-${periodMonth}-${index}`;
  const openTime = toIso(row.time);
  const closeTime = openTime;
  const direction = String(row.type || '').toLowerCase().includes('sell') ? 'sell' : 'buy';
  return {
    replayId: buildReplayId('csv', srcId),
    source: 'csv',
    sourceId: srcId,
    symbol: String(row.symbol || '').toUpperCase(),
    direction,
    openTime,
    closeTime,
    entry: null,
    exit: null,
    stopLoss: null,
    takeProfit: null,
    lotSize: toNum(row.volume, 0),
    pnl: toNum(row.profit, 0),
    durationSeconds: null,
    raw: row,
  };
}

function sortTradesDesc(trades) {
  return [...trades].sort((a, b) => {
    const at = new Date(a.closeTime || a.openTime || 0).getTime();
    const bt = new Date(b.closeTime || b.openTime || 0).getTime();
    return bt - at;
  });
}

async function loadMtTrades(userId, platformId) {
  const [rows] = await executeQuery(
    `SELECT trade_json FROM aura_platform_trade_cache WHERE user_id = ? AND platform_id = ? ORDER BY updated_at DESC LIMIT 5000`,
    [userId, platformId]
  );
  const trades = [];
  for (const row of rows || []) {
    const parsed = parseTradeJson(row.trade_json);
    if (!parsed || typeof parsed !== 'object') continue;
    const normalized = normalizeMtTrade(parsed, platformId);
    if (!normalized.symbol) continue;
    trades.push(normalized);
  }
  return trades;
}

async function loadAuraTrades(userId) {
  const [rows] = await executeQuery(
    `SELECT id, pair, direction, entry_price, stop_loss, take_profit, position_size, pnl, created_at, updated_at
     FROM aura_analysis_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000`,
    [userId]
  );
  return (rows || []).map(normalizeAuraTrade).filter((t) => t.symbol);
}

async function loadCsvTrades(userId) {
  const [rows] = await executeQuery(
    `SELECT period_year, period_month, upload_json FROM report_csv_uploads WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 24`,
    [userId]
  );
  const out = [];
  for (const row of rows || []) {
    const parsed = parseTradeJson(row.upload_json);
    const trades = Array.isArray(parsed?.trades) ? parsed.trades : [];
    for (let i = 0; i < trades.length; i += 1) {
      const normalized = normalizeCsvTrade(row.period_year, row.period_month, trades[i], i);
      if (!normalized.symbol) continue;
      out.push(normalized);
    }
  }
  return out;
}

async function loadReplayableTradesForUser(userId, source = 'all') {
  const src = String(source || 'all').toLowerCase();
  let trades = [];
  if (src === 'all' || src === 'mt4') trades = trades.concat(await loadMtTrades(userId, 'mt4'));
  if (src === 'all' || src === 'mt5') trades = trades.concat(await loadMtTrades(userId, 'mt5'));
  if (src === 'all' || src === 'aura') trades = trades.concat(await loadAuraTrades(userId));
  if (src === 'all' || src === 'csv') trades = trades.concat(await loadCsvTrades(userId));
  return sortTradesDesc(trades);
}

async function loadReplayTradeByIdForUser(userId, rawId) {
  const decoded = decodeReplayIdParam(rawId);
  if (!decoded) return null;

  const parsed = parseReplayId(decoded);
  if (parsed) {
    const sourceTrades = await loadReplayableTradesForUser(userId, parsed.source);
    const exact = sourceTrades.find((t) => t.replayId === decoded);
    if (exact) return exact;
  }

  const legacyCsv = decoded.match(/^csv-(\d+)$/i);
  if (legacyCsv) {
    const leg = await loadLegacyCsvDashTrade(userId, Number(legacyCsv[1], 10));
    if (leg) return leg;
  }

  const all = await loadReplayableTradesForUser(userId, 'all');
  const direct = all.find((t) => t.replayId === decoded || String(t.sourceId) === decoded);
  if (direct) return direct;

  if (!decoded.includes(':')) {
    for (const plat of ['mt4', 'mt5', 'aura']) {
      const candidate = buildReplayId(plat, decoded);
      const hit = all.find((t) => t.replayId === candidate);
      if (hit) return hit;
    }
  }

  return null;
}

module.exports = {
  buildReplayId,
  parseReplayId,
  decodeReplayIdParam,
  loadReplayableTradesForUser,
  loadReplayTradeByIdForUser,
  normalizeMtTrade,
  normalizeAuraTrade,
  normalizeCsvTrade,
};
