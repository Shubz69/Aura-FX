/**
 * Client-side fallback when /api/trader-replay/analysis fails (shape matches API heuristic).
 */
export function buildHeuristicTradeAnalysis(trade) {
  if (!trade) return null;
  const pnl = Number(trade.pnl || 0);
  const directionWord = trade.direction === 'buy' ? 'long' : 'short';
  return {
    strengths: [
      trade.stopLoss ? 'Defined stop loss gives the trade a clear invalidation point.' : 'Execution appears simple and decisive.',
      pnl >= 0 ? 'Exit captured realized profit without over-holding.' : 'Position size stayed contained for a reviewable loss.',
    ],
    weaknesses: [
      trade.takeProfit ? null : 'No explicit take-profit was logged, which weakens pre-trade planning.',
      pnl < 0 ? 'Timing or confirmation likely needed one more trigger before entry.' : 'Consider whether partials could improve consistency.',
    ].filter(Boolean),
    betterApproach: [
      `Before the ${directionWord} entry, wait for one extra confirmation candle in line with the setup.`,
      'Pre-define exit logic (target/management) before clicking execute.',
    ],
    nextTimeChecklist: [
      'Map invalidation and target first.',
      'Confirm session volatility fits your setup.',
      'Track whether entry came from plan or impulse.',
    ],
    verdict: {
      entry: trade.entry ? 'Entry was measurable and reviewable.' : 'Entry data is missing; log exact trigger next time.',
      exit: trade.exit ? 'Exit is recorded and can be replayed against structure.' : 'Exit is missing; this limits post-trade learning.',
      risk: trade.stopLoss ? 'Risk controls were present.' : 'Risk controls were incomplete (missing SL).',
      timing: pnl >= 0 ? 'Timing was acceptable for this setup.' : 'Timing looked early or late relative to structure.',
      rr: 'R context unavailable without full level data.',
    },
  };
}
