/**
 * /api/push/subscribe — store/remove Web Push subscriptions
 * POST  { subscription, userId }  → save subscription
 * DELETE { endpoint, userId }     → remove subscription
 */

const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');
const webpush = require('web-push');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function ensureTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    )
  `);
}

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Authenticate
  let userId;
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const decoded = verifyToken(token);
    userId = decoded.id || decoded.userId;
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Configure web-push (VAPID keys required in env)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      `mailto:${process.env.EMAIL_USER || 'support@auraterminal.ai'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }

  const db = await getDbConnection();
  if (!db) {
    return res.status(500).json({ success: false, message: 'Database error' });
  }
  try {
    await ensureTable(db);

    if (req.method === 'POST') {
      const { subscription } = req.body || {};
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ success: false, message: 'Invalid subscription object' });
      }

      // Upsert: remove old entry with same endpoint, then insert
      await db.execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
      await db.execute(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
      );

      return res.status(200).json({ success: true, message: 'Subscription saved' });
    }

    if (req.method === 'DELETE') {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ success: false, message: 'Missing endpoint' });
      await db.execute('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);
      return res.status(200).json({ success: true, message: 'Subscription removed' });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (e) {
    console.error('Push subscribe error:', e.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    try {
      if (db && typeof db.release === 'function') db.release();
    } catch (_) {}
  }
};
