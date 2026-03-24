const { executeQuery } = require('../db');
const { getYyyyMmDdInTimeZone, normalizeYyyyMmDd } = require('./journalDate');

async function getJournalContext(userId) {
  const [rows] = await executeQuery(
    `SELECT role, COALESCE(NULLIF(TRIM(timezone), ''), 'UTC') AS timezone FROM users WHERE id = ?`,
    [userId]
  );
  const row = rows && rows[0];
  const role = row?.role ?? null;
  const timezone = row?.timezone || 'UTC';
  const todayYyyyMmDd = getYyyyMmDdInTimeZone(new Date(), timezone);
  return {
    role,
    timezone,
    todayYyyyMmDd,
  };
}

/**
 * Journal writes are allowed only for the user's local calendar day (IANA timezone on profile).
 * No role bypass — discipline data must stay consistent with reports.
 * @returns {boolean} true if allowed to proceed
 */
function assertJournalWritableDate(res, context, dateStr) {
  const d = normalizeYyyyMmDd(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    res.status(400).json({ success: false, message: 'Invalid date' });
    return false;
  }
  if (d !== context.todayYyyyMmDd) {
    res.status(403).json({
      success: false,
      message: 'Journal can only be edited for today in your timezone.',
    });
    return false;
  }
  return true;
}

module.exports = {
  getJournalContext,
  assertJournalWritableDate,
  normalizeYyyyMmDd,
};
