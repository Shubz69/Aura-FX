/**
 * Shared request vs ingest policy for equities (US + ASX + Cboe AU + UK + Cboe UK).
 * Keeps hot paths DB/cache-first; cron and explicit refresh opt into network.
 * Cboe Australia: same as other equity categories — use equityDatasetReadOpts (dbFirst) on routes;
 * `/api/ai/fundamentals` avoids allowNetwork:true for .CXAC so TD+ingest stays primary.
 *
 * UK listing currency / pence normalization: see ukMarketGuards.js (Twelve Data GBX → internal GBP).
 */

const {
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
  isVentureRegionalEquity,
  toCanonical,
} = require('../../ai/utils/symbol-registry');

/** Minimum Twelve Data daily bars before trying Finnhub/FMP/AV OHLCV (decoder stack). */
const US_MIN_DECODER_TD_BARS = 50;
/** ASX, UK, and similar exchanges often need a lower bar count before foreign fallbacks. */
const NON_US_MIN_DECODER_TD_BARS = 12;
/** @deprecated use NON_US_MIN_DECODER_TD_BARS */
const ASX_MIN_DECODER_TD_BARS = NON_US_MIN_DECODER_TD_BARS;

function minTdDailyBarsBeforeOhlcvFallback(canonical) {
  const c = toCanonical(canonical);
  return (
    isAsxListedEquity(c) ||
    isUkListedEquity(c) ||
    isCboeEuropeUkListedEquity(c) ||
    isCboeAustraliaListedEquity(c) ||
    isVentureRegionalEquity(c)
  )
    ? NON_US_MIN_DECODER_TD_BARS
    : US_MIN_DECODER_TD_BARS;
}

/**
 * @param {{ allowNetwork?: boolean, dbFirst?: boolean }} [opts]
 * @returns {{ allowNetwork: boolean, dbFirst: boolean }}
 */
function equityDatasetReadOpts(opts = {}) {
  const dbFirst = opts.dbFirst !== false;
  const allowNetwork = opts.allowNetwork === true;
  return { allowNetwork, dbFirst };
}

module.exports = {
  minTdDailyBarsBeforeOhlcvFallback,
  equityDatasetReadOpts,
  US_MIN_DECODER_TD_BARS,
  NON_US_MIN_DECODER_TD_BARS,
  ASX_MIN_DECODER_TD_BARS,
};
