/**
 * Market Regime Engine – Trending, Ranging, Breakout, Mean Reversion, High/Low Volatility.
 */

const { analyzeTrendVsRange } = require('../price-action');
const { expansionState } = require('./volatility-engine');

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({ open: c.open ?? c.o, high: c.high ?? c.h, low: c.low ?? c.l, close: c.close ?? c.c }));
}

/**
 * Classify regime from trend/range and volatility.
 */
function classifyRegime(ohlcv) {
  const c = normalizeCandles(ohlcv);
  if (c.length < 20) return { regime: 'Unknown', breakoutProbability: null, summary: 'Insufficient data.' };

  const trendRange = analyzeTrendVsRange(c);
  if (trendRange.error) return { regime: 'Unknown', breakoutProbability: null, summary: trendRange.error };

  const vol = expansionState(c, 14);
  const condition = (trendRange.condition || '').toLowerCase();
  const volState = (vol.state || '').toLowerCase();

  let regime = 'Ranging';
  if (condition === 'trending' && volState === 'expanding') regime = 'Trending';
  else if (condition === 'trending') regime = 'Trending';
  else if (volState === 'compressing') regime = 'Range Bound';
  else if (condition === 'mixed') regime = 'Mixed';

  let breakoutProbability = null;
  if (regime === 'Range Bound' || volState === 'compressing') {
    breakoutProbability = 'increasing';
  } else if (volState === 'expanding') {
    breakoutProbability = 'elevated';
  }

  const highVol = volState === 'expanding';
  const lowVol = volState === 'compressing';

  const lines = [
    `Current regime: ${regime}`,
    breakoutProbability ? `Probability of breakout ${breakoutProbability}.` : null,
    highVol ? 'High volatility environment.' : lowVol ? 'Low volatility / compression.' : null
  ].filter(Boolean);

  return {
    regime,
    trendCondition: condition,
    volatilityState: volState,
    breakoutProbability,
    highVolatility: highVol,
    lowVolatility: lowVol,
    summary: lines.join('\n')
  };
}

module.exports = { analyze: classifyRegime, classifyRegime };
