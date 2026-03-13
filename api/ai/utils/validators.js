/**
 * Data validation for Aura AI: numeric fields, timestamp freshness, response integrity.
 * Reject corrupted or stale data before passing to AI.
 */

const MAX_PRICE_AGE_MS = 60000;   // 60s - treat as stale after this
const WARN_PRICE_AGE_MS = 30000;  // 30s - warn but allow
const MAX_REASONABLE_AGE_MS = 300000; // 5 min - hard reject

/**
 * Parse numeric value safely. Returns null if invalid.
 * @param {*} value
 * @param {{ min?: number, max?: number }} opts
 * @returns {number|null}
 */
function parseNumeric(value, opts = {}) {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  if (opts.min != null && n < opts.min) return null;
  if (opts.max != null && n > opts.max) return null;
  return n;
}

/**
 * Validate price (must be positive and finite). Returns false if invalid.
 * @param {*} price
 * @param {{ allowZero?: boolean }} opts
 */
function isValidPrice(price, opts = { allowZero: false }) {
  const n = parseNumeric(price, { min: opts.allowZero ? 0 : 1e-12 });
  return n !== null && n < 1e15;
}

/**
 * Check timestamp freshness (ms since epoch or seconds).
 * @param {number|string} ts - epoch ms or seconds
 * @returns {{ ageMs: number, isStale: boolean, isExpired: boolean }}
 */
function timestampFreshness(ts) {
  if (ts == null) return { ageMs: Infinity, isStale: true, isExpired: true };
  let ms = Number(ts);
  if (ms < 1e12) ms *= 1000; // assume seconds
  const ageMs = Date.now() - ms;
  return {
    ageMs,
    isStale: ageMs > MAX_PRICE_AGE_MS,
    isExpired: ageMs > MAX_REASONABLE_AGE_MS,
    isWarn: ageMs > WARN_PRICE_AGE_MS,
  };
}

/**
 * Validate market quote object. Returns { valid: boolean, errors: string[] }.
 */
function validateQuote(quote) {
  const errors = [];
  if (!quote || typeof quote !== 'object') {
    return { valid: false, errors: ['Missing or invalid quote object'] };
  }
  const price = quote.price ?? quote.c ?? quote.close;
  if (!isValidPrice(price)) {
    errors.push('Invalid or missing price');
  }
  const ts = quote.timestamp ?? quote.t ?? quote.datetime;
  const freshness = timestampFreshness(ts);
  if (freshness.isExpired) {
    errors.push(`Data too old (${Math.round(freshness.ageMs / 1000)}s)`);
  }
  return {
    valid: errors.length === 0,
    errors,
    dataAgeSeconds: Math.round(freshness.ageMs / 1000),
    isStale: freshness.isStale,
  };
}

/**
 * Sanitize quote for AI: ensure numeric fields are numbers, add data_age_seconds.
 */
function sanitizeQuoteForContext(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const price = parseNumeric(quote.price ?? quote.c ?? quote.close, { min: 0 });
  if (price === null) return null;
  const ts = quote.timestamp ?? quote.t ?? Date.now();
  const { ageMs } = timestampFreshness(ts);
  return {
    symbol: quote.symbol || '',
    price,
    open: parseNumeric(quote.open ?? quote.o) ?? undefined,
    high: parseNumeric(quote.high ?? quote.h) ?? undefined,
    low: parseNumeric(quote.low ?? quote.l) ?? undefined,
    previousClose: parseNumeric(quote.previousClose ?? quote.pc) ?? undefined,
    change: parseNumeric(quote.change) ?? undefined,
    changePercent: parseNumeric(quote.changePercent) ?? undefined,
    timestamp: typeof ts === 'number' ? ts : Date.now(),
    data_age_seconds: Math.round(ageMs / 1000),
    source: quote.source || 'unknown',
  };
}

module.exports = {
  parseNumeric,
  isValidPrice,
  timestampFreshness,
  validateQuote,
  sanitizeQuoteForContext,
  MAX_PRICE_AGE_MS,
  WARN_PRICE_AGE_MS,
  MAX_REASONABLE_AGE_MS,
};
