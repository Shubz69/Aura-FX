/**
 * Product-facing helpers — routes call these instead of raw Twelve Data paths.
 * Twelve Data remains primary; fallbacks stay inside marketDataLayer where applicable.
 */

const {
  fetchQuoteDto,
  fetchTimeSeriesDto,
  fetchEarliestTimestampCached,
  fetchExchangeRateNormalized,
  fetchCurrencyConversionNormalized,
} = require('../marketDataLayer');
const { getFundamentalsBundleForSymbol, getEquityDataset } = require('../equities/equityDataLayer');
const { fetchDataset } = require('./ingestOrchestrator');
const { getCategory, categorySupportsSymbol } = require('./registry');
const { cboeEuropeUkMic, cboeEuropeUkTdExchangeCode } = require('../equities/cboeEuropeUkMarketGuards');
const {
  toCanonical,
  getResolvedSymbol,
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
  resolveVentureCategoryId,
} = require('../../ai/utils/symbol-registry');
const { equityDatasetReadOpts } = require('../equities/equityReadPolicy');

function resolveCategoryId(symbol, hint) {
  const h = String(hint || '').trim();
  if (h === 'us_equities') return 'us_market';
  if (h) return h;
  const c = toCanonical(symbol);
  const cat = getResolvedSymbol(c);
  if (cat.assetClass === 'forex' || (c === 'XAUUSD' || c === 'XAGUSD')) return 'forex';
  if (isCboeEuropeUkListedEquity(c)) return 'cboe_europe_equities_uk';
  if (isUkListedEquity(c)) return 'uk_equities';
  if (isCboeAustraliaListedEquity(c)) return 'cboe_australia';
  if (isAsxListedEquity(c)) return 'asx_equities';
  const ventureId = resolveVentureCategoryId(c);
  if (ventureId) return ventureId;
  if (cat.assetClass === 'stock') return 'us_market';
  if (cat.assetClass === 'index') return 'indices';
  if (cat.assetClass === 'commodity') return 'commodities';
  if (cat.assetClass === 'crypto') return 'crypto';
  return 'us_market';
}

async function getLatestQuote(symbol, opts = {}) {
  const c = toCanonical(symbol);
  const cat = resolveCategoryId(c, opts.categoryId);
  const feat =
    opts.feature ||
    (cat === 'crypto'
      ? 'crypto-public-quote'
      : cat === 'forex'
        ? 'fx-public-quote'
        : cat === 'cboe_europe_equities_uk'
          ? 'cboe-uk-public-quote'
          : cat === 'uk_equities'
            ? 'uk-public-quote'
            : cat === 'cboe_australia'
              ? 'cboe-au-public-quote'
              : cat === 'asx_equities'
                ? 'asx-public-quote'
                : String(cat).startsWith('venture_')
                  ? 'venture-public-quote'
                  : 'public-quote');
  return fetchQuoteDto(c, { ...opts, feature: feat });
}

async function getCandles(symbol, interval, rangeToken, rangeOpts, opts = {}) {
  const c = toCanonical(symbol);
  const cat = resolveCategoryId(c, opts.categoryId);
  const feat =
    opts.feature ||
    (cat === 'crypto'
      ? 'crypto-public-series'
      : cat === 'forex'
        ? 'fx-public-series'
        : cat === 'cboe_europe_equities_uk'
          ? 'cboe-uk-public-series'
          : cat === 'uk_equities'
            ? 'uk-public-series'
            : cat === 'cboe_australia'
              ? 'cboe-au-public-series'
              : cat === 'asx_equities'
                ? 'asx-public-series'
                : String(cat).startsWith('venture_')
                  ? 'venture-public-series'
                  : 'publicApi');
  return fetchTimeSeriesDto(c, interval, rangeToken, rangeOpts, feat);
}

async function getEarliestBar(symbol, interval, opts = {}) {
  const c = toCanonical(symbol);
  const cat = resolveCategoryId(c, opts.categoryId);
  const feat =
    opts.feature ||
    (cat === 'crypto'
      ? 'crypto-public-earliest'
      : cat === 'forex'
        ? 'fx-public-earliest'
        : cat === 'cboe_europe_equities_uk'
          ? 'cboe-uk-public-earliest'
          : cat === 'uk_equities'
            ? 'uk-public-earliest'
            : cat === 'cboe_australia'
              ? 'cboe-au-public-earliest'
              : cat === 'asx_equities'
                ? 'asx-public-earliest'
                : String(cat).startsWith('venture_')
                  ? 'venture-public-earliest'
                  : 'publicApi');
  return fetchEarliestTimestampCached(c, interval, feat);
}

