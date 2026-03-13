/**
 * Market Alert Engine – generates alerts for key levels, volatility, macro events.
 * Uses existing: price clusters, volatility-engine, event-risk-engine. No duplication.
 */

const APPROACH_PCT = 0.15; // within 0.15% of level = "approaching"

function alertApproachingLevel(symbol, currentPrice, level, type) {
  if (currentPrice == null || level == null) return null;
  const distPct = Math.abs(currentPrice - level) / (currentPrice || 1) * 100;
  if (distPct > APPROACH_PCT) return null;
  return {
    type: 'level',
    symbol,
    message: `${symbol} approaching ${type} at ${level}.`,
    level,
    distancePct: distPct
  };
}

function alertVolatilitySpike(symbol, volatilitySpikeResult) {
  if (!volatilitySpikeResult?.spikeDetected) return null;
  return {
    type: 'volatility',
    symbol,
    message: `${symbol} volatility spike detected. ${volatilitySpikeResult.message || 'Expect large moves.'}`
  };
}

function alertMacroEvent(eventRisk) {
  if (!eventRisk?.warning) return null;
  return {
    type: 'macro',
    symbol: null,
    message: eventRisk.warning
  };
}

/**
 * Generate all applicable alerts from context.
 * @param {Object} params - { symbol, currentPrice, priceClusters, volatilitySpike, eventRisk }
 * @returns {Array} alerts
 */
function generate(params = {}) {
  const { symbol, currentPrice, priceClusters, volatilitySpike, eventRisk } = params;
  const alerts = [];

  const res = priceClusters?.strongestResistance?.level ?? priceClusters?.strongestResistance;
  const sup = priceClusters?.strongestSupport?.level ?? priceClusters?.strongestSupport;
  if (res != null && currentPrice != null) {
    const a = alertApproachingLevel(symbol || 'Price', currentPrice, res, 'major resistance');
    if (a) alerts.push(a);
  }
  if (sup != null && currentPrice != null) {
    const a = alertApproachingLevel(symbol || 'Price', currentPrice, sup, 'major support');
    if (a) alerts.push(a);
  }

  if (volatilitySpike?.spikeDetected) {
    const a = alertVolatilitySpike(symbol || 'Market', volatilitySpike);
    if (a) alerts.push(a);
  }

  const macro = alertMacroEvent(eventRisk || {});
  if (macro) alerts.push(macro);

  return alerts;
}

/**
 * Format alerts for display (e.g. in UI or prompt).
 */
function formatAlerts(alerts) {
  if (!alerts || alerts.length === 0) return null;
  return alerts.map(a => `Alert: ${a.message}`).join('\n');
}

module.exports = { generate, formatAlerts, alertApproachingLevel, alertVolatilitySpike, alertMacroEvent };
