/**
 * Trade Quality Score (0–100) per trade: process quality, not PnL.
 * Excellent 85–100, Good 70–84, Needs Work 50–69, Poor <50.
 */

/**
 * @param {Object} trade - checklistPercent, riskPercent, session, etc.
 * @returns {{ score: number, label: string }}
 */
export function getTradeQualityScore(trade) {
  let score = 50;
  const pct = trade.checklistPercent ?? (trade.checklistTotal > 0 ? (trade.checklistScore / trade.checklistTotal) * 100 : 0);
  if (pct >= 70) score += 25;
  else if (pct >= 50) score += 10;
  if (trade.riskPercent != null && trade.riskPercent > 0 && trade.stopLoss != null) score += 15;
  if (trade.session) score += 5;
  if (trade.rr != null && trade.rr >= 1) score += 5;
  const final = Math.max(0, Math.min(100, Math.round(score)));
  let label = 'Poor';
  if (final >= 85) label = 'Excellent';
  else if (final >= 70) label = 'Good';
  else if (final >= 50) label = 'Needs Work';
  return { score: final, label };
}

/**
 * @param {Array<Object>} trades
 * @returns {{ averageQuality: number, trend: 'up'|'down'|'stable', recent: Array<{ score: number, label: string }> }}
 */
export function getAverageTradeQuality(trades) {
  if (!trades || trades.length === 0) {
    return { averageQuality: 0, trend: 'stable', recent: [] };
  }
  const withScores = trades.slice(0, 30).map((t) => getTradeQualityScore(t));
  const sum = withScores.reduce((a, x) => a + x.score, 0);
  const averageQuality = withScores.length ? Math.round(sum / withScores.length) : 0;
  const recent = withScores.slice(0, 10);
  const firstHalf = withScores.slice(0, Math.floor(withScores.length / 2)).reduce((a, x) => a + x.score, 0) / (Math.floor(withScores.length / 2) || 1);
  const secondHalf = withScores.slice(Math.floor(withScores.length / 2)).reduce((a, x) => a + x.score, 0) / (withScores.length - Math.floor(withScores.length / 2) || 1);
  let trend = 'stable';
  if (secondHalf > firstHalf + 5) trend = 'up';
  else if (secondHalf < firstHalf - 5) trend = 'down';
  return { averageQuality, trend, recent };
}
