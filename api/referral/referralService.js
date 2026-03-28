/**
 * Central referral/affiliate engine:
 * - first-touch attribution
 * - paid conversion ledger
 * - pending -> payable lifecycle
 * - withdrawals / payouts
 * - wallet cache sync on users table
 */

const crypto = require('crypto');
const { executeQuery, addColumnIfNotExists, indexExists, getDbConnection, getDbPool } = require('../db');

let schemaReady = false;

const REFERRAL_REWARD_CONFIG = {
  holdDays: 14,
  minWithdrawalPence: 5000,
  tiers: [
    { minVerifiedPaidReferrals: 0, commissionRateBps: 0, label: 'Starter 0%' },
    { minVerifiedPaidReferrals: 5, commissionRateBps: 100, label: 'Builder 1%' },
    { minVerifiedPaidReferrals: 20, commissionRateBps: 200, label: 'Elite 2%' },
  ],
};

/** Must match Affiliation.js display milestones (sign-up counts). */
const SIGNUP_MILESTONES = [
  { n: 5, label: 'Bronze', reward: '1 week free Premium' },
  { n: 10, label: 'Silver', reward: '1 month free Premium' },
  { n: 25, label: 'Gold', reward: '3 months Elite access' },
  { n: 100, label: 'Elite', reward: 'Lifetime Elite access' },
];

function clampMoneyPence(v) {
  return Math.max(0, Math.round(Number(v) || 0));
}

function maskIdentifier(value) {
  const s = String(value || '').trim();
  if (!s) return 'anonymous';
  if (s.includes('@')) {
    const [u, d] = s.split('@');
    const um = u.length <= 2 ? `${u[0] || '*'}*` : `${u.slice(0, 2)}***`;
    return `${um}@${d || '***'}`;
  }
  if (s.length <= 3) return `${s[0] || '*'}**`;
  return `${s.slice(0, 2)}***${s.slice(-1)}`;
}

function getCurrentTierByVerifiedPaidCount(verifiedPaidReferrals) {
  const n = Math.max(0, Number(verifiedPaidReferrals) || 0);
  let selected = REFERRAL_REWARD_CONFIG.tiers[0];
  for (const tier of REFERRAL_REWARD_CONFIG.tiers) {
    if (n >= tier.minVerifiedPaidReferrals) selected = tier;
  }
  return selected;
}

