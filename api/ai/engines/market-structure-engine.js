/**
 * Market Structure Engine – institutional-grade structure detection.
 * Detects HH, HL, LH, LL, break of structure, trend continuation/reversal, momentum.
 * Uses OHLC data; works with quote-only when candles unavailable (minimal output).
 */

const { analyzeMarketStructure: baseStructure } = require('../price-action');

const SWING_LOOKBACK = 5;

/**
 * Normalize candle format: { open, high, low, close } or { o, h, l, c } plus optional timestamp.
 * @param {Array} ohlcv - Raw candles
 * @returns {Array} Normalized { open, high, low, close, timestamp }
 */
function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map((c, i) => ({
    open: c.open ?? c.o,
    high: c.high ?? c.h,
    low: c.low ?? c.l,
    close: c.close ?? c.c,
    timestamp: c.timestamp ?? c.t ?? c.datetime ?? null
  }));
}

/**
 * Build structure labels (HH, HL, LH, LL) from swing highs/lows.
 */
function labelStructure(swingHighs, swingLows) {
  const labels = [];
  if (swingHighs.length >= 2) {
    const [prev, curr] = swingHighs.slice(-2);
    labels.push(curr.price > prev.price ? 'HH' : 'LH');
  }
  if (swingLows.length >= 2) {
    const [prev, curr] = swingLows.slice(-2);
    labels.push(curr.price > prev.price ? 'HL' : 'LL');
  }
  return labels;
}

/**
 * Momentum heuristic: slope of recent swing lows (bullish) or swing highs (bearish).
 */
function momentumState(ohlcv, trendDirection, swingHighs, swingLows) {
  if (!ohlcv || ohlcv.length < 10) return 'Unknown';
  const recent = ohlcv.slice(-20);
  const closes = recent.map(c => c.close);
  const avgSlope = closes.length < 2 ? 0 : (closes[closes.length - 1] - closes[0]) / closes.length;
  const volatility = Math.max(...recent.map(c => c.high - c.low)) || 1;
  const normalizedSlope = avgSlope / volatility;
  if (trendDirection === 'bullish') return normalizedSlope > 0.05 ? 'Strengthening' : normalizedSlope < -0.05 ? 'Weakening' : 'Consolidating';
  if (trendDirection === 'bearish') return normalizedSlope < -0.05 ? 'Strengthening' : normalizedSlope > 0.05 ? 'Weakening' : 'Consolidating';
  return 'Neutral';
}

/**
 * Analyze market structure from OHLCV or single quote.
 * @param {Array|Object} ohlcvOrQuote - Array of candles or single { open, high, low, close }
 * @returns {Object} { trendDirection, structure, structureLabels, recentBOS, momentum, summary }
 */
function analyze(ohlcvOrQuote) {
  const isQuote = ohlcvOrQuote && !Array.isArray(ohlcvOrQuote) && typeof ohlcvOrQuote === 'object';
  if (isQuote) {
    const q = ohlcvOrQuote;
    const o = q.open ?? q.o;
    const h = q.high ?? q.h;
    const l = q.low ?? q.l;
    const c = q.close ?? q.price ?? q.c;
    if (o == null || h == null || l == null || c == null) {
      return { trendDirection: 'Unknown', structure: 'Insufficient data', recentBOS: null, momentum: 'Unknown', summary: 'Single quote only; add OHLCV for full structure.' };
    }
    const singleCandle = [{ open: o, high: h, low: l, close: c, timestamp: null }];
    const structure = baseStructure(singleCandle);
    if (structure.error) {
      return { trendDirection: 'Unknown', structure: 'Single candle', structureLabels: [], recentBOS: null, momentum: 'Unknown', summary: 'Need multiple candles for structure.' };
    }
    return {
      trendDirection: structure.trendDirection || 'neutral',
      structure: structure.structure || 'ranging',
      structureLabels: [],
      recentBOS: structure.breakOfStructure || null,
      momentum: 'Unknown',
      summary: `Trend: ${structure.trendDirection}. Structure: ${structure.structure}. ${structure.breakOfStructure ? 'Recent BOS detected.' : ''}`
    };
  }

  const ohlcv = normalizeCandles(ohlcvOrQuote);
  if (ohlcv.length < 2) {
    return { trendDirection: 'Unknown', structure: 'Insufficient data', structureLabels: [], recentBOS: null, momentum: 'Unknown', summary: 'Need at least 2 candles.' };
  }

  const structure = baseStructure(ohlcv);
  if (structure.error) return { ...structure, structureLabels: [], recentBOS: null, momentum: 'Unknown' };

  const labels = labelStructure(structure.swingHighs || [], structure.swingLows || []);
  const momentum = momentumState(ohlcv, structure.trendDirection, structure.swingHighs || [], structure.swingLows || []);

  const structurePhrase = structure.structure === 'uptrend' ? 'Higher highs and higher lows' : structure.structure === 'downtrend' ? 'Lower highs and lower lows' : 'Ranging (no clear trend)';
  let summary = `Trend Direction: ${(structure.trendDirection || 'Neutral').charAt(0).toUpperCase() + (structure.trendDirection || 'neutral').slice(1)}\nStructure: ${structurePhrase}\nRecent Break of Structure: ${structure.breakOfStructure ? 'Detected (' + structure.breakOfStructure.type + ')' : 'None'}\nMomentum: ${momentum}`;

  return {
    trendDirection: structure.trendDirection || 'neutral',
    structure: structure.structure || 'ranging',
    structureLabels: labels,
    swingHighs: structure.swingHighs,
    swingLows: structure.swingLows,
    recentBOS: structure.breakOfStructure,
    momentum,
    currentPrice: structure.currentPrice,
    summary: summary.trim()
  };
}

module.exports = { analyze, normalizeCandles, labelStructure, momentumState };
