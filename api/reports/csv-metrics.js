/**
 * GET /api/reports/csv-metrics
 * Premium only — returns parsed MT5 CSV snapshot from report_csv_uploads for charting / MT5 metrics dashboard.
 * Elite/Admin should use Aura Analysis (live MT5), not CSV snapshots.
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { effectiveReportsRole } = require('./resolveReportsRole');

function jsonNumber(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildCumulativePnl(trades) {
  if (!Array.isArray(trades) || !trades.length) return [];
  let run = 0;
  return trades.map((t) => {
    const p = jsonNumber(t.profit, 0);
    run += p;
    return { profit: p, cumulative: run };
  });
}

/** Best-effort parse of MT5 time strings for weekday stats */
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

function buildDrawdownSeries(cumulativePnl) {
  if (!Array.isArray(cumulativePnl) || cumulativePnl.length < 2) return [];
  let peak = 0;
  return cumulativePnl.map((pt) => {
    const c = jsonNumber(pt.cumulative, 0);
    if (c > peak) peak = c;
    const dd = peak - c;
    const ddPct = peak > 0 ? (dd / peak) * 100 : dd > 0 ? 100 : 0;
    return { ddPct: Math.max(0, ddPct) };
  });
}

function computeExtendedStats(trades, cumulativePnl) {
  if (!Array.isArray(trades) || !trades.length) {
    return {
      avgWin: '0',
      avgLoss: '0',
      largestWin: '0',
      largestLoss: '0',
      maxWinStreak: 0,
      maxLossStreak: 0,
      maxDrawdown: '0',
      maxDrawdownPct: '0',
      weekdayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
      weekdayParsedCount: 0,
    };
  }

  const profits = trades.map((t) => jsonNumber(t.profit, 0));
  const winTrades = profits.filter((p) => p > 0);
  const lossTrades = profits.filter((p) => p < 0);
  const avgWin = winTrades.length ? winTrades.reduce((a, b) => a + b, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length ? lossTrades.reduce((a, b) => a + b, 0) / lossTrades.length : 0;

  let largestWin = 0;
  let largestLoss = 0;
  for (const p of profits) {
    if (p > largestWin) largestWin = p;
    if (p < largestLoss) largestLoss = p;
  }

  let winStreak = 0;
  let maxWinStreak = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  for (const p of profits) {
    if (p > 0) {
      winStreak += 1;
      lossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (p < 0) {
      lossStreak += 1;
      winStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
  }

  let peak = 0;
  let maxDrawdown = 0;
  for (const pt of cumulativePnl) {
    const c = jsonNumber(pt.cumulative, 0);
    if (c > peak) peak = c;
    const dd = peak - c;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  let maxDrawdownPct = 0;
  if (peak > 0) maxDrawdownPct = (maxDrawdown / peak) * 100;
  else if (peak === 0 && maxDrawdown > 0) maxDrawdownPct = 100;

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  let weekdayParsedCount = 0;
  for (const t of trades) {
    const d = parseTradeTime(t);
    if (d && !Number.isNaN(d.getTime())) {
      weekdayCounts[d.getDay()] += 1;
      weekdayParsedCount += 1;
    }
  }

  return {
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    largestWin: largestWin.toFixed(2),
    largestLoss: largestLoss.toFixed(2),
    maxWinStreak,
    maxLossStreak,
    maxDrawdown: maxDrawdown.toFixed(2),
    maxDrawdownPct: maxDrawdownPct.toFixed(2),
    weekdayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekdayCounts,
    weekdayParsedCount,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = jsonNumber(decoded.id, NaN);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const user = await applyScheduledDowngrade(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const role = effectiveReportsRole(user);

    if (['elite', 'admin'].includes(role)) {
      return res.status(403).json({
        success: false,
        code: 'USE_AURA_ANALYSIS',
        message: 'Elite accounts use Aura Analysis for live MT5 metrics. Open Aura Analysis from the menu.',
      });
    }
    if (role !== 'premium') {
      return res.status(403).json({
        success: false,
        message: 'MT5 CSV metrics require an active Premium subscription.',
      });
    }

    const now = new Date();
    let year = jsonNumber(req.query?.year, NaN);
    let month = jsonNumber(req.query?.month, NaN);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) year = now.getFullYear();
    if (!Number.isFinite(month) || month < 1 || month > 12) month = now.getMonth() + 1;

    const [rows] = await executeQuery(
      'SELECT upload_json, trade_count, uploaded_at FROM report_csv_uploads WHERE user_id = ? AND period_year = ? AND period_month = ?',
      [userId, year, month]
    ).catch(() => [[]]);

    const row = rows?.[0];
    if (!row || !row.upload_json) {
      return res.status(200).json({
        success: true,
        hasData: false,
        period: { year, month },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(row.upload_json);
    } catch {
      return res.status(500).json({ success: false, message: 'Stored CSV data could not be read.' });
    }

    const trades = Array.isArray(parsed.trades) ? parsed.trades : [];
    const cumulativePnl = buildCumulativePnl(trades);
    const extended = computeExtendedStats(trades, cumulativePnl);
    const drawdownSeries = buildDrawdownSeries(cumulativePnl);

    const summary = {
      tradeCount: jsonNumber(parsed.tradeCount, trades.length),
      wins: jsonNumber(parsed.wins, 0),
      losses: jsonNumber(parsed.losses, 0),
      winRate: jsonNumber(parsed.winRate, 0),
      totalPnl: parsed.totalPnl != null ? String(parsed.totalPnl) : '0',
      grossProfit: parsed.grossProfit != null ? String(parsed.grossProfit) : '0',
      grossLoss: parsed.grossLoss != null ? String(parsed.grossLoss) : '0',
      profitFactor: parsed.profitFactor != null ? String(parsed.profitFactor) : '0',
      symbols: Array.isArray(parsed.symbols) ? parsed.symbols : [],
    };

    return res.status(200).json({
      success: true,
      hasData: true,
      period: { year, month },
      uploaded_at: row.uploaded_at,
      trade_count: jsonNumber(row.trade_count, summary.tradeCount),
      summary,
      extended,
      drawdownSeries,
      trades,
      cumulativePnl,
    });
  } catch (err) {
    console.error('[reports/csv-metrics]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load CSV metrics' });
  }
};
