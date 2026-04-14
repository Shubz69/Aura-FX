/**
 * Twelve Data equities extension — capability map, ingest, DB-first layer.
 */

const {
  EQUITY_TWELVE_DATA_DATASETS,
  GLOBAL_CANONICAL,
  listDatasetKeysByTier,
  getDatasetDef,
  summarizeCapabilitiesForAdmin,
} = require('./twelveDataEquityCapabilities');

module.exports = {
  EQUITY_TWELVE_DATA_DATASETS,
  GLOBAL_CANONICAL,
  listDatasetKeysByTier,
  getDatasetDef,
  summarizeCapabilitiesForAdmin,
  getEquityDataset: require('./equityDataLayer').getEquityDataset,
  getFundamentalsBundleForSymbol: require('./equityDataLayer').getFundamentalsBundleForSymbol,
  runEquityTwelveDataIngest: require('./equityIngest').runEquityTwelveDataIngest,
  getEquityIngestSymbols: require('./equityUniverse').getEquityIngestSymbols,
  normalizeDatasetPayload: require('./equityNormalizers').normalizeDatasetPayload,
};
