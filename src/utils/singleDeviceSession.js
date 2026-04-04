/**
 * One logged-in account per browser profile (localStorage scope).
 * Clears user-scoped caches when switching users or logging out so data does not leak between accounts.
 */
import { jwtDecode } from 'jwt-decode';

const ME_ENTITLEMENTS_SEED_KEY = 'aura_me_entitlements_seed';

export function decodeTokenUserId(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const d = jwtDecode(token);
    const id = d.id ?? d.userId ?? d.sub;
    if (id == null) return null;
    return String(id);
  } catch {
    return null;
  }
}

/** Active account id from persisted `user` JSON, else from JWT. */
export function getStoredUserId() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    if (u?.id != null && u.id !== '') return String(u.id);
  } catch {
    /* ignore */
  }
  return decodeTokenUserId(localStorage.getItem('token'));
}

export function getUserIdFromLoginPayload(data, token) {
  if (data && (data.id != null || data.userId != null)) {
    return String(data.id ?? data.userId);
  }
  return decodeTokenUserId(token);
}

/**
 * Removes offline caches and per-user keys. Does not remove token/refresh (caller handles auth keys).
 */
export function clearPerAccountLocalCaches() {
  try {
    sessionStorage.removeItem(ME_ENTITLEMENTS_SEED_KEY);
  } catch {
    /* ignore */
  }

  const extraKeys = [
    'welcomeMessageRead',
    'community_message_alerts_banner_dismissed',
    'channelCategoryOrder',
    'channelOrder',
    'collapsedCategories',
  ];
  extraKeys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });

  const prefixes = [
    'daily_login_check_',
    'daily_login_in_progress_',
    'daily_login_error_',
    'channelBadges_',
    'community_messages_',
    'community_channels_cache_',
    'mutedChannels_',
  ];

  const toRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
  } catch {
    /* ignore */
  }
  toRemove.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}

/**
 * If signing in as a different user, wipe cached profile merge source + offline data before new tokens are written.
 */
export function prepareStorageForUserSwitch(nextUserIdFromPayload, nextToken) {
  const nextId =
    nextUserIdFromPayload != null && nextUserIdFromPayload !== ''
      ? String(nextUserIdFromPayload)
      : decodeTokenUserId(nextToken);
  if (!nextId) return;

  const prevId = getStoredUserId();
  if (!prevId || prevId === nextId) return;

  clearPerAccountLocalCaches();
  try {
    localStorage.removeItem('user');
  } catch {
    /* ignore */
  }
}

/**
 * When another tab changes `localStorage.token` to a different user (or logs out), reload so only one session drives the device.
 */
export function installCrossTabAuthSync(onChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    if (e.storageArea !== localStorage || e.key !== 'token') return;
    const oldId = decodeTokenUserId(e.oldValue);
    const newId = decodeTokenUserId(e.newValue);
    if ((oldId || '') !== (newId || '')) {
      onChange({ oldId, newId });
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
