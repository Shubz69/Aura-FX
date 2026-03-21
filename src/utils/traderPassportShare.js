const KEY = 'aura-trader-passport-pending';

/** Store passport share payload (memory + sessionStorage fallback). */
export function setTraderPassportShare(payload) {
  if (!payload || typeof payload.dataUrl !== 'string') return;
  if (typeof window !== 'undefined') {
    window.__auraTraderPassportStash = payload;
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

/**
 * Take pending passport payload once. Prefer in-memory stash (Strict Mode safe when restored on cancel).
 */
export function popTraderPassportShare() {
  if (typeof window !== 'undefined' && window.__auraTraderPassportStash) {
    const s = window.__auraTraderPassportStash;
    delete window.__auraTraderPassportStash;
    try {
      sessionStorage.removeItem(KEY);
    } catch { /* ignore */ }
    return s;
  }
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
