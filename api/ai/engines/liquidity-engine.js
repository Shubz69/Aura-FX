/**
 * Liquidity Engine – equal highs/lows, stop clusters, liquidity sweeps and grabs.
 * Informs where stops may sit and where sweeps occurred.
 */

const { detectLiquiditySweeps } = require('../price-action');

const TOLERANCE_PCT = 0.0003; // ~3 pips for forex; scale by price
const CLUSTER_MIN_TOUCHES = 2;
const LOOKBACK_SWEEPS = 80;

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({
    open: c.open ?? c.o,
    high: c.high ?? c.h,
    low: c.low ?? c.l,
    close: c.close ?? c.c,
    timestamp: c.timestamp ?? c.t ?? null
  }));
}

function tolerance(price) {
  if (price > 1000) return price * 0.0001;
  if (price > 1) return price * TOLERANCE_PCT;
  return price * 0.0005;
}

/**
 * Group price levels that are within tolerance (equal highs / equal lows).
 */
function findEqualLevels(candles, useHigh) {
  const levels = candles.map(c => useHigh ? c.high : c.low).filter(n => typeof n === 'number');
  if (levels.length === 0) return [];
  const tol = tolerance(levels.reduce((a, b) => a + b, 0) / levels.length);
  const buckets = [];
  for (const p of levels) {
    const existing = buckets.find(b => Math.abs(b.price - p) <= tol);
    if (existing) existing.count++;
    else buckets.push({ price: p, count: 1 });
  }
  return buckets.filter(b => b.count >= CLUSTER_MIN_TOUCHES).sort((a, b) => b.count - a.count);
}

/**
 * Stop clusters: zones where multiple equal highs or equal lows suggest stop accumulation.
 */
function findStopClusters(candles) {
  const ohlcv = normalizeCandles(candles);
  if (ohlcv.length < 10) return { above: [], below: [] };
  const currentPrice = ohlcv[ohlcv.length - 1].close;
  const equalHighs = findEqualLevels(ohlcv, true);
  const equalLows = findEqualLevels(ohlcv, false);
  const above = equalHighs.filter(l => l.price > currentPrice).slice(0, 5);
  const below = equalLows.filter(l => l.price < currentPrice).slice(0, 5);
  return { above, below };
}

/**
 * Recent liquidity sweep: last sweep in lookback.
 */
function getRecentSweep(candles) {
  const ohlcv = normalizeCandles(candles);
  const sweeps = detectLiquiditySweeps(ohlcv, LOOKBACK_SWEEPS);
  if (sweeps.length === 0) return null;
  return sweeps[sweeps.length - 1];
}

/**
 * Full liquidity analysis.
 * @param {Array} ohlcv - Candles
 * @param {number} currentPrice - Optional; defaults to last close
 * @returns {Object} liquidityAbove, liquidityBelow, stopClustersAbove, stopClustersBelow, recentSweep, summary
 */
function analyze(ohlcv, currentPrice = null) {
  const ohlcvNorm = normalizeCandles(ohlcv);
  if (ohlcvNorm.length < 5) {
    return {
      liquidityAbove: [],
      liquidityBelow: [],
      stopClustersAbove: [],
      stopClustersBelow: [],
      recentSweep: null,
      summary: 'Insufficient data for liquidity analysis.'
    };
  }

  const price = currentPrice ?? ohlcvNorm[ohlcvNorm.length - 1].close;
  const { above: clustersAbove, below: clustersBelow } = findStopClusters(ohlcvNorm);
  const recentSweep = getRecentSweep(ohlcvNorm);

  const liquidityAbove = clustersAbove.map(c => c.price).slice(0, 3);
  const liquidityBelow = clustersBelow.map(c => c.price).slice(0, 3);

  const lines = [];
  if (liquidityAbove.length) lines.push(`Liquidity above ${liquidityAbove.map(p => p.toFixed(4)).join(', ')}`);
  if (liquidityBelow.length) lines.push(`Liquidity below ${liquidityBelow.map(p => p.toFixed(4)).join(', ')}`);
  if (clustersBelow.length) lines.push(`Stop clusters below ${clustersBelow.slice(0, 2).map(c => c.price.toFixed(4)).join(', ')}`);
  if (clustersAbove.length) lines.push(`Stop clusters above ${clustersAbove.slice(0, 2).map(c => c.price.toFixed(4)).join(', ')}`);
  if (recentSweep) lines.push(`Recent liquidity sweep detected (${recentSweep.type}, level ${recentSweep.level?.toFixed(4) ?? 'N/A'}).`);

  return {
    liquidityAbove,
    liquidityBelow,
    stopClustersAbove: clustersAbove.map(c => ({ level: c.price, touches: c.count })),
    stopClustersBelow: clustersBelow.map(c => ({ level: c.price, touches: c.count })),
    recentSweep,
    summary: lines.length ? lines.join('\n') : 'No significant liquidity clusters detected.'
  };
}

module.exports = { analyze, findEqualLevels, findStopClusters, getRecentSweep };
