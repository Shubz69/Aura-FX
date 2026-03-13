/**
 * Confluence Scoring Engine – scores setups 0–100 from structure, S/R, liquidity,
 * volatility regime, session timing, macro context. Integrates with existing engines.
 */

const MAX_SCORE = 100;
const WEIGHTS = {
  marketStructure: 20,
  supportResistance: 20,
  liquidityZones: 15,
  volatilityRegime: 10,
  sessionTiming: 15,
  macroContext: 20
};

function scoreMarketStructure(marketStructure) {
  if (!marketStructure || !marketStructure.trendDirection) return { score: 0, label: 'Unknown' };
  const t = (marketStructure.trendDirection + '').toLowerCase();
  if (t === 'bullish' || t === 'bearish') return { score: WEIGHTS.marketStructure, label: 'Strong' };
  if (t === 'neutral' || t === 'ranging') return { score: Math.round(WEIGHTS.marketStructure * 0.5), label: 'Neutral' };
  return { score: 0, label: 'Unknown' };
}

function scoreSupportResistance(priceClusters, price) {
  if (!priceClusters || price == null) return { score: 0, label: 'Unknown' };
  const sup = priceClusters.strongestSupport;
  const res = priceClusters.strongestResistance;
  if (sup && res) return { score: WEIGHTS.supportResistance, label: 'Confirmed' };
  if (sup || res) return { score: Math.round(WEIGHTS.supportResistance * 0.6), label: 'Partial' };
  return { score: 0, label: 'None' };
}

function scoreLiquidityZones(liquidity) {
  if (!liquidity || !liquidity.liquidityAbove?.length && !liquidity.liquidityBelow?.length) return { score: 0, label: 'Unknown' };
  const hasZones = (liquidity.liquidityAbove?.length || 0) + (liquidity.liquidityBelow?.length || 0) > 0;
  const hasSweep = !!liquidity.recentSweep;
  if (hasZones && hasSweep) return { score: WEIGHTS.liquidityZones, label: 'Strong' };
  if (hasZones) return { score: Math.round(WEIGHTS.liquidityZones * 0.7), label: 'Present' };
  return { score: 0, label: 'None' };
}

function scoreVolatilityRegime(volatility) {
  if (!volatility || !volatility.regime) return { score: Math.round(WEIGHTS.volatilityRegime * 0.5), label: 'Neutral' };
  const v = (volatility.regime + '').toLowerCase();
  if (v === 'stable' || v === 'compressing') return { score: WEIGHTS.volatilityRegime, label: 'Favorable' };
  if (v === 'expanding') return { score: Math.round(WEIGHTS.volatilityRegime * 0.6), label: 'Elevated' };
  return { score: Math.round(WEIGHTS.volatilityRegime * 0.5), label: 'Neutral' };
}

function scoreSessionTiming(session) {
  if (!session || !session.currentSession) return { score: Math.round(WEIGHTS.sessionTiming * 0.5), label: 'Neutral' };
  const s = (session.currentSession + '').toLowerCase();
  if (s.includes('overlap') || s === 'london' || s === 'new york') return { score: WEIGHTS.sessionTiming, label: 'Good' };
  if (s === 'asia') return { score: Math.round(WEIGHTS.sessionTiming * 0.5), label: 'Neutral' };
  return { score: Math.round(WEIGHTS.sessionTiming * 0.3), label: 'Weak' };
}

function scoreMacroContext(calendarEvents, eventRisk) {
  const highImpactSoon = eventRisk?.warning || (Array.isArray(calendarEvents) && calendarEvents.some(e => (e.impact || '').toString().toLowerCase() === 'high'));
  if (highImpactSoon && eventRisk?.warning) return { score: Math.round(WEIGHTS.macroContext * 0.3), label: 'Event risk' };
  if (Array.isArray(calendarEvents) && calendarEvents.length > 0) return { score: Math.round(WEIGHTS.macroContext * 0.8), label: 'Aware' };
  return { score: Math.round(WEIGHTS.macroContext * 0.5), label: 'Neutral' };
}

/**
 * Compute confluence score from existing engine outputs.
 * @param {Object} inputs - { marketStructure, priceClusters, liquidity, volatility, session, calendarEvents, eventRisk }
 * @param {number} currentPrice - Optional, for S/R relevance
 */
function score(inputs = {}, currentPrice = null) {
  const {
    marketStructure,
    priceClusters,
    liquidity,
    volatility,
    session,
    calendarEvents = [],
    eventRisk = {}
  } = inputs;

  const structure = scoreMarketStructure(marketStructure);
  const sr = scoreSupportResistance(priceClusters, currentPrice);
  const liq = scoreLiquidityZones(liquidity);
  const vol = scoreVolatilityRegime(volatility);
  const sess = scoreSessionTiming(session);
  const macro = scoreMacroContext(calendarEvents, eventRisk);

  const total = structure.score + sr.score + liq.score + vol.score + sess.score + macro.score;
  const confluenceScore = Math.min(MAX_SCORE, Math.round(total));

  return {
    confluenceScore,
    maxScore: MAX_SCORE,
    breakdown: {
      trendAlignment: structure.label,
      supportResistance: sr.label,
      liquidityZones: liq.label,
      volatilityRegime: vol.label,
      sessionTiming: sess.label,
      macroContext: macro.label
    },
    summary: `Confluence Score: ${confluenceScore}/${MAX_SCORE}. Trend alignment: ${structure.label}. Support level: ${sr.label}. Session timing: ${sess.label}.`
  };
}

module.exports = { score, scoreMarketStructure, scoreSupportResistance, scoreLiquidityZones, scoreVolatilityRegime, scoreSessionTiming, scoreMacroContext };
