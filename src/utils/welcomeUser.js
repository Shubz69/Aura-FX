/**
 * Greeting helpers — always derive from the authenticated user, never a hardcoded name.
 */

/**
 * @param {{ name?: string, username?: string, email?: string } | null | undefined} user
 * @returns {string}
 */
export function getUserFirstName(user) {
  if (!user) return 'Trader';
  const display = String(user.name || user.username || '').trim();
  if (display) {
    const first = display.split(/\s+/)[0];
    if (first) return first;
  }
  const emailLocal = String(user.email || '').split('@')[0].trim();
  if (emailLocal) {
    const token = emailLocal.split(/[._+-]/)[0];
    if (token && /[a-zA-ZÀ-ÿ]/.test(token)) {
      const t = token.toLowerCase();
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
  return 'Trader';
}

/**
 * e.g. "Welcome, Alex" (matches Trader Suite shell eyebrow — no trailing period)
 * @param {{ name?: string, username?: string, email?: string } | null | undefined} user
 */
export function formatWelcomeEyebrow(user) {
  return `Welcome, ${getUserFirstName(user)}`;
}

/**
 * e.g. "Welcome, Alex." (sentence style for dashboards)
 */
export function formatWelcomeSentence(user) {
  return `Welcome, ${getUserFirstName(user)}.`;
}
