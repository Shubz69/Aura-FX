/**
 * Trader Deck calendar helpers — keep aligned with api/trader-deck/deskDates.js
 */
import { DateTime } from 'luxon';

export const DESK_TIMEZONE = 'Europe/London';

export function isLondonWeekendYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = DateTime.fromISO(s, { zone: DESK_TIMEZONE });
  if (!dt.isValid) return false;
  return dt.weekday >= 6;
}

export function priorLondonWeekdayYmd(dateStr) {
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

export function getWeekEndingSundayUtcYmd(dateStr) {
  const s = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = DateTime.fromISO(`${s}T12:00:00`, { zone: 'utc' });
  if (!dt.isValid) return s;
  const add = (7 - dt.weekday) % 7;
  return dt.plus({ days: add }).toISODate();
}

export function getTraderDeckIntelStorageYmd(selectedYmd, period) {
  const slice = String(selectedYmd || '').slice(0, 10);
  if (period === 'weekly') return getWeekEndingSundayUtcYmd(slice);
  return slice;
}