/**
 * Company / reference overview — profile dataset (normalized).
 * @param {string} symbol
 * @param {{ categoryId?: string } & Parameters<typeof fetchDataset>[3]} opts
 */
async function getCompanyOverview(symbol, opts = {}) {
  const categoryId = resolveCategoryId(symbol, opts.categoryId);
  const c = toCanonical(symbol);
  if (categoryId === 'cboe_europe_equities_uk') {
    const net = opts.allowNetwork !== false;
    const dbFirst = opts.dbFirst !== false;
    const [q, ms, eod] = await Promise.all([
      fetchQuoteDto(c, { ...opts, feature: opts.feature || 'cboe-uk-overview-quote' }),
      fetchDataset('cboe_europe_equities_uk', c, 'market_state', { allowNetwork: net, dbFirst }),
      fetchDataset('cboe_europe_equities_uk', c, 'eod_latest', { allowNetwork: net, dbFirst }),
    ]);
    return {
      ok: true,
      categoryId: 'cboe_europe_equities_uk',
      kind: 'cboe_uk',
      canonical: c,
      datasetKey: 'venue_overview',
      payload: {
        body: {
          symbol: c,
          name: null,
          exchange: cboeEuropeUkTdExchangeCode(),
          mic: cboeEuropeUkMic(),
          country: 'United Kingdom',
          currency: q && q.currency != null ? q.currency : null,
        },
        _venueScope: 'cboe_europe_equities_uk',
        _fundamentalsInScope: false,
      },
      quote: q,
      marketStateDataset: ms && ms.ok ? ms : null,
      eodLatestDataset: eod && eod.ok ? eod : null,
    };
  }
  if (String(categoryId || '').startsWith('venture_')) {
    const vcat = getCategory(categoryId);
    const m = vcat && vcat.ventureExchangeMeta;
    if (m && vcat.capabilities && vcat.capabilities.fundamentals !== true) {
      const net = opts.allowNetwork !== false;
      const dbFirst = opts.dbFirst !== false;
      const [q, ms, eod] = await Promise.all([
        fetchQuoteDto(c, { ...opts, feature: opts.feature || 'venture-overview-quote' }),
        fetchDataset(categoryId, c, 'market_state', { allowNetwork: net, dbFirst }),
        fetchDataset(categoryId, c, 'eod_latest', { allowNetwork: net, dbFirst }),
      ]);
      return {
        ok: true,
        categoryId,
        kind: 'venture_venue',
        canonical: c,
        datasetKey: 'venue_overview',
        payload: {
          body: {
            symbol: c,
            name: null,
            exchange: m.tdExchange,
            mic: m.mic || null,
            country: m.country || null,
            currency: q && q.currency != null ? q.currency : null,
            supportLevel: m.supportLevel,
          },
          _ventureScope: categoryId,
          _fundamentalsInScope: false,
        },
        quote: q,
        marketStateDataset: ms && ms.ok ? ms : null,
        eodLatestDataset: eod && eod.ok ? eod : null,
      };
    }
  }
  if (
    categoryId === 'us_market' ||
    categoryId === 'us_equities' ||
    categoryId === 'asx_equities' ||
    categoryId === 'uk_equities' ||
    categoryId === 'cboe_australia'
  ) {
    return getEquityDataset(c, 'profile', { ...opts, ...equityDatasetReadOpts(opts), categoryId });
  }
  if (categoryId === 'crypto') {
    const [q, ms] = await Promise.all([
      fetchQuoteDto(c, { feature: opts.feature || 'crypto-overview-quote' }),
      fetchDataset('crypto', c, 'market_state', {
        allowNetwork: opts.allowNetwork !== false,
        dbFirst: opts.dbFirst !== false,
      }),
    ]);
    return {
      ok: true,
      kind: 'crypto',
      canonical: c,
      quote: q,
      marketStateDataset: ms.ok ? ms : null,
    };
  }
  return fetchDataset(categoryId, c, 'profile', opts);
}

/**
 * Fundamentals bundle (profile + statistics) — US equities path is battle-tested.
 */
async function getFundamentals(symbol, opts = {}) {
  return getFundamentalsBundleForSymbol(symbol, { ...opts, ...equityDatasetReadOpts(opts) });
}

