/**
 * Twelve Data category-aware ingestion framework (registry, orchestration, public helpers).
 *
 * Design constraints (Aura Terminal):
 * - Twelve Data is the primary provider; other providers are fallbacks only in outer layers.
 * - Preserve existing HTTP/JSON contracts unless routes and consumers change in the same pass.
 * - Prefer DB-first and cache-first reads (see fetchDataset opts.dbFirst / marketDataLayer caches).
 * - Normalize provider JSON before persistence and before downstream math (normalizers + DTO mappers).
 * - Favor trader-relevant datasets and summaries over raw API surface area.
 */

const { DATASET_KIND, KIND_LABEL } = require('./datasetKinds');
const { DEFAULT_TTL_MS, effectiveTtlMs } = require('./datasetTtlPolicy');
const {
  CATEGORIES,
  getCategory,
  listCategories,
  summarizeRegistryForAdmin,
  getDatasetDefForCategory,
  listDatasetKeysForCategory,
} = require('./registry');
const {
  fetchDataset,
  runCategoryIngest,
  requestHistoricalBackfill,
  requestIncrementalOhlcv,
  inflightSize,
} = require('./ingestOrchestrator');
const publicApi = require('./publicApi');
const { buildTwelveDataFrameworkDiagnostics } = require('./adminDiagnostics');

module.exports = {
  DATASET_KIND,
  KIND_LABEL,
  DEFAULT_TTL_MS,
  effectiveTtlMs,
  CATEGORIES,
  getCategory,
  listCategories,
  summarizeRegistryForAdmin,
  getDatasetDefForCategory,
  listDatasetKeysForCategory,
  fetchDataset,
  runCategoryIngest,
  requestHistoricalBackfill,
  requestIncrementalOhlcv,
  inflightSize,
  publicApi,
  buildTwelveDataFrameworkDiagnostics,
};
