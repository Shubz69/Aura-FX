/**
 * Align users.xp with SUM(xp_events) for users who have ledger rows.
 * Recalculates level from xp for all users. Use after bulk account deletes or drift.
 */

function affectedRows(r) {
  const row = Array.isArray(r) ? r[0] : r;
  return row?.affectedRows ?? 0;
}
const { getLevelFromXP, round2 } = require('./xp-system');

async function syncUserXpFromLedger(executeQuery) {
  const out = { xpRowsUpdated: 0, levelsUpdated: 0, errors: [] };

  try {
    const upd = await executeQuery(`
      UPDATE users u
      INNER JOIN (
        SELECT user_id, SUM(amount) AS total_xp
        FROM xp_events
        GROUP BY user_id
      ) s ON s.user_id = u.id
      SET u.xp = s.total_xp
      WHERE (u.is_demo IS NULL OR u.is_demo = FALSE OR u.is_demo = 0)
    `);
    out.xpRowsUpdated = affectedRows(upd);
  } catch (e) {
    out.errors.push(`xp_sync: ${e.message}`);
  }

  try {
    const [rows] = await executeQuery('SELECT id, COALESCE(xp, 0) AS xp, COALESCE(level, 1) AS level FROM users');
    let changed = 0;
    for (const row of rows || []) {
      const nextXp = round2(row.xp);
      const nextLevel = getLevelFromXP(nextXp);
      if (Number(row.level) !== Number(nextLevel) || Number(row.xp) !== Number(nextXp)) {
        await executeQuery('UPDATE users SET xp = ?, level = ? WHERE id = ?', [nextXp, nextLevel, row.id]);
        changed += 1;
      }
    }
    out.levelsUpdated = changed;
  } catch (e) {
    out.errors.push(`levels: ${e.message}`);
  }

  return out;
}

module.exports = { syncUserXpFromLedger };
