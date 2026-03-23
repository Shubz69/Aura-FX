/**
 * Calendar days from the user's first logged platform activity to today.
 * Sources: journal trades, daily journal, AI chart checks (same data the report aggregates).
 */

function normaliseDataDays(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'bigint') return Math.max(0, Number(raw));
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * @param {number} userId
 * @param {function} executeQuery - from ../db
 * @returns {Promise<number>}
 */
async function getReportDataSpanDays(userId, executeQuery) {
  const [rows] = await executeQuery(
    `SELECT DATEDIFF(CURDATE(), first_e) AS data_days
     FROM (
       SELECT MIN(e) AS first_e FROM (
         SELECT MIN(date) AS e FROM journal_trades WHERE userId = ?
         UNION ALL
         SELECT MIN(date) AS e FROM journal_daily WHERE userId = ?
         UNION ALL
         SELECT MIN(DATE(created_at)) AS e FROM ai_chart_checks WHERE user_id = ?
       ) sub
       WHERE e IS NOT NULL
     ) x`,
    [userId, userId, userId]
  ).catch(() => [[{ data_days: null }]]);

  return normaliseDataDays(rows?.[0]?.data_days);
}

module.exports = { getReportDataSpanDays, normaliseDataDays };
