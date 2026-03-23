/**
 * Trial Expiry Auto-Downgrade
 * Called by a cron job or manually: checks for expired subscriptions,
 * downgrades users to 'free', and sends notification emails.
 */

const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');

const createTransporter = () => {
  const nodemailer = require('nodemailer');
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  try {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
  } catch { return null; }
};

const sendExpiryEmail = async (email, username) => {
  const transporter = createTransporter();
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.CONTACT_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Your AURA TERMINAL subscription has expired',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;">
          <h2 style="color:#a78bfa;margin-bottom:16px;">Subscription Expired</h2>
          <p>Hi ${username || 'Trader'},</p>
          <p>Your AURA TERMINAL subscription has expired. Your account has been downgraded to the <strong>Free</strong> plan.</p>
          <p>You will retain access to free features. To restore full access, renew your subscription at any time.</p>
          <a href="${process.env.FRONTEND_URL || 'https://auraterminal.ai'}/subscription"
             style="display:inline-block;margin-top:20px;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
            Renew Subscription
          </a>
          <p style="margin-top:24px;font-size:0.85rem;color:#64748b;">
            AURA TERMINAL — Professional Trading Education
          </p>
        </div>
      `
    });
  } catch (e) {
    console.warn('Failed to send expiry email to', email, ':', e.message);
  }
};

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: accept either admin JWT or a shared cron secret header
  const cronSecret = req.headers['x-cron-secret'];
  const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isValidCron) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    try {
      const decoded = verifyToken(token);
      const role = (decoded?.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  }

  const db = await getDbConnection();
  if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });

  const release = () => { try { if (db?.release) db.release(); else if (db?.end) db.end(); } catch (_) {} };

  try {
    // Ensure columns exist
    try { await db.execute('SELECT subscription_expiry FROM users LIMIT 1'); } catch {
      await db.execute('ALTER TABLE users ADD COLUMN subscription_expiry DATETIME DEFAULT NULL');
    }
    try { await db.execute('SELECT subscription_status FROM users LIMIT 1'); } catch {
      await db.execute('ALTER TABLE users ADD COLUMN subscription_status VARCHAR(50) DEFAULT NULL');
    }

    // Find expired users: role is premium/elite/a7fx AND subscription_expiry has passed
    const [expiredUsers] = await db.execute(`
      SELECT id, email, username, name, role, subscription_expiry
      FROM users
      WHERE subscription_expiry IS NOT NULL
        AND subscription_expiry < NOW()
        AND role IN ('premium', 'elite', 'a7fx')
        AND (is_demo IS NULL OR is_demo = FALSE)
    `);

    if (expiredUsers.length === 0) {
      release();
      return res.status(200).json({ success: true, message: 'No expired subscriptions found', downgraded: 0 });
    }

    let downgradedCount = 0;
    const downgradedUsers = [];

    for (const u of expiredUsers) {
      try {
        await db.execute(
          `UPDATE users SET role = 'free', subscription_status = 'expired' WHERE id = ?`,
          [u.id]
        );
        downgradedCount++;
        downgradedUsers.push({ id: u.id, email: u.email, previousRole: u.role });
        // Send notification email (non-blocking)
        sendExpiryEmail(u.email, u.username || u.name).catch(() => {});
      } catch (e) {
        console.warn('Failed to downgrade user', u.id, ':', e.message);
      }
    }

    console.log(`Trial expiry: downgraded ${downgradedCount} users to free.`);
    release();

    return res.status(200).json({
      success: true,
      message: `Downgraded ${downgradedCount} expired subscription(s) to free.`,
      downgraded: downgradedCount,
      users: downgradedUsers
    });
  } catch (e) {
    console.error('Trial expiry error:', e);
    release();
    return res.status(500).json({ success: false, message: 'Internal server error', error: e.message });
  }
};
