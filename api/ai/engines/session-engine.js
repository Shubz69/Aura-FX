/**
 * Session Intelligence – Asia, London, New York.
 * Tracks volatility changes, liquidity spikes, session reversals.
 */

const SESSION_UTC = {
  Asia: { start: 0, end: 8 },
  London: { start: 8, end: 16 },
  NewYork: { start: 13, end: 21 },
  Overlap: { start: 13, end: 16 }
};

function getCurrentSession() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 8) return 'Asia';
  if (h >= 8 && h < 13) return 'London';
  if (h >= 13 && h < 16) return 'London-New York Overlap';
  if (h >= 16 && h < 21) return 'New York';
  return 'After Hours';
}

/**
 * Expected volatility by session (heuristic).
 */
function sessionVolatilityExpectation(session) {
  const s = (session || getCurrentSession()).toLowerCase();
  if (s.includes('overlap')) return { level: 'High', note: 'London-NY overlap typically increases volatility and volume.' };
  if (s === 'london') return { level: 'High', note: 'London session typically increases volatility.' };
  if (s === 'new york') return { level: 'High', note: 'US session drives major moves and news.' };
  if (s === 'asia') return { level: 'Low to Medium', note: 'Asia session often range-bound; breakout potential into London.' };
  return { level: 'Low', note: 'After hours; reduced liquidity.' };
}

/**
 * Session reversal: common around London open (first 1–2h). Requires OHLC to detect open vs pre-open range.
 */
function detectSessionReversal(ohlcv, sessionLabel) {
  if (!ohlcv || ohlcv.length < 20) return null;
  const c = ohlcv.map(x => ({ open: x.open ?? x.o, high: x.high ?? x.h, low: x.low ?? x.l, close: x.close ?? x.c }));
  const last = c[c.length - 1];
  const prev = c[c.length - 2];
  const range = last.high - last.low || 0.0001;
  const body = Math.abs(last.close - last.open);
  const isReversalCandle = body / range > 0.5 && ((last.close < last.open && prev.close > prev.open) || (last.close > last.open && prev.close < prev.open));
  if (!isReversalCandle) return null;
  return {
    detected: true,
    session: sessionLabel || getCurrentSession(),
    type: last.close > last.open ? 'Bullish reversal candle' : 'Bearish reversal candle'
  };
}

/**
 * Session bias for continuation: overlap and London often favour trend continuation; Asia often range.
 */
function sessionBias(session) {
  const s = (session || getCurrentSession()).toLowerCase();
  if (s.includes('overlap') || s === 'london') return 'Bullish continuation more likely in uptrends; bearish in downtrends.';
  if (s === 'new york') return 'Trend continuation or breakout; watch US data releases.';
  if (s === 'asia') return 'Range-bound bias; reversals possible into London open.';
  return 'Reduced conviction; wait for next session.';
}

/**
 * Full session analysis.
 */
function analyze(ohlcv = null) {
  const current = getCurrentSession();
  const vol = sessionVolatilityExpectation(current);
  const reversal = ohlcv ? detectSessionReversal(ohlcv, current) : null;
  const bias = sessionBias(current);

  const lines = [
    `Current session: ${current}.`,
    `${vol.note} Volatility expectation: ${vol.level}.`,
    `Session bias: ${bias}`,
    reversal ? `Recent: ${reversal.type} (${reversal.session}).` : null
  ].filter(Boolean);

  return {
    currentSession: current,
    volatilityExpectation: vol.level,
    volatilityNote: vol.note,
    sessionBias: bias,
    sessionReversal: reversal,
    summary: lines.join('\n')
  };
}

module.exports = {
  analyze,
  getCurrentSession,
  sessionVolatilityExpectation,
  detectSessionReversal,
  sessionBias,
  SESSION_UTC
};
