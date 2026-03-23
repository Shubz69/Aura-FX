/**
 * GET/POST /api/community/channel-push-preference
 * Opt-in per-channel Web Push for new messages (throttled server-side in messages.js).
 */

const { getDbConnection, executeQuery } = require('../db');

function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const padded = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS channel_push_prefs (
      user_id INT NOT NULL,
      channel_id VARCHAR(191) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      last_push_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, channel_id),
      INDEX idx_channel_throttle (channel_id, last_push_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tableReady = true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = decodeToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = decoded.id;

  try {
    await ensureTable();
  } catch (e) {
    console.error('[channel-push-preference] ensure table:', e.message);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  let db;
  try {
    db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database unavailable' });
    }

    if (req.method === 'GET') {
      const channelId = req.query.channelId || req.query.channel_id;
      if (!channelId) {
        return res.status(400).json({ success: false, message: 'channelId required' });
      }
      const [rows] = await db.execute(
        'SELECT enabled FROM channel_push_prefs WHERE user_id = ? AND channel_id = ? LIMIT 1',
        [userId, String(channelId)]
      );
      const row = rows && rows[0];
      const enabled = row && (row.enabled === 1 || row.enabled === true);
      return res.status(200).json({ success: true, enabled: !!enabled });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body || '{}');
        } catch {
          body = {};
        }
      }
      const channelId = body.channelId || body.channel_id;
      const enabled = Boolean(body.enabled);
      if (channelId === undefined || channelId === null || channelId === '') {
        return res.status(400).json({ success: false, message: 'channelId required' });
      }
      const cid = String(channelId);
      await db.execute(
        `INSERT INTO channel_push_prefs (user_id, channel_id, enabled, last_push_at)
         VALUES (?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
        [userId, cid, enabled ? 1 : 0]
      );
      return res.status(200).json({ success: true, enabled });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('[channel-push-preference]', err);
    return res.status(500).json({ success: false, message: 'Request failed' });
  } finally {
    try {
      if (db && typeof db.release === 'function') db.release();
    } catch (_) { /* ignore */ }
  }
};
