/**
 * Align users.xp with SUM(xp_events) for users who have ledger rows.
 * Recalculates level from xp for all users. Use after bulk account deletes or drift.
 */

function affectedRows(r) {
  const row = Array.isArray(r) ? r[0] : r;
  return row?.affectedRows ?? 0;
}

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
    const lev = await executeQuery(`
      UPDATE users u
      SET u.level = CASE
        WHEN COALESCE(u.xp, 0) <= 0 THEN 1
        WHEN u.xp < 500 THEN FLOOR(SQRT(u.xp / 50)) + 1
        WHEN u.xp < 5000 THEN 10 + FLOOR(SQRT((u.xp - 500) / 100)) + 1
        WHEN u.xp < 20000 THEN 50 + FLOOR(SQRT((u.xp - 5000) / 200)) + 1
        WHEN u.xp < 100000 THEN 100 + FLOOR(SQRT((u.xp - 20000) / 500)) + 1
        WHEN u.xp < 500000 THEN 200 + FLOOR(SQRT((u.xp - 100000) / 1000)) + 1
        ELSE LEAST(1000, 500 + FLOOR(SQRT((u.xp - 500000) / 2000)) + 1)
      END
    `);
    out.levelsUpdated = affectedRows(lev);
  } catch (e) {
    out.errors.push(`levels: ${e.message}`);
  }

  return out;
}

module.exports = { syncUserXpFromLedger };
