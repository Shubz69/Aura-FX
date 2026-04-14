/**
 * United States full market — Twelve Data reference, consolidated fundamentals,
 * US-scoped analyst route, and mutual-fund metadata (family / type).
 *
 * Core quote / time_series / EOD and base fundamentals inherit from us_equities via registry.
 * Symbol-scoped rows persist under storageCategory `equity` (us_market category id).
 */

const DAY = 86400000;

const NYSE_OUT = Math.max(80, Math.min(5000, parseInt(process.env.TD_US_NYSE_STOCKS_OUTPUTSIZE || '800', 10) || 800));
const NASDAQ_OUT = Math.max(80, Math.min(5000, parseInt(process.env.TD_US_NASDAQ_STOCKS_OUTPUTSIZE || '800', 10) || 800));
const US_FUNDS_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_US_FUNDS_OUTPUTSIZE || '400', 10) || 400));

function usPrimaryMic() {
  return String(process.env.TWELVE_DATA_US_EXCHANGE_MIC || 'XNYS').trim() || 'XNYS';
}

const US_MARKET_REFERENCE_GLOBAL = {
  us_stocks_nyse_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: 'NYSE', outputsize: NYSE_OUT }],
    description: 'US NYSE listings via /stocks',
  },
  us_stocks_nasdaq_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: 'NASDAQ', outputsize: NASDAQ_OUT }],
    description: 'US NASDAQ listings via /stocks',
  },
  us_funds_reference_universe: {
    ttlMs: 2 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchFunds',
    buildArgs: () => [{ country: 'United States', outputsize: US_FUNDS_OUT }],
    description: 'US funds metadata via /funds',
  },
  us_exchange_schedule_primary: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchExchangeSchedule',
    buildArgs: () => {
      const mic = usPrimaryMic();
      const today = new Date().toISOString().slice(0, 10);
      return [{ exchange: mic, start_date: today, end_date: today }];
    },
    description: 'Primary US session hours via /exchange_schedule (TWELVE_DATA_US_EXCHANGE_MIC)',
  },
  us_market_movers_nyse: {
    ttlMs: 2 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMarketMovers',
    buildArgs: () => [{ exchange: 'NYSE', direction: 'up', outputsize: 30 }],
    description: 'NYSE movers sample via /market_movers',
  },
  us_symbol_search_seed: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchSymbolSearch',
    buildArgs: () => {
      const q = String(process.env.TD_US_SYMBOL_SEARCH_SEED || 'AAPL').trim() || 'AAPL';
      const os = Math.min(80, Math.max(10, parseInt(process.env.TD_US_SYMBOL_SEARCH_OUTPUTSIZE || '35', 10) || 35));
      return [q, { outputsize: os }];
    },
    description: 'symbol_search seed (TD_US_SYMBOL_SEARCH_SEED)',
  },
  us_mutual_funds_family: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMutualFundsFamily',
    buildArgs: () => [{ country: 'United States' }],
    description: 'US mutual fund families via /mutual_funds/family',
  },
  us_mutual_funds_type: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMutualFundsType',
    buildArgs: () => [{ country: 'United States' }],
    description: 'US mutual fund types via /mutual_funds/type',
  },
};

/** Consolidated annual statements — cron / DB refresh; not hot-path per request. */
const US_MARKET_CONSOLIDATED_SYMBOL = {
  income_statement_consolidated_annual: {
    ttlMs: 7 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchIncomeStatement',
    buildArgs: (sym) => [sym, { period: 'annual', consolidated: true }],
    description: 'Income statement (annual, consolidated)',
  },
  balance_sheet_consolidated_annual: {
    ttlMs: 7 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchBalanceSheet',
    buildArgs: (sym) => [sym, { period: 'annual', consolidated: true }],
    description: 'Balance sheet (annual, consolidated)',
  },
  cash_flow_consolidated_annual: {
    ttlMs: 7 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchCashFlow',
    buildArgs: (sym) => [sym, { period: 'annual', consolidated: true }],
    description: 'Cash flow (annual, consolidated)',
  },
};

const US_MARKET_ANALYSIS_SYMBOL = {
  analyst_ratings_us_equities: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchAnalystRatingsUsEquities',
    description: 'Analyst ratings via /analyst_ratings/us_equities',
  },
};

const US_MARKET_DATASETS = {
  ...US_MARKET_REFERENCE_GLOBAL,
  ...US_MARKET_CONSOLIDATED_SYMBOL,
  ...US_MARKET_ANALYSIS_SYMBOL,
};

module.exports = {
  US_MARKET_DATASETS,
};
