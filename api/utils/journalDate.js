/**
 * Calendar YYYY-MM-DD in an IANA timezone (DST-safe via Intl).
 */

function getYyyyMmDdInTimeZone(now = new Date(), ianaTz = 'UTC') {
  const tz = (ianaTz && String(ianaTz).trim()) || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {
    /* fall through */
  }
  return now.toISOString().slice(0, 10);
}

function normalizeYyyyMmDd(dateStr) {
  return String(dateStr || '').trim().slice(0, 10);
}

module.exports = { getYyyyMmDdInTimeZone, normalizeYyyyMmDd };
