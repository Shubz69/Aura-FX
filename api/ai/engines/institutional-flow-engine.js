/**
 * Institutional Flow Engine – interprets large moves as potential institutional activity.
 * Uses: liquidity sweeps (grabs), large impulsive candles (body vs ATR), momentum. Reuses existing engines.
 */

const LARGE_BODY_ATR_RATIO = 0.8;

function normalizeCandles(ohlcv) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return [];
  return ohlcv.map(c => ({ open: c.open ?? c.o, high: c.high ?? c.h, low: c.low ?? c.l, close: c.close ?? c.c }));
}

function detectLargeImpulsiveCandles(ohlcv, atr) {
  const c = normalizeCandles(ohlcv);
  if (c.length < 2 || !atr || atr <= 0) return [];
  const large = [];
  for (let i = 0; i < c.length; i++) {
    const body = Math.abs(c[i].close - c[i].open);
    if (body >= atr * LARGE_BODY_ATR_RATIO) {
      large.push({
        index: i,
        bullish: c[i].close > c[i].open,
        bodySize: body,
        atrRatio: body / atr
      });
    }
  }
  return large.slice(-5);
}

/**
 * Interpret flow from analysis (liquidity, smartMoney, volatility, recent candles).
 * @param {Object} params - { liquidity, smartMoney, volatility, ohlcv?, symbol }
 */
function interpret(params = {}) {
  const { liquidity, smartMoney, volatility, ohlcv, symbol } = params;
  const atr = volatility?.atr ?? null;
  const messages = [];

  if (liquidity?.recentSweep) {
    const s = liquidity.recentSweep;
    const side = s.type === 'bullish_sweep' ? 'buy' : 'sell';
    messages.push(`Liquidity grab (${side}-side) detected. Possible institutional sweep.`);
  }

  const largeCandles = ohlcv && atr ? detectLargeImpulsiveCandles(ohlcv, atr) : [];
  if (largeCandles.length > 0) {
    const last = largeCandles[largeCandles.length - 1];
    const side = last.bullish ? 'buy' : 'sell';
    messages.push(`Large ${side}-side impulsive candle(s) detected. Possible institutional ${side === 'buy' ? 'accumulation' : 'distribution'}.`);
  }

  const obBull = (smartMoney?.orderBlocksBullish || []).length;
  const obBear = (smartMoney?.orderBlocksBearish || []).length;
  if (obBull > obBear && obBull >= 2) messages.push('Bullish order blocks present. Possible institutional demand zones.');
  if (obBear > obBull && obBear >= 2) messages.push('Bearish order blocks present. Possible institutional supply zones.');

  const summary = messages.length
    ? 'Institutional Flow: ' + messages.join(' ')
    : 'No strong institutional flow signals.';

  return {
    liquidityGrab: !!liquidity?.recentSweep,
    largeImpulsiveCandles: largeCandles.length,
    orderBlockAlignment: obBull !== obBear ? (obBull > obBear ? 'bullish' : 'bearish') : null,
    messages,
    summary
  };
}

module.exports = { interpret, detectLargeImpulsiveCandles };
