/**
 * Avatar helpers: only "real" avatars (user-uploaded) are shown as images.
 * When there is no real avatar, UI should show a clean purple transparent circle (CSS .avatar-placeholder).
 */

const DEFAULT_NAMES = [
    'avatar_ai.png',
    'avatar_money.png',
    'avatar_tech.png',
    'avatar_trading.png',
    'default.png',
];

/** True if avatar is a user-uploaded/custom image (data URI or non-default filename). */
export function hasRealAvatar(avatar) {
    if (!avatar || typeof avatar !== 'string') return false;
    const v = avatar.trim();
    if (v.startsWith('data:image')) return true;
    if (v.startsWith('/')) return true; // absolute path to upload
    const name = v.split('/').pop() || v;
    if (DEFAULT_NAMES.includes(name)) return false;
    if (name.startsWith('avatar_') && name.endsWith('.png')) return false;
    return true;
}

/** Minimal valid data URL has comma (e.g. data:image/jpeg;base64,xxxx). Truncated/invalid data URLs cause ERR_INVALID_URL. */
export function isValidDataUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('data:image')) return true; // non-data URLs validated elsewhere
    return url.includes(',') && url.length > 30;
}

/** Returns URL for <img src> when hasRealAvatar(avatar); otherwise null (render placeholder). */
export function resolveAvatarUrl(avatar, baseUrl = '') {
    if (!hasRealAvatar(avatar)) return null;
    const v = (avatar || '').trim();
    if (v.startsWith('data:image')) {
        if (!isValidDataUrl(v)) return null;
        return v;
    }
    if (v.startsWith('http')) return v;
    if (v.startsWith('/')) return baseUrl ? `${baseUrl.replace(/\/$/, '')}${v}` : v;
    return baseUrl ? `${baseUrl.replace(/\/$/, '')}/avatars/${v}` : `/avatars/${v}`;
}

/** Colours users can pick for their placeholder circle when they have no profile pic. */
export const PLACEHOLDER_COLORS = [
    '#8B5CF6', '#6366F1', '#3B82F6', '#0EA5E9', '#06B6D4', '#10B981', '#22C55E', '#84CC16',
    '#EAB308', '#F59E0B', '#EF4444', '#EC4899', '#A855F7', '#14B8A6'
];

const STORAGE_KEY_PREFIX = 'avatar_placeholder_';

/** Stable colour for placeholder circle. Uses saved choice for this user if set, else derived from id/username. */
export function getPlaceholderColor(userIdOrUsername) {
    if (userIdOrUsername == null || userIdOrUsername === '') return PLACEHOLDER_COLORS[0];
    const key = `${STORAGE_KEY_PREFIX}${userIdOrUsername}`;
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(key);
        if (saved && PLACEHOLDER_COLORS.includes(saved)) return saved;
    }
    const str = String(userIdOrUsername);
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
    const idx = Math.abs(hash) % PLACEHOLDER_COLORS.length;
    return PLACEHOLDER_COLORS[idx];
}

/** Save user's chosen placeholder colour (when no profile pic). */
export function setPlaceholderColor(userId, color) {
    if (typeof localStorage === 'undefined' || !userId) return;
    if (color && PLACEHOLDER_COLORS.includes(color)) {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, color);
    } else {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
    }
}
