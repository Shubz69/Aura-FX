/**
 * Trade Evaluation Engine – "Is this a good trade?" evaluation.
 * Combines trade-setup-engine and confluence-engine; outputs structured Trade Evaluation.
 */

const tradeSetupEngine = require('./trade-setup-engine');
const confluenceEngine = require('./confluence-engine');

/**
 * Evaluate a trade idea using structure, R:R, volatility, confluence.
 * @param {Object} params - { riskRewardRatio, trendDirection, tradeDirection, currentSession, volatilityRegime, marketStructure, priceClusters, liquidity, volatility, session, calendarEvents, eventRisk, currentPrice }
 */
function evaluate(params = {}) {
  const setupResult = tradeSetupEngine.evaluate({
    riskRewardRatio: params.riskRewardRatio,
    trendDirection: params.trendDirection ?? params.marketStructure?.trendDirection,
    tradeDirection: params.tradeDirection,
    currentSession: params.currentSession ?? params.session?.currentSession,
    volatilityRegime: params.volatilityRegime ?? params.volatility?.regime
  });

  const confluenceResult = confluenceEngine.score({
    marketStructure: params.marketStructure,
    priceClusters: params.priceClusters,
    liquidity: params.liquidity,
    volatility: params.volatility,
    session: params.session,
    calendarEvents: params.calendarEvents || [],
    eventRisk: params.eventRisk || {}
  }, params.currentPrice);

  const setupScore = setupResult.tradeQualityScore ?? 0;
  const confluenceScore = confluenceResult.confluenceScore ?? 0;
  const overallScore = Math.round((setupScore + confluenceScore) / 2);

  return {
    setupStrength: setupResult.setupStrength ?? 'Unknown',
    riskReward: params.riskRewardRatio != null ? `1:${params.riskRewardRatio.toFixed(1)}` : 'Not specified',
    structureAlignment: (params.trendDirection ?? params.marketStructure?.trendDirection ?? 'Unknown').toString(),
    confluenceScore: confluenceResult.confluenceScore,
    overallScore,
    riskLevel: setupResult.riskLevel,
    breakdown: {
      setup: setupResult.breakdown,
      confluence: confluenceResult.breakdown
    },
    summary: `Trade Evaluation: Setup Strength: ${setupResult.setupStrength}. Risk Reward: ${params.riskRewardRatio != null ? '1:' + params.riskRewardRatio.toFixed(1) : 'N/A'}. Structure Alignment: ${params.trendDirection ?? params.marketStructure?.trendDirection ?? 'N/A'}. Overall Score: ${overallScore}/100.`
  };
}

module.exports = { evaluate };
