/**
 * Shared referral schema + attribution (signups via users.referred_by;
 * conversions in referral_conversion).
 */

const crypto = require('crypto');
const { executeQuery, addColumnIfNotExists, indexExists } = require('../db');

let schemaReady = false;

async function ensureReferralSchema() {
  if (schemaReady) return;
  try {
    await addColumnIfNotExists('users', 'referral_code', 'VARCHAR(32) NULL DEFAULT NULL');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referred_by', 'INT NULL DEFAULT NULL');
  } catch (_) {}
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS referral_conversion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        referrer_user_id INT NOT NULL,
        referee_user_id INT NOT NULL,
        event_type ENUM('subscription','course') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_referee_event (referee_user_id, event_type),
        INDEX idx_referrer_type (referrer_user_id, event_type)
      )
    `);
  } catch (e) {
    if (!/already exists/i.test(e.message || '')) throw e;
  }
  try {
    if (!(await indexExists('users', 'uq_users_referral_code'))) {
      await executeQuery('CREATE UNIQUE INDEX uq_users_referral_code ON users (referral_code)');
    }
  } catch (_) {
    /* duplicate codes or unsupported — app still enforces on write */
  }
  schemaReady = true;
}

function randomReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'AURA-';
  for (let i = 0; i < 8; i += 1) {
    s += chars[crypto.randomInt(0, chars.length)];
  }
  return s;
}

/**
 * Ensure user has a unique referral_code (lazy backfill).
 */
async function ensureUserReferralCode(userId) {
  await ensureReferralSchema();
  const uid = Number(userId);
  if (!uid) return null;
  const [rows] = await executeQuery(
    'SELECT referral_code FROM users WHERE id = ? LIMIT 1',
    [uid],
  );
  const cur = rows[0]?.referral_code;
  if (cur && String(cur).trim()) return String(cur).trim();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomReferralCode();
    try {
      const [res] = await executeQuery(
        'UPDATE users SET referral_code = ? WHERE id = ? AND (referral_code IS NULL OR referral_code = "")',
        [code, uid],
      );
      if (res.affectedRows > 0) return code;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') continue;
      throw e;
    }
  }
  const fallback = `AT-${String(uid).padStart(6, '0')}`;
  await executeQuery('UPDATE users SET referral_code = ? WHERE id = ?', [fallback, uid]);
  return fallback;
}

/**
 * Resolve referrer user id from AT-000123 or AURA-XXXXXXXX (case-insensitive).
 */
async function resolveReferrerIdFromInput(refRaw, newUserId) {
  await ensureReferralSchema();
  const raw = (refRaw || '').toString().trim();
  if (!raw) return null;

  const atMatch = raw.match(/^AT-(\d+)$/i);
  if (atMatch) {
    const id = parseInt(atMatch[1], 10);
    if (!id || id === Number(newUserId)) return null;
    const [rows] = await executeQuery('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0]?.id || null;
  }

  let code = raw.toUpperCase().replace(/\s/g, '');
  if (!code.startsWith('AURA-')) code = `AURA-${code.replace(/^AURA-?/i, '')}`;

  const [rows] = await executeQuery(
    'SELECT id FROM users WHERE UPPER(TRIM(referral_code)) = ? LIMIT 1',
    [code],
  );
  const rid = rows[0]?.id != null ? Number(rows[0].id) : null;
  if (!rid || rid === Number(newUserId)) return null;
  return rid;
}

/**
 * Record one conversion for the referee's referrer (idempotent per referee + event).
 */
async function recordReferralConversion(refereeUserId, eventType) {
  if (eventType !== 'subscription' && eventType !== 'course') return false;
  await ensureReferralSchema();
  const uid = Number(refereeUserId);
  if (!uid) return false;

  const [urows] = await executeQuery(
    'SELECT referred_by FROM users WHERE id = ? LIMIT 1',
    [uid],
  );
  const referrerId = urows[0]?.referred_by != null ? Number(urows[0].referred_by) : null;
  if (!referrerId || referrerId === uid) return false;

  try {
    await executeQuery(
      `INSERT IGNORE INTO referral_conversion (referrer_user_id, referee_user_id, event_type)
       VALUES (?, ?, ?)`,
      [referrerId, uid, eventType],
    );
    return true;
  } catch (e) {
    console.warn('recordReferralConversion:', e.message);
    return false;
  }
}

module.exports = {
  ensureReferralSchema,
  ensureUserReferralCode,
  resolveReferrerIdFromInput,
  recordReferralConversion,
};
