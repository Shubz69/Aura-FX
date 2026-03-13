/**
 * Timing Quality Engine – assesses whether timing is favourable.
 * Reuses: session, eventRisk, volatility, marketStructure (trend maturity, extension).
 */

const MAX_SCORE = 100;

/**
 * Score timing quality 0–100.
 */
function assess(params = {}) {
  const { symbol, session, eventRisk, volatility, marketStructure, priceClusters, currentPrice } = params;
  let score = 65;
  const reasons = [];

  const sessionName = (session?.currentSession || '').toLowerCase();
  if (sessionName.includes('london') || sessionName.includes('overlap') || sessionName.includes('new york')) {
    score += 15;
    reasons.push('Good session conditions');
  } else if (sessionName === 'asia') {
    score -= 5;
    reasons.push('Asia session (lower volume)');
  }

  if (eventRisk?.warning) {
    score -= 25;
    reasons.push('Key US data approaching');
  }

  const vol = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (vol === 'stable' || vol === 'compressing') {
    score += 5;
    reasons.push('Stable volatility regime');
  }
  if (vol === 'expanding') {
    score -= 5;
    reasons.push('Volatility expanding (timing more sensitive)');
  }

  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (mom === 'weakening') {
    score -= 10;
    reasons.push('Trend maturity / momentum fading');
  }

  const price = currentPrice ?? null;
  const sup = priceClusters?.strongestSupport?.level ?? priceClusters?.strongestSupport;
  const res = priceClusters?.strongestResistance?.level ?? priceClusters?.strongestResistance;
  if (price != null && res != null && (res - price) / (price || 1) < 0.003) {
    score -= 8;
    reasons.push('Price slightly extended toward resistance');
  }
  if (price != null && sup != null && (price - sup) / (price || 1) < 0.003) {
    score -= 8;
    reasons.push('Price slightly extended toward support');
  }

  const finalScore = Math.max(0, Math.min(MAX_SCORE, Math.round(score)));

  const summary = [
    'Timing Quality',
    `Instrument: ${symbol || 'N/A'}`,
    `Timing Score: ${finalScore}/${MAX_SCORE}`,
    `Reason: ${reasons.length ? reasons.join(', ') : 'Neutral timing'}`
  ].join('\n');

  return {
    instrument: symbol,
    timingScore: finalScore,
    maxScore: MAX_SCORE,
    reasons,
    summary
  };
}

module.exports = { assess };
