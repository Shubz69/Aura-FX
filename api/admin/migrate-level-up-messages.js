/**
 * One-time migration: move level-up messages from announcements to levels channel.
 * POST /api/admin/migrate-level-up-messages (admin only).
 */
const { getDbConnection } = require('../db');
require('../utils/suppress-warnings');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const db = await getDbConnection();
    if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });

    try {
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        if (db.end) await db.end(); else if (db.release) db.release();
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
      const payloadBase64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = payloadBase64.length % 4;
      const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
      const decoded = JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));

      const [adminCheck] = await db.execute('SELECT role, email FROM users WHERE id = ?', [decoded.id]);
      if (adminCheck.length === 0 ||
          (adminCheck[0].role !== 'admin' && adminCheck[0].role !== 'super_admin' && adminCheck[0].email !== 'shubzfx@gmail.com')) {
        if (db.end) await db.end(); else if (db.release) db.release();
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }

      // Move messages that look like level-up from announcements to levels
      const [result] = await db.execute(
        `UPDATE messages SET channel_id = 'levels' 
         WHERE channel_id = 'announcements' 
         AND (content LIKE '%LEVEL UP%' OR content LIKE '%Level up%' OR content LIKE '%has reached Level%')`
      );

      const affected = result.affectedRows != null ? result.affectedRows : 0;
      if (db.end) await db.end(); else if (db.release) db.release();

      return res.status(200).json({
        success: true,
        message: `Moved ${affected} level-up message(s) from announcements to levels`,
        moved: affected
      });
    } catch (dbErr) {
      if (db && (db.end || db.release)) {
        if (db.end) await db.end().catch(() => {}); else db.release();
      }
      throw dbErr;
    }
  } catch (error) {
    console.error('migrate-level-up-messages error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Migration failed' });
  }
};
