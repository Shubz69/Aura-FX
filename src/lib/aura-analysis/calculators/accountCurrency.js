/**
 * Account denomination vs USD for risk sizing and P/L display.
 * FX quotes follow common spot convention: EURUSD = USD per 1 EUR; USDJPY = JPY per 1 USD; USDCHF = CHF per 1 USD.
 */

export const ACCOUNT_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY'];

/**
 * @param {string} c
 * @returns {boolean}
 */
export function isAllowedAccountCurrency(c) {
  return ACCOUNT_CURRENCIES.includes(String(c || '').toUpperCase());
}

/**
 * USD value of one unit of `currency` (e.g. 1 EUR) in USD, using snapshot-style pair keys.
 * @param {string} currency
 * @param {Record<string, number>} rates - e.g. { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 150, USDCHF: 0.88 }
 * @returns {number|null}
 */
export function unitToUsd(currency, rates) {
  const c = String(currency || 'USD').toUpperCase();
  if (c === 'USD') return 1;
  const r = rates || {};
  const direct = r[`${c}USD`];
  if (typeof direct === 'number' && direct > 0) return direct;
  const inv = r[`USD${c}`];
  if (typeof inv === 'number' && inv > 0) return 1 / inv;
  return null;
}

/**
 * Convert an amount denominated in `currency` to USD.
 * @param {number} amount
 * @param {string} currency
 * @param {Record<string, number>} rates
 * @returns {number|null}
 */
export function accountCurrencyToUsd(amount, currency, rates) {
  const c = String(currency || 'USD').toUpperCase();
  if (c === 'USD') return amount;
  const u = unitToUsd(c, rates);
  if (u == null || !Number.isFinite(amount)) return null;
  return amount * u;
}

/**
 * Convert USD amount to account currency.
 * @param {number} usd
 * @param {string} accountCurrency
 * @param {Record<string, number>} rates
 * @returns {number|null}
 */
export function usdToAccountCurrency(usd, accountCurrency, rates) {
  const c = String(accountCurrency || 'USD').toUpperCase();
  if (c === 'USD') return usd;
  const u = unitToUsd(c, rates);
  if (u == null || !Number.isFinite(usd) || u <= 0) return null;
  return usd / u;
}

/**
 * Risk amount in USD for position sizing (balance and risk % are in account currency).
 * @param {{ accountBalance: number, riskPercent: number, accountCurrency?: string, fxRates?: Record<string, number> }} input
 * @returns {{ riskUsd: number|null, riskAccount: number, missingRate?: boolean }}
 */
export function getRiskAmountUsd(input) {
  const riskAccount = (Number(input.accountBalance) * Number(input.riskPercent)) / 100;
  const acc = String(input.accountCurrency || 'USD').toUpperCase();
  if (acc === 'USD') {
    return { riskUsd: riskAccount, riskAccount };
  }
  const rates = input.fxRates || {};
  const riskUsd = accountCurrencyToUsd(riskAccount, acc, rates);
  if (riskUsd == null || !Number.isFinite(riskUsd)) {
    return { riskUsd: null, riskAccount, missingRate: true };
  }
  return { riskUsd, riskAccount };
}

/**
 * Quote currency (3-letter) to USD per 1 unit of quote (for pip value in USD on crosses).
 * @param {string} quoteCcy
 * @param {Record<string, number>} rates
 * @returns {number|null}
 */
export function getQuoteCurrencyUsdRate(quoteCcy, rates) {
  return unitToUsd(String(quoteCcy || '').toUpperCase(), rates);
}

/**
 * Extract mid prices from useLivePrices `prices` map (symbol -> { rawPrice|price }).
 * @param {Record<string, { rawPrice?: string|number, price?: string|number }>} prices
 * @returns {Record<string, number>}
 */
export function buildFxRatesFromPriceMap(prices) {
  if (!prices || typeof prices !== 'object') return {};
  /** @type {Record<string, number>} */
  const out = {};
  const keys = [
    'EURUSD',
    'GBPUSD',
    'USDJPY',
    'USDCHF',
    'AUDUSD',
    'NZDUSD',
    'USDCAD',
    'USDSEK',
    'USDNOK',
    'USDZAR',
    'EURGBP',
    'EURJPY',
    'GBPJPY',
  ];
  for (const sym of keys) {
    const row = prices[sym];
    if (!row) continue;
    const n = parseFloat(row.rawPrice ?? row.price ?? row);
    if (Number.isFinite(n) && n > 0) out[sym] = n;
  }
  return out;
}

/**
 * Convert USD-denominated P/L to account currency for display.
 * @param {number} profitUsd
 * @param {number} lossUsd
 * @param {{ accountCurrency?: string, fxRates?: Record<string, number> }} input
 */
export function convertUsdPnLToAccount(profitUsd, lossUsd, input) {
  const acc = String(input.accountCurrency || 'USD').toUpperCase();
  const rates = input.fxRates || {};
  if (acc === 'USD') {
    return { potentialProfit: profitUsd, potentialLoss: lossUsd };
  }
  return {
    potentialProfit: usdToAccountCurrency(profitUsd, acc, rates) ?? profitUsd,
    potentialLoss: usdToAccountCurrency(lossUsd, acc, rates) ?? lossUsd,
  };
}
