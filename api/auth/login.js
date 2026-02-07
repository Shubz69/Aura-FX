const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('../utils/suppress-warnings');
const { normalizeRole, isSuperAdminEmail } = require('../utils/entitlements');
const { signToken } = require('../utils/auth');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }

  try {
    const connectionConfig = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 10000
    };

    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    const connection = await mysql.createConnection(connectionConfig);
    await connection.ping();
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    const { email, password } = req.body;

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

    // Connect to database
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
    } catch (connError) {
      console.error('Database connection error:', connError);
      return res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Something went wrong. Please try again.'
      });
    }

    try {
      // Find user by email
      const [users] = await db.execute(
        'SELECT * FROM users WHERE email = ?',
        [emailLower]
      );

      if (!users || users.length === 0) {
        if (db && !db.ended) {
          try {
            await db.end();
          } catch (e) {
            console.warn('Error closing DB connection:', e.message);
          }
        }
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
        if (db && !db.ended) {
          try {
            await db.end();
          } catch (e) {
            console.warn('Error closing DB connection:', e.message);
          }
        }
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

      // Check subscription status (add columns if they don't exist)
      let subscriptionStatus = 'inactive';
      let subscriptionExpiry = null;
      try {
        // Try to get subscription columns
        const [subscriptionData] = await db.execute(
          'SELECT subscription_status, subscription_expiry FROM users WHERE id = ?',
          [user.id]
        );
        if (subscriptionData && subscriptionData.length > 0) {
          subscriptionStatus = subscriptionData[0].subscription_status || 'inactive';
          subscriptionExpiry = subscriptionData[0].subscription_expiry;
          
          // Check if subscription is still valid
          if (subscriptionStatus === 'active' && subscriptionExpiry) {
            const expiryDate = new Date(subscriptionExpiry);
            if (expiryDate < new Date()) {
              // Subscription expired
              subscriptionStatus = 'expired';
              await db.execute(
                'UPDATE users SET subscription_status = ? WHERE id = ?',
                ['expired', user.id]
              );
            }
          }
        }
      } catch (err) {
        // Columns don't exist yet, they'll be created when subscription is activated
        console.log('Subscription columns not found, will be created on first subscription');
      }

      // Generate JWT token - cryptographically signed when JWT_SECRET is set
      const apiRole = isSuperAdminEmail(user) ? 'SUPER_ADMIN' : normalizeRole(user.role);
      const token = signToken({
        id: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        role: apiRole
      }, '24h');

      await db.end();

      return res.status(200).json({
        success: true,
        id: user.id,
        username: user.username || user.email.split('@')[0],
        email: user.email,
        name: user.name || user.username,
        avatar: user.avatar || '/avatars/avatar_ai.png',
        role: apiRole,
        token: token,
        status: 'SUCCESS',
        subscription: {
          status: subscriptionStatus,
          expiry: subscriptionExpiry
        }
      });
    } catch (dbError) {
      console.error('Database error during login:', dbError);
      if (db && !db.ended) {
        try {
          await db.end();
        } catch (e) {
          console.warn('Error closing DB connection after error:', e.message);
        }
      }
      return res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Something went wrong. Please try again.'
      });
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

