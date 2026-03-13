/**
 * Global Market Scanner – scans all provided analyses for unusual activity and ranks opportunities.
 * Reuses: setup-detection, volatility-spike, liquidity (sweeps), event-risk. Does NOT fetch data.
 */

const setupDetectionEngine = require('./setup-detection-engine');
const confluenceEngine = require('./confluence-engine');
const { getCached, setCached } = require('../../cache');

const CACHE_KEY = 'aura:global_market_scanner';
const CACHE_TTL_MS = 90 * 1000; // 90 seconds

function getSignals(analysis, symbol) {
  const signals = [];
  if (analysis.volatilitySpike?.spikeDetected) signals.push({ type: 'volatility_expansion', label: 'Volatility expanding' });
  const mom = (analysis.marketStructure?.momentum || '').toLowerCase();
  const trend = (analysis.marketStructure?.trendDirection || '').toLowerCase();
  if ((trend === 'bullish' || trend === 'bearish') && (mom === 'strengthening' || mom === 'strong')) signals.push({ type: 'momentum', label: 'Strong directional momentum' });
  if (analysis.marketStructure?.recentBOS) signals.push({ type: 'break_of_structure', label: 'Break of structure' });
  if (analysis.liquidity?.recentSweep) signals.push({ type: 'liquidity_sweep', label: 'Liquidity sweep' });
  if (analysis.eventRisk?.warning) signals.push({ type: 'macro_driven', label: 'Macro-driven (event risk)' });
  const setup = setupDetectionEngine.detect(analysis, analysis.currentPrice ?? null);
  if (setup?.detectedSetup && setup.detectedSetup !== 'None') signals.push({ type: 'setup', label: setup.detectedSetup });
  return signals;
}

function scoreOpportunity(analysis, confluenceScore) {
  let score = confluenceScore ?? 0;
  const signals = getSignals(analysis, analysis.symbol);
  score += Math.min(30, signals.length * 8);
  if (analysis.volatilitySpike?.spikeDetected) score += 5;
  if (analysis.marketStructure?.recentBOS) score += 5;
  return { score, signals };
}

/**
 * Scan analyses (each { symbol, ...runAllResult }), detect signals, rank.
 * @param {Array<Object>} analyses - Pre-computed runAll results per symbol
 * @param {Object} options - { useCache, cacheTtlMs }
 */
function scan(analyses = [], options = {}) {
  const useCache = options.useCache !== false;
  const cacheKey = CACHE_KEY + ':' + (analyses.map(a => a.symbol).sort().join(',') || 'global');
  if (useCache) {
    const cached = getCached(cacheKey, options.cacheTtlMs ?? CACHE_TTL_MS);
    if (cached) return { ...cached, cached: true };
  }

  const results = [];
  for (const a of analyses) {
    const confluence = confluenceEngine.score({
      marketStructure: a.marketStructure,
      priceClusters: a.priceClusters,
      liquidity: a.liquidity,
      volatility: a.volatility,
      session: a.session,
      calendarEvents: a.calendarEvents || [],
      eventRisk: a.eventRisk || {}
    }, a.currentPrice ?? null);
    const { score, signals } = scoreOpportunity(a, confluence.confluenceScore);
    if (signals.length === 0 && confluence.confluenceScore < 40) continue;
    results.push({
      symbol: a.symbol,
      confluenceScore: confluence.confluenceScore,
      opportunityScore: score,
      signals,
      setupType: setupDetectionEngine.detect(a, a.currentPrice ?? null)?.detectedSetup ?? null,
      trendAlignment: a.marketStructure?.trendDirection ?? null
    });
  }

  results.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const summary = results.length
    ? 'Market Scanner Results:\n' + results.slice(0, 15).map(r => `${r.symbol}\n${r.signals.map(s => s.label).join('\n')}`).join('\n\n')
    : 'No unusual activity or high-probability setups in scanned markets.';

  const out = {
    results,
    rankedOpportunities: results.slice(0, 20),
    summary,
    timestamp: new Date().toISOString(),
    cached: false
  };
  if (useCache && results.length > 0) setCached(cacheKey, out);
  return out;
}

module.exports = { scan, getSignals, scoreOpportunity };
