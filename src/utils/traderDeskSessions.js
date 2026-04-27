/**
 * Trader Desk market session windows (UTC hours, aligned with existing TraderDeck SESSIONS).
 * Used for Open/Closed and "Opens in" / "Ends in" countdowns.
 */

/** `cityKey` maps to `traderDeck.city.*` i18n keys for display labels. */
export const TRADER_DESK_SESSIONS = [
  { cityKey: 'sydney', openH: 22, closeH: 7 },
  { cityKey: 'tokyo', openH: 0, closeH: 9 },
  { cityKey: 'london', openH: 8, closeH: 17 },
  { cityKey: 'newYork', openH: 13, closeH: 22 },
];

export function isSessionOpen({ openH, closeH }, nowMs = Date.now()) {
  const h = new Date(nowMs).getUTCHours();
  return openH < closeH ? h >= openH && h < closeH : h >= openH || h < closeH;
}

function startOfUtcDayMs(nowMs) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * @returns {{ ms: number, phraseKey: 'opensIn' | 'endsIn' }} — map to i18n via traderDeck.sessionOpensIn / sessionEndsIn
 */
export function getSessionCountdown({ openH, closeH }, nowMs = Date.now()) {
  const sod = startOfUtcDayMs(nowMs);
  const day = 86400000;
  const h2ms = (h) => h * 3600000;

  if (openH < closeH) {
    const openMs = sod + h2ms(openH);
    const closeMs = sod + h2ms(closeH);
    const open = isSessionOpen({ openH, closeH }, nowMs);
    if (open) {
      return { ms: Math.max(0, closeMs - nowMs), phraseKey: 'endsIn' };
    }
    const h = new Date(nowMs).getUTCHours();
    if (h < openH) {
      return { ms: Math.max(0, openMs - nowMs), phraseKey: 'opensIn' };
    }
    return { ms: Math.max(0, openMs + day - nowMs), phraseKey: 'opensIn' };
  }

  // Wrap overnight (e.g. Sydney 22–07 UTC)
  const open = isSessionOpen({ openH, closeH }, nowMs);
  const h = new Date(nowMs).getUTCHours();
  if (open) {
    if (h >= openH) {
      const closeMs = sod + day + h2ms(closeH);
      return { ms: Math.max(0, closeMs - nowMs), phraseKey: 'endsIn' };
    }
    const closeMs = sod + h2ms(closeH);
    return { ms: Math.max(0, closeMs - nowMs), phraseKey: 'endsIn' };
  }

  if (h >= closeH && h < openH) {
    const openMs = sod + h2ms(openH);
    return { ms: Math.max(0, openMs - nowMs), phraseKey: 'opensIn' };
  }
  const nextOpen = sod + day + h2ms(openH);
  return { ms: Math.max(0, nextOpen - nowMs), phraseKey: 'opensIn' };
}

/**
 * @param {number} ms
 * @param {(key: string, opts?: object) => string} t — i18next `t` bound to `common` namespace
 */
export function formatSessionEta(ms, t) {
  const dash = t('traderDeck.eta.emDash');
  if (typeof t !== 'function') return dash;
  if (ms == null || !Number.isFinite(ms) || ms < 0) return dash;
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) {
    return t('traderDeck.eta.daysHours', { d: days, h: hrs % 24 });
  }
  if (hrs > 0) {
    return t('traderDeck.eta.hoursMinutes', { h: hrs, m: mins % 60 });
  }
  if (mins > 0) {
    return t('traderDeck.eta.minutesOnly', { m: mins });
  }
  return t('traderDeck.eta.lessThanMinute');
}
