/**
 * Liquidity Map Engine – maps likely liquidity zones (buy-side above, sell-side below, stop clusters).
 * Aggregates liquidity-engine output into a clear map. Reuses liquidity-engine; no duplicate detection.
 */

function levelVal(x) {
  if (x == null) return null;
  if (typeof x === 'number') return x;
  if (typeof x === 'object' && x.level != null) return x.level;
  if (typeof x === 'object' && x.price != null) return x.price;
  return null;
}

/**
 * Build liquidity map from liquidity-engine result (or equivalent).
 * @param {Object} liquidity - Output from liquidityEngine.analyze: liquidityAbove, liquidityBelow, stopClustersAbove, stopClustersBelow
 * @param {number} currentPrice - Optional; for labeling buy/sell side
 */
function map(liquidity = {}, currentPrice = null) {
  const above = liquidity.liquidityAbove ?? liquidity.stopClustersAbove?.map(s => levelVal(s)) ?? [];
  const below = liquidity.liquidityBelow ?? liquidity.stopClustersBelow?.map(s => levelVal(s)) ?? [];
  const stopAbove = (liquidity.stopClustersAbove || []).map(s => ({ level: levelVal(s) ?? s.price, touches: s.touches ?? s.count }));
  const stopBelow = (liquidity.stopClustersBelow || []).map(s => ({ level: levelVal(s) ?? s.price, touches: s.touches ?? s.count }));

  const buySideLevels = [...new Set([...above, ...stopAbove.map(s => s.level)].filter(Boolean))].sort((a, b) => a - b);
  const sellSideLevels = [...new Set([...below, ...stopBelow.map(s => s.level)].filter(Boolean))].sort((a, b) => b - a);

  const topBuy = buySideLevels.length ? Math.min(...buySideLevels) : null;
  const topSell = sellSideLevels.length ? Math.max(...sellSideLevels) : null;

  const lines = [];
  if (topBuy != null) lines.push(`Buy-side liquidity above ${topBuy.toFixed(4)}`);
  if (topSell != null) lines.push(`Sell-side liquidity below ${topSell.toFixed(4)}`);
  if (stopBelow.length) lines.push(`Stop clusters below: ${stopBelow.slice(0, 3).map(s => s.level?.toFixed(4)).join(', ')}`);
  if (stopAbove.length) lines.push(`Stop clusters above: ${stopAbove.slice(0, 3).map(s => s.level?.toFixed(4)).join(', ')}`);

  return {
    buySideLiquidityAbove: topBuy,
    sellSideLiquidityBelow: topSell,
    stopClustersAbove: stopAbove,
    stopClustersBelow: stopBelow,
    breakoutLiquidity: { above: topBuy, below: topSell },
    summary: lines.length ? 'Liquidity Map:\n' + lines.join('\n') : 'Insufficient data for liquidity map.'
  };
}

module.exports = { map };
