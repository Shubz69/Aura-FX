/**
 * Strongest Markets Engine – ranks markets by structure and cleanest opportunities.
 * Reuses: confluence, setup-ranking, pair-ranking factors. No duplicate scoring logic.
 */

const confluenceEngine = require('./confluence-engine');
const setupRankingEngine = require('./setup-ranking-engine');

function trendClarityLabel(marketStructure) {
  const t = (marketStructure?.trendDirection || '').toLowerCase();
  const mom = (marketStructure?.momentum || '').toLowerCase();
  if ((t === 'bullish' || t === 'bearish') && mom === 'strengthening') return 'Clear directional structure';
  if (t === 'bullish' || t === 'bearish') return 'Clear trend';
  return 'Unclear';
}

function volatilityQualityLabel(volatility) {
  const exp = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (exp === 'expanding') return 'High volatility quality';
  if (exp === 'stable') return 'Stable volatility';
  if (exp === 'compressing') return 'Compression (breakout potential)';
  return 'Moderate';
}

/**
 * Rank analyses (each { symbol, ...runAllResult }) and return strongest with labels.
 */
function rank(analyses = []) {
  const ranked = setupRankingEngine.rank(analyses);
  const top = (ranked.topSetups || ranked.rankings || []).slice(0, 10);

  const withLabels = top.map((r, i) => {
    const a = analyses.find(x => x.symbol === r.symbol);
    const trendLabel = a ? trendClarityLabel(a.marketStructure) : '';
    const volLabel = a ? volatilityQualityLabel(a.volatility) : '';
    const setupType = r.setupType || r.detectedSetup || '';
    const parts = [trendLabel, volLabel, setupType].filter(Boolean);
    return {
      rank: i + 1,
      symbol: r.symbol,
      confluenceScore: r.confluenceScore,
      reason: parts.join(', ') || 'Strong conditions'
    };
  });

  const summary = withLabels.length
    ? "Strongest Markets Right Now:\n" + withLabels.map(s => `${s.rank}. ${s.symbol}\n${s.reason}`).join('\n\n')
    : 'No market data to rank.';

  return {
    rankings: withLabels,
    summary
  };
}

module.exports = { rank, trendClarityLabel, volatilityQualityLabel };
