/**
 * Risk Intelligence Engine – evaluates market risk environment.
 * Uses event-risk-engine and volatility; integrates with existing modules.
 */

const eventRiskEngine = require('./event-risk-engine');

function levelFromFactors(eventRisk, volatility) {
  let score = 0;
  if (eventRisk?.warning) score += 40;
  if (eventRisk?.highImpactEvents?.length > 0) score += 20;
  const vol = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (vol === 'expanding') score += 25;
  else if (vol === 'stable') score += 10;
  if (score >= 50) return { level: 'High', score };
  if (score >= 25) return { level: 'Elevated', score };
  return { level: 'Normal', score };
}

function reasonText(eventRisk, volatility) {
  const parts = [];
  if (eventRisk?.warning) parts.push('Major economic release or high-impact event approaching.');
  if (eventRisk?.highImpactEvents?.length > 0) parts.push('Scheduled high-impact events.');
  const vol = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (vol === 'expanding') parts.push('Volatility expanding; expect larger moves.');
  if (parts.length === 0) parts.push('No major risk factors.');
  return parts.join(' ');
}

/**
 * Evaluate market risk level from calendar and volatility.
 * @param {Object} params - { calendarEvents, eventRisk, volatility }
 */
function evaluate(params = {}) {
  const eventRisk = params.eventRisk ?? eventRiskEngine.analyze(params.calendarEvents || [], 120);
  const volatility = params.volatility || {};
  const { level, score } = levelFromFactors(eventRisk, volatility);
  const reason = reasonText(eventRisk, volatility);

  return {
    marketRiskLevel: level,
    score,
    reason,
    eventRiskWarning: eventRisk?.warning ?? null,
    summary: `Market Risk Level: ${level}. Reason: ${reason}`
  };
}

module.exports = { evaluate, levelFromFactors, reasonText };
