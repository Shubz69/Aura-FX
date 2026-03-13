/**
 * Post-Trade Review Engine – reviews trade execution and discipline after a trade.
 * Input: trade details (entry, exit, stop, target, outcome, timing). Output: entry timing, risk management, discipline.
 */

function reviewEntryTiming(entryPrice, stopLoss, marketStructure) {
  if (entryPrice == null || stopLoss == null) return { rating: 'Unknown', detail: 'Insufficient data' };
  const riskDist = Math.abs(entryPrice - stopLoss) / (entryPrice || 1) * 100;
  const tight = riskDist < 0.2;
  const wide = riskDist > 1;
  if (tight) return { rating: 'Tight', detail: 'Entry very close to stop; consider wider stop or better entry.' };
  if (wide) return { rating: 'Wide', detail: 'Stop far from entry; ensure position size matches risk.' };
  return { rating: 'Good', detail: 'Reasonable distance to stop.' };
}

function reviewRiskManagement(stopLoss, target, outcome, riskPercent) {
  const hadStop = stopLoss != null;
  const hadTarget = target != null;
  const riskDefined = riskPercent != null && riskPercent > 0;
  if (!hadStop) return { rating: 'Poor', detail: 'No stop loss used; always define risk.' };
  if (!riskDefined) return { rating: 'Acceptable', detail: 'Stop used; add risk % for consistency.' };
  if (hadTarget) return { rating: 'Good', detail: 'Stop and target defined; discipline maintained.' };
  return { rating: 'Acceptable', detail: 'Risk defined; consider setting target for R:R.' };
}

function reviewDiscipline(outcome, exitReason) {
  const exit = (exitReason || '').toLowerCase();
  const win = outcome === 'win' || outcome === 'profit';
  if (exit.includes('stop') && !win) return { rating: 'Stable', detail: 'Stopped out; discipline to respect stop.' };
  if (exit.includes('target') && win) return { rating: 'Good', detail: 'Target hit; plan followed.' };
  if (exit.includes('manual') || exit.includes('discretion')) return { rating: 'Stable', detail: 'Manual exit; note reason for consistency.' };
  return { rating: 'Stable', detail: 'Review exit reason for improvement.' };
}

/**
 * Full post-trade review.
 * @param {Object} trade - { entryPrice, exitPrice, stopLoss, target, outcome ('win'|'loss'|'breakeven'), exitReason?, riskPercent?, marketStructure? }
 */
function review(trade = {}) {
  const entryTiming = reviewEntryTiming(trade.entryPrice, trade.stopLoss, trade.marketStructure);
  const riskMgmt = reviewRiskManagement(trade.stopLoss, trade.target, trade.outcome, trade.riskPercent);
  const discipline = reviewDiscipline(trade.outcome, trade.exitReason);

  const lines = [
    'Trade Review',
    `Entry timing: ${entryTiming.rating}`,
    `Risk management: ${riskMgmt.rating}`,
    `Emotional discipline: ${discipline.rating}`,
    entryTiming.detail,
    riskMgmt.detail,
    discipline.detail
  ];

  return {
    entryTiming: entryTiming.rating,
    riskManagement: riskMgmt.rating,
    emotionalDiscipline: discipline.rating,
    details: { entryTiming, riskManagement: riskMgmt, discipline },
    summary: lines.join('\n')
  };
}

module.exports = { review, reviewEntryTiming, reviewRiskManagement, reviewDiscipline };
