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
      trades,
      cumulativePnl,
    });
  } catch (err) {
    console.error('[reports/csv-metrics]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load CSV metrics' });
  }
};