/** DDL mirrors database/referral_schema.sql — keep in sync. */
const REFERRAL_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS referral_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL,
  referred_user_id BIGINT NOT NULL,
  event_type ENUM('signup','paid_conversion','renewal_conversion','milestone','reversal','manual_adjustment') NOT NULL,
  source_table VARCHAR(64) NULL,
  source_id VARCHAR(128) NULL,
  event_status ENUM('pending','approved','payable','paid','reversed','cancelled') NOT NULL DEFAULT 'pending',
  gross_amount_pence BIGINT NOT NULL DEFAULT 0,
  net_amount_pence BIGINT NOT NULL DEFAULT 0,
  commission_rate_bps INT NOT NULL DEFAULT 0,
  commission_amount_pence BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payable_after TIMESTAMP NULL,
  paid_out_at TIMESTAMP NULL,
  metadata_json LONGTEXT NULL,
  INDEX idx_referral_events_referrer (referrer_user_id),
  INDEX idx_referral_events_referred (referred_user_id),
  INDEX idx_referral_events_type (event_type),
  INDEX idx_referral_events_status (event_status),
  UNIQUE KEY uq_referral_source_event (source_table, source_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const REFERRAL_PAYOUTS_SQL = `
CREATE TABLE IF NOT EXISTS referral_payouts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  payout_method ENUM('paypal','bank_transfer','manual') NOT NULL,
  amount_pence BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  status ENUM('requested','processing','paid','failed','cancelled') NOT NULL DEFAULT 'requested',
  destination_masked VARCHAR(255) NULL,
  provider_reference VARCHAR(255) NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  notes VARCHAR(255) NULL,
  metadata_json LONGTEXT NULL,
  INDEX idx_referral_payouts_user (user_id),
  INDEX idx_referral_payouts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const REFERRAL_PAYOUT_ITEMS_SQL = `
CREATE TABLE IF NOT EXISTS referral_payout_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payout_id BIGINT NOT NULL,
  referral_event_id BIGINT NOT NULL,
  amount_pence BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_referral_payout_item_event (referral_event_id),
  INDEX idx_referral_payout_items_payout (payout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

/**
 * Ensure core referral tables exist and respond to SELECT. Throws on failure.
 * Requires a real DB pool (MYSQL_* env) — never silently skips creation.
 */
async function ensureCoreReferralTablesExist() {
  if (!getDbPool()) {
    throw new Error('Database pool not available — set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE');
  }
  await executeQuery(REFERRAL_EVENTS_SQL);
  const [evRows] = await executeQuery('SELECT COUNT(*) AS n FROM referral_events');
  if (!evRows || !evRows.length) {
    throw new Error('referral_events missing after CREATE (check DB permissions)');
  }
  await executeQuery(REFERRAL_PAYOUTS_SQL);
  const [poRows] = await executeQuery('SELECT COUNT(*) AS n FROM referral_payouts');
  if (!poRows || !poRows.length) {
    throw new Error('referral_payouts missing after CREATE (check DB permissions)');
  }
  await executeQuery(REFERRAL_PAYOUT_ITEMS_SQL);
  const [piRows] = await executeQuery('SELECT COUNT(*) AS n FROM referral_payout_items');
  if (!piRows || !piRows.length) {
    throw new Error('referral_payout_items missing after CREATE (check DB permissions)');
  }
}

async function ensureReferralSchema() {
  if (schemaReady) return;
  try {
    await ensureCoreReferralTablesExist();
  } catch (e) {
    console.error('[referral] core referral tables failed:', e && e.message);
    throw e;
  }
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
    await addColumnIfNotExists('users', 'is_affiliate_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
  } catch (_) {}
  try {
    await addColumnIfNotExists(
      'users',
      'affiliate_status',
      "ENUM('active','paused','banned') NOT NULL DEFAULT 'active'"
    );
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_wallet_pending_pence', 'BIGINT NOT NULL DEFAULT 0');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_wallet_payable_pence', 'BIGINT NOT NULL DEFAULT 0');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_wallet_paid_pence', 'BIGINT NOT NULL DEFAULT 0');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_wallet_lifetime_pence', 'BIGINT NOT NULL DEFAULT 0');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_payout_method', 'VARCHAR(50) NULL');
  } catch (_) {}
  try {
    await addColumnIfNotExists('users', 'referral_payout_details_json', 'LONGTEXT NULL');
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS referral_attributions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        referrer_user_id BIGINT NOT NULL,
        referred_user_id BIGINT NOT NULL,
        referral_code_used VARCHAR(64) NOT NULL,
        attribution_source ENUM('register','checkout','manual_admin') NOT NULL DEFAULT 'register',
        first_touch_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_confirmed_at TIMESTAMP NULL,
        status ENUM('active','rejected','fraud_review') NOT NULL DEFAULT 'active',
        notes VARCHAR(255) NULL,
        UNIQUE KEY uq_referral_attribution_referred (referred_user_id),
        INDEX idx_referral_attribution_referrer (referrer_user_id),
        INDEX idx_referral_attribution_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.error('[referral] referral_attributions CREATE failed (non-fatal):', e && e.message);
  }
  schemaReady = true;
}

/** Ledger/referees endpoints depend on referral_events; schema migration guarantees it. */
async function ensureReferralEventsReadable() {
  await ensureReferralSchema();
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
 * Register hot path: resolve referrer using an existing connection only (no CREATE TABLE).
 */
async function resolveReferrerIdFromInputLight(conn, refRaw, newUserId) {
  const raw = (refRaw || '').toString().trim();
  if (!raw) return null;
  const uid = Number(newUserId);

  const atMatch = raw.match(/^AT-(\d+)$/i);
  if (atMatch) {
    const id = parseInt(atMatch[1], 10);
    if (!id || id === uid) return null;
    try {
      const [rows] = await conn.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
      return rows[0]?.id != null ? Number(rows[0].id) : null;
    } catch (_) {
      return null;
    }
  }

  let code = raw.toUpperCase().replace(/\s/g, '');
  if (!code.startsWith('AURA-')) code = `AURA-${code.replace(/^AURA-?/i, '')}`;

  try {
    const [rows] = await conn.execute(
      'SELECT id FROM users WHERE UPPER(TRIM(referral_code)) = ? LIMIT 1',
      [code],
    );
    const rid = rows[0]?.id != null ? Number(rows[0].id) : null;
    if (!rid || rid === uid) return null;
    return rid;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return null;
    throw e;
  }
}

async function upsertReferralAttributionLight(conn, { referrerUserId, referredUserId, referralCodeUsed, source = 'register', notes = null }) {
  const referrerId = Number(referrerUserId);
  const referredId = Number(referredUserId);
  if (!referrerId || !referredId || referrerId === referredId) return false;
  const sourceSafe = ['register', 'checkout', 'manual_admin'].includes(source) ? source : 'register';
  const code = String(referralCodeUsed || normalizeReferralCode('', referrerId)).slice(0, 64);
  try {
    await conn.execute(
      `INSERT INTO referral_attributions
        (referrer_user_id, referred_user_id, referral_code_used, attribution_source, status, notes, last_confirmed_at)
       VALUES (?, ?, ?, ?, 'active', ?, NOW())
       ON DUPLICATE KEY UPDATE
        last_confirmed_at = NOW(),
        status = IF(status = 'rejected', status, 'active'),
        notes = COALESCE(VALUES(notes), notes)`,
      [referrerId, referredId, code, sourceSafe, notes ? String(notes).slice(0, 255) : null],
    );
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) return false;
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    console.warn('upsertReferralAttributionLight:', e.message);
    return false;
  }
}

