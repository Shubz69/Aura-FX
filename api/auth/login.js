const bcrypt = require('bcrypt');
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { normalizeRole, isSuperAdminEmail } = require('../utils/entitlements');
const { signToken } = require('../utils/auth');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin || '';
  const allowedOrigins = new Set([
    'https://www.auraterminal.ai',
    'https://auraterminal.ai',
    'http://localhost:3000'
  ]);
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.auraterminal.ai');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  try {
    // Rate limit login attempts (5 per 5 min per IP)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    const rateKey = `login:${clientIp}`;
    if (!checkRateLimit(rateKey, RATE_LIMIT_CONFIGS.STRICT.requests, RATE_LIMIT_CONFIGS.STRICT.windowMs)) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many login attempts. Please try again later.'
      });
    }

    const { email, password, timezone } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Please enter a valid email address.'
      });
    }

    const emailLower = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLower)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Please enter a valid email address.'
      });
    }

    if (!password || typeof password !== 'string' || !String(password).trim()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION',
        message: 'Password is required.'
      });
    }

    let db = null;
    try {
      db = await getDbConnection();
      if (!db) {
        console.error('Failed to establish database connection - missing environment variables or connection failed');
        return res.status(500).json({
          success: false,
          error: 'SERVER_ERROR',
          message: 'Something went wrong. Please try again.'
        });
      }

      // Find user by email
      const [users] = await db.execute(
        'SELECT * FROM users WHERE email = ?',
        [emailLower]
      );

      if (!users || users.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'NO_ACCOUNT',
          message: 'No account with this email exists.'
        });
      }

      const user = users[0];

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_PASSWORD',
          message: 'Incorrect password.'
        });
      }

      // Update last_seen
      await db.execute(
        'UPDATE users SET last_seen = NOW() WHERE id = ?',
        [user.id]
      );

      // Auto-detect/save timezone (IANA) on login for daily journal notifications
      const { ensureTimezoneColumn } = require('../utils/ensure-timezone-column');
      await ensureTimezoneColumn();
      const tz = typeof timezone === 'string' ? timezone.trim() : '';
      if (tz && tz.length <= 64) {
        try {
          await db.execute(
            'UPDATE users SET timezone = ? WHERE id = ?',
            [tz, user.id]
          );
        } catch (e) {
          console.warn('Login timezone update:', e.message);
        }
      } else if (!user.timezone || String(user.timezone || '').trim() === '') {
        try {
          await db.execute(
            'UPDATE users SET timezone = ? WHERE id = ?',
            ['UTC', user.id]
          );
        } catch (e) {
          console.warn('Login timezone default:', e.message);
        }
      }

      // Check subscription status (add columns if they don't exist)
      let subscriptionStatus = 'inactive';
      let subscriptionExpiry = null;
      try {
        const [subscriptionData] = await db.execute(
          'SELECT subscription_status, subscription_expiry FROM users WHERE id = ?',
          [user.id]
        );
        if (subscriptionData && subscriptionData.length > 0) {
          subscriptionStatus = subscriptionData[0].subscription_status || 'inactive';
          subscriptionExpiry = subscriptionData[0].subscription_expiry;

          if (subscriptionStatus === 'active' && subscriptionExpiry) {
            const expiryDate = new Date(subscriptionExpiry);
            if (expiryDate < new Date()) {
              subscriptionStatus = 'expired';
              await db.execute(
                'UPDATE users SET subscription_status = ? WHERE id = ?',
                ['expired', user.id]
              );
            }
          }
        }
      } catch (err) {
        console.log('Subscription columns not found, will be created on first subscription');
      }

      const apiRole = isSuperAdminEmail(user) ? 'SUPER_ADMIN' : normalizeRole(user.role);
      const token = signToken({
        id: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        role: apiRole
      }, '24h');

      const updatedTimezone = tz || (user.timezone && String(user.timezone).trim()) || 'UTC';
      return res.status(200).json({
        success: true,
        id: user.id,
        username: user.username || user.email.split('@')[0],
        email: user.email,
        name: user.name || user.username,
        avatar: user.avatar ?? null,
        role: apiRole,
        token: token,
        timezone: updatedTimezone,
        status: 'SUCCESS',
        subscription: {
          status: subscriptionStatus,
          expiry: subscriptionExpiry
        }
      });
    } catch (dbError) {
      console.error('Database error during login:', dbError);
      return res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Something went wrong. Please try again.'
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
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.'
    });
  }
};
