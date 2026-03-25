/**
 * Trader Deck content API – date-scoped Market Outlook and Market Intelligence.
 * GET ?type=outlook-daily|outlook-weekly|intel-daily|intel-weekly&date=YYYY-MM-DD
 * PUT (admin) body: { type, date, payload } for outlook; intel briefs are managed via brief-upload + list.
 */

require('../utils/suppress-warnings');

const { executeQuery, addColumnIfNotExists } = require('../db');
const { verifyToken } = require('../utils/auth');

const VALID_TYPES = ['outlook-daily', 'outlook-weekly', 'intel-daily', 'intel-weekly'];
const VALID_PERIODS = ['daily', 'weekly'];

/** Normalize date to YYYY-MM-DD (accepts YYYYMMDD or YYYY-MM-DD). */
function normalizeDate(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim().replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return str.trim().slice(0, 10);
}

function getWeekEndingSunday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return dateStr;
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay(); // 0 Sunday
  const add = day === 0 ? 0 : (7 - day);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = typeof req.body === 'string' ? req.body : req.body.toString();
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function ensureTables() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_outlook (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      payload JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_date_period (date, period),
      INDEX idx_tdo_date (date)
    )
  `);
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_briefs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      file_url VARCHAR(512) DEFAULT NULL,
      mime_type VARCHAR(128) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tdb_date_period (date, period)
    )
  `);
  await addColumnIfNotExists('trader_deck_briefs', 'file_data', 'LONGBLOB DEFAULT NULL');
}

function typeToPeriod(type) {
  if (type === 'outlook-daily' || type === 'intel-daily') return 'daily';
  if (type === 'outlook-weekly' || type === 'intel-weekly') return 'weekly';
  return null;
}

function normalizeStorageDateByType(type, date) {
  const period = typeToPeriod(type);
  if (period === 'weekly') return getWeekEndingSunday(date);
  return date;
}

async function requireAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) return { ok: false, status: 401, message: 'Authentication required' };
  const [rows] = await executeQuery(
    'SELECT role FROM users WHERE id = ? LIMIT 1',
    [Number(decoded.id)]
  );
  const role = (rows[0]?.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    return { ok: false, status: 403, message: 'Admin access required' };
  }
  return { ok: true, decoded };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();
  } catch (err) {
    console.error('Trader deck content ensureTables:', err.message);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  let url;
  try {
    url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  } catch (urlErr) {
    return res.status(400).json({ success: false, message: 'Invalid request URL' });
  }
  const queryType = (url.searchParams.get('type') || '').toLowerCase();
  const queryDate = normalizeDate(url.searchParams.get('date') || '');

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const putType = (body.type || queryType || '').toLowerCase();
    const putDateRaw = normalizeDate(body.date || queryDate || '');
    if (!VALID_TYPES.includes(putType) || !/^\d{4}-\d{2}-\d{2}$/.test(putDateRaw)) {
      return res.status(400).json({ success: false, message: 'Invalid type or date. Use type=outlook-daily|outlook-weekly|intel-daily|intel-weekly and date=YYYY-MM-DD' });
    }
    const putDate = normalizeStorageDateByType(putType, putDateRaw);
    let admin;
    try {
      admin = await requireAdmin(req);
    } catch (authErr) {
      console.error('Trader deck content requireAdmin:', authErr.message);
      return res.status(500).json({ success: false, message: 'Authentication error' });
    }
    if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

    if (putType.startsWith('outlook')) {
      const payload = body.payload;
      if (payload === undefined || payload === null) {
        return res.status(400).json({ success: false, message: 'payload required' });
      }
      try {
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const putPeriod = typeToPeriod(putType);
        await executeQuery(
          `INSERT INTO trader_deck_outlook (date, period, payload) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
          [putDate, putPeriod, payloadStr]
        );
        return res.status(200).json({ success: true, date: putDate, type: putType });
      } catch (err) {
        console.error('Trader deck content PUT error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to save outlook' });
      }
    }

    if (putType.startsWith('intel')) {
      return res.status(400).json({ success: false, message: 'Use POST /api/trader-deck/brief-upload to add briefs; DELETE /api/trader-deck/brief to remove.' });
    }
    return res.status(400).json({ success: false, message: 'Invalid type' });
  }

  const type = queryType;
  const dateRaw = queryDate;
  if (!VALID_TYPES.includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return res.status(400).json({ success: false, message: 'Invalid type or date. Use type=outlook-daily|outlook-weekly|intel-daily|intel-weekly and date=YYYY-MM-DD' });
  }
  const date = normalizeStorageDateByType(type, dateRaw);

  const period = typeToPeriod(type);
  const isOutlook = type.startsWith('outlook');
  const isIntel = type.startsWith('intel');

  if (req.method === 'GET') {
    if (isOutlook) {
      const [rows] = await executeQuery(
        'SELECT payload, updated_at FROM trader_deck_outlook WHERE date = ? AND period = ? LIMIT 1',
        [date, period]
      );
      const row = rows[0];
      if (!row) return res.status(200).json({ success: true, payload: null, date, type });
      let payload = row.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = null; }
      }
      return res.status(200).json({
        success: true,
        payload,
        updatedAt: row.updated_at,
        date,
        type,
      });
    }
    if (isIntel) {
      const [rows] = await executeQuery(
        'SELECT id, title, file_url, mime_type, created_at FROM trader_deck_briefs WHERE date = ? AND period = ? ORDER BY created_at ASC',
        [date, period]
      );
      const briefs = (rows || []).map((r) => ({
        id: r.id,
        title: r.title || 'Brief',
        previewUrl: r.file_url ? null : `/api/trader-deck/brief-preview?id=${r.id}`,
        fileUrl: r.file_url || null,
        mimeType: r.mime_type || null,
        createdAt: r.created_at,
      }));
      return res.status(200).json({ success: true, briefs, date, type });
    }
    return res.status(400).json({ success: false, message: 'Invalid type' });
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
