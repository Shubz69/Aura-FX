/**
 * Permanently removes demo / seeded users from the database.
 * Matches: is_demo = TRUE or email ending with @aurafx.demo
 *
 * Also exports deleteUsersByIds for bulk deletes (same FK cleanup order).
 */

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

function affectedRows(execResult) {
  const [row] = execResult || [];
  if (row && typeof row.affectedRows === 'number') return row.affectedRows;
  return 0;
}

/**
 * @param {Function} executeQuery - same signature as api/db executeQuery
 * @param {{ log?: Function }} [opts]
 * @returns {Promise<{ userIds: number[], deletedUsers: number, steps: string[] }>}
 */
async function deleteUsersByIds(executeQuery, ids, opts = {}) {
  const log = opts.log || (() => {});
  const steps = [];
  const idList = (ids || []).map(Number).filter((n) => n > 0);
  if (idList.length === 0) {
    return { userIds: [], deletedUsers: 0, steps: ['no_ids'] };
  }

  const ph = idList.map(() => '?').join(',');
  const p = [...idList];
  const p2 = [...idList, ...idList];

  const run = async (label, sql, params = p) => {
    try {
      const r = await executeQuery(sql, params);
      const n = affectedRows(r);
      if (n) steps.push(`${label}:${n}`);
    } catch (e) {
      log(`purge skip ${label}: ${e.message}`);
    }
  };

  await run('xp_events', `DELETE FROM xp_events WHERE user_id IN (${ph})`);
  await run('notifications', `DELETE FROM notifications WHERE user_id IN (${ph}) OR from_user_id IN (${ph})`, p2);
  await run('friend_requests', `DELETE FROM friend_requests WHERE requester_id IN (${ph}) OR receiver_id IN (${ph})`, p2);
  await run('friendships', `DELETE FROM friendships WHERE user_id IN (${ph}) OR friend_id IN (${ph})`, p2);
  await run('friends', `DELETE FROM friends WHERE user_id IN (${ph}) OR friend_id IN (${ph})`, p2);
  await run('user_courses', `DELETE FROM user_courses WHERE user_id IN (${ph})`);
  await run('leaderboard_legacy', `DELETE FROM leaderboard WHERE user_id IN (${ph})`);
  await run('user_ranks', `DELETE FROM user_ranks WHERE user_id IN (${ph})`);
  await run('user_login_streaks', `DELETE FROM user_login_streaks WHERE user_id IN (${ph})`);
  await run('journal_trades', `DELETE FROM journal_trades WHERE userId IN (${ph})`);
  await run('journal_daily', `DELETE FROM journal_daily WHERE userId IN (${ph})`);
  await run('journal_tasks', `DELETE FROM journal_tasks WHERE userId IN (${ph})`);
  await run('journal_prompt_history', `DELETE FROM journal_prompt_history WHERE user_id IN (${ph})`);
  await run('journal_xp_awards', `DELETE FROM journal_xp_awards WHERE userId IN (${ph})`);

  let deletedUsers = 0;
  try {
    const del = await executeQuery(`DELETE FROM users WHERE id IN (${ph})`, p);
    deletedUsers = affectedRows(del);
    steps.push(`users:${deletedUsers}`);
  } catch (e) {
    log(`purge users failed: ${e.message}`);
    steps.push(`users_error:${e.message}`);
  }

  return { userIds: idList, deletedUsers, steps };
}

async function purgeDemoUsers(executeQuery, opts = {}) {
  const log = opts.log || (() => {});
  const steps = [];

  const [idResult] = await executeQuery(`
    SELECT id FROM users
    WHERE is_demo = TRUE OR is_demo = 1 OR email LIKE '%@aurafx.demo'
  `);
  const ids = getRows(idResult).map((r) => r.id).filter(Boolean);
  if (ids.length === 0) {
    steps.push('no_demo_users_found');
    return { userIds: [], deletedUsers: 0, steps };
  }

  return deleteUsersByIds(executeQuery, ids, { log });
}

module.exports = { purgeDemoUsers, deleteUsersByIds, getRows };
