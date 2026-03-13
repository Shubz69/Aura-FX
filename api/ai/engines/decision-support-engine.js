/**
 * Decision Support Engine – combines outputs into a clear recommendation.
 * Status: strong setup | moderate setup | wait for confirmation | high trap risk | avoid for now.
 * Reuses: fake-breakout, stop-hunt, confluence, execution-quality, no-trade.
 */

const fakeBreakoutEngine = require('./fake-breakout-engine');
const stopHuntEngine = require('./stop-hunt-engine');
const executionQualityEngine = require('./execution-quality-engine');

/**
 * Produce decision-support summary from full analysis.
 */
function summarize(params = {}) {
  const { symbol, liquidity, marketStructure, priceClusters, session, eventRisk, volatility, confluence, calendarEvents } = params;

  const fakeOut = fakeBreakoutEngine.detect({ symbol, liquidity, marketStructure, priceClusters, currentPrice: params.currentPrice });
  const trap = stopHuntEngine.detect({ symbol, liquidity, session, marketStructure });
  const exec = executionQualityEngine.assess(params);

  let status = 'moderate setup';
  const reasons = [];

  if (fakeOut.risk === 'High' || trap.trapType) {
    status = 'high trap risk';
    if (fakeOut.risk === 'High') reasons.push('Fake breakout risk elevated');
    if (trap.trapType) reasons.push(trap.trapType);
  } else if (exec.score >= 75 && (confluence?.confluenceScore ?? 0) >= 65) {
    status = 'strong setup';
    reasons.push('Good confluence and execution quality');
  } else if (exec.score >= 55 && (confluence?.confluenceScore ?? 0) >= 50) {
    status = 'moderate setup';
    reasons.push('Reasonable confluence; check execution details');
  } else if (eventRisk?.warning || exec.cons?.some(c => c.includes('data release'))) {
    status = 'wait for confirmation';
    reasons.push('Event risk or timing suggests waiting for confirmation');
  } else if (exec.score < 45 || (confluence?.confluenceScore ?? 0) < 40) {
    status = 'avoid for now';
    reasons.push('Low confluence or poor execution quality');
  } else {
    status = 'wait for confirmation';
    reasons.push('Momentum or structure not yet aligned for high conviction');
  }

  const summary = [
    'Decision Support Summary',
    `Instrument: ${symbol || 'N/A'}`,
    `Status: ${status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}`,
    `Reason: ${reasons.length ? reasons.join('. ') : 'Review key levels and risk.'}`
  ].join('\n');

  return {
    instrument: symbol,
    status,
    reasons,
    fakeBreakoutRisk: fakeOut.risk,
    trapType: trap.trapType,
    executionScore: exec.score,
    confluenceScore: confluence?.confluenceScore,
    summary
  };
}

module.exports = { summarize };
