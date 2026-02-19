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

/** Returns URL for <img src> when hasRealAvatar(avatar); otherwise null (render placeholder). */
export function resolveAvatarUrl(avatar, baseUrl = '') {
    if (!hasRealAvatar(avatar)) return null;
    const v = (avatar || '').trim();
    if (v.startsWith('data:image') || v.startsWith('http')) return v;
    if (v.startsWith('/')) return baseUrl ? `${baseUrl.replace(/\/$/, '')}${v}` : v;
    return baseUrl ? `${baseUrl.replace(/\/$/, '')}/avatars/${v}` : `/avatars/${v}`;
}
