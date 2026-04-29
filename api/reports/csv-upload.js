/**
 * POST /api/reports/csv-upload
 * Parses MT5 CSV export and stores it for report generation / manual metrics dashboard.
 * Body: { csv: string (raw CSV text), year?: number, month?: number }
 * Premium, Elite, and Admin may upload (Elite also has Aura Analysis for live MT5 — separate).
 */
const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { effectiveReportsRole } = require('./resolveReportsRole');
const { isSuperAdminEmail } = require('../utils/entitlements');
const {
  buildStoredCsvPayload,
  isPeriodAfterCurrentMonth,
} = require('./csvTradeSummary');

/** Delimiters tried when locating the header row (PDF tools often emit TSV). */
const HEADER_DELIMITERS = [',', ';', '\t', '|'];

/**
 * Prefer semicolon when MT5 exports use EU locale (columns separated by ;).
 * Used only as a hint when header detection did not pick a delimiter (legacy path).
 */
function detectDelimiter(headerLine) {
  if (!headerLine || typeof headerLine !== 'string') return ',';
  const commaCols = headerLine.split(',').length;
  const semiCols = headerLine.split(';').length;
  const tabCols = headerLine.split('\t').length;
  if (tabCols > Math.max(commaCols, semiCols)) return '\t';
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
  return splitCsvLine(line, delimiter);
}

/** Split one CSV/TSV line respecting double quotes (MT5 + many PDF converters). */
function splitCsvLine(line, delimiter) {
  if (line == null || typeof line !== 'string') return [];
  const d = delimiter === '\t' ? '\t' : delimiter;
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && d !== '' && line.substring(i, i + d.length) === d) {
      out.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
      i += d.length - 1;
      continue;
    }
    cur += c;
  }
  out.push(cur.trim().replace(/^"|"$/g, ''));
  return out;
}

/** Strip UTF-8 BOM so the first column is not corrupted. */
function stripBom(s) {
  if (!s || typeof s !== 'string') return s;
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  // UTF-8 BOM as raw bytes mis-decoded, or UTF-16 LE BOM appearing as replacement characters in some pipelines
  if (s.charCodeAt(0) === 0xfffe) return s.slice(1);
  return s;
}

