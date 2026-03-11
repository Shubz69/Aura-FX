/**
 * Trade analytics metrics (win rate, PnL, streaks, etc.).
 * Uses getClosedTrades from utils; trades are objects with result, pnl, r_multiple, rr, pair, session, created_at, checklist_percent, checklist_total, risk_percent.
 */
import { getClosedTrades } from '../utils';

export function getResolvedTrades(trades) {
  return getClosedTrades(trades);
}

export function totalTrades(trades) {
  return getResolvedTrades(trades).length;
}

export function winRate(trades) {
  const resolved = getResolvedTrades(trades);
  if (resolved.length === 0) return 0;
  const wins = resolved.filter((t) => t.result === 'win').length;
  return (wins / resolved.length) * 100;
}

export function breakevenRate(trades) {
  const resolved = getResolvedTrades(trades);
  if (resolved.length === 0) return 0;
  const be = resolved.filter((t) => t.result === 'breakeven').length;
  return (be / resolved.length) * 100;
}

export function averageR(trades) {
  const resolved = getResolvedTrades(trades).filter((t) => t.result !== 'breakeven');
  if (resolved.length === 0) return 0;
  const sum = resolved.reduce((a, t) => a + (t.r_multiple ?? 0), 0);
  return sum / resolved.length;
}

export function averageRR(trades) {
  const resolved = getResolvedTrades(trades);
  if (resolved.length === 0) return 0;
  const sum = resolved.reduce((a, t) => a + (t.rr ?? 0), 0);
  return sum / resolved.length;
}

export function totalPnL(trades) {
  return getResolvedTrades(trades).reduce((a, t) => a + (t.pnl ?? 0), 0);
}

export function profitFactor(trades) {
  const resolved = getResolvedTrades(trades);
  const grossProfit = resolved.filter((t) => (t.pnl ?? 0) > 0).reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(resolved.filter((t) => (t.pnl ?? 0) < 0).reduce((a, t) => a + t.pnl, 0));
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

export function expectancy(trades) {
  const resolved = getResolvedTrades(trades);
  if (resolved.length === 0) return 0;
  const sumR = resolved.reduce((a, t) => a + (t.r_multiple ?? 0), 0);
  return sumR / resolved.length;
}

export function pairPnL(trades) {
  const resolved = getResolvedTrades(trades);
  const out = {};
  for (const t of resolved) {
    const p = t.pair || 'Unknown';
    out[p] = (out[p] ?? 0) + (t.pnl ?? 0);
  }
  return out;
}

export function bestPair(trades) {
  const byPair = pairPnL(trades);
  let best = null;
  let bestPnL = -Infinity;
  for (const [pair, pnl] of Object.entries(byPair)) {
    if (pnl > bestPnL) {
      bestPnL = pnl;
      best = pair;
    }
  }
  return best;
}

export function worstPair(trades) {
  const byPair = pairPnL(trades);
  let worst = null;
  let worstPnL = Infinity;
  for (const [pair, pnl] of Object.entries(byPair)) {
    if (pnl < worstPnL) {
      worstPnL = pnl;
      worst = pair;
    }
  }
  return worst;
}

export function sessionPnL(trades) {
  const resolved = getResolvedTrades(trades);
  const out = {};
  for (const t of resolved) {
    const s = t.session ?? 'Unknown';
    out[s] = (out[s] ?? 0) + (t.pnl ?? 0);
  }
  return out;
}

export function maxDrawdown(trades) {
  const resolved = [...getResolvedTrades(trades)].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  let peak = 0;
  let maxDd = 0;
  let cum = 0;
  for (const t of resolved) {
    cum += t.pnl ?? 0;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function longestWinStreak(trades) {
  const resolved = [...getResolvedTrades(trades)].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  let max = 0;
  let current = 0;
  for (const t of resolved) {
    if (t.result === 'win') {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

export function longestLossStreak(trades) {
  const resolved = [...getResolvedTrades(trades)].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  let max = 0;
  let current = 0;
  for (const t of resolved) {
    if (t.result === 'loss') {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

export function averageChecklistPercent(trades) {
  const withChecklist = getResolvedTrades(trades).filter((t) => (t.checklist_total ?? 0) > 0);
  if (withChecklist.length === 0) return 0;
  const sum = withChecklist.reduce((a, t) => a + (t.checklist_percent ?? 0), 0);
  return sum / withChecklist.length;
}

function legacyConsistencyScoreFromResolved(resolved) {
  if (resolved.length < 2) return 0;
  const list = resolved.filter((t) => t.result && t.result !== 'open');
  if (list.length < 2) return 0;
  let score = 50;
  const checklistPcts = list.map((t) => t.checklist_percent ?? 0).filter((p) => p > 0);
  if (checklistPcts.length > 0) {
    const avgChecklist = checklistPcts.reduce((a, b) => a + b, 0) / checklistPcts.length;
    score += (avgChecklist - 50) / 5;
  }
  const riskPcts = list.map((t) => t.risk_percent ?? 0).filter((r) => r > 0);
  if (riskPcts.length > 0) {
    const avgRisk = riskPcts.reduce((a, b) => a + b, 0) / riskPcts.length;
    if (avgRisk <= 2) score += 10;
    else if (avgRisk <= 3) score += 5;
  }
  const rMults = list.map((t) => t.r_multiple ?? 0);
  const mean = rMults.reduce((a, b) => a + b, 0) / rMults.length;
  const vol = rMults.reduce((a, b) => a + b * b, 0) / rMults.length - mean * mean;
  if (vol < 2) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function legacyConsistencyScore(trades) {
  const resolved = getResolvedTrades(trades);
  return legacyConsistencyScoreFromResolved(
    resolved.map((t) => ({
      result: t.result,
      r_multiple: t.r_multiple,
      risk_percent: t.risk_percent,
      checklist_percent: t.checklist_percent,
    }))
  );
}
