/**
 * Trade Plan Engine – generates structured trade plans from analysis (entry zone, targets, invalidation).
 * Informational guidance only; not financial advice. Uses price clusters, structure, volatility.
 */

const ATR_TARGET_MULTIPLE = 1.5;
const ATR_INVALIDATION_MULTIPLE = 1;

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Generate trade plan for a single instrument.
 * @param {Object} params - { symbol, marketStructure, priceClusters, volatility, bias?, currentPrice }
 */
function generate(params = {}) {
  const { symbol, marketStructure, priceClusters, volatility, bias, currentPrice } = params;
  const price = currentPrice ?? null;
  const trend = (marketStructure?.trendDirection || bias?.shortTermBias || 'Neutral').toString();
  const support = levelVal(priceClusters?.strongestSupport);
  const resistance = levelVal(priceClusters?.strongestResistance);
  const atr = volatility?.atr ?? (price ? price * 0.005 : null);

  const isBullish = /bullish|bull/i.test(trend);
  const isBearish = /bearish|bear/i.test(trend);

  let entryZone = null;
  let targets = [];
  let invalidation = null;

  if (price != null) {
    if (isBullish && support != null) {
      entryZone = { low: Math.min(support, price) * 0.9995, high: price * 1.001 };
      targets = resistance != null ? [resistance] : (atr ? [price + atr * ATR_TARGET_MULTIPLE] : []);
      invalidation = support != null ? support * 0.998 : (atr ? price - atr * ATR_INVALIDATION_MULTIPLE : null);
    } else if (isBearish && resistance != null) {
      entryZone = { low: price * 0.999, high: Math.max(resistance, price) * 1.0005 };
      targets = support != null ? [support] : (atr ? [price - atr * ATR_TARGET_MULTIPLE] : []);
      invalidation = resistance != null ? resistance * 1.002 : (atr ? price + atr * ATR_INVALIDATION_MULTIPLE : null);
    } else {
      if (support != null && resistance != null) {
        entryZone = { low: support, high: resistance };
        targets = [resistance, support];
        invalidation = null;
      }
    }
  }

  const volEnv = (volatility?.regime || volatility?.expansionState || 'Unknown').toString();
  const riskEnv = /expand/i.test(volEnv) ? 'Elevated volatility' : /stable|compress/i.test(volEnv) ? 'Moderate volatility' : 'Moderate volatility';

  const lines = [
    'Trade Plan (informational guidance only – not financial advice)',
    `Instrument: ${symbol || 'N/A'}`,
    `Bias: ${trend}`,
    entryZone ? `Entry Zone: ${entryZone.low?.toFixed(4)} - ${entryZone.high?.toFixed(4)}` : 'Entry Zone: Not defined',
    targets.length ? `Targets: ${targets.map(t => t?.toFixed(4)).join(', ')}` : 'Targets: Not defined',
    invalidation != null ? `Invalidation: ${invalidation.toFixed(4)}` : 'Invalidation: Not defined',
    `Risk Environment: ${riskEnv}`
  ];

  return {
    instrument: symbol,
    bias: trend,
    entryZone,
    targets,
    invalidation,
    riskEnvironment: riskEnv,
    summary: lines.join('\n')
  };
}

module.exports = { generate };
