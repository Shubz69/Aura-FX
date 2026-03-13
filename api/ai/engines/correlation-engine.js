/**
 * Correlation Engine – narrative correlation insights from multi-asset sentiment/direction.
 * Without historical return series we use: instrument sentiment, trend direction, known pairs.
 * Output: e.g. "Gold rising while USD weakening. Correlation suggests continued upward pressure."
 */

const KNOWN_PAIRS = [
  { assets: ['XAUUSD', 'USD'], inverse: true, label: 'Gold vs USD' },
  { assets: ['XAUUSD', 'DXY'], inverse: true, label: 'Gold vs Dollar Index' },
  { assets: ['USOIL', 'USDCAD'], inverse: false, label: 'Oil vs CAD' },
  { assets: ['SPY', 'NASDAQ'], inverse: false, label: 'Indices' },
  { assets: ['EURUSD', 'USD'], inverse: true, label: 'EURUSD vs USD' },
  { assets: ['GBPUSD', 'USD'], inverse: true, label: 'GBPUSD vs USD' }
];

function normalizeSymbol(s) {
  if (!s) return '';
  const u = (s + '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u === 'GOLD' || u === 'XAU') return 'XAUUSD';
  if (u === 'USD' || u === 'DXY') return 'USD';
  return u;
}

/**
 * Build correlation insight from per-asset analysis.
 * @param {Array<{ symbol, sentiment?, marketStructure? }>} assetAnalyses - One per asset
 */
function insight(assetAnalyses = []) {
  const bySymbol = {};
  for (const a of assetAnalyses) {
    const sym = normalizeSymbol(a.symbol);
    if (!sym) continue;
    bySymbol[sym] = {
      sentiment: (a.instrumentSentiment ?? a.sentiment?.instrumentSentiment ?? a.marketStructure?.trendDirection ?? '').toString().toLowerCase(),
      trend: (a.marketStructure?.trendDirection ?? a.bias?.shortTermBias ?? '').toString().toLowerCase()
    };
  }

  const insights = [];
  for (const pair of KNOWN_PAIRS) {
    const a1 = pair.assets[0];
    const a2 = pair.assets[1];
    const d1 = bySymbol[normalizeSymbol(a1)] ?? bySymbol[a1];
    const d2 = bySymbol[normalizeSymbol(a2)] ?? bySymbol[a2];
    if (!d1 || !d2) continue;
    const dir1 = d1.trend || d1.sentiment;
    const dir2 = d2.trend || d2.sentiment;
    const bull1 = /bull|rise|strong|up/.test(dir1);
    const bear1 = /bear|fall|weak|down/.test(dir1);
    const bull2 = /bull|rise|strong|up/.test(dir2);
    const bear2 = /bear|fall|weak|down/.test(dir2);
    if (pair.inverse && bull1 && bear2) insights.push(`${pair.label}: ${a1} rising while ${a2} weakening. Correlation suggests continued upward pressure on ${a1}.`);
    else if (pair.inverse && bear1 && bull2) insights.push(`${pair.label}: ${a1} falling while ${a2} strengthening. Correlation suggests continued downward pressure on ${a1}.`);
    else if (!pair.inverse && bull1 && bull2) insights.push(`${pair.label}: Both assets bullish. Positive correlation alignment.`);
  }

  return {
    insights,
    summary: insights.length ? 'Correlation Insight:\n' + insights.join('\n') : 'Insufficient multi-asset data for correlation insight.'
  };
}

module.exports = { insight, KNOWN_PAIRS };
