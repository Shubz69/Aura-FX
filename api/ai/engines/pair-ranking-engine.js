/**
 * Pair Ranking Engine – ranks instruments by trading conditions.
 * Factors: volatility, trend clarity, liquidity, macro influence, technical structure.
 * Accepts array of { symbol, ...engineResults }; uses existing engine outputs.
 */

function scoreVolatility(volatility) {
  if (!volatility?.atr) return 0;
  const exp = (volatility.expansionState || '').toLowerCase();
  if (exp === 'expanding') return 25;
  if (exp === 'stable') return 20;
  if (exp === 'compressing') return 15;
  return 10;
}

function scoreTrendClarity(marketStructure) {
  const t = (marketStructure?.trendDirection || '').toLowerCase();
  const mom = (marketStructure?.momentum || '').toLowerCase();
  if ((t === 'bullish' || t === 'bearish') && mom === 'strengthening') return 25;
  if (t === 'bullish' || t === 'bearish') return 18;
  if (t === 'neutral' || t === 'ranging') return 8;
  return 0;
}

function scoreLiquidity(liquidity) {
  if (!liquidity) return 0;
  const above = liquidity.liquidityAbove?.length || 0;
  const below = liquidity.liquidityBelow?.length || 0;
  const hasSweep = !!liquidity.recentSweep;
  if (above + below >= 2 && hasSweep) return 20;
  if (above + below >= 1) return 12;
  return 5;
}

function scoreMacroInfluence(calendarEvents, eventRisk) {
  const highSoon = !!eventRisk?.warning;
  if (highSoon) return 15; // relevant but risky
  if (Array.isArray(calendarEvents) && calendarEvents.length > 0) return 10;
  return 5;
}

function scoreTechnicalStructure(priceClusters, regime) {
  let s = 0;
  if (priceClusters?.strongestSupport && priceClusters?.strongestResistance) s += 10;
  else if (priceClusters?.strongestSupport || priceClusters?.strongestResistance) s += 5;
  const reg = (regime?.regime || '').toLowerCase();
  if (reg === 'trending') s += 10;
  else if (reg === 'range bound') s += 8;
  return s;
}

/**
 * Rank instruments. Each item: { symbol, marketStructure, volatility, liquidity, priceClusters, regime, calendarEvents, eventRisk }.
 * @param {Array<Object>} analyses - One object per symbol with engine results
 * @returns {Object} { rankings, topMarkets, summary }
 */
function rank(analyses = []) {
  const scored = analyses.map(a => {
    const vol = scoreVolatility(a.volatility);
    const trend = scoreTrendClarity(a.marketStructure);
    const liq = scoreLiquidity(a.liquidity);
    const macro = scoreMacroInfluence(a.calendarEvents || [], a.eventRisk || {});
    const tech = scoreTechnicalStructure(a.priceClusters, a.regime);
    const total = vol + trend + liq + macro + tech;
    return {
      symbol: a.symbol,
      totalScore: total,
      volatility: vol,
      trendClarity: trend,
      liquidity: liq,
      macro: macro,
      technical: tech
    };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  const top = scored.slice(0, 10);

  const reasons = (s) => {
    const r = [];
    if (s.volatility >= 20) r.push('Strong volatility');
    if (s.trendClarity >= 18) r.push('Clear structure');
    if (s.liquidity >= 12) r.push('Liquidity present');
    if (s.technical >= 15) r.push('Technical structure');
    return r.length ? r.join(' + ') : 'Moderate conditions';
  };

  return {
    rankings: scored,
    topMarkets: top.map((s, i) => ({ rank: i + 1, symbol: s.symbol, reason: reasons(s) })),
    summary: top.length ? `Top market conditions: ${top.map((s, i) => `${i + 1} ${s.symbol} (${reasons(s)})`).join('; ')}` : 'No data to rank.'
  };
}

module.exports = { rank, scoreVolatility, scoreTrendClarity, scoreLiquidity, scoreMacroInfluence, scoreTechnicalStructure };
