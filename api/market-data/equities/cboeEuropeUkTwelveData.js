/**
 * Cboe Europe Equities UK — narrow Twelve Data integration (reference + core only).
 * No inheritance from full US equity fundamentals/analysis/regulatory maps.
 *
 * Exchange default: BCXE (override TWELVE_DATA_CBOE_UK_EXCHANGE_CODE).
 */

const DAY = 86400000;
const { cboeEuropeUkTdExchangeCode, cboeEuropeUkMic } = require('./cboeEuropeUkMarketGuards');

const EX = () => cboeEuropeUkTdExchangeCode();
const REF_OUT = Math.max(60, Math.min(4000, parseInt(process.env.TD_CBOE_UK_REFERENCE_OUTPUTSIZE || '800', 10) || 800));
const FUNDS_OUT = Math.max(40, Math.min(1500, parseInt(process.env.TD_CBOE_UK_FUNDS_OUTPUTSIZE || '200', 10) || 200));
const BONDS_OUT = Math.max(40, Math.min(1500, parseInt(process.env.TD_CBOE_UK_BONDS_OUTPUTSIZE || '200', 10) || 200));

/** Symbol-scoped datasets suitable for this venue (no statistics, statements, ownership). */
const CBOE_UK_SYMBOL_CORE = {
  market_state: {
    ttlMs: 2 * 3600000,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchMarketState',
    description: 'Session state (Cboe Europe UK)',
  },
  eod_latest: {
    ttlMs: 6 * 3600000,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchEod',
    buildArgs: (sym) => [sym, new Date().toISOString().slice(0, 10)],
    description: 'EOD (current UTC calendar date)',
  },
};

/** @type {Record<string, object>} */
const CBOE_UK_REFERENCE_GLOBAL = {
  cboe_uk_stocks_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: EX(), outputsize: REF_OUT }],
    description: 'Cboe Europe UK listings via /stocks',
  },
  cboe_uk_funds_universe: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchFunds',
    buildArgs: () => [{ country: 'United Kingdom', outputsize: FUNDS_OUT }],
    description: 'UK funds reference via /funds (overlaps other UK ingests; metadata only)',
  },
  cboe_uk_bonds_universe: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchBonds',
    buildArgs: () => [{ exchange: EX(), outputsize: BONDS_OUT }],
    description: 'Bonds listed for BCXE via /bonds (plan-dependent)',
  },
  cboe_uk_exchange_schedule: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchExchangeSchedule',
    buildArgs: () => {
      const mic = cboeEuropeUkMic();
      const today = new Date().toISOString().slice(0, 10);
      return [{ exchange: mic, start_date: today, end_date: today }];
    },
    description: 'Cboe Europe UK hours via /exchange_schedule',
  },
  cboe_uk_market_movers: {
    ttlMs: 2 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMarketMovers',
    buildArgs: () => [{ exchange: EX(), direction: 'up', outputsize: 25 }],
    description: 'BCXE market movers via /market_movers',
  },
  cboe_uk_symbol_search_seed: {
    ttlMs: 1 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchSymbolSearch',
    buildArgs: () => {
      const q = String(process.env.TD_CBOE_UK_SYMBOL_SEARCH_SEED || 'VOD').trim() || 'VOD';
      const os = Math.min(80, Math.max(10, parseInt(process.env.TD_CBOE_UK_SYMBOL_SEARCH_OUTPUTSIZE || '35', 10) || 35));
      return [q, { outputsize: os }];
    },
    description: 'symbol_search seed (TD_CBOE_UK_SYMBOL_SEARCH_SEED)',
  },
};

const CBOE_UK_DATASETS = { ...CBOE_UK_SYMBOL_CORE, ...CBOE_UK_REFERENCE_GLOBAL };

module.exports = { CBOE_UK_DATASETS };