async function ensureUserReferralCodeLight(conn, userId) {
  const uid = Number(userId);
  if (!uid) return null;
  try {
    const [rows] = await conn.execute('SELECT referral_code FROM users WHERE id = ? LIMIT 1', [uid]);
    const cur = rows[0]?.referral_code;
    if (cur && String(cur).trim()) return String(cur).trim();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const c = randomReferralCode();
      try {
        const [res] = await conn.execute(
          'UPDATE users SET referral_code = ? WHERE id = ? AND (referral_code IS NULL OR referral_code = "")',
          [c, uid],
        );
        if (res.affectedRows > 0) return c;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') continue;
        if (e.code === 'ER_BAD_FIELD_ERROR') return null;
        throw e;
      }
    }
    const fallback = `AT-${String(uid).padStart(6, '0')}`;
    try {
      await conn.execute('UPDATE users SET referral_code = ? WHERE id = ?', [fallback, uid]);
    } catch (_) {}
    return fallback;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return null;
    console.warn('ensureUserReferralCodeLight:', e.message);
    return null;
  }
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
  const updated = !!(res && res.affectedRows > 0);
  if (updated) {
    const referralCodeUsed = normalizeReferralCode(refRaw, referrerId);
    await upsertReferralAttribution({
      referrerUserId: referrerId,
      referredUserId: uid,
      referralCodeUsed,
      source: 'checkout',
    });
  }
  return updated;
}

/**
 * Record one conversion for the referee's referrer.
 * Uses source-based de-dupe to avoid double crediting.
 */
