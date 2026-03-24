/**
 * Single source of truth for MT5 CSV trade aggregates (stored trades slice only).
 */

function jsonNumber(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Align with csv-metrics parseTradeTime for data span + weekday consistency */
function parseTradeTime(t) {
  const raw = (t && t.time != null ? String(t.time) : '').trim();
  if (!raw) return null;
  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const normalized = raw
    .replace(/\./g, '-')
    .replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2');
  d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  const alt = raw.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');
  d = new Date(alt);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MAX_STORED_TRADES = 12000;
const MAX_UPLOAD_JSON_BYTES = 6 * 1024 * 1024;

/**
 * Summary fields matching dashboard / upload response shape (strings for money fields).
 */
function buildSummaryFromTrades(trades) {
  if (!Array.isArray(trades) || !trades.length) {
    return {
      tradeCount: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winRate: 0,
      totalPnl: '0.00',
      grossProfit: '0.00',
      grossLoss: '0.00',
      profitFactor: '0',
      symbols: [],
    };
  }

  const profits = trades.map((t) => jsonNumber(t.profit, 0));
  const wins = profits.filter((p) => p > 0).length;
  const losses = profits.filter((p) => p < 0).length;
  const breakevens = profits.filter((p) => p === 0).length;
  const totalPnl = profits.reduce((a, b) => a + b, 0);
  const grossProfit = profits.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(profits.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : wins > 0 ? '∞' : '0';
  const symbols = [...new Set(trades.map((t) => t.symbol).filter(Boolean))];

  return {
    tradeCount: trades.length,
    wins,
    losses,
    breakevens,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    totalPnl: totalPnl.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    grossLoss: grossLoss.toFixed(2),
    profitFactor,
    symbols: symbols.slice(0, 10),
  };
}

function getDataSpanFromTrades(trades) {
  if (!Array.isArray(trades) || !trades.length) return null;
  let min = null;
  let max = null;
  for (const t of trades) {
    const d = parseTradeTime(t);
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) return null;
  return {
    start: min.toISOString().slice(0, 10),
    end: max.toISOString().slice(0, 10),
    startRaw: min.toISOString(),
    endRaw: max.toISOString(),
  };
}

/**
 * True if (year, month) is strictly after the current calendar month (server local time).
 */
function isPeriodAfterCurrentMonth(year, month) {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (year > cy) return true;
  if (year === cy && month > cm) return true;
  return false;
}

/**
 * Slice trades for storage, summarize from slice only, enforce JSON byte budget.
 */
function buildStoredCsvPayload(allTrades) {
  if (!Array.isArray(allTrades) || !allTrades.length) {
    throw new Error('No valid trade rows found in CSV');
  }
  const sourceTradeCount = allTrades.length;
  let n = Math.min(sourceTradeCount, MAX_STORED_TRADES);

  function payloadForCount(count) {
    const slice = allTrades.slice(0, count);
    const sum = buildSummaryFromTrades(slice);
    const truncated = count < sourceTradeCount;
    return {
      ...sum,
      trades: slice,
      truncated,
      sourceTradeCount,
      storedTradeCount: count,
      csvPayloadVersion: 2,
    };
  }

  let count = n;
  let payload = payloadForCount(count);
  let bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');

  while (bytes > MAX_UPLOAD_JSON_BYTES && count > 500) {
    count = Math.max(500, Math.floor(count * 0.82));
    payload = payloadForCount(count);
    bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  }

  if (bytes > MAX_UPLOAD_JSON_BYTES) {
    throw new Error(
      'This export is too large to store. In MT5, filter to a shorter date range and export again.'
    );
  }

  return payload;
}

module.exports = {
  buildSummaryFromTrades,
  getDataSpanFromTrades,
  parseTradeTime,
  isPeriodAfterCurrentMonth,
  buildStoredCsvPayload,
  MAX_STORED_TRADES,
  MAX_UPLOAD_JSON_BYTES,
};
