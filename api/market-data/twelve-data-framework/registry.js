/**
 * Category capability registry — maps each market category to Twelve Data dataset defs,
 * storage key (market_category column), symbol universe, and readiness.
 *
 * Adding a category:
 * 1. Add entry below with storageCategory, symbolSource, supportsSymbol, readiness.
 * 2. Either define `datasets` or set inheritsDatasetTemplatesFrom: 'us_equities' | 'forex'.
 * 3. Wire a cron (optional) calling runCategoryIngest('<id>', opts) from ingestOrchestrator.
 *
 * Ready now: us_market (primary US), us_equities (base template for inheritance), uk_equities (LSE/AIM-style),
 * cboe_europe_equities_uk (BCXE narrow), asx_equities, cboe_australia (CXAC), venture_* (config regional),
 * forex, crypto.
 * Partial: indices, commodities (equity-style TD where symbols resolve).
 * Stub: international_equities (env symbol lists).
 */

const DAY = 86400000;

const {
  EQUITY_TWELVE_DATA_DATASETS,
  GLOBAL_CANONICAL,
} = require('../equities/twelveDataEquityCapabilities');
const { DATASET_KIND, KIND_LABEL } = require('./datasetKinds');
const {
  getAssetClass,
  supportsEquityTwelveDataDatasets,
  usesForexSessionContext,
  toCanonical,
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
  isVentureRegionalEquity,
} = require('../../ai/utils/symbol-registry');
const { buildVentureRegistryCategories } = require('../equities/ventureRemainingMarkets');
const { parseEnvSymbolList } = require('./symbolSources');
const { ASX_REFERENCE_DATASETS } = require('../equities/asxTwelveDataReference');
const { UK_REFERENCE_DATASETS } = require('../equities/ukTwelveDataReference');
const { CBOE_UK_DATASETS } = require('../equities/cboeEuropeUkTwelveData');
const { CBOE_AU_DATASETS } = require('../equities/cboeAustraliaTwelveData');
const { US_MARKET_DATASETS } = require('../equities/usMarketTwelveData');

function inferDatasetKind(datasetKey) {
  const k = String(datasetKey || '');
  if (k.includes('calendar') || k.startsWith('ipo_')) return DATASET_KIND.CALENDAR;
  if (k.includes('insider') || k.includes('institutional') || k.includes('fund_holders')) {
    return DATASET_KIND.REGULATORY;
  }
  if (
    k.includes('analyst') ||
    k.includes('recommendations') ||
    k.includes('price_target') ||
    k.includes('estimate') ||
    k.includes('eps_trend') ||
    k.includes('growth_estimates')
  ) {
    return DATASET_KIND.ANALYSIS;
  }
  if (k === 'profile' || k === 'logo' || k === 'market_cap' || k === 'stocks_reference_sample') {
    return DATASET_KIND.REFERENCE;
  }
  if (k === 'market_state') return DATASET_KIND.REFERENCE;
  if (k === 'forex_pairs_universe') return DATASET_KIND.REFERENCE;
  if (k === 'eod_latest') return DATASET_KIND.CORE;
  if (k.startsWith('asx_') && k.includes('movers')) return DATASET_KIND.CORE;
  if (k.startsWith('asx_') && k.includes('universe')) return DATASET_KIND.REFERENCE;
  if (k === 'asx_exchange_schedule') return DATASET_KIND.REFERENCE;
  if (k.startsWith('uk_') && k.includes('movers')) return DATASET_KIND.CORE;
  if (k.startsWith('uk_') && (k.includes('universe') || k.includes('symbol_search'))) {
    return DATASET_KIND.REFERENCE;
  }
  if (k === 'uk_exchange_schedule') return DATASET_KIND.REFERENCE;
  if (k.startsWith('cboe_uk_') && k.includes('movers')) return DATASET_KIND.CORE;
  if (k.startsWith('cboe_uk_') && (k.includes('universe') || k.includes('symbol_search'))) {
    return DATASET_KIND.REFERENCE;
  }
  if (k === 'cboe_uk_exchange_schedule') return DATASET_KIND.REFERENCE;
  if (k.startsWith('cboe_au_') && k.includes('movers')) return DATASET_KIND.CORE;
  if (k.startsWith('cboe_au_') && (k.includes('universe') || k.includes('symbol_search'))) {
    return DATASET_KIND.REFERENCE;
  }
  if (k === 'cboe_au_exchange_schedule') return DATASET_KIND.REFERENCE;
  if (k.startsWith('us_') && k.includes('movers')) return DATASET_KIND.CORE;
  if (k.startsWith('us_') && (k.includes('universe') || k.includes('symbol_search'))) {
    return DATASET_KIND.REFERENCE;
  }
  if (k === 'us_exchange_schedule_primary') return DATASET_KIND.REFERENCE;
  if (k.startsWith('us_mutual_funds_')) return DATASET_KIND.REFERENCE;
  if (k.startsWith('venture_') && k.includes('movers')) return DATASET_KIND.CORE;
  if (k.startsWith('venture_') && (k.includes('universe') || k.includes('symbol_search'))) {
    return DATASET_KIND.REFERENCE;
  }
  if (k.startsWith('venture_') && k.includes('exchange_schedule')) return DATASET_KIND.REFERENCE;
  if (
    k.includes('statement') ||
    k.includes('statistics') ||
    k.includes('dividends') ||
    k.includes('splits') ||
    k === 'earnings' ||
    k === 'key_executives' ||
    k === 'press_releases' ||
    k.includes('cash_flow')
  ) {
    return DATASET_KIND.FUNDAMENTALS;
  }
  return DATASET_KIND.FUNDAMENTALS;
}

