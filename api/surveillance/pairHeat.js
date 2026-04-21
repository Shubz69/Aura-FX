/**
 * Aggregates FX / XAU directional bias from the current surveillance tape.
 * Editorial model — not a price forecast. Recomputes on every feed/bootstrap from live events.
 */

const { scoreMarkets } = require('./marketImpact');

/** Pairs shown in masthead (liquid majors + gold + key EM). */
const PAIR_SYMBOLS = new Set([
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'NZDUSD',
  'USDCAD',
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'USDMXN',
  'USDZAR',
  'USDBRL',
  'USDINR',
  'USDKRW',
  'USDCNH',
  'USDTRY',
  'XAUUSD',
]);

/**
 * Map (symbol, direction, risk_bias) → implied pair move: +1 up, −1 down, 0 unclear.
 * USD-quote majors: USD strength pushes price down.
 * USD-base: USD strength pushes price up.
 */
function directionDelta(symbol, direction, riskBias) {
  const d = String(direction || 'neutral').toLowerCase();
  const rb = String(riskBias || 'neutral').toLowerCase();

  const usdQuote = /^(EUR|GBP|AUD|NZD)USD$/.test(symbol);
  const usdBase = /^USD(JPY|CHF|CAD|MXN|ZAR|BRL|INR|KRW|CNH|TRY)$/.test(symbol);
  const xau = symbol === 'XAUUSD';
  const eurgbp = symbol === 'EURGBP';
  const eurjpy = symbol === 'EURJPY';
  const gbpjpy = symbol === 'GBPJPY';

  let x = 0;
  if (d === 'usd_bull') {
    if (usdQuote) x -= 1;
    else if (usdBase) x += 1;
    else if (xau) x -= 0.55;
    else if (eurgbp || eurjpy || gbpjpy) x -= 0.15;
  } else if (d === 'usd_bear' || d === 'bearish') {
    if (usdQuote) x += 1;
    else if (usdBase) x -= 1;
    else if (xau) x += 0.75;
    else if (eurgbp || eurjpy || gbpjpy) x += 0.12;
  } else if (d === 'bullish') {
    if (usdBase) x += 0.45;
    if (usdQuote) x += 0.25;
    if (xau) x += 0.35;
  } else if (d === 'bearish_risk') {
    if (usdQuote) x -= 0.45;
    if (usdBase) x += 0.35;
    if (xau) x += 0.85;
    if (symbol === 'USDJPY') x -= 0.75;
    if (symbol === 'USDCHF') x -= 0.55;
    if (symbol === 'AUDUSD' || symbol === 'NZDUSD') x -= 0.5;
    if (symbol === 'USDCAD') x += 0.25;
    if (eurgbp) x += 0.08;
    if (eurjpy || gbpjpy) x -= 0.35;
  } else if (d === 'bullish_risk') {
    if (usdQuote) x += 0.35;
    if (usdBase) x += 0.25;
    if (symbol === 'AUDUSD' || symbol === 'NZDUSD') x += 0.45;
    if (xau) x -= 0.25;
    if (symbol === 'USDJPY') x += 0.4;
    if (eurjpy || gbpjpy) x += 0.35;
  }

  if (d === 'neutral' || x === 0) {
    if (rb === 'risk_off') {
      if (symbol === 'USDJPY') x -= 0.55;
      if (symbol === 'USDCHF') x -= 0.45;
      if (symbol === 'XAUUSD') x += 0.7;
      if (symbol === 'EURUSD') x -= 0.25;
      if (symbol === 'AUDUSD' || symbol === 'NZDUSD') x -= 0.4;
      if (symbol === 'USDCAD') x += 0.15;
      if (eurjpy || gbpjpy) x -= 0.3;
    } else if (rb === 'risk_on') {
      if (symbol === 'USDJPY') x += 0.35;
      if (symbol === 'AUDUSD' || symbol === 'NZDUSD') x += 0.35;
      if (symbol === 'XAUUSD') x -= 0.2;
      if (usdQuote) x += 0.15;
    }
  }

  return Math.max(-1, Math.min(1, x));
}

