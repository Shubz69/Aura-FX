/**
 * Market Probability Engine – scenario probabilities (bullish continuation, range, bearish reversal).
 * Based on trend strength, volatility, macro, liquidity positioning. Heuristic weights.
 */

function trendStrengthScore(marketStructure) {
  const t = (marketStructure?.trendDirection || '').toLowerCase();
  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (t === 'bullish' && (mom === 'strengthening' || mom === 'strong')) return { bullish: 0.7, range: 0.2, bearish: 0.1 };
  if (t === 'bearish' && (mom === 'strengthening' || mom === 'strong')) return { bullish: 0.1, range: 0.2, bearish: 0.7 };
  if (t === 'bullish') return { bullish: 0.55, range: 0.3, bearish: 0.15 };
  if (t === 'bearish') return { bullish: 0.15, range: 0.3, bearish: 0.55 };
  return { bullish: 0.33, range: 0.34, bearish: 0.33 };
}

function volatilityAdjustment(volatility) {
  const exp = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (exp === 'expanding') return { range: -0.1, other: 0.05 }; // less range, more directional
  if (exp === 'compressing') return { range: 0.1, other: -0.05 };
  return { range: 0, other: 0 };
}

function macroAdjustment(eventRisk, sentiment) {
  let bull = 0, bear = 0, range = 0;
  if (eventRisk?.warning) range += 0.1;
  const sent = (sentiment?.marketSentiment || sentiment?.instrumentSentiment || '').toLowerCase();
  if (sent.includes('risk off')) bear += 0.05;
  if (sent.includes('risk on')) bull += 0.05;
  return { bullish: bull, bearish: bear, range };
}

/**
 * Estimate scenario probabilities.
 * @param {Object} params - { marketStructure, volatility, eventRisk, sentiment, liquidity? }
 */
function estimate(params = {}) {
  const base = trendStrengthScore(params.marketStructure);
  const volAdj = volatilityAdjustment(params.volatility || {});
  const macroAdj = macroAdjustment(params.eventRisk || {}, params.sentiment || {});

  let bullish = base.bullish + macroAdj.bullish + volAdj.other;
  let bearish = base.bearish + macroAdj.bearish + volAdj.other;
  let range = base.range + volAdj.range + macroAdj.range;

  const sum = bullish + bearish + range;
  bullish = Math.max(0, Math.min(1, bullish / sum));
  bearish = Math.max(0, Math.min(1, bearish / sum));
  range = Math.max(0, Math.min(1, range / sum));
  const norm = bullish + bearish + range;
  bullish = Math.round((bullish / norm) * 100);
  bearish = Math.round((bearish / norm) * 100);
  range = Math.round((range / norm) * 100);

  const summary = `Scenario Probability: Bullish continuation: ${bullish}%. Range continuation: ${range}%. Bearish reversal: ${bearish}%.`;

  return {
    bullishContinuation: bullish,
    rangeContinuation: range,
    bearishReversal: bearish,
    summary
  };
}

module.exports = { estimate, trendStrengthScore, volatilityAdjustment, macroAdjustment };
