/**
 * Journal XP – award XP for journal actions and avoid double-awards.
 * Uses same level formula as src/utils/xpSystem.js (getLevelFromXP).
 */

const { executeQuery } = require('../db');
const { getLevelFromXP, XP_RULES, round2 } = require('../utils/xp-system');

/** Per-action journal awards (each ≤ 5 XP at J=1; override via XP_JOURNAL_MULT). */
const J = XP_RULES.JOURNAL_MULTIPLIER;
const XP = {
  ADD_TASK: round2(2 * J),
  SAVE_NOTE: round2(2 * J),
  COMPLETE_WITH_PROOF: round2(5 * J),
  DAY_PCT_MAX: round2(4 * J),
  WEEK_PCT_MAX: round2(5 * J),
  MONTH_PCT_MAX: round2(5 * J),
};

async function ensureXpAwardsTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS journal_xp_awards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      award_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100) DEFAULT NULL,
      period_date DATE DEFAULT NULL,
      xp_amount DECIMAL(14, 4) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_type (userId, award_type),
      INDEX idx_lookup (userId, award_type, entity_id, period_date)
    )
  `);
}

/**
 * Check if we already awarded this type for this entity/period.
 * entityId and periodDate can be null; for uniqueness we use (userId, award_type, entity_id, period_date).
 */
async function alreadyAwarded(userId, awardType, entityId, periodDate) {
  await ensureXpAwardsTable();
  const [rows] = await executeQuery(
    `SELECT id FROM journal_xp_awards WHERE userId = ? AND award_type = ? AND (entity_id <=> ?) AND (period_date <=> ?) LIMIT 1`,
    [userId, awardType, entityId || null, periodDate || null]
  );
  return rows.length > 0;
}

/**
 * Award XP to user. Updates users.xp, users.level, inserts xp_events and journal_xp_awards.
 * Returns { awarded: true, xpAdded, newXp, newLevel } or { awarded: false } if amount <= 0.
 */
async function awardJournalXP(userId, amount, awardType, entityId, periodDate) {
  if (!userId || amount <= 0) return { awarded: false };
  await ensureXpAwardsTable();

  const [userRows] = await executeQuery('SELECT xp, level FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0) return { awarded: false };
  const currentXp = parseFloat(userRows[0].xp || 0);
  const newXp = round2(currentXp + amount);
  const newLevel = getLevelFromXP(newXp);

  await executeQuery('UPDATE users SET xp = ?, level = ? WHERE id = ?', [newXp, newLevel, userId]);

  try {
    await executeQuery(
      `INSERT INTO xp_events (user_id, amount, source, meta) VALUES (?, ?, ?, ?)`,
      [userId, amount, awardType, JSON.stringify({ entity_id: entityId, period_date: periodDate || null })]
    );
  } catch (e) {
    // xp_events might not exist
  }

  await executeQuery(
    `INSERT INTO journal_xp_awards (userId, award_type, entity_id, period_date, xp_amount) VALUES (?, ?, ?, ?, ?)`,
    [userId, awardType, entityId || null, periodDate || null, amount]
  );

  return { awarded: true, xpAdded: amount, newXp, newLevel };
}

/**
 * Award XP only if not already awarded for this key.
 */
async function awardOnce(userId, awardType, amount, entityId, periodDate) {
  const done = await alreadyAwarded(userId, awardType, entityId, periodDate);
  if (done) return { awarded: false, already: true };
  return awardJournalXP(userId, amount, awardType, entityId, periodDate);
}

module.exports = { XP, getLevelFromXP, alreadyAwarded, awardJournalXP, awardOnce, ensureXpAwardsTable };
