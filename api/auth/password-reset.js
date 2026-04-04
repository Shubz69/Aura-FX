// Combined password reset endpoint - handles forgot-password, verify code, and reset password
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');
const { signToken, getJwtSecret } = require('../utils/auth');
const { enforceTrustedOrigin } = require('../utils/csrf');

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

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

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
  if (
    !checkRateLimit(
      `password_reset:${clientIp}`,
      RATE_LIMIT_CONFIGS.STRICT.requests,
      RATE_LIMIT_CONFIGS.STRICT.windowMs
    )
  ) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  }

  try {
    const { action, email, code, token, newPassword } = req.body;

    // Handle forgot-password (send reset code) - action='forgot' or no action/code provided
    if (action === 'forgot' || (!action && !code && !token && email && !newPassword)) {
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const emailLower = String(email).trim().toLowerCase();

      let db = null;
      try {
        db = await getDbConnection();
        if (!db) {
          console.error('Failed to establish database connection for password reset');
          return res.status(500).json({
            success: false,
            message: 'Database connection error. Please try again later.'
          });
        }

        const [userRows] = await db.execute(
          'SELECT id, email, username FROM users WHERE LOWER(TRIM(COALESCE(email, \'\'))) = ? LIMIT 1',
          [emailLower],
        );

        if (!userRows || userRows.length === 0) {
          return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset code has been sent.'
          });
        }

        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + (10 * 60 * 1000);

        await db.execute(`
          CREATE TABLE IF NOT EXISTS reset_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            email VARCHAR(255) NOT NULL,
            code VARCHAR(10) NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            used BOOLEAN DEFAULT FALSE,
            INDEX idx_user_id (user_id),
            INDEX idx_email (email),
            INDEX idx_code (code),
            INDEX idx_expires (expires_at)
          )
        `);

        await db.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);
        await db.execute(
          'INSERT INTO reset_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
          [userRows[0].id, emailLower, resetCode, expiresAt]
        );

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
          subject: 'Aura Terminal — Password reset code',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ffffff;">Aura Terminal — Password reset</h2>
              <p>You requested to reset your password. Your reset code is:</p>
              <div style="background: #1a1a1a; color: #ffffff; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px; border: 1px solid #ffffff;">
                ${resetCode}
              </div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you did not request this code, please ignore this email.</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Password reset code sent to ${emailLower}`);

        return res.status(200).json({
          success: true,
          message: 'If an account with that email exists, a password reset code has been sent.'
        });
      } catch (err) {
        console.error('Error in forgot-password:', err.message || err);
        return res.status(500).json({
          success: false,
          message: 'Failed to send reset email. Please try again later.',
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      } finally {
        if (db) {
          try {
            db.release();
          } catch (e) {
            console.warn('Error releasing DB connection:', e.message);
          }
        }
      }

    }

    // Handle verify code action
    if (action === 'verify' || (code && !token)) {
      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message: 'Email and code are required'
        });
      }

      const emailLower = String(email).trim().toLowerCase();
      let dbVerify = null;
      try {
        dbVerify = await getDbConnection();

        if (!dbVerify) {
          return res.status(500).json({
            success: false,
            message: 'Database not configured. Please contact support.'
          });
        }

        const [rows] = await dbVerify.execute(
          'SELECT * FROM reset_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1',
          [emailLower, code]
        );

        if (rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Invalid code'
          });
        }

        const stored = rows[0];

        if (Date.now() > stored.expires_at) {
          await dbVerify.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);
          return res.status(400).json({
            success: false,
            message: 'Code has expired'
          });
        }

        await dbVerify.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);

        const resetToken = signToken({
          purpose: 'password_reset',
          email: emailLower,
          code: String(code || '').trim()
        }, '15m');

        return res.status(200).json({
          success: true,
          token: resetToken,
          message: 'Code verified successfully'
        });
      } catch (dbError) {
        console.error('Database error verifying code:', dbError.message);
        console.error('Database error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno
        });
        return res.status(500).json({
          success: false,
          message: `Failed to verify code: ${dbError.message || 'Database error'}`
        });
      } finally {
        if (dbVerify) {
          try {
            dbVerify.release();
          } catch (e) {
            console.warn('Error releasing DB connection (verify):', e.message);
          }
        }
      }
    }

    // Handle reset password action
    if (action === 'reset' || (token && newPassword)) {
      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
        });
      }

      let tokenData;
      try {
        const secret = getJwtSecret();
        if (!secret || secret.length < 16) {
          return res.status(500).json({
            success: false,
            message: 'Reset token verification is not configured'
          });
        }
        tokenData = jwt.verify(token, secret, { algorithms: ['HS256'] });
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid token'
        });
      }

      if (tokenData?.purpose !== 'password_reset' || !tokenData?.email || !tokenData?.code) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token'
        });
      }

      const emailLower = String(tokenData.email).toLowerCase().trim();
      const codeValue = String(tokenData.code).trim();

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      let dbReset = null;
      try {
        dbReset = await getDbConnection();
        if (!dbReset) {
          return res.status(500).json({
            success: false,
            message: 'Database not configured. Please contact support.'
          });
        }

        const [codeRows] = await dbReset.execute(
          'SELECT id, expires_at FROM reset_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1',
          [emailLower, codeValue]
        );
        if (!codeRows?.length) {
          return res.status(400).json({
            success: false,
            message: 'Reset code is invalid or already used'
          });
        }
        if (Date.now() > Number(codeRows[0].expires_at || 0)) {
          await dbReset.execute('DELETE FROM reset_codes WHERE id = ?', [codeRows[0].id]);
          return res.status(400).json({
            success: false,
            message: 'Reset code has expired'
          });
        }

        const [result] = await dbReset.execute(
          'UPDATE users SET password = ? WHERE LOWER(TRIM(COALESCE(email, \'\'))) = ?',
          [hashedPassword, emailLower],
        );
        await dbReset.execute('DELETE FROM reset_codes WHERE id = ?', [codeRows[0].id]);

        if (result.affectedRows > 0) {
          console.log(`Password reset for ${emailLower} - updated in MySQL database`);
          return res.status(200).json({
            success: true,
            message: 'Password reset successfully'
          });
        }
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      } catch (dbError) {
        console.error('MySQL update error:', dbError.message);
        console.error('Database error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno
        });
        return res.status(500).json({
          success: false,
          message: `Failed to reset password: ${dbError.message || 'Database error'}`
        });
      } finally {
        if (dbReset) {
          try {
            dbReset.release();
          } catch (e) {
            console.warn('Error releasing DB connection (reset):', e.message);
          }
        }
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use action="verify" or action="reset"'
    });
  } catch (error) {
    console.error('Error in password-reset endpoint:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error message
    let errorMessage = 'Failed to process request';
    if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

