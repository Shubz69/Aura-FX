/**
 * Watchlist Engine – monitors symbols for key levels, volatility, breakout potential.
 * Input: watchlist [{ symbol, levels?: { support?, resistance? } }] + current data/analysis per symbol.
 */

const APPROACH_PCT = 0.2;
const VOLATILITY_FLAG = 'Expanding';

function checkApproachingLevel(symbol, currentPrice, level, label) {
  if (currentPrice == null || level == null) return null;
  const distPct = Math.abs(currentPrice - level) / (currentPrice || 1) * 100;
  if (distPct > APPROACH_PCT) return null;
  return {
    symbol,
    type: 'level',
    message: `${symbol} approaching ${label} at ${level}.`,
    level,
    currentPrice
  };
}

function checkBreakoutPotential(regime, volatility) {
  const reg = (regime?.regime || '').toLowerCase();
  const exp = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (reg === 'range bound' && (exp === 'expanding' || volatility?.breakoutPotential === 'Rising')) return true;
  if (volatility?.breakoutPotential === 'High') return true;
  return false;
}

/**
 * Evaluate watchlist items. Each item: { symbol, currentPrice?, levels?: { support?, resistance? }, priceClusters?, regime?, volatility? }.
 * @param {Array<Object>} watchlistWithData - One object per watchlist symbol with optional levels and engine results
 * @returns {Object} { alerts, summary }
 */
function evaluate(watchlistWithData = []) {
  const alerts = [];

  for (const item of watchlistWithData) {
    const symbol = item.symbol;
    const price = item.currentPrice;
    const levels = item.levels || {};
    const clusters = item.priceClusters;
    const res = levels.resistance ?? clusters?.strongestResistance?.level ?? clusters?.strongestResistance;
    const sup = levels.support ?? clusters?.strongestSupport?.level ?? clusters?.strongestSupport;

    const a1 = checkApproachingLevel(symbol, price, res, 'key resistance');
    if (a1) alerts.push(a1);
    const a2 = checkApproachingLevel(symbol, price, sup, 'key support');
    if (a2) alerts.push(a2);

    if (checkBreakoutPotential(item.regime, item.volatility)) {
      alerts.push({
        symbol,
        type: 'breakout',
        message: `${symbol} possible breakout soon. Volatility/regime suggest expansion.`
      });
    }

    const vol = (item.volatility?.expansionState || item.volatility?.regime || '').toString();
    if (vol === VOLATILITY_FLAG) {
      alerts.push({
        symbol,
        type: 'volatility',
        message: `${symbol} volatility increasing.`
      });
    }
  }

  const summary = alerts.length
    ? 'Watchlist alerts: ' + alerts.map(a => a.message).join(' | ')
    : 'No watchlist alerts.';

  return {
    alerts,
    summary
  };
}

module.exports = { evaluate, checkApproachingLevel, checkBreakoutPotential };
