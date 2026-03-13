/**
 * Price Cluster Engine – multiple touches, consolidation zones, strongest S/R levels.
 */

const { identifySupportResistance } = require('../price-action');

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({
    open: c.open ?? c.o,
    high: c.high ?? c.h,
    low: c.low ?? c.l,
    close: c.close ?? c.c
  }));
}

/**
 * Cluster nearby levels into zones (tolerance by price scale).
 */
function clusterLevels(levelsWithStrength, tolerancePct = 0.002) {
  if (!levelsWithStrength.length) return [];
  const sorted = [...levelsWithStrength].sort((a, b) => (a.level ?? a.price) - (b.level ?? b.price));
  const zones = [];
  for (const l of sorted) {
    const price = l.level ?? l.price;
    const strength = l.strength ?? l.touches ?? l.count ?? 1;
    const existing = zones.find(z => Math.abs(z.mid - price) / (z.mid || 1) <= tolerancePct);
    if (existing) {
      existing.touches += strength;
      existing.mid = (existing.mid * (existing.touches - strength) + price * strength) / existing.touches;
    } else {
      zones.push({ mid: price, touches: strength, high: price, low: price });
    }
  }
  return zones.sort((a, b) => b.touches - a.touches);
}

/**
 * Consolidation zone: price spent significant time in a narrow range.
 */
function findConsolidationZones(ohlcv, lookback = 50, minCandlesInRange = 5) {
  const c = normalizeCandles(ohlcv).slice(-lookback);
  if (c.length < minCandlesInRange) return [];
  const highs = c.map(x => x.high);
  const lows = c.map(x => x.low);
  const rangePct = (Math.max(...highs) - Math.min(...lows)) / (Math.min(...lows) || 0.0001);
  if (rangePct < 0.01) {
    return [{ top: Math.max(...highs), bottom: Math.min(...lows), strength: c.length, type: 'consolidation' }];
  }
  return [];
}

/**
 * Full analysis: strongest support and resistance from clusters + consolidation.
 */
function analyze(ohlcv, lookback = 50, currentPrice = null) {
  const c = normalizeCandles(ohlcv);
  if (c.length < 10) {
    return { support: [], resistance: [], consolidationZones: [], strongestSupport: null, strongestResistance: null, summary: 'Insufficient data.' };
  }

  const sr = identifySupportResistance(c, lookback);
  if (sr.error) return { support: [], resistance: [], consolidationZones: [], strongestSupport: null, strongestResistance: null, summary: sr.error };

  const price = currentPrice ?? c[c.length - 1].close;
  const supportLevels = (sr.support || []).map(s => ({ level: s.level, strength: s.strength }));
  const resistanceLevels = (sr.resistance || []).map(r => ({ level: r.level, strength: r.strength }));

  const supportZones = clusterLevels(supportLevels);
  const resistanceZones = clusterLevels(resistanceLevels);
  const consolidationZones = findConsolidationZones(c, lookback);

  const strongestSupport = supportZones.filter(z => z.mid < price)[0] ?? null;
  const strongestResistance = resistanceZones.filter(z => z.mid > price)[0] ?? null;

  const lines = [];
  if (strongestSupport) lines.push(`Key support cluster: ${strongestSupport.mid.toFixed(4)} (${strongestSupport.touches} touches)`);
  if (strongestResistance) lines.push(`Key resistance cluster: ${strongestResistance.mid.toFixed(4)} (${strongestResistance.touches} touches)`);
  if (consolidationZones.length) lines.push(`Consolidation zone: ${consolidationZones[0].bottom.toFixed(4)} - ${consolidationZones[0].top.toFixed(4)}`);

  return {
    support: supportZones.filter(z => z.mid < price),
    resistance: resistanceZones.filter(z => z.mid > price),
    consolidationZones,
    strongestSupport: strongestSupport ? { level: strongestSupport.mid, touches: strongestSupport.touches } : null,
    strongestResistance: strongestResistance ? { level: strongestResistance.mid, touches: strongestResistance.touches } : null,
    rawSupport: sr.support,
    rawResistance: sr.resistance,
    summary: lines.length ? lines.join('\n') : 'No strong clusters identified.'
  };
}

module.exports = { analyze, clusterLevels, findConsolidationZones };
