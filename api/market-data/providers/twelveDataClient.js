/**
 * Low-level Twelve Data REST client (single responsibility: HTTP + parse).
 *
 * Forex extras: symbol_search, market_state, exchange_schedule (optional).
 * Set TWELVE_DATA_FX_EXCHANGE_MIC when your plan requires a MIC for /exchange_schedule (omit to skip schedule fetch).
 */

const axios = require('axios');
const { recordOutboundRequest } = require('../../utils/providerRequestMeter');
const { withThrottle } = require('../tdRateLimiter');

const BASE = 'https://api.twelvedata.com';
const DEFAULT_TIMEOUT = 9000;
const LONG_TIMEOUT = Math.max(9000, parseInt(process.env.TWELVE_DATA_LONG_TIMEOUT_MS || '25000', 10) || 25000);

function apiKey() {
  return String(process.env.TWELVE_DATA_API_KEY || '').trim();
}

function primaryDisabled() {
  const v = String(process.env.MARKET_DATA_PRIMARY_PROVIDER || 'twelvedata').toLowerCase();
  return v === 'off' || v === 'false' || v === 'legacy';
}

async function getJson(path, params = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const key = apiKey();
  if (!key) return { ok: false, status: 0, data: null, error: 'no_key' };
  const url = `${BASE}${path}`;
  const merged = { ...params, apikey: key };
  return withThrottle(async () => {
    try {
      recordOutboundRequest(url, 1);
      const res = await axios.get(url, { params: merged, timeout: timeoutMs });
      return { ok: res.status === 200, status: res.status, data: res.data, error: null };
    } catch (e) {
      const status = e.response && e.response.status ? e.response.status : 0;
      const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'err';
      return { ok: false, status, data: e.response && e.response.data ? e.response.data : null, error: String(msg) };
    }
  });
}

/**
 * Generic GET for equities/fundamentals/analysis paths not wrapped below.
 * @param {string} path - e.g. '/profile'
 * @param {Record<string,string|number>} [params]
 * @param {{ longTimeout?: boolean }} [opts]
 */
async function apiGet(path, params = {}, opts = {}) {
  const p = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled', data: null };
  const t = opts.longTimeout ? LONG_TIMEOUT : DEFAULT_TIMEOUT;
  return getJson(p, params, t);
}

async function fetchQuote(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/quote', { symbol: sym });
}

async function fetchPrice(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/price', { symbol: sym });
}

async function fetchTimeSeries(providerSymbol, interval, opts = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const params = { symbol: sym, interval: String(interval || '1day') };
  if (opts.outputsize != null) params.outputsize = opts.outputsize;
  if (opts.start_date) params.start_date = opts.start_date;
  if (opts.end_date) params.end_date = opts.end_date;
  if (opts.timezone) params.timezone = opts.timezone;
  return getJson('/time_series', params);
}

async function fetchEarliestTimestamp(providerSymbol, interval) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/earliest_timestamp', { symbol: sym, interval: String(interval || '1day') });
}

/** Symbol discovery (FX and other instruments). */
async function fetchSymbolSearch(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'empty_query' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const params = { symbol: q };
  if (opts.outputsize != null) params.outputsize = opts.outputsize;
  return getJson('/symbol_search', params);
}

/** Session / market open state (useful for FX context). */
async function fetchMarketState(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/market_state', { symbol: sym });
}

/**
 * Trading hours schedule. `exchange` is typically a MIC; override via TWELVE_DATA_FX_EXCHANGE_MIC when TD requires it.
 */
async function fetchExchangeSchedule(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const merged = {
    ...params,
    exchange: params.exchange || String(process.env.TWELVE_DATA_FX_EXCHANGE_MIC || '').trim() || undefined,
  };
  if (!merged.exchange) return { ok: false, error: 'exchange_not_configured' };
  return getJson('/exchange_schedule', merged);
}

/** End-of-day price for a single date. */
async function fetchEod(providerSymbol, date) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const d = date || new Date().toISOString().slice(0, 10);
  return getJson('/eod', { symbol: sym, date: d });
}

/** Exchange listing / reference (pagination via outputsize). */
async function fetchStocks(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/stocks', params);
}

/** ETF listings (e.g. exchange=ASX). */
async function fetchEtf(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/etf', params, LONG_TIMEOUT);
}

/** Mutual / managed funds listings. */
async function fetchFunds(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/funds', params, LONG_TIMEOUT);
}

/** Bond listings / reference (exchange-scoped where supported). */
async function fetchBonds(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/bonds', params, LONG_TIMEOUT);
}

/** Physical FX pair universe (reference / discovery). */
async function fetchForexPairs(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/forex_pairs', params, LONG_TIMEOUT);
}

/** Digital currency universe (reference / discovery). */
async function fetchCryptocurrencies(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/cryptocurrencies', params, LONG_TIMEOUT);
}

/**
 * Fiat or crypto conversion. `symbol` is typically BASE/QUOTE (e.g. USD/EUR, BTC/USD).
 * @param {{ symbol: string, amount?: number|string }} params
 */
