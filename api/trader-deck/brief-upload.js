/**
 * Trader Deck brief upload (admin only).
 *
 * Single POST: { date, period, title, fileBase64, fileName, mimeType } — keep payload under ~4.5MB (Vercel body limit).
 *
 * Chunked (large files):
 *   1) { action: 'chunk', token, chunkIndex, totalChunks, chunkBase64 }
 *   2) { action: 'finalize', token, date, period, title, fileName, mimeType, totalChunks }
 */

require('../utils/suppress-warnings');

const { executeQuery, addColumnIfNotExists } = require('../db');
const { isInstitutionalBriefKind, isDeskAutomationCategoryKind } = require('./deskBriefKinds');
const { verifyToken } = require('../utils/auth');

async function ensureChunkBufferTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_brief_chunks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(64) NOT NULL,
      chunk_index INT NOT NULL,
      user_id INT NOT NULL,
      chunk_data LONGBLOB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_token_idx (token, chunk_index),
      KEY idx_token (token),
      KEY idx_created (created_at)
    )
  `);
}

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
  await addColumnIfNotExists('trader_deck_briefs', 'file_data', 'LONGBLOB DEFAULT NULL');
  await addColumnIfNotExists('trader_deck_briefs', 'brief_kind', "VARCHAR(40) NOT NULL DEFAULT 'general'");
  await addColumnIfNotExists('trader_deck_briefs', 'brief_version', 'INT NOT NULL DEFAULT 1');
}

function normalizeUploadedBriefKind(raw) {
  const k = String(raw || '').toLowerCase().trim();
  if (isDeskAutomationCategoryKind(k) || isInstitutionalBriefKind(k)) return k;
  return 'stocks';
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
    await ensureChunkBufferTable();
  } catch (err) {
    console.error('Trader deck brief-upload ensureTable:', err.message);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  const body = parseBody(req);
  const userId = Number(admin.decoded.id);

  /* ── Chunked upload (bypasses per-request body size limit) ── */
  if (body.action === 'chunk') {
    const token = (body.token || '').toString().trim().slice(0, 64);
    const chunkIndex = Number(body.chunkIndex);
    const totalChunks = Number(body.totalChunks);
    const chunkBase64 = body.chunkBase64;
    if (!token || !Number.isFinite(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({ success: false, message: 'Invalid chunk request' });
    }
    if (!Number.isFinite(totalChunks) || totalChunks < 1 || totalChunks > 500) {
      return res.status(400).json({ success: false, message: 'Invalid totalChunks' });
    }
    if (!chunkBase64 || typeof chunkBase64 !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing chunk data' });
    }
    const base64 = chunkBase64.replace(/^data:[^;]+;base64,/, '');
    let buf;
    try {
      buf = Buffer.from(base64, 'base64');
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid base64 chunk' });
    }
    if (buf.length === 0) {
      return res.status(400).json({ success: false, message: 'Empty chunk' });
    }
    try {
      await executeQuery(
        `INSERT INTO trader_deck_brief_chunks (token, chunk_index, user_id, chunk_data) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE chunk_data = VALUES(chunk_data), user_id = VALUES(user_id)`,
        [token, chunkIndex, userId, buf]
      );
      await executeQuery(`DELETE FROM trader_deck_brief_chunks WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 HOUR)`).catch(() => {});
      return res.status(200).json({ success: true, chunkIndex, totalChunks });
    } catch (err) {
      console.error('Trader deck brief-upload chunk:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to store chunk' });
    }
  }

  if (body.action === 'finalize') {
    const token = (body.token || '').toString().trim().slice(0, 64);
    const totalChunks = Number(body.totalChunks);
    const date = (body.date || '').trim().slice(0, 10);
    const period = (body.period || 'daily').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
    const title = (body.title || 'Brief').toString().trim().slice(0, 255) || 'Brief';
    const briefKind = normalizeUploadedBriefKind(body.briefKind);
    const fileName = (body.fileName || '').toString().trim().slice(0, 255);
    const mimeType = (body.mimeType || 'application/octet-stream').toString().trim().slice(0, 128);
    if (!token) {
      return res.status(400).json({ success: false, message: 'Missing token' });
    }
    if (!Number.isFinite(totalChunks) || totalChunks < 1) {
      return res.status(400).json({ success: false, message: 'Invalid totalChunks' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) required' });
    }
    try {
      const [rows] = await executeQuery(
        `SELECT chunk_index, chunk_data, user_id FROM trader_deck_brief_chunks WHERE token = ? ORDER BY chunk_index ASC`,
        [token]
      );
      if (!rows || rows.length !== totalChunks) {
        return res.status(400).json({
          success: false,
          message: `Expected ${totalChunks} chunk(s), found ${rows?.length || 0}. Retry the upload.`,
        });
      }
      for (let i = 0; i < rows.length; i++) {
        if (Number(rows[i].chunk_index) !== i) {
          return res.status(400).json({ success: false, message: 'Chunk sequence error — retry upload.' });
        }
        if (Number(rows[i].user_id) !== userId) {
          return res.status(403).json({ success: false, message: 'Chunk ownership mismatch' });
        }
      }
      const fileBuffer = Buffer.concat(rows.map((r) => r.chunk_data));
      const [result] = await executeQuery(
        `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [date, period, title, null, mimeType || null, fileBuffer, briefKind]
      );
      await executeQuery(`DELETE FROM trader_deck_brief_chunks WHERE token = ?`, [token]);
      const id = result.insertId;
      return res.status(200).json({ success: true, id, date, period, title });
    } catch (err) {
      console.error('Trader deck brief-upload finalize:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to finalize upload' });
    }
  }

  const date = (body.date || '').trim().slice(0, 10);
  const period = (body.period || 'daily').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
  const title = (body.title || 'Brief').toString().trim().slice(0, 255) || 'Brief';
  const briefKind = normalizeUploadedBriefKind(body.briefKind);
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
      `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [date, period, title, fileUrl || null, mimeType || null, fileBuffer || null, briefKind]
    );
    const id = result.insertId;
    return res.status(200).json({ success: true, id, date, period, title });
  } catch (err) {
    console.error('Trader deck brief-upload insert:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save brief' });
  }
};
