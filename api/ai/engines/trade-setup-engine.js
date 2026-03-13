/**
 * Trade Setup Engine – evaluates trade ideas: R:R, structure alignment, session timing, volatility.
 * Returns Trade Quality Score (0–100), Setup Strength, Risk Level.
 */

function scoreRiskReward(riskRewardRatio) {
  if (riskRewardRatio == null || riskRewardRatio < 0) return 0;
  if (riskRewardRatio >= 2) return 25;
  if (riskRewardRatio >= 1.5) return 20;
  if (riskRewardRatio >= 1) return 15;
  if (riskRewardRatio >= 0.5) return 8;
  return 0;
}

function scoreStructureAlignment(trendDirection, tradeDirection) {
  if (!trendDirection || !tradeDirection) return 15;
  const t = (trendDirection + '').toLowerCase();
  const d = (tradeDirection + '').toLowerCase();
  if (t.includes('bull') && d.includes('bull')) return 25;
  if (t.includes('bear') && d.includes('bear')) return 25;
  if (t === 'neutral' || t === 'ranging') return 12;
  return 5; // counter-trend
}

function scoreSessionTiming(currentSession) {
  const s = (currentSession || '').toLowerCase();
  if (s.includes('overlap') || s === 'london' || s === 'new york') return 20;
  if (s === 'asia') return 10;
  return 5;
}

function scoreVolatilityRegime(volatilityRegime) {
  const v = (volatilityRegime || '').toLowerCase();
  if (v === 'stable' || v === 'compressing') return 15;
  if (v === 'expanding') return 10;
  return 10;
}

/**
 * Risk level from volatility and R:R.
 */
function riskLevel(volatilityRegime, riskRewardRatio) {
  const v = (volatilityRegime || '').toLowerCase();
  const r = riskRewardRatio ?? 0;
  if (v === 'expanding' && r < 1) return 'High';
  if (v === 'expanding') return 'Moderate';
  if (r >= 1.5) return 'Moderate';
  if (r < 0.5) return 'High';
  return 'Moderate';
}

/**
 * Setup strength label from total score.
 */
function setupStrengthLabel(score) {
  if (score >= 75) return 'Strong';
  if (score >= 55) return 'Moderate';
  if (score >= 35) return 'Weak';
  return 'Poor';
}

/**
 * Evaluate a trade setup.
 * @param {Object} params - { riskRewardRatio, trendDirection, tradeDirection, currentSession, volatilityRegime }
 */
function evaluate(params = {}) {
  const {
    riskRewardRatio = null,
    trendDirection = null,
    tradeDirection = null,
    currentSession = null,
    volatilityRegime = null
  } = params;

  const rrScore = scoreRiskReward(riskRewardRatio);
  const structureScore = scoreStructureAlignment(trendDirection, tradeDirection);
  const sessionScore = scoreSessionTiming(currentSession);
  const volScore = scoreVolatilityRegime(volatilityRegime);

  const total = rrScore + structureScore + sessionScore + volScore;
  const maxPossible = 25 + 25 + 20 + 15;
  const tradeQualityScore = Math.min(100, Math.round((total / maxPossible) * 100));

  return {
    tradeQualityScore,
    setupStrength: setupStrengthLabel(tradeQualityScore),
    riskLevel: riskLevel(volatilityRegime, riskRewardRatio),
    breakdown: { riskReward: rrScore, structureAlignment: structureScore, sessionTiming: sessionScore, volatility: volScore },
    summary: `Trade Quality Score: ${tradeQualityScore}/100. Setup Strength: ${setupStrengthLabel(tradeQualityScore)}. Risk Level: ${riskLevel(volatilityRegime, riskRewardRatio)}.`
  };
}

module.exports = { evaluate, scoreRiskReward, scoreStructureAlignment, scoreSessionTiming, scoreVolatilityRegime, riskLevel, setupStrengthLabel };