async function fetchCurrencyConversion(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const sym = String(params.symbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  const p = { symbol: sym };
  if (params.amount != null) p.amount = params.amount;
  return getJson('/currency_conversion', p, LONG_TIMEOUT);
}

/**
 * Exchange rate for a pair symbol (e.g. BTC/USD, USD/JPY).
 * @param {{ symbol: string }} params
 */
async function fetchExchangeRate(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const sym = String(params.symbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  return getJson('/exchange_rate', { symbol: sym }, LONG_TIMEOUT);
}

/**
 * Market movers (plan-dependent; often equity-oriented — use with care for crypto).
 * @param {Record<string, string|number>} [params]
 */
async function fetchMarketMovers(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/market_movers', params, LONG_TIMEOUT);
}

/**
 * Single technical indicator (central gate — prefer explicit indicator paths).
 * @param {string} indicator - e.g. rsi, macd, sma (Twelve Data path segment)
 * @param {Record<string, string|number>} params - must include symbol, interval, etc.
 */
async function fetchTechnicalIndicator(indicator, params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const ind = String(indicator || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!ind) return { ok: false, error: 'empty_indicator' };
  return getJson(`/${ind}`, params, LONG_TIMEOUT);
}

async function fetchProfile(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/profile', { symbol: sym });
}

async function fetchIncomeStatement(providerSymbol, opts = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const params = { symbol: sym, period: opts.period || 'annual' };
  const path = opts.consolidated ? '/income_statement/consolidated' : '/income_statement';
  return getJson(path, params, LONG_TIMEOUT);
}

async function fetchBalanceSheet(providerSymbol, opts = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const params = { symbol: sym, period: opts.period || 'annual' };
  const path = opts.consolidated ? '/balance_sheet/consolidated' : '/balance_sheet';
  return getJson(path, params, LONG_TIMEOUT);
}

async function fetchCashFlow(providerSymbol, opts = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const params = { symbol: sym, period: opts.period || 'annual' };
  const path = opts.consolidated ? '/cash_flow/consolidated' : '/cash_flow';
  return getJson(path, params, LONG_TIMEOUT);
}

async function fetchDividends(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/dividends', { symbol: sym });
}

async function fetchSplits(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/splits', { symbol: sym });
}

async function fetchStatistics(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/statistics', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchEarnings(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/earnings', { symbol: sym });
}

async function fetchEarningsCalendar(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/earnings_calendar', params);
}

async function fetchIpoCalendar(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/ipo_calendar', params);
}

async function fetchDividendsCalendar(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/dividends_calendar', params);
}

async function fetchSplitsCalendar(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/splits_calendar', params);
}

async function fetchLogo(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/logo', { symbol: sym });
}

async function fetchMarketCap(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/market_cap', { symbol: sym });
}

async function fetchKeyExecutives(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/key_executives', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchPressReleases(providerSymbol, params = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/press_releases', { symbol: sym, ...params }, LONG_TIMEOUT);
}

async function fetchInsiderTransactions(providerSymbol, params = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/insider_transactions', { symbol: sym, ...params }, LONG_TIMEOUT);
}

async function fetchInstitutionalHolders(providerSymbol, params = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/institutional_holders', { symbol: sym, ...params }, LONG_TIMEOUT);
}

async function fetchFundHolders(providerSymbol, params = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/fund_holders', { symbol: sym, ...params }, LONG_TIMEOUT);
}

async function fetchPriceTarget(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/price_target', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchRecommendations(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/recommendations', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchAnalystRatingsLight(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/analyst_ratings/light', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchEarningsEstimate(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/earnings_estimate', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchRevenueEstimate(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/revenue_estimate', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchEpsTrend(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/eps_trend', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchGrowthEstimates(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/growth_estimates', { symbol: sym }, LONG_TIMEOUT);
}

async function fetchAnalystRatingsUsEquities(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return { ok: false, error: 'empty_symbol' };
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  return getJson('/analyst_ratings/us_equities', { symbol: sym }, LONG_TIMEOUT);
}

/**
 * US mutual fund families (global reference). Optional: country, fund_family.
 * @param {Record<string, string>} [params]
 */
async function fetchMutualFundsFamily(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const merged = { ...params };
  if (!merged.country) merged.country = 'United States';
  return getJson('/mutual_funds/family', merged, LONG_TIMEOUT);
}

/**
 * US mutual fund types directory (global reference).
 * @param {Record<string, string>} [params]
 */
async function fetchMutualFundsType(params = {}) {
  if (primaryDisabled()) return { ok: false, error: 'primary_disabled' };
  const merged = { ...params };
  if (!merged.country) merged.country = 'United States';
  return getJson('/mutual_funds/type', merged, LONG_TIMEOUT);
}

module.exports = {
  apiKey,
  primaryDisabled,
  apiGet,
  fetchQuote,
  fetchPrice,
  fetchTimeSeries,
  fetchEarliestTimestamp,
  fetchSymbolSearch,
  fetchMarketState,
  fetchExchangeSchedule,
  fetchEod,
  fetchStocks,
  fetchEtf,
  fetchFunds,
  fetchBonds,
  fetchForexPairs,
  fetchCryptocurrencies,
  fetchCurrencyConversion,
  fetchExchangeRate,
  fetchMarketMovers,
  fetchTechnicalIndicator,
  fetchProfile,
  fetchIncomeStatement,
  fetchBalanceSheet,
  fetchCashFlow,
  fetchDividends,
  fetchSplits,
  fetchStatistics,
  fetchEarnings,
  fetchEarningsCalendar,
  fetchIpoCalendar,
  fetchDividendsCalendar,
  fetchSplitsCalendar,
  fetchLogo,
  fetchMarketCap,
  fetchKeyExecutives,
  fetchPressReleases,
  fetchInsiderTransactions,
  fetchInstitutionalHolders,
  fetchFundHolders,
  fetchPriceTarget,
  fetchRecommendations,
  fetchAnalystRatingsLight,
  fetchEarningsEstimate,
  fetchRevenueEstimate,
  fetchEpsTrend,
  fetchGrowthEstimates,
  fetchAnalystRatingsUsEquities,
  fetchMutualFundsFamily,
  fetchMutualFundsType,
};
