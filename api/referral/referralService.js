/**
 * Shared referral schema + attribution (signups via users.referred_by;
 * conversions in referral_conversion).
 */

const crypto = require('crypto');
const { executeQuery, addColumnIfNotExists, indexExists } = require('../db');

let schemaReady = false;

/** Must match Affiliation.js tier thresholds (sign-up counts). */
const SIGNUP_MILESTONES = [
  { n: 5, label: 'Bronze', reward: '1 week free Premium' },
  { n: 10, label: 'Silver', reward: '1 month free Premium' },
  { n: 25, label: 'Gold', reward: '3 months Elite access' },
  { n: 100, label: 'Elite', reward: 'Lifetime Elite access' },
];

async function ensureReferralSchema() {
  if (schemaReady) return;
  try {
    await addColumnIfNotExists('users', 'referral_code', 'VARCHAR(32) NULL DEFAULT NULL');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referred_by', 'INT NULL DEFAULT NULL');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_milestone_emailed_up_to', 'INT NULL DEFAULT 0');
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
 * If the user has no referrer yet, set referred_by from a code entered at checkout
 * (e.g. Stripe Payment Link custom field). First-touch wins; does not overwrite.
 */
async function applyReferralCodeToUserIfUnset(refereeUserId, refRaw) {
  await ensureReferralSchema();
  const uid = Number(refereeUserId);
  const raw = (refRaw || '').toString().trim();
  if (!uid || !raw) return false;

  const referrerId = await resolveReferrerIdFromInput(raw, uid);
  if (!referrerId) return false;

  const [urows] = await executeQuery(
    'SELECT referred_by FROM users WHERE id = ? LIMIT 1',
    [uid],
  );
  const existing = urows[0]?.referred_by != null ? Number(urows[0].referred_by) : null;
  if (existing) return false;

  const [res] = await executeQuery(
    'UPDATE users SET referred_by = ? WHERE id = ? AND (referred_by IS NULL OR referred_by = 0)',
    [referrerId, uid],
  );
  return !!(res && res.affectedRows > 0);
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
    const [res] = await executeQuery(
      `INSERT IGNORE INTO referral_conversion (referrer_user_id, referee_user_id, event_type)
       VALUES (?, ?, ?)`,
      [referrerId, uid, eventType],
    );
    const inserted = !!(res && res.affectedRows > 0);
    if (inserted) {
      try {
        const { sendReferralConversionEmail } = require('../utils/email');
        const [ru] = await executeQuery(
          'SELECT email, username, name FROM users WHERE id = ? LIMIT 1',
          [referrerId],
        );
        const row = ru[0];
        if (row?.email) {
          await sendReferralConversionEmail({
            to: row.email,
            name: row.name || row.username || '',
            eventType,
          });
        }
      } catch (mailErr) {
        console.warn('Referral conversion notify:', mailErr.message);
      }
    }
    return inserted;
  } catch (e) {
    console.warn('recordReferralConversion:', e.message);
    return false;
  }
}

/**
 * After a new user signs up with referred_by set, email referrer for any newly crossed tier(s).
 */
async function maybeNotifyReferralSignupMilestones(referrerUserId) {
  await ensureReferralSchema();
  const rid = Number(referrerUserId);
  if (!rid) return;

  const [countRows] = await executeQuery(
    'SELECT COUNT(*) AS c FROM users WHERE referred_by = ?',
    [rid],
  );
  const count = Number(countRows[0]?.c ?? 0);

  const [urows] = await executeQuery(
    'SELECT email, username, name, COALESCE(referral_milestone_emailed_up_to, 0) AS last_m FROM users WHERE id = ? LIMIT 1',
    [rid],
  );
  const u = urows[0];
  if (!u?.email) return;

  const lastM = Number(u.last_m) || 0;
  const newlyCrossed = SIGNUP_MILESTONES.filter((m) => count >= m.n && m.n > lastM);
  if (newlyCrossed.length === 0) return;

  const best = newlyCrossed[newlyCrossed.length - 1];
  try {
    const { sendReferralMilestoneEmail } = require('../utils/email');
    const displayName = u.name || u.username || '';
    await sendReferralMilestoneEmail({
      to: u.email,
      name: displayName,
      signupCount: count,
      tierLabel: best.label,
      tierReward: best.reward,
    });
    await executeQuery(
      'UPDATE users SET referral_milestone_emailed_up_to = ? WHERE id = ?',
      [best.n, rid],
    );
  } catch (e) {
    console.warn('maybeNotifyReferralSignupMilestones:', e.message);
  }
}

module.exports = {
  ensureReferralSchema,
  ensureUserReferralCode,
  resolveReferrerIdFromInput,
  applyReferralCodeToUserIfUnset,
  recordReferralConversion,
  maybeNotifyReferralSignupMilestones,
  SIGNUP_MILESTONES,
};
