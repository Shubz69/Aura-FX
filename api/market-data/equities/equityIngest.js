/**
 * Batch ingestion for Twelve Data equity datasets (cron-friendly, sequential for throttle).
 */

const { runCategoryIngest } = require('../twelve-data-framework/ingestOrchestrator');

/**
 * @param {{ maxTier?: number, symbolLimit?: number, includeGlobal?: boolean, datasetFilter?: string[] }} opts
 */
async function runEquityTwelveDataIngest(opts = {}) {
  return runCategoryIngest('us_market', opts);
}

module.exports = { runEquityTwelveDataIngest };
