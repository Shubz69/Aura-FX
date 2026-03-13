/**
 * No-Trade Engine – detects when there is no good trade (avoid forcing trades).
 * Reuses: marketStructure, volatility, eventRisk, confluence, liquidity (follow-through).
 */

/**
 * Detect no-trade condition from analysis.
 */
function detect(params = {}) {
  const { symbol, marketStructure, volatility, eventRisk, confluence, liquidity } = params;
  let isNoTrade = false;
  const reasons = [];

  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (trend === 'neutral' || trend === 'ranging' || trend === '') {
    isNoTrade = true;
    reasons.push('Unclear structure');
  }
  if (mom === 'weakening' && (trend === 'neutral' || trend === 'ranging')) {
    reasons.push('Conflicting signals');
  }

  const vol = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (vol === 'stable' && (trend === 'neutral' || trend === 'ranging')) {
    reasons.push('Low volatility noise');
  }

  if (eventRisk?.warning) {
    isNoTrade = true;
    reasons.push('Heavy event risk');
  }

  const confScore = confluence?.confluenceScore ?? 0;
  if (confScore < 40) {
    isNoTrade = true;
    reasons.push('Poor confluence');
  }

  if (liquidity?.recentSweep && mom !== 'strengthening') {
    reasons.push('Weak follow-through after recent sweep');
  }

  const deduped = [...new Set(reasons)];
  const summary = deduped.length
    ? `No Trade Condition\nInstrument: ${symbol || 'N/A'}\nReason: ${deduped.join(', ')}`
    : null;

  return {
    isNoTrade,
    reasons: deduped,
    summary
  };
}

module.exports = { detect };
