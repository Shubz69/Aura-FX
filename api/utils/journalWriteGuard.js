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
 * Validates journal date on writes. Users may edit any calendar day (past or future).
 * `context` is still loaded by callers for XP/report logic; not used to block dates here.
 * @returns {boolean} true if allowed to proceed
 */
function assertJournalWritableDate(res, _context, dateStr) {
  const d = normalizeYyyyMmDd(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    res.status(400).json({ success: false, message: 'Invalid date' });
    return false;
  }
  const y = parseInt(d.slice(0, 4), 10);
  if (y < 2000 || y > 2100) {
    res.status(400).json({ success: false, message: 'Invalid date' });
    return false;
  }
  return true;
}

module.exports = {
  getJournalContext,
  assertJournalWritableDate,
  normalizeYyyyMmDd,
};