function normalizeHeaderCellForMatch(cell) {
  return String(cell || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTimeLikeHeader(n) {
  if (!n) return false;
  if (n === 'time' || n === 'date') return true;
  if (n.includes('date/time') || n.includes('date time')) return true;
  if (n.includes('time') && !n.includes('timeout') && !n.includes('lifetime')) return true;
  if (n.includes('datum') || n.includes('zeit')) return true;
  return false;
}

function isSymbolLikeHeader(n) {
  if (!n) return false;
  if (
    n === 'symbol' ||
    n === 'sym' ||
    n === 'pair' ||
    n === 'instrument' ||
    n === 'item' ||
    n === 'ticker' ||
    n === 'forex' ||
    n === 'security' ||
    n === 'asset' ||
    n === 'product'
  ) {
    return true;
  }
  if (n.includes('symbol')) return true;
  if (n.includes('währung') || n.includes('wahrung')) return true;
  if ((n.endsWith('pair') || n.includes(' pair')) && n.length <= 24) return true;
  return false;
}

function isProfitLikeHeader(n) {
  if (!n) return false;
  if (n.includes('profit')) return true;
  if (n.includes('gewinn') || n.includes('beneficio') || n.includes('profitto')) return true;
  if (n.includes('commission')) return true;
  if (n === 'pnl' || n === 'pl' || n.includes('nett') || n.includes('net p')) return true;
  if (/\bp\s*[\/\\&]\s*l\b/.test(n) || n.includes('p/l') || n.includes('p&l')) return true;
  if (n.includes('closed') && (n.includes('pl') || n.includes('pnl') || n.includes('profit'))) return true;
  return false;
}

function scoreHeaderCells(cells) {
  const norms = cells.map((c) => normalizeHeaderCellForMatch(c));
  let hasT = 0;
  let hasS = 0;
  let hasP = 0;
  for (const n of norms) {
    if (isTimeLikeHeader(n)) hasT = 1;
    if (isSymbolLikeHeader(n)) hasS = 1;
    if (isProfitLikeHeader(n)) hasP = 1;
  }
  return hasT + hasS + hasP;
}

/**
 * Find header row + delimiter. PDF-to-CSV tools often use tabs, "P/L" instead of "Profit", or "Sym" headers.
 */
function findHeaderRowAndDelimiter(lines) {
  const maxScan = Math.min(lines.length, 120);
  let best = null;
  for (let i = 0; i < maxScan; i++) {
    const line = lines[i];
    if (!line || line.length < 4) continue;
    for (const delim of HEADER_DELIMITERS) {
      const cells = splitCsvLine(line, delim);
      if (cells.length < 3) continue;
      const sc = scoreHeaderCells(cells);
      if (sc >= 3) {
        const weight = sc * 100 + cells.length;
        if (!best || weight > best.weight) best = { idx: i, delim, weight };
      }
    }
  }
  return best;
}

/**
 * Legacy line scan: whole-line substring match (older MT5 reports).
 */
function findHeaderRowIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      (lower.includes('symbol') || lower.includes('instrument')) &&
      lower.includes('time') &&
      (lower.includes('profit') || lower.includes('commission') || lower.includes('p/l'))
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
      .replace(/_+/g, '_')
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

  let headerIdx = -1;
  let delimiter = ',';
  const scored = findHeaderRowAndDelimiter(lines);
  if (scored) {
    headerIdx = scored.idx;
    delimiter = scored.delim;
  } else {
    headerIdx = findHeaderRowIndex(lines);
    if (headerIdx >= 0) delimiter = detectDelimiter(lines[headerIdx]);
  }
  if (headerIdx < 0) {
    throw new Error(
      'Could not find a valid MT5 header row (expected columns like Time, Symbol, Profit). Export from MT5 as Report / CSV or remove extra rows above the table.'
    );
  }

  const headerLine = lines[headerIdx];
  const rawHeaderCells = splitRow(headerLine, delimiter).map((h) => h.trim());
  const header = normalizeHeaderNames(rawHeaderCells);
  const trades = [];

  function profitFromRow(row) {
    const direct = row.net_profit ?? row.profit ?? row.pnl ?? row.p_l ?? row.pl ?? row.net_p_l;
    if (direct !== undefined && direct !== '') return parseMoneyish(direct);
    for (const [k, v] of Object.entries(row)) {
      const nk = String(k).toLowerCase().replace(/_+/g, '_');
      if (nk.includes('commission') || nk.includes('swap') || nk.includes('balance')) continue;
      if ((nk.includes('profit') || nk.includes('gewinn')) && !nk.includes('factor')) return parseMoneyish(v);
      if (nk === 'pnl' || nk === 'pl' || nk === 'p_l' || /\bp_l\b/.test(nk) || nk.endsWith('_p_l')) {
        return parseMoneyish(v);
      }
    }
    return 0;
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], delimiter);
    if (cols.length < 2) continue;
    const row = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });

    // Normalise to a common shape
    const profit = profitFromRow(row);
    const symbol =
      row.symbol ||
      row.pair ||
      row.instrument ||
      row.item ||
      row.ticker ||
      row.sym ||
      row.asset ||
      row.product ||
      '';
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

    if (!isSuperAdminEmail(user) && (role === 'free' || role === 'access')) {
      return res.status(403).json({ success: false, code: 'FREE_PLAN', message: 'CSV upload requires a Pro plan.' });
    }

    const now = new Date();
    const bodyYear = Number(req.body?.year);
    const bodyMonth = Number(req.body?.month);
    const year = Number.isFinite(bodyYear) ? bodyYear : now.getFullYear();
    const month = Number.isFinite(bodyMonth) ? bodyMonth : now.getMonth() + 1;

    // DELETE: remove existing CSV for selected period, or latest upload if period omitted.
    if (req.method === 'DELETE') {
      if (Number.isFinite(bodyYear) && Number.isFinite(bodyMonth)) {
        await executeQuery(
          'DELETE FROM report_csv_uploads WHERE user_id = ? AND period_year = ? AND period_month = ?',
          [userId, year, month]
        );
      } else {
        await executeQuery(
          `DELETE FROM report_csv_uploads
           WHERE id = (
             SELECT id FROM (
               SELECT id FROM report_csv_uploads WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1
             ) t
           )`,
          [userId]
        );
      }
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
