/**
 * Guardrails: Twelve Data remains the authoritative crypto quote path when it can serve.
 * Prefer internal checks here over per-route conditionals.
 */

const td = require('./providers/twelveDataClient');
const { getAssetClass, toCanonical } = require('../ai/utils/symbol-registry');
const { CRYPTO_TD_QUOTE_PRIORITY_V1 } = require('./ohlcvTier1');

function twelveDataCryptoPrimaryEnabled() {
  return Boolean(td.apiKey()) && !td.primaryDisabled();
}

/**
 * When TD is on, do not let a fresh in-memory price row from CoinGecko/CMC/Yahoo/etc.
 * short-circuit the request before `fetchQuoteDto` runs (avoids CG becoming de-facto primary).
 * @param {object|null} cachedRow - entry from priceCache
 * @param {string} symbol - any input symbol
 */
function shouldIgnoreFreshNonTdCryptoCache(cachedRow, symbol) {
  if (!cachedRow || getAssetClass(toCanonical(symbol)) !== 'crypto') return false;
  if (!twelveDataCryptoPrimaryEnabled()) return false;
  const src = String(cachedRow.source || '').toLowerCase();
  if (!src || src === 'twelvedata') return false;
  return true;
}

module.exports = {
  twelveDataCryptoPrimaryEnabled,
  shouldIgnoreFreshNonTdCryptoCache,
  CRYPTO_TD_QUOTE_PRIORITY_V1,
};
