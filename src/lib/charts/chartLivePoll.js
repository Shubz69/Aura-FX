'use strict';

/**
 * Suggested polling interval (ms) for `/api/market/chart-history` so the last bar stays current.
 * @param {string} intervalNorm normalized interval (1, 5, 60, 240, 1D, …)
 */
export function chartHistoryPollIntervalMs(intervalNorm) {
  const s = String(intervalNorm || '60').trim();
  if (s === '1') return 12_000;
  if (s === '5') return 18_000;
  if (s === '15' || s === '30' || s === '45') return 32_000;
  if (s === '60') return 55_000;
  if (s === '240') return 120_000;
  if (s === '1D' || s === 'D') return 240_000;
  if (s === '1W' || s === 'W') return 600_000;
  if (s === '1M' || s === 'M') return 600_000;
  if (s === '1Y' || s === 'Y') return 600_000;
  return 55_000;
}
