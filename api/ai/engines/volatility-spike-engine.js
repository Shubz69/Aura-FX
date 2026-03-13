/**
 * Volatility Spike Engine – detects rapid increase in volatility.
 * Uses ATR expansion rate, range breakouts; optional volume. Integrates volatility-engine.
 */

const { atr, expansionState } = require('./volatility-engine');

const ATR_EXPANSION_THRESHOLD = 1.25;  // current ATR > 1.25x prior
const RANGE_MULTIPLE = 1.5;            // current range > 1.5x recent avg range

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({ high: c.high ?? c.h, low: c.low ?? c.l, close: c.close ?? c.c }));
}

/**
 * Detect spike from OHLCV: ATR expansion and/or range breakout.
 */
function detect(ohlcv, options = {}) {
  const candles = normalizeCandles(ohlcv);
  if (candles.length < 30) return { spikeDetected: false, message: null, reason: 'Insufficient data' };

  const period = options.atrPeriod ?? 14;
  const currentAtr = atr(candles, period);
  const priorCandles = candles.slice(0, -period - 1);
  const priorAtr = atr(priorCandles, period);
  const { ratio } = expansionState(candles, period, 2);

  const rangeExpansion = ratio >= ATR_EXPANSION_THRESHOLD;
  const recentRanges = candles.slice(-5).map(c => c.high - c.low);
  const avgRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
  const lastRange = candles[candles.length - 1].high - candles[candles.length - 1].low;
  const rangeBreakout = avgRange > 0 && lastRange >= avgRange * RANGE_MULTIPLE;

  const spikeDetected = rangeExpansion || rangeBreakout;
  let message = null;
  if (spikeDetected) {
    message = rangeExpansion && rangeBreakout
      ? 'Volatility increasing rapidly. ATR expanding and range breakout. Expect large moves.'
      : rangeExpansion
        ? 'Volatility spike detected. ATR expanding. Expect larger moves.'
        : 'Range breakout detected. Volatility increasing.';
  }

  return {
    spikeDetected,
    message,
    reason: rangeExpansion ? 'ATR expansion' : rangeBreakout ? 'Range breakout' : 'Stable',
    atrRatio: priorAtr > 0 ? (currentAtr / priorAtr) : null,
    currentAtr,
    priorAtr
  };
}

/**
 * Convenience: from runAll result (volatility + candles), detect spike.
 */
function detectFromAnalysis(volatility, ohlcv) {
  if (ohlcv && ohlcv.length >= 30) return detect(ohlcv);
  const exp = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (exp === 'expanding') return { spikeDetected: true, message: 'Volatility expanding. Expect large moves.', reason: 'Expanding regime' };
  return { spikeDetected: false, message: null, reason: 'Insufficient data or stable' };
}

module.exports = { detect, detectFromAnalysis };
