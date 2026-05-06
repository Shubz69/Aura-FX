export function hasActualValue(v) {
  if (v == null) return false;
  return String(v).trim() !== '';
}

/** Browser IANA timezone — correct for display vs server IP guess. */
export function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

/** YYYY-MM-DD for "today" in a given IANA zone (matches getEventDateKeyLocal). */
export function getCalendarDateKeyNow(timeZone) {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone });
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Calendar date offset by whole days, formatted in zone (for "Tomorrow" labels). */
export function getCalendarDateKeyOffsetFromNow(timeZone, offsetDays) {
  try {
    const d = new Date(Date.now() + offsetDays * 86400000);
    return d.toLocaleDateString('en-CA', { timeZone });
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Pretty label for a YYYY-MM-DD bucket in a zone (weekday + month + day). */
export function formatCalendarHeadingDate(dateStr, timeZone) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  try {
    return t.toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
  } catch (_) {
    return t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

export function parseEventTimestamp(ev) {
  const raw = ev && (ev.timestamp ?? ev.ts ?? ev.datetime);
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveUserTimeZone(user) {
  const tz = user && user.timezone ? String(user.timezone).trim() : '';
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
      return tz;
    } catch (_) {
      // fall through
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

export function formatEventTimeLocal(ev, timeZone) {
  const ts = parseEventTimestamp(ev);
  if (!ts) return ev?.time || 'All Day';
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (_) {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

export function getEventDateKeyLocal(ev, timeZone) {
  const ts = parseEventTimestamp(ev);
  if (!ts) return ev?.date || '';
  try {
    return new Date(ts).toLocaleDateString('en-CA', { timeZone });
  } catch (_) {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

const DEFAULT_MAX_COUNTDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Countdown until scheduled release (null after release or if time unknown). */
export function getReleaseCountdownMs(ev, nowMs = Date.now(), maxAheadMs = DEFAULT_MAX_COUNTDOWN_MS) {
  if (hasActualValue(ev.actual)) return null;
  const ts = parseEventTimestamp(ev);
  if (!ts) return null;
  const diff = ts - nowMs;
  if (diff <= 0 || diff > maxAheadMs) return null;
  return diff;
}

/** Format ms as HH:MM:SS or Xd HH:MM:SS for multi-day waits. */
export function formatCountdownMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const dd = Math.floor(h / 24);
  const hh = h % 24;
  if (dd > 0) {
    return `${dd}d ${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** How long after release we keep “hot” polling while `actual` is still empty (provider lag). */
export const ACTUAL_CHASE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Event time passed but actual not in payload yet — keep polling the feed. */
export function isEventWaitingForActual(ev, nowMs = Date.now(), graceAfterMs = ACTUAL_CHASE_GRACE_MS) {
  if (hasActualValue(ev.actual)) return false;
  const ts = parseEventTimestamp(ev);
  if (!ts) return false;
  const delta = nowMs - ts;
  return delta >= 0 && delta <= graceAfterMs;
}

