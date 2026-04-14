/**
 * Shared Twelve Data ingestion: DB-first reads, dedupe in flight, normalized persistence.
 */

const td = require('../providers/twelveDataClient');
const metrics = require('../tdMetrics');
const { getResolvedSymbol, toCanonical } = require('../../ai/utils/symbol-registry');
const {
  ensurePipelineTables,
  getTwelveDataDataset,
  upsertTwelveDataDataset,
  appendTdIngestRun,
} = require('../pipeline-store');
const { effectiveTtlMs } = require('./datasetTtlPolicy');
const {
  GLOBAL_CANONICAL,
  getCategory,
  categorySupportsSymbol,
  getDatasetDefForCategory,
  listDatasetKeysForCategory,
} = require('./registry');
const { normalizeForNormalizerId } = require('./normalizers');
const { getSymbolsForCategory } = require('./symbolSources');

const inflight = new Map();

function inflightKey(storageCategory, datasetKey, canon) {
  return `${storageCategory}\x00${datasetKey}\x00${canon}`;
}

function metricsFeature(categoryId, datasetKey) {
  if (categoryId === 'us_equities' || categoryId === 'us_market') return `equity-td-${datasetKey}`;
  if (String(categoryId || '').startsWith('venture_')) return `venture-td-${datasetKey}`;
  if (categoryId === 'asx_equities') return `asx-td-${datasetKey}`;
  if (categoryId === 'uk_equities') return `uk-td-${datasetKey}`;
  return `td-${categoryId}-${datasetKey}`;
}

async function invokeClient(def, providerSymbol) {
  const fn = td[def.clientMethod];
  if (typeof fn !== 'function') {
    return { ok: false, status: 0, data: null, error: 'unknown_client_method' };
  }
  const args = def.buildArgs ? def.buildArgs(providerSymbol) : [providerSymbol];
  return fn(...args);
}

/**
 * @param {string} categoryId
 * @param {string} canonical
 * @param {string} datasetKey
 * @param {{ dbFirst?: boolean, allowNetwork?: boolean, forceRefresh?: boolean }} [opts]
 */
async function fetchDataset(categoryId, canonical, datasetKey, opts = {}) {
  const cat = getCategory(categoryId);
  if (!cat) return { ok: false, reason: 'unknown_category', categoryId, datasetKey };

  const def = getDatasetDefForCategory(categoryId, datasetKey);
  if (!def) return { ok: false, reason: 'unknown_dataset', categoryId, datasetKey };
  if (!td.apiKey() || td.primaryDisabled()) return { ok: false, reason: 'td_disabled', categoryId, datasetKey };

  const isGlobal = def.scope === 'global';
  const canon = isGlobal ? GLOBAL_CANONICAL : String(canonical || '').toUpperCase();
  if (!isGlobal && !categorySupportsSymbol(cat, canon)) {
    return { ok: false, reason: 'symbol_not_in_category', categoryId, datasetKey };
  }

  const storageCategory = def.storageCategory;
  const ttlMs = effectiveTtlMs(def, datasetKey);

  await ensurePipelineTables();
  const ik = inflightKey(storageCategory, datasetKey, canon);
  if (inflight.has(ik)) return inflight.get(ik);

  const promise = (async () => {
    try {
      return await fetchDatasetImpl({
        categoryId,
        cat,
        def,
        datasetKey,
        canon,
        isGlobal,
        storageCategory,
        ttlMs,
        opts,
      });
    } finally {
      inflight.delete(ik);
    }
  })();

  inflight.set(ik, promise);
  return promise;
}