function enrichEquityDatasets(source) {
  const out = {};
  for (const [key, def] of Object.entries(source)) {
    out[key] = {
      ...def,
      datasetKind: inferDatasetKind(key),
      normalizerId: 'equity',
    };
  }
  return out;
}

const US_EQUITIES_DATASETS = enrichEquityDatasets(EQUITY_TWELVE_DATA_DATASETS);

const ASX_EXTRA_DATASETS = enrichEquityDatasets(ASX_REFERENCE_DATASETS);
const UK_EXTRA_DATASETS = enrichEquityDatasets(UK_REFERENCE_DATASETS);
const CBOE_UK_EXTRA_DATASETS = enrichEquityDatasets(CBOE_UK_DATASETS);
const CBOE_AU_EXTRA_DATASETS = enrichEquityDatasets(CBOE_AU_DATASETS);
const US_MARKET_EXTRA_DATASETS = enrichEquityDatasets(US_MARKET_DATASETS);

const FOREX_DATASETS = {
  market_state: {
    ttlMs: 2 * 3600000,
    ingestTier: 2,
    scope: 'symbol',
    clientMethod: 'fetchMarketState',
    description: 'FX / metals session state (Twelve Data market_state)',
    datasetKind: DATASET_KIND.REFERENCE,
    normalizerId: 'forex',
  },
  eod_latest: {
    ttlMs: 6 * 3600000,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchEod',
    buildArgs: (sym) => [sym, new Date().toISOString().slice(0, 10)],
    description: 'EOD for FX / metals pair (current UTC date)',
    datasetKind: DATASET_KIND.CORE,
    normalizerId: 'forex',
  },
  forex_pairs_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchForexPairs',
    buildArgs: () => [{}],
    description: 'Twelve Data /forex_pairs reference universe',
    datasetKind: DATASET_KIND.REFERENCE,
    normalizerId: 'forex',
  },
};

/** Twelve Data crypto-first datasets (not equity fundamentals). Quote/time_series use marketDataLayer. */
const CRYPTO_DATASETS = {
  market_state: {
    ttlMs: 2 * 3600000,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchMarketState',
    description: 'Crypto pair venue state (Twelve Data market_state)',
    datasetKind: DATASET_KIND.REFERENCE,
    normalizerId: 'crypto',
  },
  eod_latest: {
    ttlMs: 6 * 3600000,
    ingestTier: 1,
    scope: 'symbol',
    clientMethod: 'fetchEod',
    buildArgs: (sym) => [sym, new Date().toISOString().slice(0, 10)],
    description: 'EOD for crypto pair (current UTC date)',
    datasetKind: DATASET_KIND.CORE,
    normalizerId: 'crypto',
  },
  cryptocurrencies_universe: {
    ttlMs: 1 * DAY,
    ingestTier: 2,
    scope: 'global',
    clientMethod: 'fetchCryptocurrencies',
    buildArgs: () => [{ currency_quote: 'USD' }],
    description: '/cryptocurrencies reference (USD quote universe)',
    datasetKind: DATASET_KIND.REFERENCE,
    normalizerId: 'crypto',
  },
};

/**
 * @typedef {'ready'|'partial'|'stub'} Readiness
 * @typedef {{
 *   id: string,
 *   label: string,
 *   storageCategory: string,
 *   readiness: Readiness,
 *   symbolSource?: string,
 *   supportsSymbol?: (canonical: string) => boolean,
 *   datasets?: Record<string, object>,
 *   inheritsDatasetTemplatesFrom?: string,
 *   skipIngestDatasetKeys?: string[],
 *   notes?: string,
 * }} CategoryDef
 */

