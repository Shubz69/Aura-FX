/**
 * Build candle intelligence copy from a clicked bar (mock / deterministic).
 * @param {{ time: number, open: number, high: number, low: number, close: number, volume?: number }} bar
 * @param {{ symbol: string }} ctx
 */
export function buildCandleIntelligenceMock(bar, ctx = {}) {
  const sym = String(ctx.symbol || 'EURUSD').replace(/^OANDA:/i, '');
  const isUp = bar.close >= bar.open;
  const body = Math.abs(bar.close - bar.open);
  const range = bar.high - bar.low || 1e-8;
  const bodyPct = Math.round((body / range) * 100);
  const d = new Date(bar.time * 1000);
  const timeLabel = d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const volRead =
    bar.volume > 14000
      ? 'Above-average participation for this session window.'
      : 'Volume in-line with recent microstructure — no obvious climax bar.';

  const dxyRead = isUp
    ? 'DXY and yields softened slightly into the candle window, helping EUR find a bid.'
    : 'DXY and yields rose during the same window, pressuring EURUSD.';

  const driver =
    bodyPct > 55
      ? 'Likely driven by USD flow after a data surprise or fix-related liquidity.'
      : 'Likely a positioning / mean-reversion move within established range structure.';

  const narrative = `${driver} ${dxyRead} Candle ${isUp ? 'bullish' : 'bearish'} with ~${bodyPct}% body-to-range. ${volRead} Price remains context-sensitive vs prior value area — avoid binary breakout bets without confirmation.`;

  const guidance =
    bodyPct > 60 && bar.volume > 16000
      ? 'Action: treat as potential exhaustion if into range extreme; scale in only after rejection wick or failed breakout.'
      : 'Action: avoid breakout chase; wait for confirmation or fade extremes with reduced size.';

  return {
    candleTime: timeLabel,
    direction: isUp ? 'Bullish' : 'Bearish',
    bodyRangePct: bodyPct,
    sizeLabel: body > range * 0.55 ? 'Large' : body > range * 0.35 ? 'Medium' : 'Small',
    likelyDriver: driver,
    relatedEvents: [
      'NY cash equity open window',
      'Fixing / roll liquidity common in this 15m slot',
    ],
    volumeVolatilityRead: volRead,
    correlationRead: `${dxyRead} Gold drifted opposite risk tone; US indices flat-to-soft — cross-asset impulse moderate.`,
    whatItMeans:
      'The bar fits a two-way tape: USD leadership without a clean risk-off signature. Expect mean reversion unless yields accelerate.',
    practicalGuidance: narrative + ' ' + guidance,
    exampleBlurb:
      'Likely driven by USD strength after better-than-expected US jobless claims. DXY and yields rose during the same window, pressuring EURUSD. Candle expanded on above-average volume, but price remains inside range structure. Action: avoid breakout chase; wait for confirmation or fade extremes.',
  };
}
