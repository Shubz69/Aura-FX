/**
 * Cboe Australia — reference + consolidated fundamentals deltas (Twelve Data CXAC).
 * Core quote/EOD/time_series + standard equity fundamentals inherit from us_equities via registry.
 *
 * US-only /analyst_ratings/us_equities is registered on category us_market, not CXAC (use analyst_ratings_light here).
 */

const DAY = 86400000;
const { cboeAustraliaTdExchangeCode, cboeAustraliaMic } = require('./cboeAustraliaMarketGuards');

const EX = () => cboeAustraliaTdExchangeCode();
const REF_OUT = Math.max(80, Math.min(5000, parseInt(process.env.TD_CBOE_AU_REFERENCE_OUTPUTSIZE || '1200', 10) || 1200));
const ETF_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_CBOE_AU_ETF_OUTPUTSIZE || '400', 10) || 400));
const FUNDS_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_CBOE_AU_FUNDS_OUTPUTSIZE || '300', 10) || 300));

const CBOE_AU_REFERENCE_GLOBAL = {
  cboe_au_stocks_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: EX(), outputsize: REF_OUT }],
    description: 'Cboe Australia listings via /stocks',
  },
  cboe_au_etf_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchEtf',
    buildArgs: () => [{ exchange: EX(), outputsize: ETF_OUT }],
    description: 'Cboe Australia ETFs via /etf',
  },
  cboe_au_funds_universe: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchFunds',
    buildArgs: () => [{ country: 'Australia', outputsize: FUNDS_OUT }],
    description: 'Australia funds via /funds (metadata; overlaps ASX ingest — DB keyed by market_category)',
  },
  cboe_au_exchange_schedule: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchExchangeSchedule',
    buildArgs: () => {
      const mic = cboeAustraliaMic();
      const today = new Date().toISOString().slice(0, 10);
      return [{ exchange: mic, start_date: today, end_date: today }];
    },
    description: 'Cboe Australia hours via /exchange_schedule',
  },
  cboe_au_market_movers: {
    ttlMs: 2 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMarketMovers',
    buildArgs: () => [{ exchange: EX(), direction: 'up', outputsize: 30 }],
    description: 'Cboe Australia market movers via /market_movers',
  },
  cboe_au_symbol_search_seed: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchSymbolSearch',
    buildArgs: () => {
      const q = String(process.env.TD_CBOE_AU_SYMBOL_SEARCH_SEED || 'BHP').trim() || 'BHP';
      const os = Math.min(80, Math.max(10, parseInt(process.env.TD_CBOE_AU_SYMBOL_SEARCH_OUTPUTSIZE || '35', 10) || 35));
      return [q, { outputsize: os }];
    },
    description: 'symbol_search seed (TD_CBOE_AU_SYMBOL_SEARCH_SEED)',
  },
};

/** Consolidated statements — tier-2 ingest; DB-backed refresh only (cron), not hot-path. */
const CBOE_AU_CONSOLIDATED_SYMBOL = {
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

const CBOE_AU_DATASETS = { ...CBOE_AU_REFERENCE_GLOBAL, ...CBOE_AU_CONSOLIDATED_SYMBOL };

module.exports = { CBOE_AU_DATASETS };