/** @type {Record<string, CategoryDef>} */
const CATEGORIES = {
  forex: {
    id: 'forex',
    label: 'Forex & spot metals',
    storageCategory: 'forex',
    readiness: 'ready',
    symbolSource: 'fxTier1',
    supportsSymbol: (c) => usesForexSessionContext(toCanonical(c)),
    capabilities: {
      reference: true,
      core: true,
      timeSeries: true,
      conversion: true,
      technicalIndicators: 'central_env_gated',
    },
    datasets: { ...FOREX_DATASETS },
    notes:
      'Live quote/candles: marketDataLayer (Twelve Data). OHLCV: market_ohlcv_* via ohlcvIngest. Conversion: fetchCurrencyConversionNormalized / fetchExchangeRateNormalized. Reference ingest: /api/cron/forex-twelvedata-ingest.',
  },
  us_equities: {
    id: 'us_equities',
    label: 'US equities base (inheritance template)',
    storageCategory: 'equity',
    readiness: 'ready',
    symbolSource: 'watchlistStocksEtfs',
    supportsSymbol: (c) =>
      supportsEquityTwelveDataDatasets(c) &&
      !isAsxListedEquity(toCanonical(c)) &&
      !isUkListedEquity(toCanonical(c)) &&
      !isCboeEuropeUkListedEquity(toCanonical(c)) &&
      !isCboeAustraliaListedEquity(toCanonical(c)) &&
      !isVentureRegionalEquity(toCanonical(c)),
    datasets: US_EQUITIES_DATASETS,
    notes:
      'Base Twelve Data equity dataset map for categories that inherit from us_equities. Prefer category us_market for primary US ingest and routing; storageCategory stays equity for all US rows.',
  },
  us_market: {
    id: 'us_market',
    label: 'United States (full market)',
    storageCategory: 'equity',
    readiness: 'ready',
    symbolSource: 'watchlistStocksEtfs',
    supportsSymbol: (c) =>
      supportsEquityTwelveDataDatasets(c) &&
      !isAsxListedEquity(toCanonical(c)) &&
      !isUkListedEquity(toCanonical(c)) &&
      !isCboeEuropeUkListedEquity(toCanonical(c)) &&
      !isCboeAustraliaListedEquity(toCanonical(c)) &&
      !isVentureRegionalEquity(toCanonical(c)),
    inheritsDatasetTemplatesFrom: 'us_equities',
    skipIngestDatasetKeys: ['stocks_reference_sample'],
    datasets: { ...US_MARKET_EXTRA_DATASETS },
    capabilities: {
      reference: true,
      core: true,
      timeSeries: true,
      fundamentals: true,
      analysis: true,
      regulatory: true,
      mutualFunds: true,
    },
    notes:
      'Top-tier US category: inherits base equity datasets + NYSE/NASDAQ /stocks, US /funds, /symbol_search seed, schedule, movers, consolidated statements, /analyst_ratings/us_equities, /mutual_funds/family|type. Cron: /api/cron/equity-twelvedata-ingest (us_market). Env: TD_US_* output sizes, TWELVE_DATA_US_EXCHANGE_MIC, TD_US_SYMBOL_SEARCH_SEED.',
  },
  uk_equities: {
    id: 'uk_equities',
    label: 'UK equities (LSE / AIM-style)',
    storageCategory: 'uk_equity',
    readiness: 'ready',
    symbolSource: 'watchlistUk',
    supportsSymbol: (c) => isUkListedEquity(toCanonical(c)),
    inheritsDatasetTemplatesFrom: 'us_equities',
    datasets: { ...UK_EXTRA_DATASETS },
    capabilities: {
      reference: true,
      core: true,
      timeSeries: true,
      fundamentals: true,
      analysis: 'partial',
      regulatory: 'partial',
    },
    notes:
      'Canonical TICKER.L; Twelve Data symbol TICKER:LSE (TWELVE_DATA_UK_EXCHANGE_CODE). Ingest /api/cron/uk-twelvedata-ingest. OHLCV: shared pipeline + DB-first daily reads. Hot-path dataset reads are DB-first (cron allowNetwork). Mutual-funds /world/* not integrated (global metadata, not UK equity workflow). /analyst_ratings/us_equities not used.',
  },
  cboe_europe_equities_uk: {
    id: 'cboe_europe_equities_uk',
    label: 'Cboe Europe Equities UK (BCXE)',
    storageCategory: 'cboe_uk_equity',
    readiness: 'ready',
    symbolSource: 'watchlistCboeUk',
    supportsSymbol: (c) => isCboeEuropeUkListedEquity(toCanonical(c)),
    datasets: { ...CBOE_UK_EXTRA_DATASETS },
    capabilities: {
      reference: true,
      core: true,
      timeSeries: true,
      fundamentals: false,
      analysis: false,
      regulatory: false,
    },
    notes:
      'Narrow BCXE feed: reference (/stocks, /funds, /bonds, /symbol_search seed) + symbol core (market_state, eod). Live quote/candles/EOD: marketDataLayer (Twelve Data). Canonical TICKER.BCXE; TD TICKER:BCXE (TWELVE_DATA_CBOE_UK_EXCHANGE_CODE). Ingest /api/cron/cboe-uk-twelvedata-ingest. Does not inherit US fundamentals — differentiate from LSE/AIM (.L).',
  },
  international_equities: {
    id: 'international_equities',
    label: 'International equities',
    storageCategory: 'international_equities',
    readiness: 'stub',
    symbolSource: 'envIntlEquities',
    supportsSymbol: (c) => parseEnvSymbolList(process.env.INTL_EQ_INGEST_SYMBOLS).includes(toCanonical(c)),
    inheritsDatasetTemplatesFrom: 'us_equities',
    notes: 'Stub; set INTL_EQ_INGEST_SYMBOLS for non-US listings.',
  },
  asx_equities: {
    id: 'asx_equities',
    label: 'Australian Securities Exchange (ASX)',
    storageCategory: 'asx_equity',
    readiness: 'ready',
    symbolSource: 'watchlistAsx',
    supportsSymbol: (c) => isAsxListedEquity(toCanonical(c)),
    inheritsDatasetTemplatesFrom: 'us_equities',
    datasets: { ...ASX_EXTRA_DATASETS },
    capabilities: {
      reference: true,
      core: true,
      timeSeries: true,
      fundamentals: true,
      /** Twelve Data coverage for non-US listings is often thinner; treat as best-effort vs US. */
      analysis: 'partial',
      regulatory: 'partial',
    },
    notes:
      'Canonical symbols use Yahoo-style TICKER.AX; Twelve Data uses TICKER:ASX. Ingest: /api/cron/asx-twelvedata-ingest. OHLCV: shared pipeline + DB-first daily reads in marketDataLayer. Analyst/ownership datasets may be empty or error upstream—reads are DB-first on hot paths (use cron/allowNetwork for refresh). US-scoped routes (e.g. analyst_ratings/us_equities) are not applied to ASX.',
  },
  cboe_australia: {
    id: 'cboe_australia',
    label: 'Cboe Australia (CXAC)',
    storageCategory: 'cboe_au_equity',
    readiness: 'ready',
    symbolSource: 'watchlistCboeAu',
    supportsSymbol: (c) => isCboeAustraliaListedEquity(toCanonical(c)),
    inheritsDatasetTemplatesFrom: 'us_equities',
    skipIngestDatasetKeys: [
      'stocks_reference_sample',
    ],
    datasets: { ...CBOE_AU_EXTRA_DATASETS },
    capabilities: {
      reference: true,
      core: true,
      timeSeries: true,
      fundamentals: true,
      analysis: 'partial',
      regulatory: 'partial',
    },
    notes:
      'Canonical TICKER.CXAC (distinct from ASX .AX) — never substitute ASX prices or fundamentals for the same ticker. Framework-only wiring (no route hacks). skipIngestDatasetKeys drops inherited US-only noise (e.g. NASDAQ stocks_reference_sample). /analyst_ratings/us_equities not in client. Hot paths: DB/cache-first for datasets; cron /api/cron/cboe-au-twelvedata-ingest. Quotes: Twelve Data primary; see market/prices for fallback policy when TD unavailable.',
  },
  indices: {
    id: 'indices',
    label: 'Indices',
    storageCategory: 'indices',
    readiness: 'partial',
    symbolSource: 'watchlistIndices',
    supportsSymbol: (c) => getAssetClass(toCanonical(c)) === 'index',
    inheritsDatasetTemplatesFrom: 'us_equities',
    notes: 'Uses same Twelve Data equity-style endpoints where symbols resolve.',
  },
  commodities: {
    id: 'commodities',
    label: 'Commodities',
    storageCategory: 'commodities',
    readiness: 'partial',
    symbolSource: 'watchlistCommodities',
    supportsSymbol: (c) => getAssetClass(toCanonical(c)) === 'commodity',
    inheritsDatasetTemplatesFrom: 'us_equities',
    notes: 'Coverage depends on Twelve Data symbol mapping per instrument.',
  },
  crypto: {
    id: 'crypto',
    label: 'Crypto',
    storageCategory: 'crypto',
    readiness: 'ready',
    symbolSource: 'watchlistCrypto',
    supportsSymbol: (c) => getAssetClass(toCanonical(c)) === 'crypto',
    datasets: { ...CRYPTO_DATASETS },
    notes:
      'Live quote/candles: marketDataLayer (Twelve Data primary). OHLCV: ohlcvIngest + MySQL. Conversion: fetchCurrencyConversionNormalized / fetchExchangeRateNormalized.',
  },
  ...buildVentureRegistryCategories(enrichEquityDatasets),
};