/** ISO2 → regional FX read when tape tags a jurisdiction (weights are soft tilts). */
const ISO_FX_TILT = {
  JP: { symbol: 'USDJPY', riskOff: -0.55, riskOn: 0.35 },
  CH: { symbol: 'USDCHF', riskOff: -0.5, riskOn: 0.2 },
  AU: { symbol: 'AUDUSD', riskOff: -0.42, riskOn: 0.38 },
  NZ: { symbol: 'NZDUSD', riskOff: -0.4, riskOn: 0.35 },
  CA: { symbol: 'USDCAD', riskOff: 0.22, riskOn: -0.12 },
  GB: { symbol: 'GBPUSD', riskOff: -0.28, riskOn: 0.22 },
  DE: { symbol: 'EURUSD', riskOff: -0.2, riskOn: 0.15 },
  FR: { symbol: 'EURUSD', riskOff: -0.2, riskOn: 0.15 },
  IT: { symbol: 'EURUSD', riskOff: -0.22, riskOn: 0.12 },
  ES: { symbol: 'EURUSD', riskOff: -0.18, riskOn: 0.12 },
  NL: { symbol: 'EURUSD', riskOff: -0.15, riskOn: 0.1 },
  BE: { symbol: 'EURUSD', riskOff: -0.15, riskOn: 0.1 },
  AT: { symbol: 'EURUSD', riskOff: -0.15, riskOn: 0.1 },
  PT: { symbol: 'EURUSD', riskOff: -0.14, riskOn: 0.1 },
  IE: { symbol: 'EURUSD', riskOff: -0.14, riskOn: 0.1 },
  GR: { symbol: 'EURUSD', riskOff: -0.2, riskOn: 0.08 },
  SE: { symbol: 'EURUSD', riskOff: -0.12, riskOn: 0.08 },
  NO: { symbol: 'EURUSD', riskOff: -0.12, riskOn: 0.08 },
  PL: { symbol: 'EURUSD', riskOff: -0.18, riskOn: 0.1 },
  TR: { symbol: 'USDTRY', riskOff: 0.35, riskOn: -0.25 },
  ZA: { symbol: 'USDZAR', riskOff: 0.45, riskOn: -0.35 },
  MX: { symbol: 'USDMXN', riskOff: 0.38, riskOn: -0.28 },
  BR: { symbol: 'USDBRL', riskOff: 0.42, riskOn: -0.32 },
  IN: { symbol: 'USDINR', riskOff: 0.28, riskOn: -0.2 },
  KR: { symbol: 'USDKRW', riskOff: 0.32, riskOn: -0.22 },
  CN: { symbol: 'USDCNH', riskOff: 0.25, riskOn: -0.18 },
  HK: { symbol: 'USDCNH', riskOff: 0.22, riskOn: -0.15 },
  SG: { symbol: 'USDCNH', riskOff: 0.12, riskOn: -0.08 },
  SA: { symbol: 'XAUUSD', riskOff: 0.2, riskOn: -0.05 },
  AE: { symbol: 'XAUUSD', riskOff: 0.18, riskOn: -0.05 },
  IL: { symbol: 'USDJPY', riskOff: -0.22, riskOn: 0.08 },
  PS: { symbol: 'XAUUSD', riskOff: 0.35, riskOn: -0.12 },
  IR: { symbol: 'USDTRY', riskOff: 0.28, riskOn: -0.15 },
  IQ: { symbol: 'XAUUSD', riskOff: 0.14, riskOn: -0.05 },
  RU: { symbol: 'EURUSD', riskOff: -0.25, riskOn: 0.1 },
  UA: { symbol: 'EURUSD', riskOff: -0.22, riskOn: 0.12 },
  EG: { symbol: 'USDZAR', riskOff: 0.12, riskOn: -0.08 },
  NG: { symbol: 'USDZAR', riskOff: 0.15, riskOn: -0.1 },
  AR: { symbol: 'USDBRL', riskOff: 0.2, riskOn: -0.12 },
  CL: { symbol: 'USDMXN', riskOff: 0.1, riskOn: -0.06 },
  CO: { symbol: 'USDMXN', riskOff: 0.1, riskOn: -0.06 },
  TH: { symbol: 'USDKRW', riskOff: 0.08, riskOn: -0.05 },
  VN: { symbol: 'USDCNH', riskOff: 0.1, riskOn: -0.06 },
  MY: { symbol: 'USDCNH', riskOff: 0.08, riskOn: -0.05 },
  ID: { symbol: 'USDCNH', riskOff: 0.1, riskOn: -0.06 },
  PH: { symbol: 'USDCNH', riskOff: 0.08, riskOn: -0.05 },
  TW: { symbol: 'USDCNH', riskOff: 0.15, riskOn: -0.1 },
};

