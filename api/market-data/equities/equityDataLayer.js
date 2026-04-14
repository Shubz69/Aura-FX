/**
 * Equities Twelve Data layer — DB-first reads, normalized payloads, scheduled ingest.
 * Implementation is delegated to the shared twelve-data-framework orchestrator (primary US category us_market).
 */

const { fetchDataset, invokeClient } = require('../twelve-data-framework/ingestOrchestrator');
const {
  toCanonical,
  supportsEquityTwelveDataDatasets,
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
  resolveVentureCategoryId,
} = require('../../ai/utils/symbol-registry');

/** Drop orchestration-only fields so callers keep the same object shape as before the shared framework. */
function asLegacyEquityDatasetResult(result) {
  if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'categoryId')) {
    return result;
  }
  const { categoryId, ...rest } = result;
  return rest;
}

/**
 * @param {string} canonical
 * @param {string} datasetKey
 * @param {{ dbFirst?: boolean, allowNetwork?: boolean, forceRefresh?: boolean }} [opts]
 */
async function getEquityDataset(canonical, datasetKey, opts = {}) {
  const c = toCanonical(canonical);
  const ventureCat = resolveVentureCategoryId(c);
  let categoryId =
    opts.categoryId ||
    (isCboeEuropeUkListedEquity(c)
      ? 'cboe_europe_equities_uk'
      : isUkListedEquity(c)
        ? 'uk_equities'
        : ventureCat
          ? ventureCat
          : isCboeAustraliaListedEquity(c)
            ? 'cboe_australia'
            : isAsxListedEquity(c)
              ? 'asx_equities'
              : 'us_market');
  if (categoryId === 'us_equities') categoryId = 'us_market';
  const r = await fetchDataset(categoryId, c, datasetKey, opts);
  return asLegacyEquityDatasetResult(r);
}

/**
 * Merge profile + statistics for /api/ai/fundamentals compatibility (Twelve Data first).
 * Default is DB/cache only; pass `{ allowNetwork: true }` for cron or on-demand refresh.
 * @param {string} symbol
 */
async function getFundamentalsBundleForSymbol(symbol, opts = {}) {
  const allowNet = opts.allowNetwork === true;
  const c = toCanonical(symbol);
  if (isCboeEuropeUkListedEquity(c)) return null;
  if (!supportsEquityTwelveDataDatasets(c)) return null;
  const [p, s] = await Promise.all([
    getEquityDataset(c, 'profile', { allowNetwork: allowNet }),
    getEquityDataset(c, 'statistics', { allowNetwork: allowNet }),
  ]);
  if ((!p.ok || !p.payload) && (!s.ok || !s.payload)) return null;
  const pb = p.payload && p.payload.body ? p.payload.body : {};
  const sb = s.payload && s.payload.body ? s.payload.body : {};
  if (!pb.name && sb.marketCapitalization == null && sb.peRatio == null) return null;

  return {
    symbol: c,
    name: pb.name || null,
    description: pb.description || null,
    sector: pb.sector || null,
    industry: pb.industry || null,
    marketCap: sb.marketCapitalization != null ? String(sb.marketCapitalization) : null,
    peRatio: sb.peRatio != null ? String(sb.peRatio) : null,
    eps: sb.eps != null ? String(sb.eps) : null,
    dividendYield: sb.dividendYield != null ? String(sb.dividendYield) : null,
    beta: sb.beta != null ? String(sb.beta) : null,
    fiftyTwoWeekHigh: sb.fiftyTwoWeekHigh != null ? String(sb.fiftyTwoWeekHigh) : null,
    fiftyTwoWeekLow: sb.fiftyTwoWeekLow != null ? String(sb.fiftyTwoWeekLow) : null,
    revenue: null,
    profitMargin: null,
    operatingMargin: null,
    returnOnAssets: null,
    returnOnEquity: null,
    revenuePerShare: null,
    quarterlyEarningsGrowth: sb.quarterlyEarningsGrowthYoy != null ? String(sb.quarterlyEarningsGrowthYoy) : null,
    quarterlyRevenueGrowth: sb.quarterlyRevenueGrowth != null ? String(sb.quarterlyRevenueGrowth) : null,
    analystTargetPrice: null,
    source: 'Twelve Data',
    _equityDatasets: { profile: p.ok, statistics: s.ok },
  };
}

module.exports = {
  getEquityDataset,
  getFundamentalsBundleForSymbol,
  invokeClient,
};
