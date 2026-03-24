/**
 * Trader Desk market session windows (UTC hours, aligned with existing TraderDeck SESSIONS).
 * Used for Open/Closed and "Opens in" / "Ends in" countdowns.
 */

export const TRADER_DESK_SESSIONS = [
  { name: 'Sydney', openH: 22, closeH: 7 },
  { name: 'Tokyo', openH: 0, closeH: 9 },
  { name: 'London', openH: 8, closeH: 17 },
  { name: 'New York', openH: 13, closeH: 22 },
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
 * @returns {{ ms: number, phrase: 'Opens in' | 'Ends in' }}
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
      return { ms: Math.max(0, closeMs - nowMs), phrase: 'Ends in' };
    }
    const h = new Date(nowMs).getUTCHours();
    if (h < openH) {
      return { ms: Math.max(0, openMs - nowMs), phrase: 'Opens in' };
    }
    return { ms: Math.max(0, openMs + day - nowMs), phrase: 'Opens in' };
  }

  // Wrap overnight (e.g. Sydney 22–07 UTC)
  const open = isSessionOpen({ openH, closeH }, nowMs);
  const h = new Date(nowMs).getUTCHours();
  if (open) {
    if (h >= openH) {
      const closeMs = sod + day + h2ms(closeH);
      return { ms: Math.max(0, closeMs - nowMs), phrase: 'Ends in' };
    }
    const closeMs = sod + h2ms(closeH);
    return { ms: Math.max(0, closeMs - nowMs), phrase: 'Ends in' };
  }

  if (h >= closeH && h < openH) {
    const openMs = sod + h2ms(openH);
    return { ms: Math.max(0, openMs - nowMs), phrase: 'Opens in' };
  }
  const nextOpen = sod + day + h2ms(openH);
  return { ms: Math.max(0, nextOpen - nowMs), phrase: 'Opens in' };
}

export function formatSessionEta(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) {
    return `${days}d ${hrs % 24}h`;
  }
  if (hrs > 0) {
    return `${hrs}h ${mins % 60}m`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return '<1m';
}
