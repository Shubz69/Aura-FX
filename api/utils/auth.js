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
let legacyWarned = false;

function isProductionAuth() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

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
      console.error('JWT_SECRET missing or too short — rejecting tokens. Set JWT_SECRET (min 16 chars).');
    }
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: 30
    });
    if (!decoded || !decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isLegacyUnsignedAllowed() {
  return String(process.env.ALLOW_LEGACY_UNSIGNED_TOKENS || '').trim().toLowerCase() === 'true';
}

function verifyLegacyUnsignedTokenForMigration(authHeader) {
  if (!isLegacyUnsignedAllowed()) return null;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;
  if (!legacyWarned) {
    legacyWarned = true;
    console.warn('ALLOW_LEGACY_UNSIGNED_TOKENS=true enabled; accepting unsafe decoded JWT payloads.');
  }
  const decoded = decodeTokenUnsafe(token);
  if (!decoded?.id) return null;
  return decoded;
}

function verifyTokenOrLegacy(authHeader) {
  const verified = verifyToken(authHeader);
  if (verified) return verified;
  if (!isProductionAuth()) {
    return verifyLegacyUnsignedTokenForMigration(authHeader);
  }
  return null;
}

/**
 * Fallback decoder kept for emergency migration tooling only.
 * Never use this directly for protected routes.
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
 * Requires JWT_SECRET (min 16 chars) in all environments.
 */
function signToken(payload, expiresIn = '24h') {
  const secret = getJwtSecret();
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set (min 16 characters) to sign auth tokens');
  }
  const safe = { ...payload };
  if (safe.id != null) safe.id = Number(safe.id) || safe.id;
  return jwt.sign(safe, secret, { algorithm: 'HS256', expiresIn });
}

module.exports = {
  verifyToken,
  verifyTokenOrLegacy,
  signToken,
  decodeTokenUnsafe,
  getJwtSecret,
  get JWT_SECRET() {
    return getJwtSecret();
  }
};
