/**
 * Applies a scheduled downgrade if the user has cancel_at_period_end set and period has ended.
 * Returns the current user row (after applying downgrade if applicable).
 * Call this when loading user for entitlements so tier reflects the downgrade.
 */

const { executeQuery } = require('../db');

async function ensureDowngradeColumns() {
  try {
    await executeQuery('SELECT cancel_at_period_end FROM users LIMIT 1');
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || (e.message && e.message.includes('Unknown column'))) {
      await executeQuery('ALTER TABLE users ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE');
      await executeQuery('ALTER TABLE users ADD COLUMN downgrade_to_plan VARCHAR(50) DEFAULT NULL');
    } else {
      throw e;
    }
  }
}

async function applyScheduledDowngrade(userId) {
  if (!userId) return null;
  await ensureDowngradeColumns();

  const [rows] = await executeQuery(
    'SELECT * FROM users WHERE id = ?',
    [userId]
  );
  const user = rows && rows[0];
  if (!user) return null;

  const cancelAtEnd = user.cancel_at_period_end === true || user.cancel_at_period_end === 1;
  const downgradeTo = (user.downgrade_to_plan || '').toString().trim().toLowerCase();
  const expiry = user.subscription_expiry ? new Date(user.subscription_expiry) : null;

  if (!cancelAtEnd || !downgradeTo || !expiry || expiry > new Date()) {
    return user;
  }

  const newRole = downgradeTo === 'free' ? 'user' : (downgradeTo === 'a7fx' ? 'elite' : 'premium');
  await executeQuery(
    `UPDATE users SET
       subscription_plan = ?,
       role = ?,
       subscription_status = 'inactive',
       subscription_expiry = NULL,
       cancel_at_period_end = FALSE,
       downgrade_to_plan = NULL,
       onboarding_accepted = FALSE
     WHERE id = ?`,
    [downgradeTo, newRole, userId]
  );

  const [updated] = await executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
  return updated && updated[0] ? updated[0] : user;
}

module.exports = { applyScheduledDowngrade, ensureDowngradeColumns };