function getCategory(categoryId) {
  return CATEGORIES[String(categoryId || '')] || null;
}

function listCategories() {
  return Object.values(CATEGORIES);
}

function categorySupportsSymbol(cat, canonical) {
  if (!cat) return false;
  if (typeof cat.supportsSymbol === 'function') return cat.supportsSymbol(canonical);
  return true;
}

function resolveInheritedDatasets(categoryId, seen = new Set()) {
  if (seen.has(categoryId)) return {};
  seen.add(categoryId);
  const cat = CATEGORIES[categoryId];
  if (!cat) return {};
  let out = {};
  if (cat.inheritsDatasetTemplatesFrom) {
    out = { ...resolveInheritedDatasets(cat.inheritsDatasetTemplatesFrom, seen) };
  }
  if (cat.datasets && Object.keys(cat.datasets).length) {
    out = { ...out, ...cat.datasets };
  }
  return out;
}

/**
 * Full dataset definition for ingest (storageCategory from owning category).
 * @param {string} categoryId
 * @param {string} datasetKey
 */
function getDatasetDefForCategory(categoryId, datasetKey) {
  const cat = CATEGORIES[categoryId];
  if (!cat) return null;
  const key = String(datasetKey || '');
  const local = cat.datasets && cat.datasets[key];
  if (local) return { ...local, storageCategory: cat.storageCategory, categoryId: cat.id };
  if (cat.inheritsDatasetTemplatesFrom) {
    const parentDef = getDatasetDefForCategory(cat.inheritsDatasetTemplatesFrom, key);
    if (!parentDef) return null;
    return {
      ...parentDef,
      storageCategory: cat.storageCategory,
      categoryId: cat.id,
    };
  }
  return null;
}

