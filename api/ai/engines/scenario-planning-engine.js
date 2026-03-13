/**
 * Scenario Planning Engine – clear what-if paths (bullish case, bearish case).
 * Reuses: priceClusters, marketStructure, volatility.
 */

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Generate scenario planning text from levels and structure.
 */
function plan(params = {}) {
  const { symbol, priceClusters, marketStructure, volatility, currentPrice } = params;
  const price = currentPrice ?? null;
  const res = levelVal(priceClusters?.strongestResistance);
  const sup = levelVal(priceClusters?.strongestSupport);
  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  const vol = (volatility?.expansionState || volatility?.regime || '').toString().toLowerCase();

  let bullishCase = '';
  let bearishCase = '';

  if (res != null && sup != null) {
    bullishCase = `If price holds above ${sup.toFixed(4)} and volatility expands, continuation toward ${res.toFixed(4)} and beyond is possible.`;
    bearishCase = `If ${sup.toFixed(4)} fails and price drops below it with momentum, deeper pullback becomes more likely.`;
  } else if (res != null) {
    bullishCase = `If price holds current structure and breaks above ${res.toFixed(4)}, bullish continuation is likely.`;
    bearishCase = `If price fails to hold and breaks below key support with momentum, bearish scenario gains probability.`;
  } else if (sup != null) {
    bullishCase = `If price holds above ${sup.toFixed(4)} and builds momentum, bullish scenario remains valid.`;
    bearishCase = `If ${sup.toFixed(4)} fails with strong momentum, deeper decline is possible.`;
  } else {
    bullishCase = 'Define key levels for bullish invalidation and targets.';
    bearishCase = 'Define key levels for bearish invalidation and targets.';
  }

  const summary = [
    'Scenario Planning',
    `Bullish Case: ${bullishCase}`,
    `Bearish Case: ${bearishCase}`
  ].join('\n');

  return {
    instrument: symbol,
    bullishCase,
    bearishCase,
    summary
  };
}

module.exports = { plan };
