/**
 * Institutional Bias Engine – combines structure, macro, liquidity, volatility.
 * Outputs short / medium / long term directional bias.
 */

/**
 * Aggregate bias from multiple engines' outputs.
 * @param {Object} inputs - { marketStructure, liquidity, volatility, macroEvents, sentiment }
 * @returns {Object} shortTermBias, mediumTermBias, longTermBias, summary
 */
function analyze(inputs = {}) {
  const { marketStructure = {}, liquidity = {}, volatility = {}, macroEvents = [], sentiment = {} } = inputs;

  let shortScore = 0;
  let mediumScore = 0;
  let longScore = 0;

  const trend = (marketStructure.trendDirection || '').toLowerCase();
  if (trend === 'bullish') {
    shortScore += 2;
    mediumScore += 2;
    longScore += 1;
  } else if (trend === 'bearish') {
    shortScore -= 2;
    mediumScore -= 2;
    longScore -= 1;
  }

  if (marketStructure.recentBOS) {
    if (marketStructure.recentBOS.type === 'bullish') shortScore += 1;
    else if (marketStructure.recentBOS.type === 'bearish') shortScore -= 1;
  }

  const mom = (marketStructure.momentum || '').toLowerCase();
  if (mom === 'strengthening') shortScore += trend === 'bullish' ? 1 : trend === 'bearish' ? -1 : 0;
  if (mom === 'weakening') shortScore -= trend === 'bullish' ? 1 : trend === 'bearish' ? -1 : 0;

  const sent = (sentiment.instrumentSentiment || sentiment.marketSentiment || '').toLowerCase();
  if (sent.includes('bullish')) mediumScore += 1;
  else if (sent.includes('bearish')) mediumScore -= 1;
  if (sentiment.marketSentiment === 'Risk On') mediumScore += 0.5;
  else if (sentiment.marketSentiment === 'Risk Off') mediumScore -= 0.5;

  const volRegime = (volatility.regime || volatility.expansionState || '').toLowerCase();
  if (volRegime === 'expanding') longScore += 0;
  else if (volRegime === 'compressing') {
    shortScore += 0.5;
    mediumScore += 0.5;
  }

  const highImpactSoon = Array.isArray(macroEvents) && macroEvents.some(e => (e.impact || '').toLowerCase() === 'high');
  if (highImpactSoon) {
    shortScore *= 0.5;
    mediumScore *= 0.7;
  }

  const toBias = (score) => {
    if (score >= 1.5) return 'Bullish';
    if (score >= 0.5) return 'Slightly bullish';
    if (score <= -1.5) return 'Bearish';
    if (score <= -0.5) return 'Slightly bearish';
    return 'Neutral';
  };

  const shortTermBias = toBias(shortScore);
  const mediumTermBias = toBias(mediumScore);
  const longTermBias = toBias(longScore);

  const summary = [
    `Short term bias: ${shortTermBias}`,
    `Medium term bias: ${mediumTermBias}`,
    `Long term bias: ${longTermBias}`
  ].join('\n');

  return {
    shortTermBias,
    mediumTermBias,
    longTermBias,
    scores: { short: shortScore, medium: mediumScore, long: longScore },
    summary
  };
}

module.exports = { analyze };
