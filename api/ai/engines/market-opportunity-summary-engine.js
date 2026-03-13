/**
 * Market Opportunity Summary – "Today's Strongest Opportunities" from scanner + setup ranking.
 * Aggregates global-market-scanner and setup-ranking for prompt-friendly summary.
 */

const globalMarketScanner = require('./global-market-scanner-engine');
const setupRankingEngine = require('./setup-ranking-engine');

/**
 * Build summary from pre-computed analyses (each { symbol, ...runAllResult }).
 * @param {Array<Object>} analyses - runAll results per symbol
 * @param {Object} options - { useCache, maxItems }
 */
function summarize(analyses = [], options = {}) {
  const maxItems = options.maxItems ?? 10;
  const scanResult = globalMarketScanner.scan(analyses, { useCache: options.useCache !== false });
  const rankResult = setupRankingEngine.rank(analyses.filter(a => scanResult.results?.some(r => r.symbol === a.symbol)));

  const top = (scanResult.rankedOpportunities || []).slice(0, maxItems);
  const bySymbol = {};
  for (const r of rankResult.topSetups || []) bySymbol[r.symbol] = r;

  const lines = ["Today's Strongest Opportunities:"];
  for (const r of top) {
    const rankInfo = bySymbol[r.symbol];
    const setupType = r.setupType || rankInfo?.setupType || 'Setup';
    const reasons = r.signals?.map(s => s.label).join(', ') || 'High confluence';
    lines.push(`${r.symbol}\n${setupType}${r.trendAlignment ? ' – ' + r.trendAlignment : ''}\n${reasons}`);
  }

  const summary = lines.length > 1 ? lines.join('\n\n') : "No strong opportunities in scanned set.";

  return {
    opportunities: top,
    setupRankings: rankResult.topSetups,
    summary,
    scanResult,
    rankResult
  };
}

module.exports = { summarize };
