/**
 * When Twelve Data is enabled, do not let fresh Yahoo/Finnhub/Stooq priceCache rows
 * skip fetchQuoteDto for FX / metals (same pattern as cryptoQuotePolicy).
 */

const td = require('./providers/twelveDataClient');
const { toCanonical, usesForexSessionContext } = require('../ai/utils/symbol-registry');

function twelveDataForexPrimaryEnabled() {
  return Boolean(td.apiKey()) && !td.primaryDisabled();
}

/**
 * @param {object|null} cachedRow - entry from prices.js priceCache
 * @param {string} symbol - any input symbol
 */
function shouldIgnoreFreshNonTdForexCache(cachedRow, symbol) {
  if (!cachedRow || !usesForexSessionContext(toCanonical(symbol))) return false;
  if (!twelveDataForexPrimaryEnabled()) return false;
  const src = String(cachedRow.source || '').toLowerCase();
  if (!src || src === 'twelvedata') return false;
  return true;
}

module.exports = {
  twelveDataForexPrimaryEnabled,
  shouldIgnoreFreshNonTdForexCache,
};
