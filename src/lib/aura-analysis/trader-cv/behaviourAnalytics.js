/**
 * Behaviour analytics: Risk Discipline, Rule Adherence, Consistency, Emotional Control.
 * Uses aura_analysis_trades + journal data where available. Extension points for MT5/API.
 */

/**
 * Risk Discipline (0–100). From trades: risk consistency, SL usage, position size, breaches.
 * @param {Array<{ riskPercent: number, riskAmount: number, stopLoss: number, positionSize: number, entryPrice: number }>} trades
 * @param {{ targetRiskPercent?: number }} options
 */
export function computeRiskDiscipline(trades, options = {}) {
  const targetRisk = options.targetRiskPercent ?? 1;
  if (!trades || trades.length === 0) return { score: 50, message: 'No trade data yet. Risk discipline will update as you log trades.' };
  let penalty = 0;
  let total = trades.length;
  const oversize = trades.filter((t) => t.riskPercent > (targetRisk * 1.5)).length;
  const noSl = trades.filter((t) => !t.stopLoss || t.stopLoss === 0).length;
  const noRisk = trades.filter((t) => !t.riskAmount || t.riskAmount <= 0).length;
  penalty += oversize * 8;
  penalty += noSl * 15;
  penalty += noRisk * 20;
  const score = Math.max(0, 100 - penalty);
  const messages = [];
  if (oversize > 0) messages.push(`${oversize} trade(s) exceeded ideal risk sizing`);
  if (noSl > 0) messages.push(`${noSl} trade(s) without stop loss`);
  if (noRisk > 0) messages.push(`${noRisk} trade(s) without defined risk`);
  return {
    score: Math.round(score),
    message: messages.length ? messages.join('. ') : 'Risk sizing and stop loss usage are consistent.',
  };
}

/**
 * Rule Adherence (0–100). From checklist completion per trade.
 * @param {Array<{ checklistPercent?: number, checklistScore?: number, checklistTotal?: number }>} trades
 */
export function computeRuleAdherence(trades) {
  if (!trades || trades.length === 0) return { score: 50, message: 'Complete checklists when submitting trades to see rule adherence.' };
  const withScore = trades.filter((t) => t.checklistPercent != null || (t.checklistScore != null && t.checklistTotal != null));
  if (withScore.length === 0) return { score: 50, message: 'Checklist data not yet linked to trades.' };
  const pcts = withScore.map((t) => t.checklistPercent ?? (t.checklistTotal > 0 ? (t.checklistScore / t.checklistTotal) * 100 : 0));
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const compliant = withScore.filter((t) => (t.checklistPercent ?? 0) >= 70).length;
  const message = compliant < withScore.length
    ? `${withScore.length - compliant} trade(s) were taken without full checklist compliance`
    : 'Trades submitted with full checklist compliance';
  return { score: Math.round(Math.max(0, Math.min(100, avg))), message };
}

/**
 * Consistency (0–100). Routine, trade frequency stability, journal streaks (from options if provided).
 * @param {Array<{ createdAt: string }>} trades
 * @param {{ journalStreak?: number, routineCompletionRate?: number }} options
 */
export function computeConsistency(trades, options = {}) {
  const streak = options.journalStreak ?? 0;
  const routineRate = options.routineCompletionRate ?? 0;
  if (!trades || trades.length === 0) {
    const fromRoutine = routineRate > 0 ? Math.round(routineRate * 100) : 50;
    return { score: fromRoutine, message: 'Routine and journal streaks improve consistency score.' };
  }
  const days = new Set(trades.map((t) => (t.createdAt || '').slice(0, 10))).size;
  const tradeDaysScore = Math.min(100, days * 4);
  const streakScore = Math.min(100, streak * 3);
  const routineScore = Math.round((routineRate || 0) * 100);
  const score = Math.round((tradeDaysScore * 0.4 + streakScore * 0.35 + routineScore * 0.25));
  const message = days < 5 ? 'Session discipline and more active trading days will improve consistency.' : 'Routine stable.';
  return { score: Math.max(0, Math.min(100, score)), message };
}

/**
 * Emotional Control (0–100). From journal/reflection fields if available; else fallback.
 * @param {Array<Object>} trades - optional emotional fields per trade if added later
 * @param {{ moodBefore?: string[], moodAfter?: string[], reflectionNotes?: string[] }} options - from journal/daily
 */
export function computeEmotionalControl(trades, options = {}) {
  const moodAfter = options.moodAfter || [];
  const notes = options.reflectionNotes || [];
  if (moodAfter.length === 0 && notes.length === 0 && (!trades || trades.length === 0)) {
    return { score: 50, message: 'More journal reflections will help assess emotional control.', confidence: 'low' };
  }
  let score = 70;
  const negative = /(revenge|frustrat|fear|panic|rush|impuls|anger|overconfident)/i;
  for (const n of notes) {
    if (negative.test(String(n))) score -= 5;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    message: score < 60 ? 'Revenge or emotional patterns detected after some sessions.' : 'Emotional state appears controlled.',
    confidence: notes.length >= 3 ? 'medium' : 'low',
  };
}

/**
 * Full behaviour breakdown for Trader CV. Pass trades + optional journal/streak data.
 */
export function computeBehaviourBreakdown(trades, options = {}) {
  const risk = computeRiskDiscipline(trades, { targetRiskPercent: options.targetRiskPercent });
  const rule = computeRuleAdherence(trades);
  const consistency = computeConsistency(trades, {
    journalStreak: options.journalStreak,
    routineCompletionRate: options.routineCompletionRate,
  });
  const emotional = computeEmotionalControl(trades, {
    moodAfter: options.moodAfter,
    reflectionNotes: options.reflectionNotes,
  });
  return {
    riskDiscipline: risk.score,
    ruleAdherence: rule.score,
    consistency: consistency.score,
    emotionalControl: emotional.score,
    messages: {
      riskDiscipline: risk.message,
      ruleAdherence: rule.message,
      consistency: consistency.message,
      emotionalControl: emotional.message,
    },
    emotionalConfidence: emotional.confidence,
  };
}
