const POST_LOGIN_TRANSITION_KEY = 'aura_post_login_transition';

/** Routes where we should not run (or consume) the post-login handoff overlay. */
export function isPostLoginTransitionExcludedPath(pathname) {
  const p = pathname == null ? '' : String(pathname);
  return (
    p.startsWith('/login') ||
    p.startsWith('/register') ||
    p.startsWith('/signup') ||
    p.startsWith('/forgot-password') ||
    p.startsWith('/reset-password') ||
    p.startsWith('/verify-mfa') ||
    // Plan selection must render immediately — full-screen post-login loader blocked users here
    p.startsWith('/choose-plan')
  );
}

export function armPostLoginTransition() {
  try {
    sessionStorage.setItem(POST_LOGIN_TRANSITION_KEY, '1');
  } catch (_) {
    // Ignore storage failures (private mode, quotas).
  }
}

export function consumePostLoginTransition() {
  try {
    const armed = sessionStorage.getItem(POST_LOGIN_TRANSITION_KEY) === '1';
    if (armed) {
      sessionStorage.removeItem(POST_LOGIN_TRANSITION_KEY);
    }
    return armed;
  } catch (_) {
    return false;
  }
}
