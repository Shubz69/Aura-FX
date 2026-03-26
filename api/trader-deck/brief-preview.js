/**
 * Trader Deck brief preview – serve file with Content-Disposition: inline (view only, no download link in UI).
 * GET ?id=123
 */

const { executeQuery } = require('../db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const id = parseInt(url.searchParams.get('id'), 10);
  if (!id || id < 1) return res.status(400).json({ success: false, message: 'id required' });

  try {
    const [rows] = await executeQuery(
      'SELECT file_data, file_url, mime_type, title FROM trader_deck_briefs WHERE id = ? LIMIT 1',
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Brief not found' });

    if (row.file_url) {
      res.setHeader('Location', row.file_url);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(302).end();
    }

    const fileData = row.file_data;
    if (!fileData || !(fileData instanceof Buffer)) {
      return res.status(404).json({ success: false, message: 'No file stored for this brief' });
    }

    const mime = (row.mime_type || 'application/octet-stream').toString();
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(fileData);
  } catch (err) {
    console.error('Trader deck brief-preview:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
