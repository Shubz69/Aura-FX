require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { verifyPasswordWithOptionalRehash } = require('../utils/loginPassword');
const { normalizeRole, isSuperAdminEmail } = require('../utils/entitlements');
const { canonicalSubscriptionPlanForResponse } = require('../utils/userResponseNormalize');
const { signToken } = require('../utils/auth');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');

const BASE_SELECT_FIELDS = [
  'id',
  'email',
  'username',
  'name',
  'avatar',
  'password',
  'role'
];

const OPTIONAL_SELECT_FIELDS = [
  'subscription_status',
  'subscription_expiry',
  'subscription_plan',
  'payment_failed',
  'timezone'
];

function isUnknownColumnError(error) {
  if (!error) return false;
  return error.code === 'ER_BAD_FIELD_ERROR' || /unknown column/i.test(String(error.message || ''));
}

function parseMissingColumn(error) {
  const message = String(error?.message || '');
  const match = message.match(/Unknown column '([^']+)'/i);
  return match ? match[1] : null;
}

const LOGIN_IDENTIFIER_WHERE = `(
  LOWER(TRIM(COALESCE(email, ''))) = ?
  OR LOWER(TRIM(COALESCE(username, ''))) = ?
)`;

async function fetchUserByLoginIdentifierCompat(db, identifierLower) {
  const fields = [...BASE_SELECT_FIELDS, ...OPTIONAL_SELECT_FIELDS];
  let attempts = 0;
  const params = [identifierLower, identifierLower];

  while (attempts < OPTIONAL_SELECT_FIELDS.length + 1) {
    try {
      const [rows] = await db.execute(
        `SELECT ${fields.join(', ')} FROM users WHERE ${LOGIN_IDENTIFIER_WHERE} LIMIT 1`,
        params
      );
      return rows && rows[0] ? rows[0] : null;
    } catch (error) {
      if (!isUnknownColumnError(error)) throw error;
      const missing = parseMissingColumn(error);
      if (missing && fields.includes(missing)) {
        const idx = fields.indexOf(missing);
        fields.splice(idx, 1);
        attempts += 1;
        continue;
      }
      throw error;
    }
  }

  const [fallbackRows] = await db.execute(
    `SELECT ${BASE_SELECT_FIELDS.join(', ')} FROM users WHERE ${LOGIN_IDENTIFIER_WHERE} LIMIT 1`,
    params
  );
  return fallbackRows && fallbackRows[0] ? fallbackRows[0] : null;
}

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin || '';
  const allowedOrigins = new Set([
    'https://www.auraterminal.ai',
    'https://auraterminal.ai',
    'http://localhost:3000',
  ]);
  const vercelPreview =
    origin && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  if ((origin && allowedOrigins.has(origin)) || vercelPreview) {
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

    const { email, login, password, timezone } = req.body;
    const rawLogin = (email != null && email !== '' ? email : login) || '';
    const loginTrimmed = typeof rawLogin === 'string' ? rawLogin.trim() : '';

    if (!loginTrimmed || loginTrimmed.length < 2 || loginTrimmed.length > 254) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_LOGIN',
        message: 'Please enter your email or username.',
      });
    }

    const identifierLower = loginTrimmed.toLowerCase();

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

      // Match email or username; tolerate legacy rows with stray spaces / casing.
      const user = await fetchUserByLoginIdentifierCompat(db, identifierLower);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NO_ACCOUNT',
          message: 'No account found with that email or username.',
        });
      }

      const { ok: passwordMatch, rehash } = await verifyPasswordWithOptionalRehash(
        String(password),
        user.password,
      );
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_PASSWORD',
          message: 'Incorrect password.',
        });
      }

      if (rehash) {
        try {
          await db.execute('UPDATE users SET password = ? WHERE id = ?', [rehash, user.id]);
        } catch (rehashErr) {
          console.warn('Login password rehash skipped:', rehashErr.message);
        }
      }

      // Update last_seen
      try {
        await db.execute(
          'UPDATE users SET last_seen = NOW() WHERE id = ?',
          [user.id]
        );
      } catch (error) {
        if (!isUnknownColumnError(error)) throw error;
      }

      // Auto-detect/save timezone (IANA) on login for daily journal notifications
      const tz = typeof timezone === 'string' ? timezone.trim() : '';
      if (tz && tz.length <= 64 && Object.prototype.hasOwnProperty.call(user, 'timezone')) {
        try {
          await db.execute(
            'UPDATE users SET timezone = ? WHERE id = ?',
            [tz, user.id]
          );
        } catch (e) {
          console.warn('Login timezone update:', e.message);
        }
      } else if (Object.prototype.hasOwnProperty.call(user, 'timezone') && (!user.timezone || String(user.timezone || '').trim() === '')) {
        try {
          await db.execute(
            'UPDATE users SET timezone = ? WHERE id = ?',
            ['UTC', user.id]
          );
        } catch (e) {
          console.warn('Login timezone default:', e.message);
        }
      }

      let subscriptionStatus = user.subscription_status || 'inactive';
      let subscriptionExpiry = user.subscription_expiry || null;
      const canonicalSubPlan = canonicalSubscriptionPlanForResponse(user);
      if (subscriptionStatus === 'active' && subscriptionExpiry) {
        const expiryDate = new Date(subscriptionExpiry);
        if (expiryDate < new Date()) {
          subscriptionStatus = 'expired';
          try {
            await db.execute(
              'UPDATE users SET subscription_status = ? WHERE id = ?',
              ['expired', user.id]
            );
          } catch (e) {
            if (!isUnknownColumnError(e)) throw e;
          }
        }
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
          expiry: subscriptionExpiry,
          plan: canonicalSubPlan
        },
        subscriptionPlan: canonicalSubPlan
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
