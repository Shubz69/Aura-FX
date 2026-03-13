/**
 * Breakout Prediction Engine – estimates likelihood of a breakout (quality of setup, not direction).
 * Reuses: volatility-engine (compression, ATR), priceClusters (tests), session, liquidity, regime.
 * Does not promise direction; assesses setup quality.
 */

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Score breakout probability 0–100 from factors. No direction bias.
 */
function predict(params = {}) {
  const { symbol, volatility, priceClusters, liquidity, session, regime, marketStructure, ohlcv, currentPrice } = params;
  const price = currentPrice ?? null;
  let score = 0;
  const reasons = [];

  const comp = (volatility?.expansionState || volatility?.regime || '').toString().toLowerCase();
  if (comp === 'compressing') {
    score += 18;
    reasons.push('Volatility compression');
  }
  const exp = comp === 'expanding';
  if (exp) {
    score += 12;
    reasons.push('Rising ATR after compression');
  }

  const res = levelVal(priceClusters?.strongestResistance);
  const sup = levelVal(priceClusters?.strongestSupport);
  if (res != null || sup != null) {
    score += 15;
    reasons.push('Clear level to break');
  }

  const sessionName = (session?.currentSession || '').toLowerCase();
  if (sessionName.includes('london') || sessionName.includes('overlap') || sessionName.includes('new york')) {
    score += 12;
    reasons.push('Session timing (liquidity)');
  }

  const liqAbove = (liquidity?.liquidityAbove?.length || 0) + (liquidity?.stopClustersAbove?.length || 0);
  const liqBelow = (liquidity?.liquidityBelow?.length || 0) + (liquidity?.stopClustersBelow?.length || 0);
  if (liqAbove + liqBelow > 0) {
    score += 10;
    reasons.push('Liquidity buildup');
  }

  const reg = (regime?.regime || '').toLowerCase();
  if (reg === 'range bound' || reg === 'ranging') {
    score += 8;
    reasons.push('Range-bound (breakout potential)');
  }

  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (mom === 'strengthening' || mom === 'strong') {
    score += 8;
    reasons.push('Momentum increase');
  }

  const probability = Math.min(95, Math.round(score));
  const level = price != null && res != null && price < res ? res : (price != null && sup != null && price > sup ? sup : res || sup);

  const summary = [
    'Breakout Watch',
    `Instrument: ${symbol || 'N/A'}`,
    level != null ? `Level: ${level.toFixed(4)}` : 'Level: N/A',
    `Breakout Probability: ${probability}%`,
    `Reason: ${reasons.length ? reasons.join(', ') : 'Insufficient factors'}`
  ].join('\n');

  return {
    instrument: symbol,
    level,
    breakoutProbability: probability,
    reasons,
    summary
  };
}

module.exports = { predict };
