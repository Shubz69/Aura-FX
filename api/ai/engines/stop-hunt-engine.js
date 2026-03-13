/**
 * Stop Hunt / Trap Detection Engine – detects liquidity sweeps and trader traps.
 * Reuses: liquidity.recentSweep (sweep then reversal). Adds trap classification.
 */

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Detect liquidity sweep and trap type from analysis.
 */
function detect(params = {}) {
  const { symbol, liquidity, session, marketStructure, currentPrice } = params;
  const sweep = liquidity?.recentSweep;
  const detections = [];
  let trapType = null;

  if (sweep) {
    const isSellSide = sweep.type === 'bullish_sweep';
    const zone = sweep.level;
    const dir = isSellSide ? 'Sell-side' : 'Buy-side';
    detections.push({
      type: 'liquidity_sweep',
      side: isSellSide ? 'sell' : 'buy',
      zone: zone != null ? (isSellSide ? `Below ${zone.toFixed(4)}` : `Above ${zone.toFixed(4)}`) : 'N/A',
      message: `Liquidity Sweep Detected. Instrument: ${symbol || 'N/A'}. Type: ${dir} liquidity sweep. Zone: ${zone != null ? zone.toFixed(4) : 'N/A'}. Rapid ${isSellSide ? 'bearish' : 'bullish'} recovery suggests stop hunt.`
    });
    trapType = isSellSide ? 'Reversal trap (sweep above then drop)' : 'Reversal trap (sweep below then rally)';
  }

  const sessionName = (session?.currentSession || '').toLowerCase();
  if (sessionName.includes('after hours') || sessionName === 'asia') {
    detections.push({ type: 'late_session', message: 'Late or low-liquidity session; chase setups carry higher trap risk.' });
    if (!trapType) trapType = 'Late-session chase setup';
  }

  const mom = (marketStructure?.momentum || '').toLowerCase();
  if (sweep && (mom === 'weakening' || mom === 'neutral')) {
    detections.push({ type: 'weak_follow_through', message: 'Weak follow-through after move; possible breakout trap.' });
    if (!trapType) trapType = 'Breakout trap';
  }

  const summary = detections.length
    ? detections.map(d => d.message || d.type).join('\n')
    : 'No stop hunt or trap signals detected.';

  return {
    liquiditySweep: sweep ? { type: sweep.type, level: sweep.level } : null,
    trapType,
    detections,
    summary
  };
}

module.exports = { detect };
