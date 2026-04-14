/**
 * Cache keys and TTLs for market data layer (v1).
 * Env overrides: MD_QUOTE_TTL_MS, MD_SERIES_TTL_MS, MD_EARLIEST_TTL_MS
 */

const QUOTE_TTL_MS = Math.max(3000, parseInt(process.env.MD_QUOTE_TTL_MS || '25000', 10) || 25000);
/** FX / metals live quote cache — short TTL (10–30s) so bid/ask and session moves stay credible. */
const FX_QUOTE_TTL_MS = Math.max(
  10000,
  Math.min(30000, parseInt(process.env.MD_FX_QUOTE_TTL_MS || '20000', 10) || 20000)
);
const SERIES_TTL_MS = Math.max(5000, parseInt(process.env.MD_SERIES_TTL_MS || '600000', 10) || 600000);
const EARLIEST_TTL_MS = Math.max(60000, parseInt(process.env.MD_EARLIEST_TTL_MS || '86400000', 10) || 86400000);
/** FX market_state cache — short TTL so session open/close stays relevant. */
const FX_MARKET_STATE_TTL_MS = Math.max(
  15000,
  parseInt(process.env.MD_FX_MARKET_STATE_TTL_MS || '120000', 10) || 120000
);
/** exchange_schedule — session calendar, longer TTL. */
const FX_EXCHANGE_SCHEDULE_TTL_MS = Math.max(
  300000,
  parseInt(process.env.MD_FX_EXCHANGE_SCHEDULE_TTL_MS || '21600000', 10) || 21600000
);
/** Crypto market_state — 24/7 venues; short TTL like FX session hints. */
const CRYPTO_MARKET_STATE_TTL_MS = Math.max(
  15000,
  parseInt(process.env.MD_CRYPTO_MARKET_STATE_TTL_MS || String(FX_MARKET_STATE_TTL_MS), 10) || FX_MARKET_STATE_TTL_MS
);
/** Cached fiat/crypto pair rate (Twelve Data exchange_rate). */
const EXCHANGE_RATE_TTL_MS = Math.max(
  30000,
  parseInt(process.env.MD_EXCHANGE_RATE_TTL_MS || '300000', 10) || 300000
);
/** currency_conversion — slightly longer than raw quote. */
const CURRENCY_CONVERSION_TTL_MS = Math.max(
  30000,
  parseInt(process.env.MD_CURRENCY_CONVERSION_TTL_MS || '600000', 10) || 600000
);
const CALC_VER = 'v1';

function quoteKey(canonical) {
  return `md:${CALC_VER}:quote:${String(canonical || '').toUpperCase()}`;
}

function seriesKey(canonical, interval, rangeToken) {
  return `md:${CALC_VER}:series:${String(canonical || '').toUpperCase()}:${interval}:${rangeToken}`;
}

function earliestKey(canonical, interval) {
  return `md:${CALC_VER}:earliest:${String(canonical || '').toUpperCase()}:${interval}`;
}

function forexMarketStateKey(canonical) {
  return `md:${CALC_VER}:fx_ms:${String(canonical || '').toUpperCase()}`;
}

function forexExchangeScheduleKey(exchange, startDate, endDate) {
  const ex = String(exchange || 'FX').toUpperCase();
  return `md:${CALC_VER}:fx_sched:${ex}:${startDate || '_'}:${endDate || '_'}`;
}

function cryptoMarketStateKey(canonical) {
  return `md:${CALC_VER}:crypto_ms:${String(canonical || '').toUpperCase()}`;
}

function exchangeRateKey(symbolPair) {
  const s = String(symbolPair || '').toUpperCase().replace(/\s+/g, '');
  return `md:${CALC_VER}:exrate:${s}`;
}

function currencyConversionKey(symbolPair, amount) {
  const s = String(symbolPair || '').toUpperCase().replace(/\s+/g, '');
  const a = amount != null ? String(amount) : '1';
  return `md:${CALC_VER}:curconv:${s}:${a}`;
}

module.exports = {
  QUOTE_TTL_MS,
  FX_QUOTE_TTL_MS,
  SERIES_TTL_MS,
  EARLIEST_TTL_MS,
  FX_MARKET_STATE_TTL_MS,
  FX_EXCHANGE_SCHEDULE_TTL_MS,
  CRYPTO_MARKET_STATE_TTL_MS,
  EXCHANGE_RATE_TTL_MS,
  CURRENCY_CONVERSION_TTL_MS,
  quoteKey,
  seriesKey,
  earliestKey,
  forexMarketStateKey,
  forexExchangeScheduleKey,
  cryptoMarketStateKey,
  exchangeRateKey,
  currencyConversionKey,
  CALC_VER,
};