async function fetchDatasetImpl(ctx) {
  const { categoryId, def, datasetKey, canon, isGlobal, storageCategory, ttlMs, opts } = ctx;
  const row = await getTwelveDataDataset(canon, storageCategory, datasetKey);
  const now = Date.now();
  let fetchedMs = 0;
  if (row && row.fetched_at) {
    const t = new Date(row.fetched_at).getTime();
    if (Number.isFinite(t)) fetchedMs = t;
  }
  const fresh = row && row.payload && fetchedMs && now - fetchedMs < ttlMs;

  if (opts.dbFirst !== false && fresh && !opts.forceRefresh) {
    return {
      ok: true,
      fromDb: true,
      fresh: true,
      datasetKey,
      categoryId,
      canonical: canon,
      payload: row.payload,
      fetchedAt: row.fetched_at,
    };
  }

  if (opts.allowNetwork === false) {
    if (row && row.payload) {
      return {
        ok: true,
        fromDb: true,
        fresh: false,
        stale: !fresh,
        datasetKey,
        categoryId,
        canonical: canon,
        payload: row.payload,
        fetchedAt: row.fetched_at,
      };
    }
    return { ok: false, reason: 'cache_miss', categoryId, datasetKey };
  }

  const resolved = isGlobal ? { twelveDataSymbol: null, canonical: canon } : getResolvedSymbol(canon);
  const tdSym = resolved.twelveDataSymbol || canon;
  const res = await invokeClient(def, tdSym);

  if (!res.ok || !res.data || res.data.status === 'error') {
    const errMsg = res.error || (res.data && res.data.message) || 'upstream_error';
    await upsertTwelveDataDataset({
      canonicalSymbol: canon,
      providerSymbol: isGlobal ? null : tdSym,
      marketCategory: storageCategory,
      datasetKey,
      freshnessStatus: 'error',
      fetchedAt: new Date(),
      payload: { schemaVersion: 1, datasetKey, error: true, message: String(errMsg).slice(0, 240) },
      errorNote: String(errMsg).slice(0, 500),
      meta: { httpStatus: res.status || 0, categoryId },
    });
    return { ok: false, reason: errMsg, categoryId, datasetKey, httpStatus: res.status };
  }

  const normalized = normalizeForNormalizerId(def.normalizerId, datasetKey, res.data);
  if (!normalized) {
    await upsertTwelveDataDataset({
      canonicalSymbol: canon,
      providerSymbol: isGlobal ? null : tdSym,
      marketCategory: storageCategory,
      datasetKey,
      freshnessStatus: 'error',
      fetchedAt: new Date(),
      payload: { schemaVersion: 1, datasetKey, error: true, message: 'normalize_failed' },
      errorNote: 'normalize_failed',
      meta: { httpStatus: res.status, categoryId },
    });
    return { ok: false, reason: 'normalize_failed', categoryId, datasetKey };
  }

  const nextRefresh = new Date(Date.now() + ttlMs);
  await upsertTwelveDataDataset({
    canonicalSymbol: canon,
    providerSymbol: isGlobal ? null : tdSym,
    marketCategory: storageCategory,
    datasetKey,
    freshnessStatus: 'fresh',
    fetchedAt: new Date(),
    nextRefreshAfter: nextRefresh,
    payload: normalized,
    meta: { httpStatus: res.status, categoryId },
    errorNote: null,
  });

  metrics.bump(metricsFeature(categoryId, datasetKey), 'twelvedata');
  return {
    ok: true,
    fromDb: false,
    fresh: true,
    categoryId,
    datasetKey,
    canonical: canon,
    payload: normalized,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} categoryId
 * @param {{ maxTier?: number, symbolLimit?: number, includeGlobal?: boolean, datasetFilter?: string[], persistRun?: boolean }} opts
 */
async function runCategoryIngest(categoryId, opts = {}) {
  const cat = getCategory(categoryId);
  if (!cat) {
    return { ok: false, reason: 'unknown_category', categoryId };
  }

  const maxTier = Math.max(1, Math.min(3, Number(opts.maxTier) || 2));
  const keys = listDatasetKeysForCategory(categoryId, maxTier);
  const filter = opts.datasetFilter && opts.datasetFilter.length ? new Set(opts.datasetFilter) : null;
  let symbols = getSymbolsForCategory(cat);
  const symLim = Math.max(1, Math.min(120, Number(opts.symbolLimit) || 45));
  symbols = symbols.slice(0, symLim);
  const includeGlobal = opts.includeGlobal !== false;

  const t0 = Date.now();
  const results = [];

  for (const datasetKey of keys) {
    if (filter && !filter.has(datasetKey)) continue;
    const def = getDatasetDefForCategory(categoryId, datasetKey);
    if (!def) continue;
    if (def.scope === 'global') {
      if (!includeGlobal) continue;
      /* eslint-disable no-await-in-loop */
      const r = await fetchDataset(categoryId, GLOBAL_CANONICAL, datasetKey, { allowNetwork: true });
      /* eslint-enable no-await-in-loop */
      results.push({ datasetKey, scope: 'global', ...r });
      continue;
    }
    for (const sym of symbols) {
      if (!categorySupportsSymbol(cat, sym)) continue;
      /* eslint-disable no-await-in-loop */
      const r = await fetchDataset(categoryId, sym, datasetKey, { allowNetwork: true });
      /* eslint-enable no-await-in-loop */
      results.push({ datasetKey, symbol: sym, ...r });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const durationMs = Date.now() - t0;
  const summary = {
    ok: true,
    categoryId,
    durationMs,
    maxTier,
    symbolCount: symbols.length,
    datasetKeys: keys.length,
    resultsCount: results.length,
    successCount: ok,
    failCount: fail,
    results: results.slice(0, 500),
  };

  if (opts.persistRun !== false) {
    const runStatus =
      results.length === 0 ? 'empty' :
      fail === 0 ? 'success' :
      ok > 0 ? 'partial' : 'failed';
    await appendTdIngestRun({
      categoryId,
      runStartedAt: new Date(t0),
      runFinishedAt: new Date(),
      status: runStatus,
      statsJson: {
        durationMs,
        symbolCount: symbols.length,
        resultsCount: results.length,
        successCount: ok,
        failCount: fail,
      },
      errorSummary: fail ? `${fail} failures` : null,
      optionsJson: {
        maxTier,
        includeGlobal,
        symbolLimit: symLim,
        skipIngestDatasetKeys: cat.skipIngestDatasetKeys && cat.skipIngestDatasetKeys.length ? [...cat.skipIngestDatasetKeys] : null,
      },
    });
  }

  return summary;
}

/**
 * Historical OHLCV backfill — delegates to shared ohlcvIngest (Twelve Data primary in that module).
 * @param {string} canonical
 * @param {{ maxChunks?: number }} [opts]
 */
async function requestHistoricalBackfill(canonical, opts = {}) {
  const ohlcv = require('../ohlcvIngest');
  const c = toCanonical(canonical);
  if (!c) return { ok: false, reason: 'bad_symbol' };
  const maxChunks = Math.max(1, Math.min(48, Number(opts.maxChunks) || 12));
  return ohlcv.ingestSymbolHistoricalBackfill(c, maxChunks);
}

/**
 * Incremental OHLCV refresh for one symbol.
 * @param {string} canonical
 */
async function requestIncrementalOhlcv(canonical) {
  const ohlcv = require('../ohlcvIngest');
  const c = toCanonical(canonical);
  if (!c) return { ok: false, reason: 'bad_symbol' };
  return ohlcv.ingestSymbolIncremental(c);
}

module.exports = {
  fetchDataset,
  runCategoryIngest,
  requestHistoricalBackfill,
  requestIncrementalOhlcv,
  invokeClient,
  inflightSize: () => inflight.size,
};
