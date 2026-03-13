/**
 * Volatility Forecast Engine – predicts volatility changes from ATR trend, compression, events.
 * Uses volatility-engine and event-risk-engine. No duplicate logic.
 */

const { expansionState, atr } = require('./volatility-engine');
const eventRiskEngine = require('./event-risk-engine');

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({ high: c.high ?? c.h, low: c.low ?? c.l, close: c.close ?? c.c }));
}

/**
 * Forecast next-session volatility direction.
 * @param {Object} params - { ohlcv?, volatility?, calendarEvents?, eventRisk? }
 */
function forecast(params = {}) {
  const { ohlcv, volatility, calendarEvents = [], eventRisk } = params;
  const events = eventRisk ?? eventRiskEngine.analyze(calendarEvents, 120);

  let atrTrend = 'stable';
  let compressionZone = false;
  if (ohlcv && ohlcv.length >= 30) {
    const c = normalizeCandles(ohlcv);
    const exp = expansionState(c, 14);
    atrTrend = (exp.state || '').toLowerCase();
    if (atrTrend === 'compressing') compressionZone = true;
  } else if (volatility?.expansionState === 'Compressing' || volatility?.regime === 'Compressing') {
    compressionZone = true;
    atrTrend = 'compressing';
  } else if (volatility?.expansionState === 'Expanding' || volatility?.regime === 'Expanding') {
    atrTrend = 'expanding';
  }

  const highImpactApproaching = !!events?.warning;
  let direction = 'Stable';
  let message = '';

  if (highImpactApproaching) {
    direction = 'Increase expected';
    message = 'Expected volatility increase in next session. High impact economic data approaching.';
  } else if (compressionZone) {
    direction = 'Increase likely';
    message = 'Volatility compression often precedes expansion. Expect volatility increase when range breaks.';
  } else if (atrTrend === 'expanding') {
    direction = 'Elevated';
    message = 'Volatility already expanding. Maintain elevated expectations.';
  } else {
    message = 'No strong volatility change signal.';
  }

  return {
    direction,
    compressionZone,
    highImpactEventSoon: highImpactApproaching,
    eventWarning: events?.warning ?? null,
    summary: `Volatility Forecast: ${message}`
  };
}

module.exports = { forecast };
