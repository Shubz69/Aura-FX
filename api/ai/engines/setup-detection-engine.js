/**
 * Setup Detection Engine – detects common setups from structure, clusters, liquidity, regime.
 * Uses existing engines; no duplicate logic. Output: setup type, confidence, trend alignment.
 */

function detectPullbackToSupport(priceClusters, marketStructure, currentPrice) {
  if (!priceClusters?.strongestSupport || currentPrice == null) return null;
  const level = priceClusters.strongestSupport.level ?? priceClusters.strongestSupport;
  const distPct = Math.abs(currentPrice - level) / (currentPrice || 1) * 100;
  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  const nearSupport = currentPrice >= level && distPct < 0.3;
  const bullishTrend = trend === 'bullish';
  if (nearSupport && bullishTrend) return { type: 'Pullback to support', confidence: 'Medium', trendAlignment: 'Bullish', detail: `Price near support at ${level}` };
  if (nearSupport) return { type: 'Price at support', confidence: 'Low', trendAlignment: trend || 'Neutral', detail: `Support at ${level}` };
  return null;
}

function detectBreakoutOfConsolidation(regime, volatility, marketStructure) {
  if (!regime || !volatility) return null;
  const reg = (regime.regime || '').toLowerCase();
  const vol = (volatility.expansionState || volatility.regime || '').toLowerCase();
  if ((reg === 'range bound' || reg === 'ranging') && (vol === 'expanding' || volatility.breakoutPotential === 'Rising')) {
    return { type: 'Possible breakout forming', confidence: 'Medium', trendAlignment: marketStructure?.trendDirection || 'Neutral', detail: 'Consolidation with volatility expanding.' };
  }
  return null;
}

function detectRangeRejection(priceClusters, marketStructure, currentPrice) {
  if (!priceClusters?.strongestResistance && !priceClusters?.strongestSupport) return null;
  const price = currentPrice;
  if (price == null) return null;
  const res = priceClusters.strongestResistance?.level ?? priceClusters.strongestResistance;
  const sup = priceClusters.strongestSupport?.level ?? priceClusters.strongestSupport;
  const nearRes = res != null && price <= res && (res - price) / (price || 1) * 100 < 0.2;
  const nearSup = sup != null && price >= sup && (price - sup) / (price || 1) * 100 < 0.2;
  if (nearRes) return { type: 'Range rejection (resistance)', confidence: 'Medium', trendAlignment: 'Bearish', detail: `Near resistance at ${res}` };
  if (nearSup) return { type: 'Range rejection (support)', confidence: 'Medium', trendAlignment: 'Bullish', detail: `Near support at ${sup}` };
  return null;
}

function detectTrendContinuation(marketStructure, liquidity, volatility) {
  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  if (trend !== 'bullish' && trend !== 'bearish') return null;
  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (mom === 'strengthening') {
    return { type: 'Trend continuation setup', confidence: 'High', trendAlignment: trend.charAt(0).toUpperCase() + trend.slice(1), detail: 'Structure and momentum aligned.' };
  }
  if (trend === 'bullish' || trend === 'bearish') {
    return { type: 'Trend continuation', confidence: 'Medium', trendAlignment: trend.charAt(0).toUpperCase() + trend.slice(1), detail: 'Structure supports trend.' };
  }
  return null;
}

function detectLiquiditySweepSetup(liquidity) {
  if (!liquidity?.recentSweep) return null;
  const s = liquidity.recentSweep;
  const dir = s.type === 'bullish_sweep' ? 'Bullish' : 'Bearish';
  return { type: 'Liquidity sweep (reversal)', confidence: 'Medium', trendAlignment: dir, detail: `Recent ${s.type} at ${s.level}` };
}

/**
 * Run all detectors and return the strongest/most relevant setup.
 * @param {Object} engineResults - Output from runAll (marketStructure, priceClusters, liquidity, regime, volatility)
 * @param {number} currentPrice - Current price
 */
function detect(engineResults = {}, currentPrice = null) {
  const { marketStructure, priceClusters, liquidity, regime, volatility } = engineResults;
  const price = currentPrice ?? null;

  const candidates = [
    detectTrendContinuation(marketStructure, liquidity, volatility),
    detectPullbackToSupport(priceClusters, marketStructure, price),
    detectBreakoutOfConsolidation(regime, volatility, marketStructure),
    detectRangeRejection(priceClusters, marketStructure, price),
    detectLiquiditySweepSetup(liquidity)
  ].filter(Boolean);

  const byConfidence = { High: 3, Medium: 2, Low: 1 };
  candidates.sort((a, b) => (byConfidence[b.confidence] || 0) - (byConfidence[a.confidence] || 0));
  const primary = candidates[0] || null;

  return {
    detectedSetup: primary?.type ?? 'None',
    confidence: primary?.confidence ?? 'Low',
    trendAlignment: primary?.trendAlignment ?? 'Neutral',
    detail: primary?.detail ?? '',
    allCandidates: candidates
  };
}

module.exports = { detect, detectPullbackToSupport, detectBreakoutOfConsolidation, detectRangeRejection, detectTrendContinuation, detectLiquiditySweepSetup };
