/**
 * External store for muted channel IDs so toggling mute does not re-render the whole Community page.
 * Only components that call useSyncExternalStore(subscribe, getSnapshot, …) re-render.
 */

let muted = new Set();
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {
      /* ignore */
    }
  });
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot() {
  return muted;
}

export function getServerSnapshot() {
  return new Set();
}

export function hydrateFromStorage(userId) {
  if (!userId) {
    muted = new Set();
    emit();
    return;
  }
  try {
    const saved = localStorage.getItem(`mutedChannels_${userId}`);
    muted = new Set(saved ? JSON.parse(saved) : []);
  } catch {
    muted = new Set();
  }
  emit();
}

function persist(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(`mutedChannels_${userId}`, JSON.stringify([...muted]));
  } catch (_) {
    /* ignore */
  }
}

let persistTimer = null;
function schedulePersist(userId) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist(userId);
  }, 0);
}

export function toggleChannel(channelId, category, userId) {
  if (category === 'announcements') return;
  const id = String(channelId);
  const next = new Set(muted);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  muted = next;
  emit();
  schedulePersist(userId);
}

/** Synchronous read (e.g. WebSocket toast logic) — no re-render */
export function has(channelId) {
  return muted.has(String(channelId));
}
