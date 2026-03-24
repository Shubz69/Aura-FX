/**
 * Trader Deck brief delete (admin only).
 * DELETE ?id=123
 */

require('../utils/suppress-warnings');

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');

async function requireAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) return { ok: false, status: 401, message: 'Authentication required' };
  const [rows] = await executeQuery('SELECT role FROM users WHERE id = ? LIMIT 1', [Number(decoded.id)]);
  const role = (rows[0]?.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    return { ok: false, status: 403, message: 'Admin access required' };
  }
  return { ok: true };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const id = parseInt(url.searchParams.get('id'), 10);
  if (!id || id < 1) return res.status(400).json({ success: false, message: 'id required' });

  try {
    const [result] = await executeQuery('DELETE FROM trader_deck_briefs WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Brief not found' });
    return res.status(200).json({ success: true, id });
  } catch (err) {
    console.error('Trader deck brief-delete:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete' });
  }
};