function listDatasetKeysForCategory(categoryId, maxTier = 2) {
  const cat = getCategory(categoryId);
  const skip =
    cat && Array.isArray(cat.skipIngestDatasetKeys) && cat.skipIngestDatasetKeys.length
      ? new Set(cat.skipIngestDatasetKeys)
      : null;
  const datasets = resolveInheritedDatasets(categoryId);
  const t = Math.max(1, Math.min(3, Number(maxTier) || 2));
  return Object.entries(datasets)
    .filter(([k, d]) => (!skip || !skip.has(k)) && d.ingestTier <= t)
    .map(([k]) => k);
}

function summarizeEndpointGroupsForCategory(categoryId) {
  const datasets = resolveInheritedDatasets(categoryId);
  const byKind = {};
  for (const [key, d] of Object.entries(datasets)) {
    const kind = d.datasetKind || inferDatasetKind(key);
    if (!byKind[kind]) byKind[kind] = [];
    byKind[kind].push(key);
  }
  return Object.entries(byKind).map(([kind, keys]) => ({
    kind,
    label: KIND_LABEL[kind] || kind,
    datasetCount: keys.length,
    sampleKeys: keys.slice(0, 8),
  }));
}

function summarizeRegistryForAdmin() {
  return listCategories().map((c) => ({
    id: c.id,
    label: c.label,
    storageCategory: c.storageCategory,
    readiness: c.readiness,
    symbolSource: c.symbolSource || null,
    inheritsDatasetTemplatesFrom: c.inheritsDatasetTemplatesFrom || null,
    skipIngestDatasetKeys: c.skipIngestDatasetKeys && c.skipIngestDatasetKeys.length ? [...c.skipIngestDatasetKeys] : null,
    capabilities: c.capabilities || null,
    endpointGroups: summarizeEndpointGroupsForCategory(c.id),
    notes: c.notes || null,
  }));
}

module.exports = {
  CATEGORIES,
  DATASET_KIND,
  GLOBAL_CANONICAL,
  getCategory,
  listCategories,
  categorySupportsSymbol,
  getDatasetDefForCategory,
  listDatasetKeysForCategory,
  summarizeEndpointGroupsForCategory,
  summarizeRegistryForAdmin,
  resolveInheritedDatasets,
};
