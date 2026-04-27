/**
 * Shared helpers for Lightweight Charts candle data (Trader Lab, Replay, Market Decoder).
 * Keeps ascending order, drops duplicate timestamps (last wins), no layout/CSS impact.
 */

import { TickMarkType } from 'lightweight-charts';

/** @param {string} interval */
export function normalizeApiInterval(interval) {
  const s = String(interval || '60').trim();
  if (!s) return '60';
  const u = s.toUpperCase();
  if (u === 'D' || u === '1D') return '1D';
  return s;
}

/**
 * @param {Array<{ time: number | string }>} bars
 * @returns {{ time: number, open: number, high: number, low: number, close: number }[]}
 */
export function normalizeChartBars(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const byTime = new Map();
  for (const b of bars) {
    const t = Math.floor(Number(b.time));
    if (!Number.isFinite(t)) continue;
    byTime.set(t, {
      time: t,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
    });
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row)
    .filter((row) => Number.isFinite(row.open) && Number.isFinite(row.close));
}

/**
 * Lightweight Charts v4 time scale options from API interval string.
 * @param {string} interval
 */
export function timeScaleOptionsForInterval(interval) {
  const iv = normalizeApiInterval(interval);
  const isDaily = iv === '1D';
  const isMinute = iv === '1' || iv === '5' || iv === '15';
  const isHourly = iv === '60' || iv === '240';

  const pad2 = (n) => String(n).padStart(2, '0');

  /** @param {number|{ year: number, month: number, day: number }} time */
  const asUtc = (time) => {
    if (time == null) return null;
    if (typeof time === 'number') return new Date(time * 1000);
    if (typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time) {
      return new Date(Date.UTC(time.year, time.month - 1, time.day));
    }
    return null;
  };

  return {
    visible: true,
    borderVisible: true,
    timeVisible: !isDaily,
    secondsVisible: false,
    tickMarkFormatter: (time, tickMarkType, locale) => {
      const d = asUtc(time);
      if (!d || Number.isNaN(d.getTime())) return null;
      if (isDaily) {
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
      }
      if (isMinute) {
        if (
          tickMarkType === TickMarkType.DayOfMonth ||
          tickMarkType === TickMarkType.Month ||
          tickMarkType === TickMarkType.Year
        ) {
          return `${pad2(d.getUTCDate())} ${d.toLocaleString(locale || 'en-US', { month: 'short', timeZone: 'UTC' })}`;
        }
        return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
      }
      if (isHourly) {
        if (
          tickMarkType === TickMarkType.DayOfMonth ||
          tickMarkType === TickMarkType.Month ||
          tickMarkType === TickMarkType.Year
        ) {
          return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
        }
        return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:00`;
      }
      return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    },
  };
}
