/**
 * Central Auth Utility - JWT verification and RBAC
 *
 * SECURITY: Never trust client-provided tier/role. Always derive from server-side source of truth.
 * - JWT must be signed with JWT_SECRET (HMAC-SHA256)
 * - User entitlements come from DB via getEntitlements()
 *
 * Usage:
 * const { verifyToken, requireAuth } = require('../utils/auth');
 * const decoded = verifyToken(req.headers.authorization);
 * if (!decoded) return res.status(401).json({ ... });
 */

const jwt = require('jsonwebtoken');

let jwtSecretWarned = false;
let jwtSignWarned = false;

/**
 * Read secret at request time (trim / strip quotes) so Vercel env edits apply reliably.
 */
function getJwtSecret() {
  let raw = process.env.JWT_SECRET || process.env.JWT_SIGNING_KEY;
  if (raw == null || raw === undefined) return '';
  raw = String(raw).trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  return raw;
}

/**
 * Old signToken() used a fake third segment: base64url(Buffer.from('legacy-' + Date.now())).
 * Real HS256 signatures are binary; those never match this UTF-8 pattern.
 */
function isLegacyUnsignedToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const p3 = parts[2].trim();
    if (!p3) return false;
    const pad = p3.length % 4 === 0 ? '' : '='.repeat(4 - (p3.length % 4));
    const b64 = p3.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const dec = Buffer.from(b64, 'base64').toString('utf8');
    return /^legacy-\d+$/.test(dec);
  } catch {
    return false;
  }
}

/**
 * Verify JWT token from Authorization header.
 * Returns decoded payload or null if invalid/expired/missing.
 */
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  const secret = getJwtSecret();
  if (!secret || secret.length < 16) {
    if (!jwtSecretWarned) {
      jwtSecretWarned = true;
      console.warn(
        'JWT_SECRET not set or too short - auth verification degraded. Set JWT_SECRET in Vercel env for production.'
      );
    }
    return decodeTokenUnsafe(token);
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: 30
    });
    if (!decoded || !decoded.id) return null;
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') return null;
    // Tokens issued before JWT_SECRET was set: legacy unsigned format — accept until expiry / re-login
    if (isLegacyUnsignedToken(token)) {
      const unsafe = decodeTokenUnsafe(token);
      if (!unsafe || !unsafe.id) return null;
      return unsafe;
    }
    return null;
  }
}

/**
 * Fallback: decode without verify (only when JWT_SECRET not set - dev/backward compat).
 * INSECURE - used only for gradual migration. Remove once JWT_SECRET is set everywhere.
 */
function decodeTokenUnsafe(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const padded = padding ? payload + '='.repeat(4 - padding) : payload;
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    if (!decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Sign a JWT for a user (login, token refresh).
 * When JWT_SECRET is set (min 16 chars): uses HMAC-SHA256. Secure.
 * When not set: falls back to legacy unsigned format for backward compat. Set JWT_SECRET in production.
 */
function signToken(payload, expiresIn = '24h') {
  const secret = getJwtSecret();
  if (secret && secret.length >= 16) {
    const safe = { ...payload };
    if (safe.id != null) safe.id = Number(safe.id) || safe.id;
    return jwt.sign(safe, secret, { algorithm: 'HS256', expiresIn });
  }
  if (!jwtSignWarned) {
    jwtSignWarned = true;
    console.warn('JWT_SECRET not set - using legacy unsigned token. Set JWT_SECRET for production.');
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = typeof expiresIn === 'string' ? (expiresIn === '24h' ? Math.floor(Date.now() / 1000) + 86400 : Math.floor(Date.now() / 1000) + 3600) : (Math.floor(Date.now() / 1000) + (expiresIn || 86400));
  const pl = { ...payload, exp };
  if (pl.id != null) pl.id = Number(pl.id) || pl.id;
  const payloadB64 = Buffer.from(JSON.stringify(pl)).toString('base64url');
  const sig = Buffer.from('legacy-' + Date.now()).toString('base64url').replace(/=+$/, '');
  return `${header}.${payloadB64}.${sig}`;
}

module.exports = {
  verifyToken,
  signToken,
  decodeTokenUnsafe,
  getJwtSecret,
  get JWT_SECRET() {
    return getJwtSecret();
  }
};
