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
const {
  buildStoredCsvPayload,
  isPeriodAfterCurrentMonth,
} = require('./csvTradeSummary');

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

/** Strip UTF-8 BOM so the first column is not corrupted. */
function stripBom(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * MT5 "Save as Report" CSVs often have a multi-line preamble; the real header contains Symbol, Time, Profit/Commission.
 */
function findHeaderRowIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.includes('symbol') &&
      lower.includes('time') &&
      (lower.includes('profit') || lower.includes('commission'))
    ) {
      return i;
    }
  }
  return -1;
}

/** Duplicate column names (e.g. Time/Price twice in positions report) become time, time_2, price, price_2 */
function normalizeHeaderNames(rawNames) {
  const counts = {};
  return rawNames.map((raw) => {
    let base = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!base) base = 'col';
    counts[base] = (counts[base] || 0) + 1;
    const n = counts[base];
    return n === 1 ? base : `${base}_${n}`;
  });
}

/**
 * Parse an MT5 trade history CSV.
 * MT5 exports typically have columns like:
 * Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Swap,Profit,Balance,Comment
 * (comma-separated) or the same with semicolons in EU locales.
 * Report History files may include a title block; the header row is auto-detected.
 */
function parseMT5CSV(csvText) {
  const raw = stripBom(String(csvText));
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const headerIdx = findHeaderRowIndex(lines);
  if (headerIdx < 0) {
    throw new Error(
      'Could not find a valid MT5 header row (expected columns like Time, Symbol, Profit). Export from MT5 as Report / CSV or remove extra rows above the table.'
    );
  }

  const headerLine = lines[headerIdx];
  const delimiter = detectDelimiter(headerLine);
  const rawHeaderCells = splitRow(headerLine, delimiter).map((h) => h.trim());
  const header = normalizeHeaderNames(rawHeaderCells);
  const trades = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
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

  /** Full row list; storage + summary are applied in buildStoredCsvPayload (same slice = consistent KPIs). */
  return { trades };
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
    const y = Number(year);
    const m = Number(month);
    if (isPeriodAfterCurrentMonth(y, m)) {
      return res.status(400).json({
        success: false,
        code: 'FUTURE_PERIOD',
        message:
          'Upload is for closed months only. Choose the calendar month you are reporting (not a future month).',
      });
    }
    if (csv.length > 5_000_000) {
      return res.status(400).json({ success: false, message: 'CSV too large (max 5MB)' });
    }

    const { trades: allTrades } = parseMT5CSV(csv);
    const parsed = buildStoredCsvPayload(allTrades);

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
        truncated: parsed.truncated,
        sourceTradeCount: parsed.sourceTradeCount,
      },
    });
  } catch (err) {
    console.error('[reports/csv-upload]', err.message);
    if (
      err.message.includes('No valid') ||
      err.message.includes('no data') ||
      err.message.includes('CSV has no data') ||
      err.message.includes('Could not find a valid MT5 header')
    ) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'CSV processing failed. Please check the file format.' });
  }
};

/** Exposed for unit / smoke tests of parsing only */
module.exports.parseMT5CSV = parseMT5CSV;
