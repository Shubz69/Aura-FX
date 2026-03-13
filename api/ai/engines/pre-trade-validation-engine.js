/**
 * Pre-Trade Validation Engine – discipline checklist before entry.
 * Risk defined? Setup clear? Session appropriate? Output: Trade readiness Approved/Not approved.
 */

function checkRiskDefined(riskPercent, stopLoss, positionSize) {
  const hasStop = stopLoss != null && Number(stopLoss) > 0;
  const hasRisk = riskPercent != null && Number(riskPercent) > 0 && Number(riskPercent) <= 10;
  const hasSize = positionSize != null && Number(positionSize) > 0;
  if (hasStop && (hasRisk || hasSize)) return { pass: true, label: 'Yes', detail: 'Risk parameters defined.' };
  if (hasStop) return { pass: true, label: 'Partial', detail: 'Stop defined; confirm risk % or size.' };
  return { pass: false, label: 'No', detail: 'Define stop loss and risk per trade.' };
}

function checkSetupClear(marketStructure, tradeDirection) {
  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  const dir = (tradeDirection || '').toLowerCase();
  if (!dir) return { pass: false, label: 'Unclear', detail: 'Define trade direction (long/short).' };
  const aligned = (trend === 'bullish' && dir.includes('bull')) || (trend === 'bearish' && dir.includes('bear')) || trend === 'neutral' || trend === 'ranging';
  if (aligned) return { pass: true, label: 'Yes', detail: 'Structure aligned with direction.' };
  return { pass: true, label: 'Counter-trend', detail: 'Structure does not align; ensure intentional.' };
}

function checkSessionAppropriate(session) {
  const s = (session?.currentSession || '').toLowerCase();
  if (s.includes('overlap') || s === 'london' || s === 'new york') return { pass: true, label: 'Good', detail: 'Active session.' };
  if (s === 'asia') return { pass: true, label: 'Moderate', detail: 'Asia session; lower volume.' };
  return { pass: true, label: 'Quiet', detail: 'Off hours; consider waiting for session.' };
}

function checkEventRisk(eventRisk) {
  const warn = eventRisk?.warning;
  if (!warn) return { pass: true, label: 'Clear', detail: 'No high-impact event imminent.' };
  return { pass: false, label: 'Event risk', detail: warn };
}

/**
 * Run pre-trade checklist.
 * @param {Object} params - { riskPercent, stopLoss, positionSize, marketStructure, tradeDirection, session, eventRisk }
 * @returns {Object} { riskDefined, structureAligned, sessionTiming, eventRisk, tradeReadiness, summary }
 */
function validate(params = {}) {
  const riskDefined = checkRiskDefined(params.riskPercent, params.stopLoss, params.positionSize);
  const structureAligned = checkSetupClear(params.marketStructure, params.tradeDirection);
  const sessionTiming = checkSessionAppropriate(params.session);
  const eventRisk = checkEventRisk(params.eventRisk || {});

  const allCritical = riskDefined.pass && structureAligned.pass && eventRisk.pass;
  const tradeReadiness = allCritical ? 'Approved' : 'Not approved';

  const lines = [
    `Pre Trade Review`,
    `Risk defined: ${riskDefined.label}`,
    `Structure aligned: ${structureAligned.label}`,
    `Session timing: ${sessionTiming.label}`,
    `Event risk: ${eventRisk.label}`,
    `Trade readiness: ${tradeReadiness}`
  ];

  return {
    riskDefined: riskDefined.label,
    structureAligned: structureAligned.label,
    sessionTiming: sessionTiming.label,
    eventRisk: eventRisk.label,
    tradeReadiness,
    details: { riskDefined, structureAligned, sessionTiming, eventRisk },
    summary: lines.join('\n')
  };
}

module.exports = { validate, checkRiskDefined, checkSetupClear, checkSessionAppropriate, checkEventRisk };
