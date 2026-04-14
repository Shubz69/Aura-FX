/**
 * Twelve Data — equities / equity-like instruments capability map.
 * Defines which REST endpoints we ingest, TTLs, and how to invoke the client.
 *
 * Skipped or plan-gated at runtime (not listed here):
 * - Consolidated statements duplicate annual in many cases — available as tier-2 keys if needed later.
 * - Some analysis endpoints are high credit cost; kept in tier 3 for optional cron.
 */

const DAY = 86400000;

/** @typedef {{ ttlMs: number, ingestTier: number, scope: 'symbol'|'global', description: string, buildArgs?: (providerSymbol: string) => any[], clientMethod: string }} DatasetDef */

/** @type {Record<string, DatasetDef>} */
const EQUITY_TWELVE_DATA_DATASETS = {
  profile: {
    ttlMs: 1 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchProfile',
    description: 'Company profile / reference',
  },
  statistics: {
    ttlMs: 1 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchStatistics',
    description: 'Key ratios and valuation statistics',
  },
  market_cap: {
    ttlMs: 1 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchMarketCap',
    description: 'Market capitalization series/meta',
  },
  logo: {
    ttlMs: 7 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchLogo',
    description: 'Brand logo URL metadata',
  },
  market_state: {
    ttlMs: 2 * 3600000,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchMarketState',
    description: 'Exchange session state (equities)',
  },
  eod_latest: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchEod',
    buildArgs: (sym) => [sym, new Date().toISOString().slice(0, 10)],
    description: 'Official EOD for current UTC calendar date (may be previous close)',
  },
  income_statement_annual: {
    ttlMs: 7 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchIncomeStatement',
    buildArgs: (sym) => [sym, { period: 'annual', consolidated: false }],
    description: 'Income statement (annual)',
  },
  balance_sheet_annual: {
    ttlMs: 7 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchBalanceSheet',
    buildArgs: (sym) => [sym, { period: 'annual', consolidated: false }],
    description: 'Balance sheet (annual)',
  },
  cash_flow_annual: {
    ttlMs: 7 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchCashFlow',
    buildArgs: (sym) => [sym, { period: 'annual', consolidated: false }],
    description: 'Cash flow (annual)',
  },
  dividends: {
    ttlMs: 1 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchDividends',
    description: 'Historical dividends',
  },
  splits: {
    ttlMs: 7 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchSplits',
    description: 'Stock splits',
  },
  earnings: {
    ttlMs: 1 * DAY,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchEarnings',
    description: 'Reported earnings history',
  },
  key_executives: {
    ttlMs: 7 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchKeyExecutives',
    description: 'Key executives',
  },
  press_releases: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchPressReleases',
    buildArgs: (sym) => [sym, { limit: 20 }],
    description: 'Recent press releases',
  },
  insider_transactions: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchInsiderTransactions',
    buildArgs: (sym) => [sym, { limit: 50 }],
    description: 'Insider transactions',
  },
  institutional_holders: {
    ttlMs: 7 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchInstitutionalHolders',
    description: 'Institutional holders',
  },
  fund_holders: {
    ttlMs: 14 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchFundHolders',
    description: 'Mutual fund holders (high credit cost on some plans)',
  },
  analyst_ratings_light: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchAnalystRatingsLight',
    description: 'Lightweight analyst ratings',
  },
  recommendations: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchRecommendations',
    description: 'Recommendation breakdown',
  },
  price_target: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchPriceTarget',
    description: 'Analyst price targets (often plan-gated)',
  },
  earnings_estimate: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchEarningsEstimate',
    description: 'EPS consensus estimates',
  },
  revenue_estimate: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchRevenueEstimate',
    description: 'Revenue estimates',
  },
  eps_trend: {
    ttlMs: 7 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchEpsTrend',
    description: 'EPS revision trend',
  },
  growth_estimates: {
    ttlMs: 7 * DAY,
    ingestTier: 3,
    scope: 'symbol',
    clientMethod: 'fetchGrowthEstimates',
    description: 'Growth estimate summaries',
  },
  earnings_calendar_window: {
    ttlMs: 4 * 3600000,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchEarningsCalendar',
    buildArgs: () => {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10);
      return [{ start_date: start, end_date: end }];
    },
    description: 'Earnings calendar (next ~14 days, global)',
  },
  ipo_calendar_window: {
    ttlMs: 12 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchIpoCalendar',
    buildArgs: () => {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
      return [{ start_date: start, end_date: end }];
    },
    description: 'IPO calendar window',
  },
  dividends_calendar_window: {
    ttlMs: 12 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchDividendsCalendar',
    buildArgs: () => {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
      return [{ start_date: start, end_date: end }];
    },
    description: 'Dividends calendar window',
  },
  splits_calendar_window: {
    ttlMs: 12 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchSplitsCalendar',
    buildArgs: () => {
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
      return [{ start_date: start, end_date: end }];
    },
    description: 'Splits calendar window',
  },
  stocks_reference_sample: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: 'NASDAQ', outputsize: 25 }],
    description: 'Small NASDAQ listing sample (reference sanity check)',
  },
};

const GLOBAL_CANONICAL = '__GLOBAL__';

function listDatasetKeysByTier(maxTier = 2) {
  return Object.entries(EQUITY_TWELVE_DATA_DATASETS)
    .filter(([, d]) => d.ingestTier <= maxTier)
    .map(([k]) => k);
}

function getDatasetDef(key) {
  return EQUITY_TWELVE_DATA_DATASETS[key] || null;
}

function summarizeCapabilitiesForAdmin() {
  return Object.entries(EQUITY_TWELVE_DATA_DATASETS).map(([key, d]) => ({
    datasetKey: key,
    ingestTier: d.ingestTier,
    scope: d.scope,
    ttlHours: Math.round(d.ttlMs / 3600000),
    description: d.description,
    clientMethod: d.clientMethod,
  }));
}

module.exports = {
  EQUITY_TWELVE_DATA_DATASETS,
  GLOBAL_CANONICAL,
  listDatasetKeysByTier,
  getDatasetDef,
  summarizeCapabilitiesForAdmin,
};
