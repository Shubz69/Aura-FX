/**
 * Market Cleanliness Engine – how tradable and clean the structure is.
 * Reuses: marketStructure (trend vs chop), priceClusters (reactions), volatility (noise).
 */

const MAX_SCORE = 100;

/**
 * Score market cleanliness 0–100.
 */
function assess(params = {}) {
  const { symbol, marketStructure, priceClusters, volatility } = params;
  let score = 50;
  const reasons = [];

  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  if (trend === 'bullish' || trend === 'bearish') {
    score += 20;
    reasons.push('Clear directional movement');
  }
  if (trend === 'neutral' || trend === 'ranging') {
    score -= 15;
    reasons.push('Choppy range');
  }

  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (mom === 'strengthening') {
    score += 15;
    reasons.push('Structured pullbacks');
  }

  const hasSup = !!(priceClusters?.strongestSupport ?? priceClusters?.support?.length);
  const hasRes = !!(priceClusters?.strongestResistance ?? priceClusters?.resistance?.length);
  if (hasSup && hasRes) {
    score += 10;
    reasons.push('Clean reactions at levels');
  }

  const vol = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (vol === 'stable') {
    score += 5;
    reasons.push('Reduced noise');
  }
  if (vol === 'expanding') {
    score -= 5;
    reasons.push('Higher volatility (more noise)');
  }

  const finalScore = Math.max(0, Math.min(MAX_SCORE, Math.round(score)));

  const summary = [
    'Market Cleanliness',
    `Instrument: ${symbol || 'N/A'}`,
    `Score: ${finalScore}/${MAX_SCORE}`,
    `Reason: ${reasons.length ? reasons.join(' and ') : 'Insufficient data'}`
  ].join('\n');

  return {
    instrument: symbol,
    cleanlinessScore: finalScore,
    maxScore: MAX_SCORE,
    reasons,
    summary
  };
}

module.exports = { assess };
