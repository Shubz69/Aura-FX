/**
 * Opportunity Scanner Engine – scans instruments for potential setups.
 * Uses runAll (or provided analyses) and setup-detection; caches results.
 * Does NOT fetch market data; caller supplies analyses or symbol list + fetcher.
 */

const setupDetectionEngine = require('./setup-detection-engine');
const { getCached, setCached } = require('../../cache');

const CACHE_KEY_PREFIX = 'aura:opportunity_scanner:';
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Classify one symbol's analysis into opportunity type for display.
 */
function classifyOpportunity(analysis, symbol) {
  const currentPrice = analysis.currentPrice ?? (analysis.ohlcv?.length && (analysis.ohlcv[analysis.ohlcv.length - 1].close ?? analysis.ohlcv[analysis.ohlcv.length - 1].c)) ?? null;
  const setup = setupDetectionEngine.detect(analysis, currentPrice);
  if (!setup || setup.detectedSetup === 'None') return null;

  let reason = [];
  if (analysis.marketStructure?.structure === 'uptrend' || analysis.marketStructure?.structure === 'downtrend') reason.push('Trend continuation setup');
  if (analysis.regime?.breakoutProbability === 'increasing' || analysis.volatility?.breakoutPotential === 'Rising') reason.push('Possible breakout forming');
  if (setup.detectedSetup && setup.detectedSetup.toLowerCase().includes('pullback')) reason.push('Near support level');
  if (setup.detectedSetup && setup.detectedSetup.toLowerCase().includes('range')) reason.push('Range rejection');
  if (analysis.volatility?.expansionState === 'Expanding') reason.push('Volatility increasing');
  if (analysis.liquidity?.recentSweep) reason.push('Recent liquidity sweep');

  return {
    symbol,
    setupType: setup.detectedSetup,
    confidence: setup.confidence,
    trendAlignment: setup.trendAlignment,
    reasons: reason.length ? reason : [setup.detail || 'Setup detected']
  };
}

/**
 * Scan a list of pre-computed analyses. Each item: { symbol, ...runAllResult }.
 * @param {Array<{ symbol: string, ... }>} analyses - Array of { symbol, marketStructure, priceClusters, liquidity, regime, volatility }
 * @param {Object} options - { useCache, cacheTtlMs }
 * @returns {Object} { opportunities, cached, timestamp }
 */
function scan(analyses = [], options = {}) {
  const useCache = options.useCache !== false;
  const cacheKey = CACHE_KEY_PREFIX + analyses.map(a => a.symbol).sort().join(',');
  if (useCache) {
    const cached = getCached(cacheKey, options.cacheTtlMs ?? CACHE_TTL_MS);
    if (cached) return { ...cached, cached: true };
  }

  const opportunities = [];
  for (const a of analyses) {
    const opp = classifyOpportunity(a, a.symbol);
    if (opp) opportunities.push(opp);
  }

  const result = {
    opportunities,
    potentialOpportunitiesDetected: opportunities.length,
    summary: opportunities.length
      ? opportunities.map(o => `${o.symbol}: ${o.setupType}. ${o.reasons.join('. ')}`).join('\n')
      : 'No clear opportunities in scanned set.',
    cached: false,
    timestamp: new Date().toISOString()
  };

  if (useCache && opportunities.length > 0) setCached(cacheKey, result);
  return result;
}

/**
 * Build scanner-friendly summary for prompts (e.g. "Potential Opportunities: XAUUSD Trend continuation...").
 */
function formatForPrompt(scanResult) {
  if (!scanResult?.opportunities?.length) return null;
  return 'Potential Opportunities Detected:\n' + scanResult.opportunities.map(o => `${o.symbol}\n${o.setupType}\n${o.reasons.join('. ')}`).join('\n\n');
}

module.exports = { scan, classifyOpportunity, formatForPrompt, CACHE_KEY_PREFIX, CACHE_TTL_MS };
