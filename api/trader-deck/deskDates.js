'use strict';

/**
 * Trader Deck calendar rules — single source for API.
 * - Weekly intel/outlook rows use week-ending Sunday in UTC (legacy DB alignment).
 * - Daily automated briefs run every calendar day (Europe/London); weekend reads may still fall back to prior rows if empty.
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
  priorLondonWeekdayYmd,
  getWeekEndingSundayUtcYmd,
  getTraderDeckIntelStorageYmd,
};
