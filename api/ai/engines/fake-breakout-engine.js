/**
 * Fake Breakout Detection Engine – identifies likely false breakouts.
 * Reuses: liquidity.recentSweep (break then reject), marketStructure (momentum), priceClusters.
 * Detects: breakout then rejection, weak follow-through, breakout into opposing liquidity, low momentum.
 */

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Assess fake breakout risk from analysis. High/Medium/Low.
 */
function detect(params = {}) {
  const { symbol, liquidity, marketStructure, priceClusters, currentPrice } = params;
  let risk = 'Low';
  const reasons = [];

  const sweep = liquidity?.recentSweep;
  if (sweep) {
    risk = 'High';
    const dir = sweep.type === 'bullish_sweep' ? 'above' : 'below';
    reasons.push(`Break ${dir} level failed to hold`);
    reasons.push(sweep.type === 'bullish_sweep' ? 'Sharp rejection candle (reversed down)' : 'Sharp rejection candle (reversed up)');
  }

  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (mom === 'weakening' || mom === 'neutral') {
    if (risk === 'Low') risk = 'Medium';
    reasons.push('Low momentum confirmation');
  }

  const res = levelVal(priceClusters?.strongestResistance);
  const sup = levelVal(priceClusters?.strongestSupport);
  const price = currentPrice ?? null;
  if (price != null && res != null && price > res * 1.001) {
    const clusterAbove = (liquidity?.liquidityAbove?.length || 0) > 0;
    if (clusterAbove) reasons.push('Breakout into heavy opposing liquidity above');
  }
  if (price != null && sup != null && price < sup * 0.999) {
    const clusterBelow = (liquidity?.liquidityBelow?.length || 0) > 0;
    if (clusterBelow) reasons.push('Breakout into heavy opposing liquidity below');
  }

  const level = sweep?.level ?? res ?? sup;
  const summary = [
    'Fake Breakout Risk',
    `Instrument: ${symbol || 'N/A'}`,
    level != null ? `Level: ${level.toFixed(4)}` : 'Level: N/A',
    `Risk: ${risk}`,
    `Reason: ${reasons.length ? reasons.join(', ') : 'No strong fake breakout signals'}`
  ].join('\n');

  return {
    instrument: symbol,
    level,
    risk,
    reasons,
    summary
  };
}

module.exports = { detect };