/**
 * Analyst-oriented datasets merged (price targets, recommendations, light ratings).
 * UK/ASX: many analysis endpoints are US-centric upstream; expect per-dataset ok:false or stale DB rows.
 * Response shape stays { ok, categoryId, canonical, datasets } — inspect each datasets[k].ok / reason.
 * Hot paths use equityDatasetReadOpts (DB-first; no network unless allowNetwork: true).
 */
async function getAnalystData(symbol, opts = {}) {
  const categoryId = resolveCategoryId(symbol, opts.categoryId);
  if (categoryId === 'crypto') {
    return { ok: false, reason: 'not_applicable_crypto', categoryId: 'crypto' };
  }
  const c = toCanonical(symbol);
  if (categoryId === 'cboe_europe_equities_uk') {
    return {
      ok: false,
      reason: 'not_in_scope_cboe_uk',
      categoryId: 'cboe_europe_equities_uk',
      canonical: c,
    };
  }
  const catMeta = getCategory(categoryId);
  if (catMeta && catMeta.capabilities && catMeta.capabilities.analysis === false) {
    return {
      ok: false,
      reason: 'not_in_scope_category',
      categoryId,
      canonical: c,
    };
  }
  const cat = getCategory(categoryId);
  if (!cat || !categorySupportsSymbol(cat, c)) {
    return { ok: false, reason: 'symbol_not_in_category', categoryId };
  }
  const keys = ['price_target', 'recommendations', 'analyst_ratings_light'];
  if (categoryId === 'us_market') keys.push('analyst_ratings_us_equities');
  const readOpts = equityDatasetReadOpts(opts);
  const out = {};
  /* eslint-disable no-await-in-loop */
  for (const k of keys) {
    out[k] = await fetchDataset(categoryId, c, k, { ...opts, ...readOpts });
  }
  /* eslint-enable no-await-in-loop */
  return { ok: true, categoryId, canonical: c, datasets: out };
}

/**
 * Regulatory / ownership style datasets.
 * UK: coverage may be thinner than US; per-dataset ok/reason in `datasets`; DB-first on hot paths.
 */
async function getRegulatoryData(symbol, opts = {}) {
  const categoryId = resolveCategoryId(symbol, opts.categoryId);
  if (categoryId === 'crypto') {
    return { ok: false, reason: 'not_applicable_crypto', categoryId: 'crypto' };
  }
  const c = toCanonical(symbol);
  if (categoryId === 'cboe_europe_equities_uk') {
    return {
      ok: false,
      reason: 'not_in_scope_cboe_uk',
      categoryId: 'cboe_europe_equities_uk',
      canonical: c,
    };
  }
  const catMetaReg = getCategory(categoryId);
  if (catMetaReg && catMetaReg.capabilities && catMetaReg.capabilities.regulatory === false) {
    return {
      ok: false,
      reason: 'not_in_scope_category',
      categoryId,
      canonical: c,
    };
  }
  const cat = getCategory(categoryId);
  if (!cat || !categorySupportsSymbol(cat, c)) {
    return { ok: false, reason: 'symbol_not_in_category', categoryId };
  }
  const keys = ['institutional_holders', 'insider_transactions', 'fund_holders'];
  const readOpts = equityDatasetReadOpts(opts);
  const out = {};
  /* eslint-disable no-await-in-loop */
  for (const k of keys) {
    out[k] = await fetchDataset(categoryId, c, k, { ...opts, ...readOpts });
  }
  /* eslint-enable no-await-in-loop */
  return { ok: true, categoryId, canonical: c, datasets: out };
}

/**
 * Generic dataset read (for admin tools or future routes).
 */
async function getTwelveDataDatasetForCategory(categoryId, symbol, datasetKey, opts = {}) {
  return fetchDataset(categoryId, toCanonical(symbol), datasetKey, opts);
}

/** @param {string} pairSymbol - Twelve Data pair e.g. BTC/USD or USD/EUR */
async function getExchangeRate(pairSymbol, opts = {}) {
  return fetchExchangeRateNormalized(pairSymbol, opts);
}

/** @param {string} pairSymbol - e.g. USD/EUR */
async function convertCurrency(pairSymbol, amount = 1, opts = {}) {
  return fetchCurrencyConversionNormalized(pairSymbol, amount, opts);
}

module.exports = {
  resolveCategoryId,
  getLatestQuote,
  getCandles,
  getEarliestBar,
  getCompanyOverview,
  getFundamentals,
  getAnalystData,
  getRegulatoryData,
  getTwelveDataDatasetForCategory,
  getExchangeRate,
  convertCurrency,
};
