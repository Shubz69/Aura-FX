/**
 * Smart Money Engine – order blocks, fair value gaps, imbalance zones, mitigation.
 * Uses candle imbalance detection; reuses price-action FVG and supply/demand.
 */

const { detectFairValueGaps, identifySupplyDemandZones } = require('../price-action');

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

/**
 * Order block: last opposite-bodied candle before a strong impulsive move.
 * Bullish OB = last bearish candle before strong up move; bearish OB = last bullish before strong down.
 */
function findOrderBlocks(ohlcv, impulseRatio = 2, lookback = 30) {
  const candles = normalizeCandles(ohlcv).slice(-lookback);
  if (candles.length < 5) return { bullish: [], bearish: [] };

  const bullish = [];
  const bearish = [];

  for (let i = 2; i < candles.length - 3; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 0.0001;
    const after = candles.slice(i + 1, i + 6);
    const moveUp = after[after.length - 1].close - c.close;
    const moveDown = c.close - after[after.length - 1].close;

    if (body / range < 0.6) continue; // skip doji

    const isBearishCandle = c.close < c.open;
    const isBullishCandle = c.close > c.open;

    if (isBearishCandle && moveUp > range * impulseRatio) {
      bullish.push({ top: c.high, bottom: c.low, base: c.close, timestamp: c.timestamp, strength: moveUp / range });
    }
    if (isBullishCandle && moveDown > range * impulseRatio) {
      bearish.push({ top: c.high, bottom: c.low, base: c.close, timestamp: c.timestamp, strength: moveDown / range });
    }
  }

  return {
    bullish: bullish.sort((a, b) => b.strength - a.strength).slice(0, 5),
    bearish: bearish.sort((a, b) => b.strength - a.strength).slice(0, 5)
  };
}

/**
 * Imbalance zones: same as FVG; we also flag if FVG has been partially/fully filled (mitigation).
 */
function checkMitigation(fvg, candlesAfter) {
  if (!candlesAfter || candlesAfter.length === 0) return { mitigated: false };
  const lows = candlesAfter.map(c => c.low);
  const highs = candlesAfter.map(c => c.high);
  const top = fvg.top ?? Math.max(fvg.bottom, fvg.top);
  const bottom = fvg.bottom ?? Math.min(fvg.bottom, fvg.top);
  if (fvg.type === 'bullish_fvg') {
    const filled = lows.some(l => l <= top && l >= bottom);
    return { mitigated: filled };
  }
  const filled = highs.some(h => h >= bottom && h <= top);
  return { mitigated: filled };
}

/**
 * Full smart money analysis.
 */
function analyze(ohlcv, currentPrice = null) {
  const ohlcvNorm = normalizeCandles(ohlcv);
  if (ohlcvNorm.length < 5) {
    return { orderBlocksBullish: [], orderBlocksBearish: [], fairValueGaps: [], imbalanceZones: [], summary: 'Insufficient data.' };
  }

  const price = currentPrice ?? ohlcvNorm[ohlcvNorm.length - 1].close;
  const ob = findOrderBlocks(ohlcvNorm);
  const fvgs = detectFairValueGaps(ohlcvNorm);
  const zones = identifySupplyDemandZones(ohlcvNorm);

  const orderBlocksBullish = (zones.demand || []).concat(ob.bullish).slice(0, 5);
  const orderBlocksBearish = (zones.supply || []).concat(ob.bearish).slice(0, 5);

  const nearestBullOB = orderBlocksBullish
    .map(z => ({ ...z, level: (z.top + z.bottom) / 2 }))
    .filter(z => z.level < price)
    .sort((a, b) => b.level - a.level)[0];
  const nearestBearOB = orderBlocksBearish
    .map(z => ({ ...z, level: (z.top + z.bottom) / 2 }))
    .filter(z => z.level > price)
    .sort((a, b) => a.level - b.level)[0];

  const lines = [];
  if (nearestBullOB) lines.push(`Bullish order block near ${nearestBullOB.level.toFixed(4)}`);
  if (nearestBearOB) lines.push(`Bearish order block near ${nearestBearOB.level.toFixed(4)}`);
  const unfilledFvgs = fvgs.filter(f => !f.filled);
  unfilledFvgs.slice(0, 2).forEach(f => {
    const mid = ((f.top + f.bottom) / 2).toFixed(4);
    lines.push(`${f.type === 'bullish_fvg' ? 'Bullish' : 'Bearish'} fair value gap between ${(f.bottom).toFixed(4)} and ${(f.top).toFixed(4)}`);
  });

  return {
    orderBlocksBullish,
    orderBlocksBearish,
    fairValueGaps: fvgs,
    imbalanceZones: unfilledFvgs,
    summary: lines.length ? lines.join('\n') : 'No order blocks or FVGs in range.'
  };
}

module.exports = { analyze, findOrderBlocks, checkMitigation };
