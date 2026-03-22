/**
 * Trader Deck brief preview — authenticated users only.
 * GET ?id=123&token=JWT (token required for iframe; Authorization: Bearer also accepted)
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');

function getQuery(req) {
  try {
    const u = req.url || '';
    const path = u.split('?')[0];
    const qs = u.includes('?') ? u.slice(u.indexOf('?') + 1) : '';
    return new URLSearchParams(qs);
  } catch {
    return new URLSearchParams();
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const params = getQuery(req);
  const id = parseInt(params.get('id'), 10);
  const qToken = (params.get('token') || '').trim();
  const authHeader = req.headers.authorization || (qToken ? `Bearer ${qToken}` : null);
  const decoded = verifyToken(authHeader);

  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Sign in to preview briefs' });
  }

  if (!id || id < 1) return res.status(400).json({ success: false, message: 'id required' });

  try {
    const [rows] = await executeQuery(
      'SELECT file_data, file_url, mime_type, title FROM trader_deck_briefs WHERE id = ? LIMIT 1',
      [id],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Brief not found' });

    if (row.file_url) {
      return res.status(404).json({
        success: false,
        message: 'Linked briefs open only in the in-app viewer (not as a direct download).',
      });
    }

    const fileData = row.file_data;
    if (!fileData || !(fileData instanceof Buffer)) {
      return res.status(404).json({ success: false, message: 'No file stored for this brief' });
    }

    const mime = (row.mime_type || 'application/octet-stream').toString();
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).send(fileData);
  } catch (err) {
    console.error('Trader deck brief-preview:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
