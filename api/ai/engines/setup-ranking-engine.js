/**
 * Setup Ranking Engine – ranks detected setups by confluence, volatility, structure, liquidity, macro.
 * Uses confluence-engine and existing analysis fields. No duplicate logic.
 */

const confluenceEngine = require('./confluence-engine');

function structureClarityScore(marketStructure) {
  const t = (marketStructure?.trendDirection || '').toLowerCase();
  const mom = (marketStructure?.momentum || '').toLowerCase();
  if ((t === 'bullish' || t === 'bearish') && mom === 'strengthening') return 25;
  if (t === 'bullish' || t === 'bearish') return 18;
  return 8;
}

function liquidityAlignmentScore(liquidity) {
  const above = liquidity?.liquidityAbove?.length || 0;
  const below = liquidity?.liquidityBelow?.length || 0;
  const sweep = !!liquidity?.recentSweep;
  if (above + below >= 2 && sweep) return 20;
  if (above + below >= 1) return 12;
  return 5;
}

function volatilityScore(volatility) {
  const exp = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  if (exp === 'expanding') return 18;
  if (exp === 'stable') return 15;
  if (exp === 'compressing') return 12;
  return 8;
}

function macroContextScore(calendarEvents, eventRisk) {
  if (eventRisk?.warning) return 8; // relevant but risky
  if (Array.isArray(calendarEvents) && calendarEvents.length > 0) return 12;
  return 5;
}

/**
 * Rank setups. Each item: { symbol, marketStructure, priceClusters, liquidity, volatility, session, calendarEvents, eventRisk, detectedSetup?, currentPrice? }.
 */
function rank(setupsOrAnalyses = []) {
  const scored = setupsOrAnalyses.map(a => {
    const confluence = confluenceEngine.score({
      marketStructure: a.marketStructure,
      priceClusters: a.priceClusters,
      liquidity: a.liquidity,
      volatility: a.volatility,
      session: a.session,
      calendarEvents: a.calendarEvents || [],
      eventRisk: a.eventRisk || {}
    }, a.currentPrice ?? null);
    const conf = confluence.confluenceScore ?? 0;
    const structure = structureClarityScore(a.marketStructure);
    const liquidity = liquidityAlignmentScore(a.liquidity);
    const vol = volatilityScore(a.volatility);
    const macro = macroContextScore(a.calendarEvents || [], a.eventRisk || {});
    const total = conf * 0.4 + structure * 0.2 + liquidity * 0.15 + vol * 0.15 + macro * 0.1;
    return {
      symbol: a.symbol,
      confluenceScore: Math.round(conf),
      totalScore: Math.round(total),
      setupType: a.detectedSetup ?? a.setupType ?? null,
      trendAlignment: a.marketStructure?.trendDirection ?? null,
      breakdown: { structure, liquidity, volatility: vol, macro }
    };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  const top = scored.slice(0, 10);

  const summary = top.length
    ? 'Top Trade Setups:\n' + top.map((s, i) => `${i + 1} ${s.symbol}\nConfluence Score: ${s.confluenceScore}\n${s.setupType || 'Setup'}${s.trendAlignment ? '\n' + s.trendAlignment : ''}`).join('\n\n')
    : 'No setups to rank.';

  return {
    rankings: scored,
    topSetups: top,
    summary
  };
}

module.exports = { rank, structureClarityScore, liquidityAlignmentScore, volatilityScore, macroContextScore };
