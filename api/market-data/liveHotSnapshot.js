/**
 * Twelve Data–first live hot snapshot: batch quote DTO → legacy snapshot rows.
 * Used by GET /api/markets/snapshot and api/market/prices.fetchPricesForSymbols.
 *
 * - Per-symbol: fetchQuoteDto (shared quote cache with Market Decoder / prices) → legacy row
 * - Miss / invalid: fetchPrice full chain (Stooq-seeded for FX batch) → static fallback
 * - Bounded concurrency (LIVE_HOT_SNAPSHOT_CONCURRENCY, default 12)
 */

'use strict';

const { peekCached } = require('../cache');
const { fetchQuoteDto, isFxLayerSymbol, isCryptoLayerSymbol } = require('./marketDataLayer');
const { quoteKey, QUOTE_TTL_MS, FX_QUOTE_TTL_MS } = require('./cachePolicy');
const {
  toCanonical,
  usesForexSessionContext,
  getAssetClass,
  isCboeEuropeUkListedEquity,
  isUkListedEquity,
  isCboeAustraliaListedEquity,
  isVentureRegionalEquity,
  isAsxListedEquity,
} = require('../ai/utils/symbol-registry');
const tdMetrics = require('./tdMetrics');

const DEFAULT_CONCURRENCY = Math.max(
  1,
  Math.min(32, parseInt(process.env.LIVE_HOT_SNAPSHOT_CONCURRENCY || '12', 10) || 12)
);
const SYMBOL_TIMEOUT_MS = Math.max(
  4000,
  parseInt(process.env.LIVE_HOT_SYMBOL_TIMEOUT_MS || '9000', 10) || 9000
);

function snapshotFeatureFor(canonical) {
  const c = String(canonical || '').toUpperCase();
  if (usesForexSessionContext(c)) return 'fx-snapshot';
  if (getAssetClass(c) === 'crypto') return 'crypto-snapshot';
  if (isCboeEuropeUkListedEquity(c)) return 'cboe-uk-snapshot';
  if (isUkListedEquity(c)) return 'uk-snapshot';
  if (isCboeAustraliaListedEquity(c)) return 'cboe-au-snapshot';
  if (isVentureRegionalEquity(c)) return 'venture-snapshot';
  if (isAsxListedEquity(c)) return 'asx-snapshot';
  return 'snapshot';
}

function quoteLayerCachePrimed(canonical) {
  const c = String(canonical || '').toUpperCase();
  if (!isFxLayerSymbol(c) && !isCryptoLayerSymbol(c)) return null;
  const key = quoteKey(c);
  const ttl = isFxLayerSymbol(c) ? FX_QUOTE_TTL_MS : QUOTE_TTL_MS;
  return peekCached(key, ttl) != null;
}

function isUsablePriceRow(row) {
  if (!row) return false;
  const rp = row.rawPrice != null ? Number(row.rawPrice) : NaN;
  if (!Number.isFinite(rp) || rp <= 0) return false;
  const p = row.price != null ? parseFloat(String(row.price).replace(/,/g, '')) : NaN;
  if (!Number.isFinite(p) || p <= 0 || String(row.price) === '0.00') return false;
  return true;
}

async function withTimeout(promise, ms, fallbackValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallbackValue), ms);
    }),
  ]);
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * @param {string[]} symbols
 * @param {{ concurrency?: number }} [opts]
 * @returns {Promise<{ prices: Record<string, object>, timestamp: number, diagnostics: object }>}
 */
async function buildLiveHotSnapshot(symbols, opts = {}) {
  const started = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const uniq = [
    ...new Set(
      (symbols || [])
        .map((s) => String(s || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  const pricesMod = require('../market/prices');
  const stooqSyms = uniq.filter((s) => pricesMod.STOOQ_FOREX_METALS.has(s));
  const stooqBySymbol =
    stooqSyms.length > 0 ? await pricesMod.fetchStooqBatchMap(stooqSyms) : {};

  let quotePrimedHit = 0;
  let quotePrimedMiss = 0;

  const perSymbol = await mapWithConcurrency(uniq, concurrency, async (symbol) => {
    const canonical = toCanonical(symbol);
    const primed = quoteLayerCachePrimed(canonical);
    if (primed === true) quotePrimedHit += 1;
    else if (primed === false) quotePrimedMiss += 1;

    const feat = snapshotFeatureFor(canonical);
    const dto = await withTimeout(
      fetchQuoteDto(canonical, { feature: feat }),
      SYMBOL_TIMEOUT_MS,
      null
    );

    let row = dto ? pricesMod.legacyPriceRowFromQuoteDto(canonical, dto) : null;
    let resolvedPath = 'twelvedata-dto';

    if (!isUsablePriceRow(row)) {
      resolvedPath = 'full-chain';
      row = await withTimeout(
        pricesMod.fetchPrice(symbol, { stooqBySymbol }),
        SYMBOL_TIMEOUT_MS + 2000,
        null
      );
    }

    if (!isUsablePriceRow(row)) {
      resolvedPath = 'static-fallback';
      row = pricesMod.getFallbackPrice(symbol);
    }

    if (!isUsablePriceRow(row)) {
      return { canonical, symbol, row: null, resolvedPath: 'missing', quoteLayerPrimed: primed };
    }

    return { canonical, symbol, row, resolvedPath, quoteLayerPrimed: primed };
  });

  const prices = {};
  const pathCounts = { 'twelvedata-dto': 0, 'full-chain': 0, 'static-fallback': 0, missing: 0 };
  for (const entry of perSymbol) {
    pathCounts[entry.resolvedPath] = (pathCounts[entry.resolvedPath] || 0) + 1;
    if (entry.row) prices[entry.canonical] = entry.row;
  }

  const durationMs = Date.now() - started;
  const diagnostics = {
    engine: 'liveHotSnapshot:v1',
    symbolCount: uniq.length,
    durationMs,
    concurrency,
    symbolTimeoutMs: SYMBOL_TIMEOUT_MS,
    paths: pathCounts,
    quoteLayerPeek: {
      fxCryptoSymbols: quotePrimedHit + quotePrimedMiss,
      primedTrue: quotePrimedHit,
      primedFalse: quotePrimedMiss,
    },
    symbols: perSymbol.map((p) => ({
      symbol: p.canonical,
      path: p.resolvedPath,
      quoteLayerPrimed: p.quoteLayerPrimed,
      source: p.row?.source || null,
    })),
  };

  tdMetrics.recordLiveHotSnapshotRun(diagnostics);

  return {
    prices,
    timestamp: Date.now(),
    diagnostics,
  };
}

module.exports = {
  buildLiveHotSnapshot,
  snapshotFeatureFor,
};
