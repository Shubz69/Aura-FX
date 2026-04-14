/**
 * ASX-specific Twelve Data reference datasets (exchange-scoped /stocks, /etf, /funds).
 * Core quotes, EOD, time_series, and fundamentals inherit from us_equities via registry merge.
 */

const DAY = 86400000;

const ASX_EXCHANGE = 'ASX';
const REF_OUT = Math.max(80, Math.min(5000, parseInt(process.env.TD_ASX_REFERENCE_OUTPUTSIZE || '1200', 10) || 1200));
const ETF_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_ASX_ETF_OUTPUTSIZE || '400', 10) || 400));
const FUNDS_OUT = Math.max(40, Math.min(2000, parseInt(process.env.TD_ASX_FUNDS_OUTPUTSIZE || '300', 10) || 300));

/** @type {Record<string, { ttlMs: number, ingestTier: number, scope: string, clientMethod: string, description: string, buildArgs?: Function }>} */
const ASX_REFERENCE_DATASETS = {
  asx_stocks_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchStocks',
    buildArgs: () => [{ exchange: ASX_EXCHANGE, outputsize: REF_OUT }],
    description: 'ASX listed stocks via /stocks',
  },
  asx_etf_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchEtf',
    buildArgs: () => [{ exchange: ASX_EXCHANGE, outputsize: ETF_OUT }],
    description: 'ASX-listed ETFs via /etf',
  },
  asx_funds_universe: {
    ttlMs: 2 * DAY,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchFunds',
    buildArgs: () => [{ country: 'Australia', outputsize: FUNDS_OUT }],
    description: 'Australia funds universe via /funds (metadata; not all are ASX-listed)',
  },
  asx_exchange_schedule: {
    ttlMs: 6 * 3600000,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchExchangeSchedule',
    buildArgs: () => {
      const mic = String(process.env.TWELVE_DATA_ASX_MIC || 'XASX').trim() || 'XASX';
      const today = new Date().toISOString().slice(0, 10);
      return [{ exchange: mic, start_date: today, end_date: today }];
    },
    description: 'ASX session hours via /exchange_schedule (MIC: TWELVE_DATA_ASX_MIC or XASX)',
  },
  asx_market_movers: {
    ttlMs: 2 * 3600000,
    ingestTier: 3,
    scope: 'global',
    clientMethod: 'fetchMarketMovers',
    buildArgs: () => [{ exchange: ASX_EXCHANGE, direction: 'up', outputsize: 30 }],
    description: 'ASX market movers (plan-dependent; may be sparse off-session)',
  },
};

module.exports = { ASX_REFERENCE_DATASETS, ASX_EXCHANGE };
