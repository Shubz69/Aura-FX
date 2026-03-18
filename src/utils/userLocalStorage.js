/**
 * localStorage quota (~5MB). Never store base64 banner/full-size avatars in `user`.
 * Banner: use Profile's userBannerKey. Avatar: URLs only or small data URLs.
 */

const MAX_STORED_AVATAR = 2500;
const MAX_JSON_LEN = 120000;

export function sanitizeUserForLocalStorage(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const u = { ...raw };
  delete u.banner;
  if (typeof u.avatar === 'string') {
    if (u.avatar.startsWith('data:image') && u.avatar.length > MAX_STORED_AVATAR) {
      u.avatar = u.avatar.startsWith('data:image/svg') && u.avatar.length < 800 ? u.avatar : null;
    }
  }
  ['metadata', 'achievements'].forEach((k) => {
    if (u[k] != null && typeof u[k] === 'object') {
      try {
        if (JSON.stringify(u[k]).length > 2000) delete u[k];
      } catch {
        delete u[k];
      }
    }
  });
  if (typeof u.bio === 'string' && u.bio.length > 2000) u.bio = u.bio.slice(0, 2000);
  if (typeof u.address === 'string' && u.address.length > 500) u.address = u.address.slice(0, 500);
  return u;
}

export function setUserInLocalStorage(user) {
  const s = sanitizeUserForLocalStorage(user);
  const minimal = () => ({
    id: s.id ?? user?.id,
    email: s.email ?? user?.email,
    role: s.role ?? user?.role,
    username: s.username ?? user?.username,
    name: s.name ?? user?.name,
    level: s.level ?? user?.level,
    xp: s.xp ?? user?.xp,
    timezone: s.timezone ?? user?.timezone,
    mfaVerified: s.mfaVerified ?? user?.mfaVerified,
    login_streak: s.login_streak ?? user?.login_streak,
  });
  try {
    const str = JSON.stringify(s);
    if (str.length > MAX_JSON_LEN) {
      localStorage.setItem('user', JSON.stringify(minimal()));
      return;
    }
    localStorage.setItem('user', str);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      try {
        localStorage.removeItem('user');
        localStorage.setItem('user', JSON.stringify(minimal()));
      } catch (_) {
        try {
          localStorage.removeItem('user');
          localStorage.setItem(
            'user',
            JSON.stringify({ id: user?.id, email: user?.email, role: user?.role })
          );
        } catch (_) {}
      }
    }
  }
}
