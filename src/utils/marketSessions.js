/**
 * Session copy for "All Markets" modal (forex weekend rule, client-side).
 */

import { DateTime } from 'luxon';

function isRetailForexClosed(d = new Date()) {
  const dow = d.getUTCDay();
  const h = d.getUTCHours();
  if (dow === 6) return true;
  if (dow === 5 && h >= 21) return true;
  if (dow === 0 && h < 22) return true;
  return false;
}

function formatDuration(ms) {
  if (ms <= 0) return 'under a minute';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 72) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return 'under a minute';
}

/**
 * NYSE-style cash hours Mon–Fri 9:30–16:00 America/New_York (holidays not excluded).
 */
export function getNyseOpensInMs(now = new Date()) {
  const et = DateTime.fromJSDate(now).setZone('America/New_York');
  const openM = 9 * 60 + 30;
  const closeM = 16 * 60;
  const hm = et.hour * 60 + et.minute + et.second / 60;
  const wd = et.weekday;

  if (wd >= 1 && wd <= 5 && hm >= openM && hm < closeM) {
    return { inSession: true, msToOpen: 0 };
  }

  let cursor = et;
  for (let i = 0; i < 12; i++) {
    if (cursor.weekday >= 1 && cursor.weekday <= 5) {
      const dayOpen = cursor.set({
        hour: 9,
        minute: 30,
        second: 0,
        millisecond: 0,
      });
      if (dayOpen > et) {
        return { inSession: false, msToOpen: dayOpen.diff(et).as('milliseconds') };
      }
    }
    cursor = cursor.plus({ days: 1 }).startOf('day');
  }
  return { inSession: false, msToOpen: 24 * 60 * 60 * 1000 };
}

export function getAllMarketsSessionBannerLines(now = new Date()) {
  const lines = [];
  const { inSession, msToOpen } = getNyseOpensInMs(now);

  if (inSession) {
    lines.push({
      key: 'us',
      label: 'US equities',
      text: 'Cash session is open (Mon–Fri 9:30 AM – 4:00 PM ET).',
    });
  } else {
    lines.push({
      key: 'us',
      label: 'US equities',
      text: `Next session opens in ${formatDuration(msToOpen)} (Mon–Fri 9:30 AM ET).`,
    });
  }

  if (isRetailForexClosed(now)) {
    lines.push({
      key: 'fx',
      label: 'Spot FX',
      text: 'Retail forex is typically quiet Fri 9 PM – Sun 10 PM UTC; liquidity returns Sunday evening UTC.',
    });
  } else {
    lines.push({
      key: 'fx',
      label: 'Spot FX',
      text: 'Major pairs are active (24-hour market weekdays).',
    });
  }

  lines.push({
    key: 'crypto',
    label: 'Crypto',
    text: 'Digital assets trade 24/7.',
  });

  return lines;
}
