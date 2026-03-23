/**
 * Applies a scheduled downgrade if the user has cancel_at_period_end set and period has ended.
 * Returns the current user row (after applying downgrade if applicable).
 * Call this when loading user for entitlements so tier reflects the downgrade.
 *
 * When callers already hold a pooled connection (e.g. getDbConnection()), pass it as the second
 * argument. On Vercel the pool has connectionLimit 1 — using executeQuery while holding that
 * connection deadlocks until the serverless invocation times out.
 */

const { executeQuery } = require('../db');

/** After first successful column check (or migration), skip extra probes on warm instances */
let downgradeColumnsReady = false;

async function runUserSql(dbConn, query, params = []) {
  const safeParams = (params || []).map((p) => (p === undefined ? null : p));
  if (dbConn && typeof dbConn.execute === 'function') {
    return dbConn.execute(query, safeParams);
  }
  return executeQuery(query, safeParams);
}

async function ensureDowngradeColumns(dbConn = null) {
  if (downgradeColumnsReady) return;
  const schema = process.env.MYSQL_DATABASE;
  if (schema && dbConn && typeof dbConn.execute === 'function') {
    try {
      const [colRows] = await runUserSql(
        dbConn,
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('cancel_at_period_end','downgrade_to_plan')`,
        [schema]
      );
      const have = new Set((colRows || []).map((r) => r.COLUMN_NAME));
      if (have.has('cancel_at_period_end') && have.has('downgrade_to_plan')) {
        downgradeColumnsReady = true;
        return;
      }
      if (!have.has('cancel_at_period_end')) {
        try {
          await runUserSql(dbConn, 'ALTER TABLE users ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE');
        } catch (alterErr) {
          if (!isDuplicateColumnError(alterErr)) throw alterErr;
        }
      }
      if (!have.has('downgrade_to_plan')) {
        try {
          await runUserSql(dbConn, 'ALTER TABLE users ADD COLUMN downgrade_to_plan VARCHAR(50) DEFAULT NULL');
        } catch (alterErr) {
          if (!isDuplicateColumnError(alterErr)) throw alterErr;
        }
      }
      downgradeColumnsReady = true;
      return;
    } catch (schemaErr) {
      /* fall through to legacy probe */
    }
  }
  try {
    await runUserSql(dbConn, 'SELECT cancel_at_period_end, downgrade_to_plan FROM users LIMIT 1');
    downgradeColumnsReady = true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || (e.message && e.message.includes('Unknown column'))) {
      try {
        await runUserSql(dbConn, 'ALTER TABLE users ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE');
      } catch (alterErr) {
        if (!isDuplicateColumnError(alterErr)) throw alterErr;
      }
      try {
        await runUserSql(dbConn, 'ALTER TABLE users ADD COLUMN downgrade_to_plan VARCHAR(50) DEFAULT NULL');
      } catch (alterErr) {
        if (!isDuplicateColumnError(alterErr)) throw alterErr;
      }
      downgradeColumnsReady = true;
    } else {
      throw e;
    }
  }
}

function isDuplicateColumnError(err) {
  if (!err) return false;
  if (err.code === 'ER_DUP_FIELDNAME') return true;
  const errno = Number(err.errno);
  if (errno === 1060) return true;
  const msg = `${err.message || ''} ${err.sqlMessage || ''}`;
  return /duplicate column name/i.test(msg);
}

async function applyScheduledDowngrade(userId, dbConn = null) {
  if (userId == null || userId === '') return null;
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  await ensureDowngradeColumns(dbConn);

  const [rows] = await runUserSql(dbConn, 'SELECT * FROM users WHERE id = ?', [id]);
  const user = rows && rows[0];
  if (!user) return null;

  const cancelAtEnd = user.cancel_at_period_end === true || user.cancel_at_period_end === 1;
  const downgradeTo = (user.downgrade_to_plan || '').toString().trim().toLowerCase();
  const expiry = user.subscription_expiry ? new Date(user.subscription_expiry) : null;

  if (!cancelAtEnd || !downgradeTo || !expiry || expiry > new Date()) {
    return user;
  }

  const newRole = downgradeTo === 'free' ? 'user' : (downgradeTo === 'a7fx' ? 'elite' : 'premium');
  await runUserSql(
    dbConn,
    `UPDATE users SET
       subscription_plan = ?,
       role = ?,
       subscription_status = 'inactive',
       subscription_expiry = NULL,
       cancel_at_period_end = FALSE,
       downgrade_to_plan = NULL,
       onboarding_accepted = FALSE
     WHERE id = ?`,
    [downgradeTo, newRole, id]
  );

  const [updated] = await runUserSql(dbConn, 'SELECT * FROM users WHERE id = ?', [id]);
  return updated && updated[0] ? updated[0] : user;
}

module.exports = { applyScheduledDowngrade, ensureDowngradeColumns };
