/**
 * Shared normalization shapes (documentation — concrete builders live in marketDataLayer + equity normalizers).
 *
 * QuoteDTO — see mapTdQuotePayload / fetchQuoteDto in marketDataLayer.js
 * CandleDTO — bars from mapTdTimeSeriesToCandles; DB rows in market_ohlcv_bars
 * CompanyReferenceDTO — profile + logo payloads in equityNormalizers (datasetKey profile, logo)
 * FundamentalsDTO — statistics + statements; getFundamentalsBundleForSymbol merge shape
 * AnalysisDTO — price_target, recommendations, analyst_ratings_light normalized bodies
 * RegulatoryDTO — institutional_holders, insider_transactions, fund_holders
 */

module.exports = {
  /** @type {string} */ SCHEMA_VERSION_NOTE: 'schemaVersion: 1 on stored JSON payloads where applicable',
};
