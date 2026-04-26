/**
 * Imperative navigation for non-component code (e.g. toast click handlers).
 * Registered from inside <Router> via registerAppNavigate.
 */
let navigateImpl = (to) => {
  if (typeof window !== 'undefined' && typeof to === 'string' && to.startsWith('/')) {
    window.location.assign(to);
  }
};

export function registerAppNavigate(fn) {
  if (typeof fn === 'function') navigateImpl = fn;
}

export function appNavigate(to, opts = {}) {
  if (typeof to !== 'string' || !to.startsWith('/')) return;
  try {
    navigateImpl(to, opts);
  } catch (_) {
    if (typeof window !== 'undefined') window.location.assign(to);
  }
}
