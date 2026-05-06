'use strict';

/**
 * Trader Deck calendar rules — single source for API.
 * - Weekly intel/outlook rows use week-ending Sunday in UTC (legacy DB alignment).
 * - Daily automated briefs run every calendar day (Europe/London); Saturday reads may fall back to prior rows if empty; London Sunday daily intel does not (week-open brief uses Sunday’s own date).
 *
 * Frontend: keep in sync with src/lib/trader-deck/deskDates.js
 */

const { DateTime } = require('luxon');

const DESK_TIMEZONE = 'Europe/London';

/** @param {string} dateStr YYYY-MM-DD */
function isLondonWeekendYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = DateTime.fromISO(s, { zone: DESK_TIMEZONE });
  if (!dt.isValid) return false;
  return dt.weekday >= 6;
}

/** Calendar Sunday in Europe/London (Luxon weekday 7). */
function isLondonSundayYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = DateTime.fromISO(s, { zone: DESK_TIMEZONE });
  return dt.isValid && dt.weekday === 7;
}

/**
 * Intel-daily UX: on London Sundays, do not surface the previous weekday’s pack (or kick autogen for Sunday)
 * until 21:00 London — aligns desk view with the Sunday evening window instead of Friday’s session titles.
 */
const INTEL_DAILY_SUNDAY_UK_OPEN_HOUR = 21;

function londonSundayIntelDailyHoldActive(requestedYmd, now = new Date()) {
  if (!isLondonSundayYmd(requestedYmd)) return false;
  const day = DateTime.fromISO(String(requestedYmd || '').slice(0, 10), { zone: DESK_TIMEZONE });
  if (!day.isValid) return false;
  const open = day.set({
    hour: INTEL_DAILY_SUNDAY_UK_OPEN_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const nowLon = DateTime.fromJSDate(now).setZone(DESK_TIMEZONE);
  return nowLon < open;
}

/** Prior calendar day in London that is Mon–Fri. */
function priorLondonWeekdayYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let dt = DateTime.fromISO(s, { zone: DESK_TIMEZONE });
  if (!dt.isValid) return s;
  for (let i = 0; i < 14; i++) {
    dt = dt.minus({ days: 1 });
    if (dt.weekday < 6) return dt.toISODate();
  }
  return s;
}

/** Week-ending Sunday (UTC), matching historical weekly storage keys. */
function getWeekEndingSundayUtcYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = DateTime.fromISO(`${s}T12:00:00`, { zone: 'utc' });
  if (!dt.isValid) return s;
  const add = (7 - dt.weekday) % 7;
  return dt.plus({ days: add }).toISODate();
}

/** Normalized YYYY-MM-DD for API storage key (weekly → UTC Sunday week end). */
function getTraderDeckIntelStorageYmd(selectedYmd, period) {
  const slice = String(selectedYmd || '').slice(0, 10);
  if (period === 'weekly') return getWeekEndingSundayUtcYmd(slice);
  return slice;
}

module.exports = {
  DESK_TIMEZONE,
  isLondonWeekendYmd,
  isLondonSundayYmd,
  londonSundayIntelDailyHoldActive,
  priorLondonWeekdayYmd,
  getWeekEndingSundayUtcYmd,
  getTraderDeckIntelStorageYmd,
};
