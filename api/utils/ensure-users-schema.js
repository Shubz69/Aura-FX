/**
 * One-time (per serverless instance) users table shape checks.
 * Avoids running SELECT/ALTER probes on every GET /api/users/:id — that pattern
 * exhausted DB connections and locked `users` in production.
 */
const { executeQuery, isBenignSchemaDuplicate, isMetadataAccessDenied } = require('../db');

let usersColumnSet = null;
let ensureInFlight = null;
const MINIMUM_SAFE_COLUMN_SET = new Set([
  'id', 'username', 'email', 'name', 'phone', 'address', 'bio', 'avatar', 'role', 'level', 'xp'
]);

const OPTIONAL_COLS = [
  ['last_username_change', 'DATETIME DEFAULT NULL'],
  ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
  ['login_streak', 'INT DEFAULT 0'],
  ['banner', 'TEXT'],
  ['last_seen', 'DATETIME DEFAULT NULL'],
  ['avatarColor', 'VARCHAR(50) DEFAULT NULL'],
  ['name', 'VARCHAR(255)'],
  ['username', 'VARCHAR(255)'],
  ['email', 'VARCHAR(255)'],
  ['phone', 'VARCHAR(50)'],
  ['address', 'TEXT'],
  ['bio', 'TEXT']
];

async function fetchColumnSet() {
  try {
    const [rows] = await executeQuery(
      `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
      [],
      { timeout: 15000, requestId: 'users-schema' }
    );
    return new Set((rows || []).map((r) => String(r.c)));
  } catch (error) {
    if (isMetadataAccessDenied(error)) return null;
    throw error;
  }
}

async function widenAvatarToTextIfNeeded(columnSet) {
  if (!columnSet) return;
  if (!columnSet.has('avatar')) {
    try {
      await executeQuery('ALTER TABLE users ADD COLUMN avatar TEXT', [], {
        timeout: 60000,
        requestId: 'users-schema-avatar-add'
      });
      columnSet.add('avatar');
    } catch (e) {
      if (isBenignSchemaDuplicate(e)) columnSet.add('avatar');
      else throw e;
    }
    return;
  }
  let rows = null;
  try {
    const result = await executeQuery(
      `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar'`,
      [],
      { timeout: 15000, requestId: 'users-schema-avatar-type' }
    );
    rows = result[0];
  } catch (error) {
    if (isMetadataAccessDenied(error)) return;
    throw error;
  }
  if (!rows || !rows[0]) return;
  const t = String(rows[0].t || '').toLowerCase();
  if (t.includes('varchar') && !t.includes('text')) {
    try {
      await executeQuery('ALTER TABLE users MODIFY COLUMN avatar TEXT', [], {
        timeout: 60000,
        requestId: 'users-schema-avatar-mod'
      });
    } catch (e) {
      console.warn('avatar TEXT widen skipped:', e.message);
    }
  }
}

/**
 * Ensures expected columns exist; runs at most once per warm lambda (cached).
 */
async function ensureUsersSchema() {
  if (usersColumnSet && usersColumnSet.size > 0) return usersColumnSet;
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    try {
      let set = await fetchColumnSet();
      if (!set) {
        // DB user cannot read metadata; skip runtime DDL and cache safe baseline to avoid retries/noisy logs.
        usersColumnSet = new Set(MINIMUM_SAFE_COLUMN_SET);
        return usersColumnSet;
      }
      for (const [name, def] of OPTIONAL_COLS) {
        if (set.has(name)) continue;
        try {
          await executeQuery(`ALTER TABLE users ADD COLUMN \`${name}\` ${def}`, [], {
            timeout: 60000,
            requestId: `users-schema-add-${name}`
          });
          set.add(name);
        } catch (e) {
          if (isBenignSchemaDuplicate(e)) set.add(name);
          else throw e;
        }
      }
      await widenAvatarToTextIfNeeded(set);
      usersColumnSet = set;
      return usersColumnSet;
    } finally {
      ensureInFlight = null;
    }
  })();

  return ensureInFlight;
}

function buildUserSelectFields(columnSet) {
  const base = 'id, username, email, name, phone, address, bio, avatar, role, level, xp';
  const parts = [base];
  if (columnSet.has('login_streak')) parts.push('login_streak');
  if (columnSet.has('last_username_change')) parts.push('last_username_change');
  if (columnSet.has('created_at')) parts.push('created_at');
  if (columnSet.has('banner')) parts.push('banner');
  if (columnSet.has('avatarColor')) parts.push('avatarColor');
  if (columnSet.has('last_seen')) parts.push('last_seen');
  return {
    selectFields: parts.join(', '),
    hasBanner: columnSet.has('banner'),
    hasLastSeen: columnSet.has('last_seen'),
    hasAvatarColor: columnSet.has('avatarColor')
  };
}

module.exports = { ensureUsersSchema, buildUserSelectFields };
