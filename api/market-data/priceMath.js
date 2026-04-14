/**
 * Pure math on QuoteDTO / CandleSeriesDTO only (no raw provider fields).
 */

const { emptyQuoteDTO } = require('./dto');
const { toCanonical, getAssetClass } = require('../ai/utils/symbol-registry');

/**
 * @param {import('./dto').QuoteDTO} q
 * @returns {{ change: number|null, changePct: number|null }}
 */
function sessionChangeFromQuote(q) {
  if (!q || q.last == null || !Number.isFinite(q.last)) {
    return { change: null, changePct: null };
  }
  const last = q.last;
  let base = q.prevClose;
  if (base == null || !Number.isFinite(base) || base === 0) {
    base = q.open;
  }
  if (base == null || !Number.isFinite(base) || base === 0) {
    return { change: null, changePct: null };
  }
  const change = last - base;
  const changePct = (change / Math.abs(base)) * 100;
  return { change, changePct };
}

/**
 * Preferred session metrics: vs previous close when available.
 * @param {import('./dto').QuoteDTO} q
 */
function changeVsPreviousClose(q) {
  if (!q || q.last == null || !Number.isFinite(q.last)) {
    return { change: null, changePct: null };
  }
  const pc = q.prevClose;
  if (pc == null || !Number.isFinite(pc) || pc === 0) {
    return { change: null, changePct: null };
  }
  const change = q.last - pc;
  return { change, changePct: (change / Math.abs(pc)) * 100 };
}

/**
 * Same as changeVsPreviousClose (alias for call-site clarity — FX guardrails: no session-open substitute).
 */
function changeVsPreviousCloseOnly(q) {
  return changeVsPreviousClose(q);
}

/**
 * @param {import('./dto').CandleSeriesDTO} series
 * @returns {{ high: number|null, low: number|null, range: number|null, lastClose: number|null }}
 */
function rangeFromSeries(series) {
  const bars = series && Array.isArray(series.bars) ? series.bars : [];
  if (!bars.length) return { high: null, low: null, range: null, lastClose: null };
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of bars) {
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
  }
  const last = bars[bars.length - 1];
  const lastClose = last && Number.isFinite(last.c) ? last.c : null;
  const high = Number.isFinite(hi) ? hi : null;
  const low = Number.isFinite(lo) ? lo : null;
  const range = high != null && low != null ? high - low : null;
  return { high, low, range, lastClose };
}

/**
 * US Treasury yields from Twelve Data often quoted as points (e.g. 4.25). No transform unless scale wrong.
 * @param {string} canonical
 * @param {number} value
 */
function formatYieldPoints(canonical, value) {
  if (!Number.isFinite(value)) return null;
  const y = String(canonical || '').toUpperCase();
  if (/^(US\d{2}Y|DE\d{2}Y|UK\d{2}Y|JP\d{2}Y|IT\d{2}Y)$/.test(y)) {
    return Math.round(value * 10000) / 10000;
  }
  return value;
}

/**
 * Merge partial quote fields into a copy of QuoteDTO with recomputed change if needed.
 * @param {import('./dto').QuoteDTO} q
 */
function ensureDerivedChange(q) {
  const out = emptyQuoteDTO(q);
  const vs = changeVsPreviousClose(out);
  if (vs.change != null && (out.prevClose == null || out.last == null)) {
    return out;
  }
  if (out.last != null && out.prevClose != null && Number.isFinite(out.last) && Number.isFinite(out.prevClose)) {
    return out;
  }
  return out;
}

/**
 * Pip-aware display decimals for FX majors / JPY / spot metals when watchlist has no override.
 * @param {string} canonical
 * @returns {number|null} null = use generic default (e.g. 2)
 */
function displayDecimalsForSymbol(canonical) {
  const c = toCanonical(canonical);
  if (c === 'XAUUSD') return 2;
  if (c === 'XAGUSD') return 3;
  if (getAssetClass(c) === 'crypto') {
    if (/^SHIB|^DOGE|^PEPE|^FLOKI/i.test(c)) return 6;
    if (/^BTC|^ETH/i.test(c)) return 2;
    return null;
  }
  if (!/^[A-Z]{6}$/.test(c)) return null;
  if (getAssetClass(c) !== 'forex') return null;
  if (/JPY$/.test(c)) return 3;
  return 5;
}

/**
 * Dynamic decimals for low-priced crypto when watchlist / heuristics do not pin precision.
 * @param {string} canonical
 * @param {number} rawPrice
 */
function effectiveCryptoDisplayDecimals(canonical, rawPrice) {
  const c = toCanonical(canonical);
  if (getAssetClass(c) !== 'crypto' || !Number.isFinite(rawPrice) || rawPrice <= 0) return null;
  if (rawPrice >= 1000) return 2;
  if (rawPrice >= 1) return 4;
  if (rawPrice >= 0.01) return 5;
  if (rawPrice >= 0.0001) return 6;
  return 8;
}

/**
 * Legacy snapshot / card percent string — extra precision for tiny %-moves on crypto.
 */
/**
 * Standard pip size for G10-style majors (JPY quote: 0.01 pip; else 0.0001).
 * @param {string} canonical
 * @returns {number|null}
 */
function pipSizeForForexCanonical(canonical) {
  const c = toCanonical(canonical);
  if (!/^[A-Z]{6}$/.test(c) || getAssetClass(c) !== 'forex') return null;
  return /JPY$/.test(c) ? 0.01 : 0.0001;
}

/**
 * Whole pips from a price delta (e.g. change vs prev close), for trader-facing copy.
 * @param {string} canonical
 * @param {number} priceDelta
 * @returns {number|null}
 */
function pipsFromPriceDelta(canonical, priceDelta) {
  if (priceDelta == null || !Number.isFinite(priceDelta)) return null;
  const pip = pipSizeForForexCanonical(canonical);
  if (pip == null || pip <= 0) return null;
  return Math.round(priceDelta / pip);
}

function formatChangePercentDisplay(changePct, canonical) {
  if (changePct == null || !Number.isFinite(changePct)) return '0.00';
  const abs = Math.abs(changePct);
  const c = toCanonical(canonical);
  if (getAssetClass(c) === 'crypto') {
    if (abs === 0) return '0.00';
    if (abs < 0.0001) return abs.toFixed(6);
    if (abs < 0.01) return abs.toFixed(4);
  }
  const cls = getAssetClass(c);
  if (cls === 'forex' || c === 'XAUUSD' || c === 'XAGUSD') {
    if (abs === 0) return '0.00';
    if (abs < 0.01) return abs.toFixed(4);
    return abs.toFixed(2);
  }
  return abs.toFixed(2);
}

/**
 * Signed % string for UI (magnitude uses formatChangePercentDisplay pip-/asset-aware rules).
 */
function formatSignedChangePercentDisplay(changePct, canonical) {
  if (changePct == null || !Number.isFinite(changePct)) return null;
  const sign = changePct < 0 ? '-' : '';
  return `${sign}${formatChangePercentDisplay(changePct, canonical)}`;
}

module.exports = {
  sessionChangeFromQuote,
  changeVsPreviousClose,
  changeVsPreviousCloseOnly,
  rangeFromSeries,
  formatYieldPoints,
  ensureDerivedChange,
  displayDecimalsForSymbol,
  effectiveCryptoDisplayDecimals,
  pipSizeForForexCanonical,
  pipsFromPriceDelta,
  formatChangePercentDisplay,
  formatSignedChangePercentDisplay,
};
