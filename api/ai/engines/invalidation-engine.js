/**
 * Invalidation Engine – explains what invalidates a bullish or bearish idea.
 * Reuses: priceClusters (support/resistance), marketStructure (trend).
 */

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Generate invalidation logic for current bias/levels.
 */
function explain(params = {}) {
  const { symbol, marketStructure, priceClusters, bias, currentPrice } = params;
  const trend = (marketStructure?.trendDirection || bias?.shortTermBias || '').toString().toLowerCase();
  const sup = levelVal(priceClusters?.strongestSupport);
  const res = levelVal(priceClusters?.strongestResistance);
  const price = currentPrice ?? null;

  let bullishInvalidation = null;
  let bearishInvalidation = null;

  if (sup != null) {
    bullishInvalidation = `Bullish idea invalidates if price closes below ${sup.toFixed(4)} support with strong momentum.`;
  }
  if (res != null) {
    bearishInvalidation = `Bearish idea invalidates if price reclaims ${res.toFixed(4)} resistance and holds above it.`;
  }

  if (!bullishInvalidation && trend.includes('bull')) {
    bullishInvalidation = 'Bullish idea invalidates on break of structure (e.g. lower low with momentum).';
  }
  if (!bearishInvalidation && trend.includes('bear')) {
    bearishInvalidation = 'Bearish idea invalidates on break of structure (e.g. higher high with momentum).';
  }

  const lines = ['Invalidation Logic'];
  if (bullishInvalidation) lines.push(bullishInvalidation);
  if (bearishInvalidation) lines.push(bearishInvalidation);
  if (!bullishInvalidation && !bearishInvalidation) lines.push('Define key support/resistance to set invalidation levels.');

  return {
    instrument: symbol,
    bullishInvalidation: bullishInvalidation || undefined,
    bearishInvalidation: bearishInvalidation || undefined,
    summary: lines.join('\n')
  };
}

module.exports = { explain };