async function recordReferralConversion(refereeUserId, eventType, opts = {}) {
  if (eventType !== 'subscription' && eventType !== 'course' && eventType !== 'renewal') return false;
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
      const grossPence = clampMoneyPence(opts.grossAmountPence);
      const netPence = clampMoneyPence(opts.netAmountPence || grossPence);
      const sourceTable = String(opts.sourceTable || 'payment').slice(0, 64);
      const sourceId = String(opts.sourceId || `${eventType}:${uid}`).slice(0, 128);
      const conversionType = eventType === 'renewal' ? 'renewal_conversion' : 'paid_conversion';
      await createPaidCommissionEvent({
        referrerUserId: referrerId,
        referredUserId: uid,
        sourceTable,
        sourceId,
        grossAmountPence: grossPence,
        netAmountPence: netPence,
        conversionType,
        currency: opts.currency || 'GBP',
        metadata: opts.metadata || null,
      });
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

function normalizeReferralCode(raw, fallbackReferrerId) {
  const v = String(raw || '').trim();
  if (!v) return `AT-${String(Number(fallbackReferrerId) || 0).padStart(6, '0')}`;
  if (/^AT-\d+$/i.test(v)) return v.toUpperCase();
  const compact = v.toUpperCase().replace(/\s/g, '').replace(/^AURA-?/i, '');
  return `AURA-${compact}`;
}

async function upsertReferralAttribution({ referrerUserId, referredUserId, referralCodeUsed, source = 'register', notes = null }) {
  const referrerId = Number(referrerUserId);
  const referredId = Number(referredUserId);
  if (!referrerId || !referredId || referrerId === referredId) return false;
  await ensureReferralSchema();
  const sourceSafe = ['register', 'checkout', 'manual_admin'].includes(source) ? source : 'register';
  const code = String(referralCodeUsed || normalizeReferralCode('', referrerId)).slice(0, 64);
  await executeQuery(
    `INSERT INTO referral_attributions
      (referrer_user_id, referred_user_id, referral_code_used, attribution_source, status, notes, last_confirmed_at)
     VALUES (?, ?, ?, ?, 'active', ?, NOW())
     ON DUPLICATE KEY UPDATE
      last_confirmed_at = NOW(),
      status = IF(status = 'rejected', status, 'active'),
      notes = COALESCE(VALUES(notes), notes)`,
    [referrerId, referredId, code, sourceSafe, notes ? String(notes).slice(0, 255) : null]
  );
  return true;
}

async function countVerifiedPaidReferrals(referrerUserId) {
  const rid = Number(referrerUserId);
  if (!rid) return 0;
  const [rows] = await executeQuery(
    `SELECT COUNT(DISTINCT referred_user_id) AS c
     FROM referral_events
     WHERE referrer_user_id = ?
       AND event_type IN ('paid_conversion','renewal_conversion')
       AND event_status IN ('pending','approved','payable','paid')`,
    [rid]
  );
  return Number(rows?.[0]?.c || 0);
}

async function createPaidCommissionEvent({
  referrerUserId,
  referredUserId,
  sourceTable,
  sourceId,
  grossAmountPence,
  netAmountPence,
  conversionType = 'paid_conversion',
  currency = 'GBP',
  metadata = null,
}) {
  const rid = Number(referrerUserId);
  const uid = Number(referredUserId);
  if (!rid || !uid || rid === uid) return { created: false, reason: 'invalid' };
  const gross = clampMoneyPence(grossAmountPence);
  const net = clampMoneyPence(netAmountPence || gross);
  if (gross <= 0 || net <= 0) return { created: false, reason: 'non_positive_amount' };

  const verified = await countVerifiedPaidReferrals(rid);
  const tier = getCurrentTierByVerifiedPaidCount(verified);
  const bps = Number(tier.commissionRateBps || 0);
  const commission = Math.max(0, Math.floor((net * bps) / 10000));
  const payableAfterExpr = `DATE_ADD(NOW(), INTERVAL ${Number(REFERRAL_REWARD_CONFIG.holdDays)} DAY)`;
  const evtType = conversionType === 'renewal_conversion' ? 'renewal_conversion' : 'paid_conversion';

  const [res] = await executeQuery(
    `INSERT IGNORE INTO referral_events
      (referrer_user_id, referred_user_id, event_type, source_table, source_id, event_status,
       gross_amount_pence, net_amount_pence, commission_rate_bps, commission_amount_pence,
       currency, payable_after, metadata_json)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ${payableAfterExpr}, ?)`,
    [
      rid,
      uid,
      evtType,
      String(sourceTable || 'payment').slice(0, 64),
      String(sourceId || `${evtType}:${uid}`).slice(0, 128),
      gross,
      net,
      bps,
      commission,
      String(currency || 'GBP').slice(0, 10).toUpperCase(),
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
  const created = !!(res && res.affectedRows > 0);
  if (created) {
    await recalcAndCacheReferralWallet(rid);
  }
  return { created, commissionPence: commission, commissionRateBps: bps };
}

async function reverseReferralBySource({
  sourceTable,
  sourceId,
  reason = 'payment_reversal',
  metadata = null,
}) {
  await ensureReferralSchema();
  const [rows] = await executeQuery(
    `SELECT id, referrer_user_id, referred_user_id, commission_amount_pence, currency
     FROM referral_events
     WHERE source_table = ? AND source_id = ?
       AND event_type IN ('paid_conversion','renewal_conversion')
       AND event_status IN ('pending','approved','payable','paid')
     ORDER BY id DESC LIMIT 1`,
    [String(sourceTable || '').slice(0, 64), String(sourceId || '').slice(0, 128)]
  );
  const row = rows?.[0];
  if (!row) return { reversed: false };

  const baseEventId = Number(row.id);
  const rid = Number(row.referrer_user_id);
  const uid = Number(row.referred_user_id);
  const amount = clampMoneyPence(row.commission_amount_pence);
  await executeQuery(
    `INSERT IGNORE INTO referral_events
      (referrer_user_id, referred_user_id, event_type, source_table, source_id, event_status,
       gross_amount_pence, net_amount_pence, commission_rate_bps, commission_amount_pence, currency, metadata_json)
     VALUES (?, ?, 'reversal', 'referral_events', ?, 'reversed', 0, 0, 0, ?, ?, ?)`,
    [
      rid,
      uid,
      String(baseEventId),
      amount,
      String(row.currency || 'GBP').slice(0, 10).toUpperCase(),
      JSON.stringify({ reason, originalEventId: baseEventId, ...(metadata || {}) }),
    ]
  );
  await executeQuery(
    `UPDATE referral_events
     SET event_status = 'reversed'
     WHERE id = ?`,
    [baseEventId]
  );
  await recalcAndCacheReferralWallet(rid);
  return { reversed: true, referrerUserId: rid };
}

async function recalcAndCacheReferralWallet(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  await ensureReferralSchema();

  const [rows] = await executeQuery(
    `SELECT
      COALESCE(SUM(CASE WHEN event_type IN ('paid_conversion','renewal_conversion') AND event_status IN ('pending','approved') THEN commission_amount_pence ELSE 0 END),0) AS pending_raw,
      COALESCE(SUM(CASE WHEN event_type IN ('paid_conversion','renewal_conversion') AND event_status = 'payable' THEN commission_amount_pence ELSE 0 END),0) AS payable_raw,
      COALESCE(SUM(CASE WHEN event_type IN ('paid_conversion','renewal_conversion') AND event_status = 'paid' THEN commission_amount_pence ELSE 0 END),0) AS paid_raw,
      COALESCE(SUM(CASE WHEN event_type IN ('paid_conversion','renewal_conversion') THEN commission_amount_pence ELSE 0 END),0) AS positive_raw,
      COALESCE(SUM(CASE WHEN event_type = 'reversal' THEN commission_amount_pence ELSE 0 END),0) AS reversal_raw
     FROM referral_events
     WHERE referrer_user_id = ?`,
    [uid]
  );
  const r = rows?.[0] || {};
  const pending = clampMoneyPence(r.pending_raw);
  const payable = clampMoneyPence(r.payable_raw);
  const paid = clampMoneyPence(r.paid_raw);
  const lifetime = Math.max(0, clampMoneyPence(r.positive_raw) - clampMoneyPence(r.reversal_raw));

  await executeQuery(
    `UPDATE users
     SET referral_wallet_pending_pence = ?,
         referral_wallet_payable_pence = ?,
         referral_wallet_paid_pence = ?,
         referral_wallet_lifetime_pence = ?
     WHERE id = ?`,
    [pending, payable, paid, lifetime, uid]
  );

  return { pendingPence: pending, payablePence: payable, paidPence: paid, lifetimePence: lifetime };
}

async function releaseMaturedPendingCommissions() {
  await ensureReferralSchema();
  const [rows] = await executeQuery(
    `SELECT id, referrer_user_id
     FROM referral_events
     WHERE event_type IN ('paid_conversion','renewal_conversion')
       AND event_status IN ('pending','approved')
       AND payable_after IS NOT NULL
       AND payable_after <= NOW()
     LIMIT 500`
  );
  if (!rows?.length) return { moved: 0 };
  const ids = rows.map((r) => Number(r.id)).filter(Boolean);
  const referrers = [...new Set(rows.map((r) => Number(r.referrer_user_id)).filter(Boolean))];
  if (ids.length) {
    await executeQuery(
      `UPDATE referral_events SET event_status = 'payable' WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
  }
  for (const rid of referrers) {
    await recalcAndCacheReferralWallet(rid);
  }
  return { moved: ids.length };
}

async function getReferralDashboard(userId, opts = {}) {
  const uid = Number(userId);
  if (!uid) return null;
  await ensureReferralSchema();
  if (opts.releaseMatured !== false) {
    await releaseMaturedPendingCommissions();
  }
  const referralCode = await ensureUserReferralCode(uid);
  const [signupsR] = await executeQuery('SELECT COUNT(*) AS c FROM users WHERE referred_by = ?', [uid]);
  const signups = Number(signupsR?.[0]?.c || 0);
  const verifiedPaidReferrals = await countVerifiedPaidReferrals(uid);
  const currentTier = getCurrentTierByVerifiedPaidCount(verifiedPaidReferrals);
  const nextTier = REFERRAL_REWARD_CONFIG.tiers.find((t) => verifiedPaidReferrals < t.minVerifiedPaidReferrals) || null;
  const wallet = await recalcAndCacheReferralWallet(uid);

  const [activeR] = await executeQuery(
    `SELECT COUNT(*) AS c FROM users WHERE referred_by = ?
      AND LOWER(COALESCE(subscription_status, '')) IN ('active','trialing')`,
    [uid]
  );

  const [ledgerRows] = await executeQuery(
    `SELECT re.id, re.event_type, re.event_status, re.commission_amount_pence, re.occurred_at, u.email, u.username
     FROM referral_events re
     LEFT JOIN users u ON u.id = re.referred_user_id
     WHERE re.referrer_user_id = ?
     ORDER BY re.occurred_at DESC
     LIMIT 12`,
    [uid]
  );

  const [refRows] = await executeQuery(
    `SELECT u.id, u.email, u.username, u.created_at,
            EXISTS(
              SELECT 1 FROM referral_events re
              WHERE re.referrer_user_id = ? AND re.referred_user_id = u.id
                AND re.event_type IN ('paid_conversion','renewal_conversion')
                AND re.event_status IN ('pending','approved','payable','paid')
            ) AS verified_paid,
            COALESCE((
              SELECT SUM(CASE
                WHEN re.event_type IN ('paid_conversion','renewal_conversion') THEN re.commission_amount_pence
                WHEN re.event_type = 'reversal' THEN -re.commission_amount_pence
                ELSE 0 END)
              FROM referral_events re
              WHERE re.referrer_user_id = ? AND re.referred_user_id = u.id
            ),0) AS earned_pence
     FROM users u
     WHERE u.referred_by = ?
     ORDER BY u.created_at DESC
     LIMIT 12`,
    [uid, uid, uid]
  );

  return {
    referralCode,
    referralUrl: null,
    totalSignups: signups,
    verifiedPaidReferrals,
    activeReferredPlans: Number(activeR?.[0]?.c || 0),
    currentCommissionTierPercent: Number((currentTier.commissionRateBps || 0) / 100),
    nextTierTarget: nextTier ? Number(nextTier.minVerifiedPaidReferrals) : null,
    nextTierLabel: nextTier ? nextTier.label : 'Top tier reached',
    pendingEarningsPence: wallet?.pendingPence || 0,
    payableEarningsPence: wallet?.payablePence || 0,
    paidOutEarningsPence: wallet?.paidPence || 0,
    lifetimeEarningsPence: wallet?.lifetimePence || 0,
    minWithdrawalPence: REFERRAL_REWARD_CONFIG.minWithdrawalPence,
    recentLedger: (ledgerRows || []).map((r) => ({
      id: Number(r.id),
      date: r.occurred_at,
      eventType: r.event_type,
      status: r.event_status,
      commissionPence: clampMoneyPence(r.commission_amount_pence),
      maskedReferee: maskIdentifier(r.email || r.username || ''),
    })),
    maskedReferees: (refRows || []).map((r) => ({
      referredUserId: Number(r.id),
      maskedIdentifier: maskIdentifier(r.email || r.username || ''),
      joinedAt: r.created_at,
      verifiedPaid: Number(r.verified_paid) > 0,
      totalCommissionEarnedPence: clampMoneyPence(r.earned_pence),
    })),
    statsAt: new Date().toISOString(),
  };
}

async function getReferralLedger(userId, page = 1, pageSize = 20) {
  await ensureReferralEventsReadable();
  const uid = Number(userId);
  const p = Math.max(1, Number(page) || 1);
  const sz = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const off = (p - 1) * sz;
  if (!Number.isFinite(off) || off < 0 || off > 500000) {
    throw new Error('Invalid pagination');
  }
  const limitSql = String(sz);
  const offsetSql = String(off);
  const [rows] = await executeQuery(
    `SELECT re.id, re.event_type, re.event_status, re.commission_amount_pence, re.occurred_at, u.email, u.username
     FROM referral_events re
     LEFT JOIN users u ON u.id = re.referred_user_id
     WHERE re.referrer_user_id = ?
     ORDER BY re.occurred_at DESC
     LIMIT ${limitSql} OFFSET ${offsetSql}`,
    [uid]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    date: r.occurred_at,
    eventType: r.event_type,
    status: r.event_status,
    commissionAmountPence: clampMoneyPence(r.commission_amount_pence),
    maskedReferee: maskIdentifier(r.email || r.username || ''),
  }));
}

async function getReferralReferees(userId, page = 1, pageSize = 20) {
  await ensureReferralEventsReadable();
  const uid = Number(userId);
  const p = Math.max(1, Number(page) || 1);
  const sz = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const off = (p - 1) * sz;
  if (!Number.isFinite(off) || off < 0 || off > 500000) {
    throw new Error('Invalid pagination');
  }
  const limitSql = String(sz);
  const offsetSql = String(off);
  const [rows] = await executeQuery(
    `SELECT u.id, u.email, u.username, u.created_at,
            EXISTS(
              SELECT 1 FROM referral_events re
              WHERE re.referrer_user_id = ? AND re.referred_user_id = u.id
                AND re.event_type IN ('paid_conversion','renewal_conversion')
                AND re.event_status IN ('pending','approved','payable','paid')
            ) AS verified_paid,
            COALESCE((
              SELECT SUM(CASE
                WHEN re.event_type IN ('paid_conversion','renewal_conversion') THEN re.commission_amount_pence
                WHEN re.event_type = 'reversal' THEN -re.commission_amount_pence
                ELSE 0 END)
              FROM referral_events re
              WHERE re.referrer_user_id = ? AND re.referred_user_id = u.id
            ),0) AS earned_pence
     FROM users u
     WHERE u.referred_by = ?
     ORDER BY u.created_at DESC
     LIMIT ${limitSql} OFFSET ${offsetSql}`,
    [uid, uid, uid]
  );
  return (rows || []).map((r) => ({
    referredUserId: Number(r.id),
    maskedIdentifier: maskIdentifier(r.email || r.username || ''),
    joinDate: r.created_at,
    verifiedPaid: Number(r.verified_paid) > 0,
    totalCommissionEarnedPence: clampMoneyPence(r.earned_pence),
  }));
}

async function getPayoutMethod(userId) {
  await ensureReferralSchema();
  const uid = Number(userId);
  const [rows] = await executeQuery(
    `SELECT referral_payout_method, referral_payout_details_json
     FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const row = rows?.[0] || {};
  let details = null;
  if (row.referral_payout_details_json) {
    try {
      details = typeof row.referral_payout_details_json === 'string'
        ? JSON.parse(row.referral_payout_details_json)
        : row.referral_payout_details_json;
    } catch (_) {
      details = null;
    }
  }
  return { method: row.referral_payout_method || null, details: details || null };
}

async function setPayoutMethod(userId, method, details) {
  const uid = Number(userId);
  const allowed = new Set(['paypal', 'bank_transfer', 'manual']);
  const m = String(method || '').trim().toLowerCase();
  if (!allowed.has(m)) throw new Error('Invalid payout method');
  const safeDetails = details && typeof details === 'object' ? details : {};
  await executeQuery(
    `UPDATE users SET referral_payout_method = ?, referral_payout_details_json = ? WHERE id = ?`,
    [m, JSON.stringify(safeDetails), uid]
  );
  return true;
}

async function requestWithdrawal(userId, amountPence) {
  const uid = Number(userId);
  const amount = clampMoneyPence(amountPence);
  if (amount < REFERRAL_REWARD_CONFIG.minWithdrawalPence) {
    throw new Error(`Minimum withdrawal is ${REFERRAL_REWARD_CONFIG.minWithdrawalPence} pence`);
  }
  await ensureReferralSchema();

  const db = await getDbConnection();
  if (!db) throw new Error('Database connection error');
  try {
    await db.beginTransaction();
    const [urows] = await db.execute(
      `SELECT is_affiliate_enabled, affiliate_status, referral_payout_method, referral_wallet_payable_pence,
              referral_payout_details_json
       FROM users WHERE id = ? FOR UPDATE`,
      [uid]
    );
    const u = urows?.[0];
    if (!u) throw new Error('User not found');
    if (!Number(u.is_affiliate_enabled) || String(u.affiliate_status || '').toLowerCase() !== 'active') {
      throw new Error('Affiliate account is not active');
    }
    if (!u.referral_payout_method) throw new Error('Set payout method before withdrawing');
    const payable = clampMoneyPence(u.referral_wallet_payable_pence);
    if (amount > payable) throw new Error('Amount exceeds payable balance');

    const [events] = await db.execute(
      `SELECT id, referred_user_id, currency, commission_amount_pence
       FROM referral_events
       WHERE referrer_user_id = ? AND event_status = 'payable'
       ORDER BY occurred_at ASC
       FOR UPDATE`,
      [uid]
    );
    let remain = amount;
    const picks = [];
    for (const ev of events) {
      if (remain <= 0) break;
      const evAmt = clampMoneyPence(ev.commission_amount_pence);
      if (evAmt <= 0) continue;
      const consume = Math.min(evAmt, remain);
      if (consume <= 0) continue;
      if (consume < evAmt) {
        await db.execute(
          `UPDATE referral_events
           SET commission_amount_pence = ?
           WHERE id = ? AND event_status = 'payable'`,
          [evAmt - consume, Number(ev.id)]
        );
        const [splitRes] = await db.execute(
          `INSERT INTO referral_events
            (referrer_user_id, referred_user_id, event_type, source_table, source_id, event_status,
             gross_amount_pence, net_amount_pence, commission_rate_bps, commission_amount_pence, currency, metadata_json)
           VALUES (?, ?, 'paid_conversion', 'referral_withdraw_split', ?, 'approved', 0, 0, 0, ?, ?, ?)`,
          [
            uid,
            Number(ev.referred_user_id),
            `split:${Number(ev.id)}:${Date.now()}`,
            consume,
            String(ev.currency || 'GBP').slice(0, 10).toUpperCase(),
            JSON.stringify({ originalEventId: Number(ev.id), reason: 'withdraw_split' }),
          ]
        );
        picks.push({ eventId: Number(splitRes.insertId), amount: consume });
      } else {
        await db.execute(
          `UPDATE referral_events SET event_status = 'approved' WHERE id = ? AND event_status = 'payable'`,
          [Number(ev.id)]
        );
        picks.push({ eventId: Number(ev.id), amount: consume });
      }
      remain -= consume;
    }
    if (remain > 0) throw new Error('Not enough payable events to cover withdrawal');

    const destinationMasked = (() => {
      const details = (() => {
        try {
          return u.referral_payout_details_json
            ? (typeof u.referral_payout_details_json === 'string'
              ? JSON.parse(u.referral_payout_details_json)
              : u.referral_payout_details_json)
            : {};
        } catch (_) {
          return {};
        }
      })();
      return maskIdentifier(details?.email || details?.account || details?.iban || details?.sortCode || 'manual');
    })();

    const [payoutRes] = await db.execute(
      `INSERT INTO referral_payouts
        (user_id, payout_method, amount_pence, currency, status, destination_masked, metadata_json)
       VALUES (?, ?, ?, 'GBP', 'requested', ?, ?)`,
      [uid, String(u.referral_payout_method), amount, destinationMasked, JSON.stringify({ requestedBy: uid })]
    );
    const payoutId = Number(payoutRes.insertId);
    for (const p of picks) {
      await db.execute(
        `INSERT INTO referral_payout_items (payout_id, referral_event_id, amount_pence) VALUES (?, ?, ?)`,
        [payoutId, p.eventId, p.amount]
      );
    }
    await db.commit();
    return { payoutId, amountPence: amount, status: 'requested' };
  } catch (e) {
    try { await db.rollback(); } catch (_) {}
    throw e;
  } finally {
    try { db.release(); } catch (_) {}
    await recalcAndCacheReferralWallet(uid);
  }
}

async function getAdminPayouts(status = null, page = 1, pageSize = 50) {
  const p = Math.max(1, Number(page) || 1);
  const sz = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const off = (p - 1) * sz;
  const where = status ? 'WHERE rp.status = ?' : '';
  const args = status ? [String(status), sz, off] : [sz, off];
  const [rows] = await executeQuery(
    `SELECT rp.*, u.email, u.username
     FROM referral_payouts rp
     LEFT JOIN users u ON u.id = rp.user_id
     ${where}
     ORDER BY rp.requested_at DESC
     LIMIT ? OFFSET ?`,
    args
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    userId: Number(r.user_id),
    user: maskIdentifier(r.email || r.username || ''),
    payoutMethod: r.payout_method,
    amountPence: clampMoneyPence(r.amount_pence),
    status: r.status,
    destinationMasked: r.destination_masked || null,
    requestedAt: r.requested_at,
    processedAt: r.processed_at || null,
    notes: r.notes || null,
  }));
}

async function processAdminPayout(payoutId, action, payload = {}) {
  const id = Number(payoutId);
  if (!id) throw new Error('Invalid payout id');
  const mode = String(action || '').toLowerCase();
  if (!['process', 'paid', 'fail', 'cancel'].includes(mode)) throw new Error('Invalid payout action');

  const db = await getDbConnection();
  if (!db) throw new Error('Database connection error');
  try {
    await db.beginTransaction();
    const [pr] = await db.execute(
      `SELECT id, user_id, status, amount_pence FROM referral_payouts WHERE id = ? FOR UPDATE`,
      [id]
    );
    const p = pr?.[0];
    if (!p) throw new Error('Payout not found');
    const userId = Number(p.user_id);
    if (mode === 'process') {
      if (p.status !== 'requested') throw new Error('Only requested payouts can be processed');
      await db.execute(
        `UPDATE referral_payouts SET status = 'processing', notes = ? WHERE id = ?`,
        [payload.notes ? String(payload.notes).slice(0, 255) : null, id]
      );
    } else if (mode === 'paid') {
      if (!['requested', 'processing'].includes(String(p.status))) throw new Error('Payout is not payable');
      await db.execute(
        `UPDATE referral_payouts
         SET status = 'paid', processed_at = NOW(), provider_reference = ?, notes = ?
         WHERE id = ?`,
        [
          payload.providerReference ? String(payload.providerReference).slice(0, 255) : null,
          payload.notes ? String(payload.notes).slice(0, 255) : null,
          id,
        ]
      );
      await db.execute(
        `UPDATE referral_events re
         INNER JOIN referral_payout_items rpi ON rpi.referral_event_id = re.id
         SET re.event_status = 'paid', re.paid_out_at = NOW()
         WHERE rpi.payout_id = ? AND re.event_status IN ('approved','payable')`,
        [id]
      );
    } else if (mode === 'fail' || mode === 'cancel') {
      await db.execute(
        `UPDATE referral_payouts
         SET status = ?, processed_at = NOW(), notes = ?
         WHERE id = ?`,
        [mode === 'fail' ? 'failed' : 'cancelled', payload.notes ? String(payload.notes).slice(0, 255) : null, id]
      );
      await db.execute(
        `UPDATE referral_events re
         INNER JOIN referral_payout_items rpi ON rpi.referral_event_id = re.id
         SET re.event_status = 'payable'
         WHERE rpi.payout_id = ? AND re.event_status = 'approved'`,
        [id]
      );
    }
    await db.commit();
    return { id, action: mode, success: true, userId };
  } catch (e) {
    try { await db.rollback(); } catch (_) {}
    throw e;
  } finally {
    try { db.release(); } catch (_) {}
  }
}

/**
 * Milestone emails without running referral schema DDL (serverless-safe fire-and-forget).
 */
async function maybeNotifyReferralSignupMilestonesLight(referrerUserId) {
  const rid = Number(referrerUserId);
  if (!rid) return;
  try {
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
    console.warn('maybeNotifyReferralSignupMilestonesLight:', e.message);
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
  REFERRAL_REWARD_CONFIG,
  ensureReferralSchema,
  ensureUserReferralCode,
  ensureUserReferralCodeLight,
  resolveReferrerIdFromInput,
  resolveReferrerIdFromInputLight,
  applyReferralCodeToUserIfUnset,
  upsertReferralAttribution,
  upsertReferralAttributionLight,
  recordReferralConversion,
  reverseReferralBySource,
  releaseMaturedPendingCommissions,
  recalcAndCacheReferralWallet,
  getReferralDashboard,
  getReferralLedger,
  getReferralReferees,
  getPayoutMethod,
  setPayoutMethod,
  requestWithdrawal,
  getAdminPayouts,
  processAdminPayout,
  countVerifiedPaidReferrals,
  getCurrentTierByVerifiedPaidCount,
  maybeNotifyReferralSignupMilestones,
  maybeNotifyReferralSignupMilestonesLight,
  SIGNUP_MILESTONES,
};
