const nodemailer = require('nodemailer');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');
const { signToken } = require('../utils/auth');
const { enforceTrustedOrigin } = require('../utils/csrf');
const { permissionRoleFromUserRow } = require('../utils/userResponseNormalize');

// Function to create email transporter
const createEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing EMAIL_USER or EMAIL_PASS environment variables');
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_PASS.trim()
      }
    });
    return transporter;
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    return null;
  }
};

// Generate 6-digit MFA code
const generateMFACode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

async function ensureMfaTable(conn) {
  await conn.execute(`
      CREATE TABLE IF NOT EXISTS mfa_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_email (email),
        INDEX idx_expires (expires_at)
      )
    `);
}

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  if (!enforceTrustedOrigin(req, res)) return;

  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  try {
    const { action, userId, email, code } = req.body;

    // Handle send MFA code (action === 'send' or resend flag)
    if (action === 'send' || (req.body.resend && !code)) {
      if (
        !checkRateLimit(
          `mfa_send:${clientIp}`,
          RATE_LIMIT_CONFIGS.STRICT.requests,
          RATE_LIMIT_CONFIGS.STRICT.windowMs
        )
      ) {
        return res.status(429).json({
          success: false,
          message: 'Too many MFA requests. Please try again later.',
        });
      }
      if (!userId && !email) {
        return res.status(400).json({ 
          success: false, 
          message: 'User ID or email is required' 
        });
      }

      const emailLower = (email || '').toLowerCase();

      // Generate MFA code
      const mfaCode = generateMFACode();
      const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes expiration

      let db = null;
      try {
        db = await getDbConnection();
        if (!db) {
          return res.status(500).json({
            success: false,
            message: 'Database connection error. Please try again later.'
          });
        }
        await ensureMfaTable(db);
        if (userId) {
          await db.execute('DELETE FROM mfa_codes WHERE user_id = ?', [userId]);
        } else if (emailLower) {
          await db.execute('DELETE FROM mfa_codes WHERE email = ?', [emailLower]);
        }
        await db.execute(
          'INSERT INTO mfa_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
          [userId || null, emailLower, mfaCode, expiresAt]
        );
      } catch (dbError) {
        console.error('Database error storing MFA code:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Failed to store MFA code. Please try again.'
        });
      } finally {
        if (db) {
          try {
            db.release();
          } catch (e) {
            console.warn('MFA send release:', e.message);
          }
        }
      }

      // Send email
      const transporter = createEmailTransporter();
      if (!transporter) {
        return res.status(500).json({ 
          success: false, 
          message: 'Email service is not configured. Please contact support.' 
        });
      }

      const mailOptions = {
        from: `"Aura Terminal" <${process.env.EMAIL_USER.trim()}>`,
        to: emailLower,
        subject: 'Aura Terminal — Verification code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ffffff;">Aura Terminal — Sign-in verification</h2>
            <p>Your MFA verification code is:</p>
            <div style="background: #1a1a1a; color: #ffffff; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px; border: 1px solid #ffffff;">
              ${mfaCode}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`MFA code sent to ${emailLower}`);

      return res.status(200).json({ 
        success: true, 
        message: req.body.resend ? 'MFA code resent successfully' : 'MFA code sent successfully' 
      });
    }

    // Handle verify MFA code (action === 'verify' or code is provided)
    if (action === 'verify' || code) {
      if (
        !checkRateLimit(
          `mfa_verify:${clientIp}`,
          RATE_LIMIT_CONFIGS.LOW.requests,
          RATE_LIMIT_CONFIGS.LOW.windowMs
        )
      ) {
        return res.status(429).json({
          success: false,
          message: 'Too many verification attempts. Please try again later.',
        });
      }
      if (!code || (!userId && !email)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Code and user ID or email are required' 
        });
      }

      const emailLower = email ? email.toLowerCase() : null;

      let db = null;
      try {
        db = await getDbConnection();
        if (!db) {
          return res.status(500).json({
            success: false,
            message: 'Database connection error. Please try again later.'
          });
        }
        await ensureMfaTable(db);

        let query, params;
        if (userId) {
          query = 'SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? ORDER BY created_at DESC LIMIT 1';
          params = [userId, code];
        } else {
          query = 'SELECT * FROM mfa_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1';
          params = [emailLower, code];
        }

        const [rows] = await db.execute(query, params);

        if (!rows || rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Invalid MFA code'
          });
        }

        const mfaRecord = rows[0];

        if (Date.now() > mfaRecord.expires_at) {
          await db.execute('DELETE FROM mfa_codes WHERE id = ?', [mfaRecord.id]);
          return res.status(400).json({
            success: false,
            message: 'MFA code has expired. Please request a new one.'
          });
        }

        let userInfo;
        if (userId) {
          const [userRows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
          if (userRows && userRows.length > 0) {
            userInfo = userRows[0];
          }
        } else if (emailLower) {
          const [userRows] = await db.execute('SELECT * FROM users WHERE email = ?', [emailLower]);
          if (userRows && userRows.length > 0) {
            userInfo = userRows[0];
          }
        }

        await db.execute('DELETE FROM mfa_codes WHERE id = ?', [mfaRecord.id]);

        if (!userInfo) {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }

        const apiRole = permissionRoleFromUserRow(userInfo);
        const token = signToken({
          id: userInfo.id,
          email: userInfo.email,
          username: userInfo.username,
          role: apiRole
        }, '24h');

        return res.status(200).json({
          success: true,
          verified: true,
          token: token,
          id: userInfo.id,
          username: userInfo.username,
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.avatar ?? null,
          role: apiRole,
          mfaVerified: true
        });
      } catch (dbError) {
        console.error('Database error verifying MFA code:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Database error. Please try again later.'
        });
      } finally {
        if (db) {
          try {
            db.release();
          } catch (e) {
            console.warn('MFA verify release:', e.message);
          }
        }
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use action="send" or action="verify"'
    });
  } catch (error) {
    console.error('Error in mfa endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to process MFA request. Please try again later.' 
    });
  }
};

