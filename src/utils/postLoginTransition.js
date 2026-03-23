const POST_LOGIN_TRANSITION_KEY = 'aura_post_login_transition';

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
