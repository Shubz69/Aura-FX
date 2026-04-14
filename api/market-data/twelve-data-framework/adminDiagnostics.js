/**
 * Super-admin health payload fragment: category coverage, ingest runs, cache/fallback signals.
 */

const { summarizeRegistryForAdmin } = require('./registry');
const { getSymbolsForCategory } = require('./symbolSources');
const {
  listTwelveDataCoverageForStorageCategory,
  listRecentTdIngestRuns,
  getOhlcvIngestSummary,
} = require('../pipeline-store');
const { DEFAULT_TTL_MS, effectiveTtlMs } = require('./datasetTtlPolicy');
const { DATASET_KIND } = require('./datasetKinds');
const { inflightSize } = require('./ingestOrchestrator');

async function buildCategoryCoverageRow(cat) {
  const symbols = getSymbolsForCategory(cat);
  const storage = cat.storageCategory;
  const db =
    symbols.length && storage
      ? await listTwelveDataCoverageForStorageCategory(storage, symbols)
      : { rows: [], aggregates: [] };
  const agg = db.aggregates || [];
  const errorRows = (db.rows || []).filter((r) => r.freshness_status === 'error' || r.error_note);
  return {
    id: cat.id,
    readiness: cat.readiness,
    storageCategory: storage,
    symbolSample: symbols.slice(0, 12),
    symbolCount: symbols.length,
    datasetAggregateCount: agg.length,
    lastIngestByDataset: agg.slice(0, 12).map((a) => ({
      datasetKey: a.dataset_key,
      symbolCount: Number(a.symbol_count || 0),
      lastIngest: a.last_ingest,
    })),
    dbErrorRowsSample: errorRows.slice(0, 8).map((r) => ({
      symbol: r.canonical_symbol,
      datasetKey: r.dataset_key,
      errorNote: r.error_note,
    })),
  };
}

/**
 * @param {{ cacheStats?: object|null, tdSnapshot?: object|null }} ctx
 */
async function buildTwelveDataFrameworkDiagnostics(ctx = {}) {
  const registry = summarizeRegistryForAdmin();
  const categories = registry.map((r) => ({
    ...r,
    defaultTtlByKind: DEFAULT_TTL_MS,
    sampleEffectiveTtlMs: {
      core: effectiveTtlMs({ datasetKind: DATASET_KIND.CORE }),
      reference: effectiveTtlMs({ datasetKind: DATASET_KIND.REFERENCE }, 'profile'),
    },
  }));

  const coverage = [];
  for (const c of registry) {
    /* eslint-disable no-await-in-loop */
    coverage.push(await buildCategoryCoverageRow(c));
    /* eslint-enable no-await-in-loop */
  }

  const ingestRuns = await listRecentTdIngestRuns({ limit: 30 });
  const ohlcv = await getOhlcvIngestSummary();

  const cache = ctx.cacheStats || null;
  const hits = cache ? Number(cache.hits || 0) : 0;
  const misses = cache ? Number(cache.misses || 0) : 0;
  const cacheHitRatio = hits + misses > 0 ? Number((hits / (hits + misses)).toFixed(4)) : null;

  const tdSnap = ctx.tdSnapshot || {};
  const life = tdSnap.lifetime || { twelvedata: 0, fallback: 0 };
  const tdTotal = (life.twelvedata || 0) + (life.fallback || 0);
  const fallbackRatio = tdTotal > 0 ? Number(((life.fallback || 0) / tdTotal).toFixed(4)) : null;

  return {
    registry: categories,
    coverage,
    ingestRuns: ingestRuns.slice(0, 20),
    ohlcvBackfillSummary: ohlcv,
    cacheHitRatio,
    cacheHits: hits,
    cacheMisses: misses,
    fallbackRatio,
    inflightDedupeSize: inflightSize(),
  };
}

module.exports = { buildTwelveDataFrameworkDiagnostics, buildCategoryCoverageRow };
