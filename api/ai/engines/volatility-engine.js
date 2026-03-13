/**
 * Volatility Engine – ATR, range expansion/compression, breakout potential.
 */

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({
    high: c.high ?? c.h,
    low: c.low ?? c.l,
    close: c.close ?? c.c
  }));
}

/**
 * Simple ATR (Average True Range) – period default 14.
 */
function atr(candles, period = 14) {
  const c = normalizeCandles(candles);
  if (c.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < c.length; i++) {
    const high = c[i].high;
    const low = c[i].low;
    const prevClose = c[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = tr.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * Compare current ATR to prior period to detect expansion/compression.
 */
function expansionState(candles, period = 14, comparePeriods = 2) {
  const c = normalizeCandles(candles);
  const len = period * (comparePeriods + 1) + 1;
  if (c.length < len) return { state: 'Unknown', ratio: 1 };
  const currentAtr = atr(c.slice(-period - 1), period);
  const priorAtr = atr(c.slice(-period * 2 - 1), period);
  if (!currentAtr || !priorAtr || priorAtr === 0) return { state: 'Unknown', ratio: 1 };
  const ratio = currentAtr / priorAtr;
  let state = 'Stable';
  if (ratio > 1.15) state = 'Expanding';
  else if (ratio < 0.85) state = 'Compressing';
  return { state, ratio };
}

/**
 * Breakout potential heuristic: compression + range near recent high/low.
 */
function breakoutPotential(candles, period = 14) {
  const c = normalizeCandles(candles);
  if (c.length < period * 2) return { probability: 'Unknown', reason: 'Insufficient data' };
  const { state } = expansionState(candles, period);
  const recent = c.slice(-period);
  const highest = Math.max(...recent.map(x => x.high));
  const lowest = Math.min(...recent.map(x => x.low));
  const lastClose = c[c.length - 1].close;
  const range = highest - lowest || 0.0001;
  const nearHigh = (highest - lastClose) / range < 0.2;
  const nearLow = (lastClose - lowest) / range < 0.2;

  let probability = 'Low';
  if (state === 'Compressing') probability = 'Rising';
  if (state === 'Expanding' && (nearHigh || nearLow)) probability = 'High';
  const reason = state === 'Expanding' ? 'ATR increasing; volatility expanding.' : state === 'Compressing' ? 'Range compressing; breakout likely when volatility expands.' : 'Stable volatility.';

  return { probability, reason, volatilityRegime: state };
}

/**
 * Full volatility analysis.
 */
function analyze(ohlcv) {
  const c = normalizeCandles(ohlcv);
  if (c.length < 10) {
    return { atr: null, regime: 'Unknown', expansionState: 'Unknown', breakoutPotential: 'Unknown', summary: 'Insufficient data.' };
  }

  const atrVal = atr(c, 14);
  const { state: expansion, ratio } = expansionState(c, 14);
  const { probability: breakoutProb, reason, volatilityRegime } = breakoutPotential(c, 14);

  const lines = [
    `Volatility Regime: ${expansion}`,
    `ATR ${atrVal != null ? atrVal.toFixed(4) : 'N/A'}${expansion === 'Expanding' ? ' (increasing)' : expansion === 'Compressing' ? ' (decreasing)' : ''}`,
    `Breakout probability: ${breakoutProb.toLowerCase()}. ${reason}`
  ];

  return {
    atr: atrVal,
    regime: volatilityRegime,
    expansionState: expansion,
    breakoutPotential: breakoutProb,
    atrRatioVsPrior: ratio,
    summary: lines.join('\n')
  };
}

module.exports = { analyze, atr, expansionState, breakoutPotential };
