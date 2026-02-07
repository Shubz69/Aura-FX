/**
 * Phone verification for signup - Twilio only.
 * Sends SMS via Twilio, verifies code from DB.
 */
const mysql = require('mysql2/promise');
require('../utils/suppress-warnings');

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }
  try {
    const config = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
    const conn = await mysql.createConnection(config);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS phone_verification_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_phone (phone),
        INDEX idx_expires (expires_at)
      )
    `);
    return conn;
  } catch (e) {
    console.error('Phone verification DB error:', e.message);
    return null;
  }
};

const normalizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ success: false, message: 'Invalid JSON' }); }
    }
    const { action, phone, code } = body;

    const twilioOk = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER;
    if (!twilioOk) {
      return res.status(503).json({
        success: false,
        message: 'Phone verification requires Twilio. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in Vercel.'
      });
    }

    if (action === 'send' || !action) {
      const raw = (phone || '').toString().trim();
      if (!raw || raw.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ success: false, message: 'Valid phone number is required' });
      }
      const phoneE164 = normalizePhone(raw);

      const verificationCode = generateCode();
      const expiresAt = Date.now() + (10 * 60 * 1000);

      const db = await getDbConnection();
      if (db) {
        try {
          await db.execute('DELETE FROM phone_verification_codes WHERE phone = ?', [phoneE164]);
          await db.execute(
            'INSERT INTO phone_verification_codes (phone, code, expires_at) VALUES (?, ?, ?)',
            [phoneE164, verificationCode, expiresAt]
          );
          await db.end();
        } catch (e) {
          console.error('Phone verification DB error:', e.message);
          await db.end();
        }
      }

      try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your AURA FX verification code is: ${verificationCode}. Valid for 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneE164
        });
      } catch (twilioErr) {
        console.error('Twilio SMS error:', twilioErr.message);
        const code = twilioErr.code || twilioErr.status || 0;
        const msg = (twilioErr.message || '').toLowerCase();
        if (code === 21608 || msg.includes('unverified') || msg.includes('trial')) {
          return res.status(400).json({
            success: false,
            message: 'Twilio trial: verify this number at twilio.com/console/phone-numbers/verified or upgrade your account.'
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to send SMS. Please check your phone number and try again.'
        });
      }

      return res.status(200).json({ success: true, message: 'Verification code sent' });
    }

    if (action === 'verify') {
      const raw = (phone || '').toString().trim();
      const codeTrimmed = (code || '').toString().trim();
      if (!raw || !codeTrimmed) {
        return res.status(400).json({ success: false, message: 'Phone and code are required' });
      }
      const phoneE164 = normalizePhone(raw);

      const db = await getDbConnection();
      if (!db) return res.status(500).json({ success: false, message: 'Database error' });

      try {
        const [rows] = await db.execute(
          'SELECT * FROM phone_verification_codes WHERE phone = ? AND code = ? ORDER BY created_at DESC LIMIT 1',
          [phoneE164, codeTrimmed]
        );
        if (!rows || rows.length === 0) {
          await db.end();
          return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        }
        const rec = rows[0];
        if (Date.now() > parseInt(rec.expires_at)) {
          await db.execute('DELETE FROM phone_verification_codes WHERE phone = ?', [phoneE164]);
          await db.end();
          return res.status(400).json({ success: false, message: 'Verification code has expired' });
        }
        await db.execute('DELETE FROM phone_verification_codes WHERE phone = ? AND code = ?', [phoneE164, codeTrimmed]);
        await db.end();
        return res.status(200).json({ success: true, verified: true });
      } catch (e) {
        if (db) await db.end();
        return res.status(500).json({ success: false, message: 'Verification failed' });
      }
    }

    return res.status(400).json({ success: false, message: 'Invalid action' });
  } catch (err) {
    console.error('Phone verification error:', err);
    return res.status(500).json({ success: false, message: 'An error occurred' });
  }
};