function eventRecencyWeight(e) {
  const ts =
    (e.updated_at && new Date(e.updated_at).getTime()) ||
    (e.published_at && new Date(e.published_at).getTime()) ||
    (e.detected_at && new Date(e.detected_at).getTime()) ||
    0;
  const ageH = Math.max(0, (Date.now() - ts) / 3600000);
  const freshness = Math.exp(-ageH / 20);
  const rank = Number(e.rank_score) || 48;
  const mi = Number(e.market_impact_score) || 18;
  const sev = Number(e.severity) || 1;
  const corr = 1 + Math.min(4, Number(e.corroboration_count) || 0) * 0.12;
  return (rank * 0.022 + mi * 1.05 + sev * 7.5) * (0.38 + freshness * 0.62) * corr;
}

function shortDriver(title) {
  const t = String(title || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return 'Tape flow';
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

function marketsForEvent(e) {
  try {
    return scoreMarkets(e);
  } catch {
    return Array.isArray(e.impacted_markets) ? e.impacted_markets : [];
  }
}

/**
 * @param {object[]} events — surveillance tape rows (already filtered by tab/lens on API).
 * @param {{ limit?: number }} opts
 * @returns {{ symbol: string, bias: 'up'|'down'|'sideways', score: number, net: number, drivers: string[] }[]}
 */
function buildPairHeatFromEvents(events, opts = {}) {
  const limit = Math.min(10, Math.max(4, opts.limit ?? 6));
  const acc = new Map();

  function bump(symbol, w, delta, driver) {
    if (!PAIR_SYMBOLS.has(symbol)) return;
    if (!acc.has(symbol)) acc.set(symbol, { net: 0, wsum: 0, drivers: [] });
    const row = acc.get(symbol);
    row.net += w * delta;
    row.wsum += w;
    if (driver && row.drivers.length < 3) {
      const d = shortDriver(driver);
      if (d && !row.drivers.includes(d)) row.drivers.push(d);
    }
  }

  for (const e of events || []) {
    const w = eventRecencyWeight(e);
    const rb = e.risk_bias || 'neutral';
    const mk = marketsForEvent(e);
    for (const m of mk) {
      if (!m || !m.symbol) continue;
      const sym = String(m.symbol).toUpperCase();
      const delta = directionDelta(sym, m.direction, rb);
      if (delta === 0 && m.direction === 'neutral') continue;
      bump(sym, w * (0.55 + (Number(m.score) || 20) / 140), delta, e.title);
    }

    for (const c of e.countries || []) {
      const iso = String(c).toUpperCase();
      const tilt = ISO_FX_TILT[iso];
      if (!tilt) continue;
      const sym = tilt.symbol;
      if (!PAIR_SYMBOLS.has(sym)) continue;
      let deltaT = 0;
      if (rb === 'risk_off') deltaT = tilt.riskOff;
      else if (rb === 'risk_on') deltaT = tilt.riskOn;
      else deltaT = (tilt.riskOff + tilt.riskOn) * 0.22;
      bump(sym, w * 0.48, Math.max(-1, Math.min(1, deltaT)), e.title);
    }
  }

  const out = [...acc.entries()]
    .map(([symbol, v]) => {
      const net = v.wsum > 0 ? v.net / v.wsum : 0;
      const score = Math.min(100, Math.round(v.wsum * 3.2 + Math.abs(net) * 22));
      let bias = 'sideways';
      if (net > 0.12) bias = 'up';
      else if (net < -0.12) bias = 'down';
      return {
        symbol,
        bias,
        score,
        net: Math.round(net * 1000) / 1000,
        drivers: v.drivers.length ? v.drivers : ['Cross-tape geopolitical read'],
      };
    })
    .sort((a, b) => b.score - a.score || Math.abs(b.net) - Math.abs(a.net));

  return out.slice(0, limit);
}

module.exports = { buildPairHeatFromEvents, PAIR_SYMBOLS };
