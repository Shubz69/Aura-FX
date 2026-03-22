/**
 * Attach marketClosed + human session hints to snapshot rows.
 * - Crypto: always "open" for display (24/7).
 * - Forex: retail gap Sat–Sun (Fri ~21 UTC → Sun ~22 UTC) approx.
 * - Equities / indices / futures: prefer Yahoo chart meta.marketState === 'CLOSED'.
 */

const { CRYPTO_SYMBOL_SET, FOREX_SYMBOL_SET } = require('./instrument-universe');

/** Rough retail FX weekend (UTC): Fri 21:00 – Sun 22:00 */
function isRetailForexClosed(d = new Date()) {
  const dow = d.getUTCDay();
  const h = d.getUTCHours();
  if (dow === 6) return true;
  if (dow === 5 && h >= 21) return true;
  if (dow === 0 && h < 22) return true;
  return false;
}

function enrichSnapshotPrices(prices) {
  if (!prices || typeof prices !== 'object') return;
  for (const sym of Object.keys(prices)) {
    const row = prices[sym];
    if (!row || typeof row !== 'object') continue;

    if (CRYPTO_SYMBOL_SET.has(sym)) {
      row.marketClosed = false;
      continue;
    }

    if (FOREX_SYMBOL_SET.has(sym)) {
      row.marketClosed = isRetailForexClosed();
      continue;
    }

    const ms = row.marketState;
    if (ms === 'CLOSED' || ms === 'PREPRE' || ms === 'POSTPOST') {
      row.marketClosed = true;
      continue;
    }

    if (row.marketClosed === undefined) {
      row.marketClosed = false;
    }
  }
}

module.exports = {
  isRetailForexClosed,
  enrichSnapshotPrices,
};
