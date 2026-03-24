/** Prefix/suffix style display for trade calculator (not full Intl per locale). */
const CCY = {
  USD: { sym: '$', pos: 'before' },
  GBP: { sym: '£', pos: 'before' },
  EUR: { sym: '€', pos: 'before' },
  JPY: { sym: '¥', pos: 'before' },
  AUD: { sym: 'A$', pos: 'before' },
  NZD: { sym: 'NZ$', pos: 'before' },
  CAD: { sym: 'C$', pos: 'before' },
  CHF: { sym: 'CHF ', pos: 'before' },
};

/**
 * @param {number} n
 * @param {string} [currency='USD']
 * @param {number} [fractionDigits=2]
 */
export function formatMoneyAccount(n, currency = 'USD', fractionDigits = 2) {
  const c = String(currency || 'USD').toUpperCase();
  const fd = c === 'JPY' ? 0 : fractionDigits;
  const abs = Math.abs(Number(n) || 0);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: fd, maximumFractionDigits: fd });
  const pref = CCY[c]?.sym ?? `${c} `;
  const neg = Number(n) < 0 ? '-' : '';
  return `${neg}${pref}${str}`;
}

/**
 * Signed P/L for KPIs and lists: leading + on gains; matches Overview behaviour.
 * @param {number|null|undefined} n
 * @param {string} [currency='USD']
 */
export function formatSignedPnL(n, currency = 'USD') {
  if (n == null || Number.isNaN(Number(n))) return formatMoneyAccount(0, currency);
  const v = Number(n);
  const s = formatMoneyAccount(v, currency);
  if (v > 0) return `+${s}`;
  return s;
}

export const ACCOUNT_CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY'];
