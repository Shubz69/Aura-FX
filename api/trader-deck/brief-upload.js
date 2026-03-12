/**
 * Trader Deck brief upload (admin only).
 * POST body: { date, period, title, fileBase64, fileName, mimeType }
 * File stored in trader_deck_briefs.file_data (LONGBLOB). No size limit for admins.
 * Note: Vercel/serverless may enforce request body limits (e.g. 4.5MB–50MB); increase in project settings if needed.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');

async function ensureBriefsTable() {
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
  try {
    await executeQuery(`ALTER TABLE trader_deck_briefs ADD COLUMN file_data LONGBLOB DEFAULT NULL`);
  } catch (_) { /* exists */ }
}

async function requireAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) return { ok: false, status: 401, message: 'Authentication required' };
  const [rows] = await executeQuery('SELECT role FROM users WHERE id = ? LIMIT 1', [Number(decoded.id)]);
  const role = (rows[0]?.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    return { ok: false, status: 403, message: 'Admin access required' };
  }
  return { ok: true, decoded };
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

  try {
    await ensureBriefsTable();
  } catch (err) {
    console.error('Trader deck brief-upload ensureTable:', err.message);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  const body = parseBody(req);
  const date = (body.date || '').trim().slice(0, 10);
  const period = (body.period || 'daily').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
  const title = (body.title || 'Brief').toString().trim().slice(0, 255) || 'Brief';
  const fileBase64 = body.fileBase64;
  const fileName = (body.fileName || '').toString().trim().slice(0, 255);
  const mimeType = (body.mimeType || 'application/octet-stream').toString().trim().slice(0, 128);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) required' });
  }

  let fileBuffer = null;
  if (fileBase64 && typeof fileBase64 === 'string') {
    const base64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    try {
      fileBuffer = Buffer.from(base64, 'base64');
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid base64 file data' });
    }
  }

  const fileUrl = body.fileUrl ? (body.fileUrl || '').toString().trim().slice(0, 512) : null;
  if (!fileBuffer && !fileUrl) {
    return res.status(400).json({ success: false, message: 'Provide fileBase64 (and fileName, mimeType) or fileUrl' });
  }

  try {
    const [result] = await executeQuery(
      `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data) VALUES (?, ?, ?, ?, ?, ?)`,
      [date, period, title, fileUrl || null, mimeType || null, fileBuffer || null]
    );
    const id = result.insertId;
    return res.status(200).json({ success: true, id, date, period, title });
  } catch (err) {
    console.error('Trader deck brief-upload insert:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save brief' });
  }
};
