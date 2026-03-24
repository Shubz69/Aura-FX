export function hasActualValue(v) {
  if (v == null) return false;
  return String(v).trim() !== '';
}

export function parseEventTimestamp(ev) {
  const raw = ev && (ev.timestamp ?? ev.ts ?? ev.datetime);
  if (raw == null) return null;
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

