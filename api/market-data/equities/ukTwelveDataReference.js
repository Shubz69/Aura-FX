/**
 * UK (LSE / AIM-style) Twelve Data reference datasets.
 * Core quotes, OHLCV, and fundamentals inherit from us_equities via registry merge.
 *
 * Exchange code defaults to LSE (Twelve Data); override with TWELVE_DATA_UK_EXCHANGE_CODE if needed.
 * Session schedule uses MIC XLON (override TWELVE_DATA_UK_MIC).
 *
 * Skipped intentionally: /mutual_funds/* — global fund metadata, not LSE equity workflow; high cost/low trader value here.
 * Skipped: /analyst_ratings/us_equities — US-scoped; not wired in this codebase.
 */

const DAY = 86400000;

const { ukTwelveDataExchangeCode } = require('./ukMarketGuards');
const REF_OUT = Math.max(80, Math.min(5000, parseInt(process.env.TD_UK_REFERENCE_OUTPUTSIZE || '1200', 10) || 1200));
const ETF_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_UK_ETF_OUTPUTSIZE || '400', 10) || 400));
const FUNDS_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_UK_FUNDS_OUTPUTSIZE || '300', 10) || 300));

/** @type {Record<string, { ttlMs: number, ingestTier: number, scope: string, clientMethod: string, description: string, buildArgs?: Function }>} */
const UK_REFERENCE_DATASETS = {
  uk_stocks_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: ukTwelveDataExchangeCode(), outputsize: REF_OUT }],
    description: 'UK-listed stocks via /stocks (LSE/AIM-style listings per Twelve Data exchange code)',
  },
  uk_etf_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchEtf',
    buildArgs: () => [{ exchange: ukTwelveDataExchangeCode(), outputsize: ETF_OUT }],
    description: 'UK-listed ETFs via /etf',
  },
  uk_funds_universe: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchFunds',
    buildArgs: () => [{ country: 'United Kingdom', outputsize: FUNDS_OUT }],
    description: 'UK funds metadata via /funds (not all are LSE-listed; reference only)',
  },
  uk_exchange_schedule: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchExchangeSchedule',
    buildArgs: () => {
      const mic = String(process.env.TWELVE_DATA_UK_MIC || 'XLON').trim() || 'XLON';
      const today = new Date().toISOString().slice(0, 10);
      return [{ exchange: mic, start_date: today, end_date: today }];
    },
    description: 'London session via /exchange_schedule (MIC: TWELVE_DATA_UK_MIC or XLON)',
  },
  uk_market_movers: {
    ttlMs: 2 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMarketMovers',
    buildArgs: () => [{ exchange: ukTwelveDataExchangeCode(), direction: 'up', outputsize: 30 }],
    description: 'UK market movers (plan-dependent)',
  },
  uk_symbol_search_seed: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchSymbolSearch',
    buildArgs: () => {
      const q = String(process.env.TD_UK_SYMBOL_SEARCH_SEED || 'LLOY').trim() || 'LLOY';
      return [q, { outputsize: Math.min(80, Math.max(10, parseInt(process.env.TD_UK_SYMBOL_SEARCH_OUTPUTSIZE || '40', 10) || 40)) }];
    },
    description: 'symbol_search seed for UK discovery (query TD_UK_SYMBOL_SEARCH_SEED; not a full universe)',
  },
};

module.exports = { UK_REFERENCE_DATASETS };
