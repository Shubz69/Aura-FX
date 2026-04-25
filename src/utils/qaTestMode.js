/**
 * Non-production QA test mode gate.
 * Enabled only in local/dev contexts via env, URL, or localStorage flag.
 * Never active in production builds unless explicitly configured.
 */
export function isQaTestModeEnabled() {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (process.env.REACT_APP_ENABLE_QA_TEST_MODE === 'true') return true;

  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search || '');
    if (q.get('qa_test_mode') === '1') return true;
    const flag = window.localStorage?.getItem('qaTestMode');
    return flag === '1' || flag === 'true';
  } catch {
    return false;
  }
}

