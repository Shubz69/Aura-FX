/**
 * POST /api/reports/csv-upload
 * Parses MT5 CSV export and stores it for report generation / manual metrics dashboard.
 * Body: { csv: string (raw CSV text), year: number, month: number }
 * Premium, Elite, and Admin may upload (Elite also has Aura Analysis for live MT5 — separate).
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { effectiveReportsRole } = require('./resolveReportsRole');

/**
 * Prefer semicolon when MT5 exports use EU locale (columns separated by ;).
 */
function detectDelimiter(headerLine) {
  if (!headerLine || typeof headerLine !== 'string') return ',';
  const commaCols = headerLine.split(',').length;
  const semiCols = headerLine.split(';').length;
  if (semiCols > commaCols) return ';';
  if (semiCols === commaCols && headerLine.includes(';') && !headerLine.includes(',')) return ';';
  return ',';
}

/** Parse numeric cells from MT5 (handles comma as decimal when semicolon-delimited EU export). */
function parseMoneyish(raw) {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim().replace(/\s/g, '');
  if (!s) return 0;
  // 1.234,56 or 12.345,67
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // 123,45
  if (/^-?\d+,\d+$/.test(s)) {
    return parseFloat(s.replace(',', '.')) || 0;
  }
  return parseFloat(s) || 0;
}

function splitRow(line, delimiter) {
  return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
}

/**
 * Parse an MT5 trade history CSV.
 * MT5 exports typically have columns like:
 * Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Swap,Profit,Balance,Comment
 * (comma-separated) or the same with semicolons in EU locales.
 */
function parseMT5CSV(csvText) {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const delimiter = detectDelimiter(lines[0]);
  const header = splitRow(lines[0], delimiter).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const trades = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], delimiter);
    if (cols.length < 2) continue;
    const row = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });

    // Normalise to a common shape
    const profit = parseMoneyish(row.profit || row.pnl || row.net_profit || 0);
    const symbol = row.symbol || row.pair || row.instrument || '';
    const type = (row.type || row.direction || '').toLowerCase();
    const volume = parseMoneyish(row.volume || row.lots || row.size || 0);
    const time = row.time || row.open_time || row.date || '';
    const commission = parseMoneyish(row.commission || 0);
    const swap = parseMoneyish(row.swap || 0);

    if (!symbol && profit === 0) continue; // skip blank rows

    trades.push({ symbol, type, volume, profit, commission, swap, time });
  }

  if (!trades.length) throw new Error('No valid trade rows found in CSV');

  // Compute summary
  const wins = trades.filter(t => t.profit > 0).length;
  const losses = trades.filter(t => t.profit < 0).length;
  const totalPnl = trades.reduce((s, t) => s + t.profit, 0);
  const grossProfit = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : wins > 0 ? '∞' : '0';

  const symbols = [...new Set(trades.map(t => t.symbol).filter(Boolean))];

  return {
    tradeCount: trades.length,
    wins,
    losses,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    totalPnl: totalPnl.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    grossLoss: grossLoss.toFixed(2),
    profitFactor,
    symbols: symbols.slice(0, 10),
    trades: trades.slice(0, 200), // cap for storage
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = decoded.id;

  try {
    const user = await applyScheduledDowngrade(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const role = effectiveReportsRole(user);

    if (role === 'free') {
      return res.status(403).json({ success: false, code: 'FREE_PLAN', message: 'CSV upload requires a Premium plan.' });
    }

    const { year, month } = req.body || {};

    // DELETE: remove existing CSV for period
    if (req.method === 'DELETE') {
      await executeQuery(
        'DELETE FROM report_csv_uploads WHERE user_id = ? AND period_year = ? AND period_month = ?',
        [userId, year, month]
      );
      return res.status(200).json({ success: true });
    }

    const { csv } = req.body || {};
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ success: false, message: 'csv (string) is required' });
    }
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: 'year and month (1–12) are required' });
    }
    if (csv.length > 5_000_000) {
      return res.status(400).json({ success: false, message: 'CSV too large (max 5MB)' });
    }

    const parsed = parseMT5CSV(csv);

    await executeQuery(
      `INSERT INTO report_csv_uploads (user_id, period_year, period_month, filename, trade_count, upload_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE trade_count = VALUES(trade_count), upload_json = VALUES(upload_json), uploaded_at = NOW()`,
      [userId, year, month, `mt5_${year}_${month}.csv`, parsed.tradeCount, JSON.stringify(parsed)]
    );

    return res.status(200).json({
      success: true,
      summary: {
        tradeCount: parsed.tradeCount,
        winRate: parsed.winRate,
        totalPnl: parsed.totalPnl,
        profitFactor: parsed.profitFactor,
        symbols: parsed.symbols,
      },
    });
  } catch (err) {
    console.error('[reports/csv-upload]', err.message);
    if (
      err.message.includes('No valid') ||
      err.message.includes('no data') ||
      err.message.includes('CSV has no data')
    ) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'CSV processing failed. Please check the file format.' });
  }
};

/** Exposed for unit / smoke tests of parsing only */
module.exports.parseMT5CSV = parseMT5CSV;
