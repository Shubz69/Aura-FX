/**
 * Read-only schema guard for monthly_reports index state.
 * This must never mutate schema during request handling.
 */
async function ensureReportSchema(executeQuery) {
  const [indexRows] = await executeQuery(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'monthly_reports'
        AND INDEX_NAME IN ('uq_user_period', 'uq_user_period_phase')
      GROUP BY INDEX_NAME`
  ).catch(() => [[]]);

  const indexNames = new Set((indexRows || []).map((row) => String(row.INDEX_NAME || row.index_name || '')));
  return {
    hasLegacyUserPeriodIndex: indexNames.has('uq_user_period'),
    hasPhaseAwareUniqueIndex: indexNames.has('uq_user_period_phase'),
  };
}

module.exports = { ensureReportSchema };
