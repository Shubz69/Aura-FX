/**
 * UK listing guardrails: single source for LSE/AIM Twelve Data exchange code,
 * pence (GBX) vs pound (GBP) normalization, and display rules.
 *
 * Internal contract: UK equity QuoteDTO numeric fields are stored in **pounds GBP**
 * where Twelve Data reports GBX (pence), we scale by 0.01 so DB/cache/UI stay consistent.
 */

function ukTwelveDataExchangeCode() {
  return String(process.env.TWELVE_DATA_UK_EXCHANGE_CODE || 'LSE').trim() || 'LSE';
}

/**
 * Twelve Data / some venues use ISO GBX for pence; rare GBp alias.
 * @param {string|null|undefined} currency
 * @returns {boolean}
 */
function isUkQuoteCurrencyPence(currency) {
  const raw = String(currency || '').trim();
  if (!raw) return false;
  if (raw.toUpperCase() === 'GBX') return true;
  return raw === 'GBp';
}

/**
 * Scale factor to convert quoted units → pounds for internal DTOs.
 * @param {string|null|undefined} currency
 * @returns {number}
 */
function ukTdQuoteScaleToPounds(currency) {
  return isUkQuoteCurrencyPence(currency) ? 0.01 : 1;
}

/**
 * Apply pounds scaling to TD quote / price fields (mutates plain object with numeric fields).
 * @param {Record<string, unknown>} data - Twelve Data quote or price payload
 * @param {number} scale
 */
function scaleUkTdNumericFields(data, scale) {
  if (!data || scale === 1) return;
  const keys = [
    'close',
    'price',
    'previous_close',
    'bid',
    'ask',
    'open',
    'high',
    'low',
  ];
  for (const k of keys) {
    if (data[k] == null || data[k] === '') continue;
    const n = typeof data[k] === 'string' ? parseFloat(data[k]) : Number(data[k]);
    if (!Number.isFinite(n)) continue;
    data[k] = n * scale;
  }
}

/**
 * Snapshot/prices display decimals for `.L` symbols when amounts are **pounds** (post-normalization).
 * Avoid treating £1–£10 as "pence" — use extra precision only for sub-£1 handles.
 * @param {string} canonicalUpper
 * @param {number|null} amountInPoundsHint
 * @returns {number}
 */
function ukListingPriceDisplayDecimals(canonicalUpper, amountInPoundsHint) {
  if (!/\.(L|BCXE)$/i.test(canonicalUpper)) return 2;
  const h =
    amountInPoundsHint != null && Number.isFinite(Number(amountInPoundsHint))
      ? Number(amountInPoundsHint)
      : null;
  if (h != null && h > 0 && h < 1) return 4;
  return 2;
}

module.exports = {
  ukTwelveDataExchangeCode,
  isUkQuoteCurrencyPence,
  ukTdQuoteScaleToPounds,
  scaleUkTdNumericFields,
  ukListingPriceDisplayDecimals,
};
