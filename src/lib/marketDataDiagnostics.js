/**
 * Dev-only counters for GET /api/market/* traffic (StrictMode / polling visibility).
 * Use `marketDataDiagnostics.getSnapshot()` from the console.
 */

const byKey = new Map();
let startedAt = Date.now();

function normalizeKey(url, params) {
  try {
    const u = String(url || '');
    const path = u.includes('/api/market/') ? u.split('/api/market/')[1]?.split('?')[0] || u : u;
    const p = params && typeof params === 'object' ? JSON.stringify(params) : '';
    return `${path}|${p}`;
  } catch {
    return String(url || '');
  }
}

export function recordMarketDataRequest(url, params) {
  if (process.env.NODE_ENV !== 'development') return;
  const key = normalizeKey(url, params);
  byKey.set(key, (byKey.get(key) || 0) + 1);
}

export function getMarketDataDiagnosticsSnapshot() {
  const entries = [...byKey.entries()].sort((a, b) => b[1] - a[1]);
  return {
    env: process.env.NODE_ENV,
    startedAt,
    elapsedMs: Date.now() - startedAt,
    totalCalls: entries.reduce((s, [, n]) => s + n, 0),
    byKey: Object.fromEntries(entries.slice(0, 80)),
  };
}

export function resetMarketDataDiagnostics() {
  byKey.clear();
  startedAt = Date.now();
}

const marketDataDiagnostics = {
  record: recordMarketDataRequest,
  getSnapshot: getMarketDataDiagnosticsSnapshot,
  reset: resetMarketDataDiagnostics,
};

export default marketDataDiagnostics;
