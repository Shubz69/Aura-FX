/**
 * Best conditions, strengths/weaknesses, weekly/monthly review summary.
 * Uses trades (session, pair, day of week, result) and behaviour breakdown.
 */

/**
 * @param {Array<{ session?: string, pair?: string, result?: string, pnl?: number, createdAt?: string, checklistPercent?: number }>} trades
 * @returns {{ bestDay: string, worstDay: string, bestSession: string, worstSession: string, bestPair: string, worstPair: string, hasData: boolean }}
 */
export function getBestConditions(trades) {
  const fallback = {
    bestDay: null,
    worstDay: null,
    bestSession: null,
    worstSession: null,
    bestPair: null,
    worstPair: null,
    hasData: false,
  };
  if (!trades || trades.length < 5) return fallback;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = {};
  const bySession = {};
  const byPair = {};
  trades.forEach((t) => {
    const date = (t.createdAt || '').slice(0, 10);
    const day = date ? dayNames[new Date(date + 'Z').getUTCDay()] : null;
    const session = t.session || 'Unknown';
    const pair = t.pair || 'Unknown';
    const pnl = t.pnl != null ? Number(t.pnl) : 0;
    if (day) { byDay[day] = (byDay[day] || 0) + pnl; }
    bySession[session] = (bySession[session] || 0) + pnl;
    byPair[pair] = (byPair[pair] || 0) + pnl;
  });
  const sortByPnl = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const days = sortByPnl(byDay);
  const sessions = sortByPnl(bySession);
  const pairs = sortByPnl(byPair);
  return {
    bestDay: days.length ? days[0][0] : null,
    worstDay: days.length ? days[days.length - 1][0] : null,
    bestSession: sessions.length ? sessions[0][0] : null,
    worstSession: sessions.length ? sessions[sessions.length - 1][0] : null,
    bestPair: pairs.length ? pairs[0][0] : null,
    worstPair: pairs.length ? pairs[pairs.length - 1][0] : null,
    hasData: true,
  };
}

/**
 * @param {Object} breakdown - behaviour breakdown messages and scores
 * @param {Object} conditions - best conditions
 * @returns {{ strengths: string[], weaknesses: string[], actions: string[] }}
 */
export function getReviewSummary(breakdown, conditions) {
  const strengths = [];
  const weaknesses = [];
  const actions = [];
  if (breakdown.riskDiscipline >= 75) strengths.push('Strong risk control');
  else if (breakdown.riskDiscipline < 50) { weaknesses.push('Risk discipline needs improvement'); actions.push('Stick to defined risk per trade'); }
  if (breakdown.ruleAdherence >= 75) strengths.push('Good checklist compliance');
  else if (breakdown.ruleAdherence < 50) { weaknesses.push('Trades taken without full checklist'); actions.push('Complete checklist before every trade'); }
  if (breakdown.consistency >= 70) strengths.push('Consistent routine');
  else actions.push('Build a stable trading routine');
  if (breakdown.emotionalControl >= 70) strengths.push('Emotional control in check');
  else { weaknesses.push('Emotional patterns detected'); actions.push('Pause after 2 consecutive losses'); }
  if (conditions.bestSession) strengths.push(`Best performance in ${conditions.bestSession} session`);
  if (conditions.worstSession) { weaknesses.push(`Weaker in ${conditions.worstSession} session`); actions.push(`Reduce or avoid ${conditions.worstSession} session trades`); }
  while (strengths.length < 3) strengths.push('—');
  while (weaknesses.length < 3) weaknesses.push('—');
  while (actions.length < 3) actions.push('—');
  return { strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3), actions: actions.slice(0, 3) };
}

/**
 * Monthly stats for review and future PDF.
 */
export function getMonthlyReviewStats(trades) {
  if (!trades || trades.length === 0) {
    return { totalTrades: 0, winRate: 0, avgR: 0, bestDay: null, worstDay: null, bestSession: null, worstSession: null };
  }
  const closed = trades.filter((t) => t.result && t.result !== 'open');
  const wins = closed.filter((t) => t.result === 'win').length;
  const totalTrades = closed.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const rMultiples = closed.map((t) => t.rMultiple).filter((n) => n != null && !Number.isNaN(n));
  const avgR = rMultiples.length ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length : 0;
  const conditions = getBestConditions(trades);
  return {
    totalTrades,
    winRate,
    avgR,
    bestDay: conditions.bestDay,
    worstDay: conditions.worstDay,
    bestSession: conditions.bestSession,
    worstSession: conditions.worstSession,
  };
}
