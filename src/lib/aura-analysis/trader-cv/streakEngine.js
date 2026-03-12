/**
 * Streaks and gamification: journal streak, routine, rule adherence, etc.
 * Uses user.login_streak and trade/journal data. Platform Discipline kept separate.
 */

/**
 * @param {{ login_streak?: number }} user
 * @param {Array<{ createdAt: string, checklistPercent?: number }>} trades
 * @returns {{ journalStreak: number, ruleAdherenceStreak: number, disciplinedDaysStreak: number }}
 */
export function computeStreaks(user, trades) {
  const journalStreak = Math.max(0, Number(user?.login_streak) ?? 0);
  if (!trades || trades.length === 0) {
    return { journalStreak, ruleAdherenceStreak: 0, disciplinedDaysStreak: 0 };
  }
  const sorted = [...trades].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  let ruleAdherenceStreak = 0;
  for (const t of sorted) {
    const pct = t.checklistPercent ?? 0;
    if (pct >= 70) ruleAdherenceStreak++;
    else break;
  }
  const dates = new Set(trades.map((t) => (t.createdAt || '').slice(0, 10)));
  const sortedDates = [...dates].sort().reverse();
  let disciplinedDaysStreak = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < sortedDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const d = expected.toISOString().slice(0, 10);
    if (sortedDates.includes(d)) disciplinedDaysStreak++;
    else break;
  }
  return { journalStreak, ruleAdherenceStreak, disciplinedDaysStreak };
}

export const RANK_TITLES = [
  { min: 0, label: 'Rookie' },
  { min: 45, label: 'Structured Trader' },
  { min: 60, label: 'Disciplined Trader' },
  { min: 75, label: 'Elite Operator' },
  { min: 90, label: 'Precision Trader' },
];

export function getRankTitle(auraxScore) {
  let title = RANK_TITLES[0].label;
  for (const r of RANK_TITLES) {
    if (auraxScore >= r.min) title = r.label;
  }
  return title;
}
