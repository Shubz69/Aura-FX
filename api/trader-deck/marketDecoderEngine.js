/**
 * Market Decoder — rules-first asset brief engine (institutional-style decision brief).
 * Data: Finnhub quotes + candles; FMP calendar; FRED 10Y; optional Fear & Greed (crypto).
 * AI may polish language only in the API layer — never overrides scores here.
 */

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getQuote } = require('./services/finnhubService');
const { getEconomicCalendar } = require('./services/fmpService');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const TIMEOUT_MS = 9000;

/** @typedef {'FX'|'Crypto'|'Index'|'Commodity'|'Equity'} MarketType */

/**
 * Normalize user input → display symbol + Finnhub routing.
 */
function resolveAsset(raw) {
  const u = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9^.-]/g, '');
  if (!u) return null;

  const aliases = {
    SPX: 'SPY',
    'S&P500': 'SPY',
    SP500: 'SPY',
    DXY: 'UUP',
    USDX: 'UUP',
    GOLD: 'XAUUSD',
    XAU: 'XAUUSD',
    SILVER: 'XAGUSD',
    OIL: 'CL',
    WTI: 'CL',
    BTC: 'BTCUSD',
    ETH: 'ETHUSD',
    BITCOIN: 'BTCUSD',
  };
  const key = u.replace(/\^/g, '');
  if (aliases[key]) return resolveAsset(aliases[key]);

  if (u === 'XAUUSD' || key === 'XAUUSD')
    return {
      displaySymbol: 'XAUUSD',
      marketType: 'Commodity',
      candleKind: 'forex',
      finnhubSymbol: 'OANDA:XAU_USD',
    };
  if (u === 'XAGUSD' || key === 'XAGUSD')
    return {
      displaySymbol: 'XAGUSD',
      marketType: 'Commodity',
      candleKind: 'forex',
      finnhubSymbol: 'OANDA:XAG_USD',
    };

  if (/^BTC|^ETH|^SOL|^XRP|^ADA/i.test(key) && key.endsWith('USD')) {
    const base = key.replace('USD', '');
    const map = {
      BTC: 'BINANCE:BTCUSDT',
      ETH: 'BINANCE:ETHUSDT',
      SOL: 'BINANCE:SOLUSDT',
      XRP: 'BINANCE:XRPUSDT',
      ADA: 'BINANCE:ADAUSDT',
    };
    const fh = map[base];
    if (fh) return { displaySymbol: key, marketType: 'Crypto', candleKind: 'crypto', finnhubSymbol: fh };
  }

  if (key.length === 6 && /^[A-Z]{6}$/.test(key)) {
    const a = key.slice(0, 3);
    const b = key.slice(3, 6);
    return {
      displaySymbol: key,
      marketType: 'FX',
      candleKind: 'forex',
      finnhubSymbol: `OANDA:${a}_${b}`,
    };
  }

  if (key === 'CL' || key === 'CL=F')
    return { displaySymbol: 'WTI', marketType: 'Commodity', candleKind: 'stock', finnhubSymbol: 'CL' };

  const indexEtfs = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VTI']);
  if (indexEtfs.has(key) || key.startsWith('^'))
    return {
      displaySymbol: key.replace('^', ''),
      marketType: 'Index',
      candleKind: 'stock',
      finnhubSymbol: key.startsWith('^') ? 'SPY' : key,
    };

  return {
    displaySymbol: key,
    marketType: 'Equity',
    candleKind: 'stock',
    finnhubSymbol: key.split('.')[0],
  };
}

function sma(values, period) {
  if (!values.length || period <= 0) return null;
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((s, x) => s + x, 0);
  return sum / period;
}

async function finnhubCandles(candleKind, symbol, fromSec, toSec) {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) return { ok: false, closes: [], highs: [], lows: [], times: [], error: 'no_key' };
  const path = candleKind === 'forex' ? 'forex/candle' : candleKind === 'crypto' ? 'crypto/candle' : 'stock/candle';
  const url = `${FINNHUB_BASE}/${path}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(finnhubApiKey)}`;
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, closes: [], highs: [], lows: [], times: [], error: String(res.status) };
    const j = await res.json();
    if (!j || j.s !== 'ok' || !Array.isArray(j.c)) return { ok: false, closes: [], highs: [], lows: [], times: [], error: 'no_data' };
    return {
      ok: true,
      closes: j.c.map(Number),
      highs: (j.h || []).map(Number),
      lows: (j.l || []).map(Number),
      times: j.t || [],
    };
  } catch (e) {
    return { ok: false, closes: [], highs: [], lows: [], times: [], error: e.message || 'err' };
  }
}

async function fetchTreasuryContext() {
  const { fredApiKey } = getConfig();
  if (!fredApiKey) return { level: null, rising: null };
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&sort_order=desc&limit=5&file_type=json&api_key=${encodeURIComponent(fredApiKey)}`;
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { level: null, rising: null };
    const j = await res.json();
    const obs = (j && j.observations) || [];
    const vals = obs.map((o) => Number(o.value)).filter((x) => !Number.isNaN(x));
    if (vals.length < 2) return { level: vals[0] ?? null, rising: null };
    const level = vals[0];
    const rising = vals[0] > vals[1];
    return { level, rising };
  } catch {
    return { level: null, rising: null };
  }
}

async function fetchDxyProxy() {
  const q = await getQuote('OANDA:EUR_USD');
  if (q.ok && q.data && q.data.dp != null) {
    return { eurUsdDp: Number(q.data.dp), ok: true };
  }
  return { eurUsdDp: null, ok: false };
}

async function fetchFearGreed() {
  try {
    const url = 'https://api.alternative.me/fng/?limit=1&format=json';
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const j = await res.json();
    const v = j?.data?.[0];
    if (!v) return null;
    return { score: parseInt(v.value, 10), label: v.value_classification || '' };
  } catch {
    return null;
  }
}

function scoreRules({
  last,
  sma50,
  sma200,
  momentumUp,
  dxyHeadwindEur,
  yieldsRising,
  crowdedLong,
  marketType,
}) {
  let bull = 0;
  let bear = 0;

  if (last != null && sma50 != null) {
    if (last >= sma50) bull += 1;
    else bear += 1;
  }
  if (last != null && sma200 != null) {
    if (last >= sma200) bull += 1;
    else bear += 1;
  }
  if (momentumUp === true) bull += 1;
  else if (momentumUp === false) bear += 1;

  if (dxyHeadwindEur) bear += 1;
  if (yieldsRising) bear += 1;
  if (marketType === 'Crypto' && crowdedLong) bear += 1;

  return { bull, bear, net: bull - bear };
}

function biasFromNet(net) {
  if (net >= 2) return 'Bullish';
  if (net <= -2) return 'Bearish';
  return 'Neutral';
}

function convictionFromNet(net) {
  const a = Math.abs(net);
  if (a >= 4) return 'High';
  if (a >= 2) return 'Medium';
  return 'Low';
}

function tradingCondition({ net, eventHighImpactSoon, yieldsRising }) {
  if (eventHighImpactSoon) return 'Event Risk';
  const a = Math.abs(net);
  if (a >= 3) return 'Trend';
  if (a <= 1) return 'Choppy';
  return 'Range';
}

function bestApproach({ bias, condition, last, sma50, sma200 }) {
  if (condition === 'Event Risk') return 'Reduce size; wait for headline clarity before committing.';
  if (bias === 'Neutral' && condition === 'Choppy') return 'Stand aside or trade mean-reversion only at extremes.';
  if (bias === 'Bullish' && last != null && sma50 != null && last >= sma50) return 'Look for long continuation on pullback to rising MAs.';
  if (bias === 'Bearish' && last != null && sma50 != null && last <= sma50) return 'Favour shorts into rallies toward resistance / MAs.';
  if (bias === 'Bullish') return 'Wait for confirmation above near-term resistance.';
  if (bias === 'Bearish') return 'Wait for confirmation at resistance before shorting.';
  return 'Trade smaller until structure clarifies.';
}

function pivotLevels(prevH, prevL, prevC) {
  if (prevH == null || prevL == null || prevC == null) return null;
  const p = (prevH + prevL + prevC) / 3;
  const r1 = 2 * p - prevL;
  const s1 = 2 * p - prevH;
  const r2 = p + (prevH - prevL);
  const s2 = p - (prevH - prevL);
  return { pivot: p, r1, r2, s1, s2 };
}

function weeklyRange(highs, lows) {
  const n = Math.min(5, highs.length, lows.length);
  if (n < 2) return { wh: null, wl: null };
  const h = highs.slice(-n);
  const l = lows.slice(-n);
  return { wh: Math.max(...h), wl: Math.min(...l) };
}

function pickEvents(calendarRows, limit = 6) {
  const out = [];
  for (const row of calendarRows || []) {
    const name = (row.name || '').toString();
    const rawImp = row.importance ?? row.impact;
    const imp = String(rawImp != null ? rawImp : '').toLowerCase();
    const high =
      imp.includes('high') ||
      imp.includes('3') ||
      rawImp === 3 ||
      name.match(/FOMC|CPI|NFP|GDP|Powell|ECB|BOE/i);
    if (high || out.length < limit) {
      out.push({
        title: name.slice(0, 120),
        date: row.date || '',
        impact: high ? 'High' : imp.includes('medium') || imp.includes('2') ? 'Medium' : 'Low',
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

function timeUntil(isoLike) {
  if (!isoLike) return null;
  const t = new Date(isoLike).getTime();
  if (Number.isNaN(t)) return null;
  const h = Math.round((t - Date.now()) / 3600000);
  if (h < 0) return 'Past';
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function crossAssetLines(asset, marketType, { dxyRising, yieldsRising, eurUsdDp }) {
  const lines = [];
  if (marketType === 'FX' && asset.includes('EUR')) {
    if (eurUsdDp != null) {
      lines.push(`EURUSD session % → ${eurUsdDp >= 0 ? 'supportive' : 'pressure'} for euro direction`);
    }
    if (dxyRising === true) lines.push('DXY firm → headwind for EURUSD');
    else if (dxyRising === false) lines.push('DXY softer → tailwind for EURUSD');
  } else {
    if (dxyRising === true) lines.push('DXY bid → USD-positive cross-asset tone');
    else if (dxyRising === false) lines.push('DXY offered → risk/commodity relief');
  }
  if (yieldsRising === true) lines.push('US10Y rising → pressure on duration & gold');
  else if (yieldsRising === false) lines.push('US10Y softer → supports gold & growth proxies');
  lines.push('SPX tone → risk appetite anchor for indices & crypto');
  if (lines.length < 4) lines.push('Gold vs real yields → check XAU if trading metals');
  return lines.slice(0, 4);
}

function formatLevelStr(x, marketType) {
  const n = Number(x);
  if (x == null || Number.isNaN(n)) return '—';
  if (marketType === 'FX' || marketType === 'Commodity') return n.toFixed(5);
  if (marketType === 'Crypto' && n > 200) return n.toFixed(2);
  return n.toFixed(n < 50 ? 4 : 2);
}

/** Momentum: Rising / Weakening / Flat — rules from spec */
function computeMomentum(closes, sma50) {
  if (!closes.length || sma50 == null) return 'Flat';
  const last = closes[closes.length - 1];
  const priceAbove = last >= sma50;
  const slopeUp = closes.length >= 6 && closes[closes.length - 1] > closes[closes.length - 6];
  const slopeDown = closes.length >= 6 && closes[closes.length - 1] < closes[closes.length - 6];
  if (priceAbove && slopeUp) return 'Rising';
  if (!priceAbove && slopeDown) return 'Weakening';
  return 'Flat';
}

/** Last session range % */
function volatilityLabel(highs, lows, closes) {
  if (!closes.length) return 'Moderate';
  const last = closes[closes.length - 1];
  const h = highs.length ? highs[highs.length - 1] : null;
  const l = lows.length ? lows[lows.length - 1] : null;
  if (h != null && l != null && last > 0) {
    const rangePct = (h - l) / last;
    if (rangePct > 0.02) return 'High';
    if (rangePct > 0.01) return 'Moderate';
    return 'Low';
  }
  if (closes.length >= 2) {
    const prev = closes[closes.length - 2];
    const rangePct = Math.abs(last - prev) / last;
    if (rangePct > 0.02) return 'High';
    if (rangePct > 0.01) return 'Moderate';
    return 'Low';
  }
  return 'Moderate';
}

function biasLabelFromNet(net) {
  if (net >= 3) return 'Strong Bullish';
  if (net >= 1) return 'Moderate Bullish';
  if (net <= -3) return 'Strong Bearish';
  if (net <= -1) return 'Moderate Bearish';
  return 'Neutral';
}

/** Needle 0–100 from net score (~ -6 … +6) */
function gaugePositionFromNet(net) {
  const t = (Number(net) + 6) / 12;
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

function computePulseMarketState({ eventSoon, conviction, volLabel, net }) {
  if (eventSoon) return 'Event Driven';
  if (volLabel === 'High' && conviction === 'Low') return 'Unstable';
  if (conviction === 'High') return 'Trending Clean';
  if (conviction === 'Low') return 'Choppy';
  return 'Range';
}

function computeTradeReadiness({ conviction, momentum, eventSoon, pulseState, net }) {
  let s = 0;
  if (conviction === 'High') s += 3;
  if (momentum === 'Rising' || momentum === 'Weakening') s += 2;
  if (!eventSoon) s += 2;
  if (pulseState === 'Choppy') s -= 2;
  if (pulseState === 'Event Driven') s -= 2;
  const adjusted = s + Number(net) * 0.12;
  return Math.round(Math.min(10, Math.max(1, adjusted)) * 10) / 10;
}

function computeEnvironmentLine({ tradeReadiness, pulseState, net }) {
  if (pulseState === 'Event Driven' || pulseState === 'Unstable' || tradeReadiness < 4.5) {
    return 'Environment: Not ideal for aggressive trading';
  }
  if (pulseState === 'Trending Clean' && tradeReadiness >= 7 && Math.abs(net) >= 2) {
    return 'Environment supports trend continuation';
  }
  if (tradeReadiness >= 6) {
    return 'Environment: Selective — trade clean setups only';
  }
  return 'Environment: Caution — clarity is limited';
}

function buildExecutionGuidance({ bias, last, sma50, piv, condition, conviction, marketType }) {
  const lev = (x) => formatLevelStr(x, marketType);
  const preferredDirection =
    bias === 'Bullish' ? 'Selective Long' : bias === 'Bearish' ? 'Selective Short' : 'Neutral Bias';

  let entryCondition = '';
  if (bias === 'Bullish' && last != null && sma50 != null && piv?.s1 != null) {
    entryCondition = `Only consider longs if price holds above ${lev(sma50)} and ${lev(piv.s1)} with momentum confirmation`;
  } else if (bias === 'Bearish' && last != null && sma50 != null && piv?.r1 != null) {
    entryCondition = `Only consider shorts if price rejects ${lev(piv.r1)} or loses ${lev(sma50)} with follow-through`;
  } else if (last != null && piv?.r1 != null && piv?.s1 != null) {
    entryCondition = `Require a clear break and retest of ${lev(piv.s1)} (long) or ${lev(piv.r1)} (short) before sizing`;
  } else {
    entryCondition = 'Wait for a clear structure break and retest before committing size';
  }

  let invalidation = '';
  if (bias === 'Bullish' && piv?.s1 != null) {
    invalidation = `Bias invalidated on sustained break below ${lev(piv.s1)}`;
  } else if (bias === 'Bearish' && piv?.r1 != null) {
    invalidation = `Bias invalidated on sustained break above ${lev(piv.r1)}`;
  } else {
    invalidation = 'Bias invalidated on a daily close through the opposite side of the prior day range';
  }

  let riskConsideration = '';
  if (condition === 'Event Risk') {
    riskConsideration = 'High-impact window — wider spreads, gap risk, and headline volatility';
  } else if (conviction === 'Low') {
    riskConsideration = 'Choppy conditions — avoid aggressive sizing';
  } else if (conviction === 'High') {
    riskConsideration = 'Trending conditions — add on pullbacks, not late extensions';
  } else {
    riskConsideration = 'Two-way risk — reduce size until confirmation';
  }

  const avoidThis =
    condition === 'Event Risk'
      ? 'Do not chase headlines or lean into binaries with full size'
      : 'Do not chase breakouts without confirmation — false moves likely';

  return {
    preferredDirection,
    entryCondition,
    invalidation,
    riskConsideration,
    avoidThis,
  };
}

function buildFinalPostureElite({ net, eventHighImpactSoon, conviction, bias, piv, last, marketType }) {
  const lev = (x) => formatLevelStr(x, marketType);
  let headline = 'WAIT FOR CONFIRMATION';
  let subtitle = 'Mixed signals — need a cleaner trigger';

  if (eventHighImpactSoon) {
    headline = 'AVOID MARKET';
    subtitle = 'Event risk too high, no edge';
  } else if (net >= 2) {
    headline = 'SELECTIVE LONGS';
    subtitle = 'Only on pullbacks, not breakouts';
  } else if (net <= -2) {
    headline = 'SELECTIVE SHORTS';
    subtitle = 'Only on rallies into resistance';
  }

  const reason =
    conviction === 'Low'
      ? 'Mixed signals between macro and momentum reduce clarity'
      : bias === 'Neutral'
        ? 'Scoreboard is balanced — no strong directional edge'
        : 'Lean is present but follow-through is not yet proven';

  let whatWouldChangeThis = '';
  if (piv?.r1 != null && last != null) {
    whatWouldChangeThis = `Clear break above ${lev(piv.r1)} with volume and acceptance`;
  } else if (piv?.s1 != null) {
    whatWouldChangeThis = `Clear break and hold of ${lev(piv.s1)} with momentum confirmation`;
  } else {
    whatWouldChangeThis = 'A clean daily close beyond the prior range with follow-through';
  }

  return { headline, subtitle, reason, whatWouldChangeThis };
}

function whatMattersTemplate({ macro, technical, risk }) {
  return [
    { label: 'Macro driver', text: macro },
    { label: 'Technical driver', text: technical },
    { label: 'Immediate risk/event', text: risk },
  ];
}

/**
 * Build full Market Decoder brief (rules-only text; API may polish).
 */
async function runMarketDecoder(symbolInput) {
  const resolved = resolveAsset(symbolInput);
  if (!resolved) {
    return {
      success: false,
      message: 'Enter a valid symbol (e.g. EURUSD, XAUUSD, BTCUSD, SPY).',
    };
  }

  const { displaySymbol, marketType, candleKind, finnhubSymbol } = resolved;
  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * 400;

  const [candles, quoteRes, fred, dxy, fng, cal] = await Promise.all([
    finnhubCandles(candleKind, finnhubSymbol, from, to),
    getQuote(finnhubSymbol),
    fetchTreasuryContext(),
    fetchDxyProxy(),
    marketType === 'Crypto' ? fetchFearGreed() : Promise.resolve(null),
    getEconomicCalendar(),
  ]);

  const closes = candles.ok ? candles.closes : [];
  const highs = candles.ok ? candles.highs : [];
  const lows = candles.ok ? candles.lows : [];

  const last = closes.length ? closes[closes.length - 1] : null;
  const prev = closes.length > 1 ? closes[closes.length - 2] : null;
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const mom5 = closes.length > 5 ? closes[closes.length - 1] - closes[closes.length - 6] : null;
  const momentumUp = mom5 == null ? null : mom5 > 0;

  const q = quoteRes.ok && quoteRes.data ? quoteRes.data : {};
  const pctDay = q.dp != null ? Number(q.dp) : prev && last ? ((last - prev) / prev) * 100 : null;

  const dxyRising = dxy.ok && dxy.eurUsdDp != null ? dxy.eurUsdDp < 0 : null;

  const yieldsRising = fred.rising === true;
  const crowdedLongCrypto = marketType === 'Crypto' && fng && fng.score >= 75;

  const calRows = cal.ok ? cal.data : [];
  const eventsRaw = pickEvents(calRows, 8);
  const eventHighImpactSoon = eventsRaw.some((e) => e.impact === 'High');

  const { bull, bear, net } = scoreRules({
    last,
    sma50,
    sma200,
    momentumUp,
    dxyHeadwindEur: marketType === 'FX' && displaySymbol.includes('EUR') && dxyRising === true,
    yieldsRising,
    crowdedLong: crowdedLongCrypto,
    marketType,
  });

  const bias = biasFromNet(net);
  const conviction = convictionFromNet(net);
  const condition = tradingCondition({ net, eventHighImpactSoon, yieldsRising });
  const approach = bestApproach({ bias, condition, last, sma50, sma200 });

  let prevH = highs.length > 1 ? highs[highs.length - 2] : q.h;
  let prevL = lows.length > 1 ? lows[lows.length - 2] : q.l;
  const prevC = closes.length > 1 ? closes[closes.length - 2] : q.pc ?? q.o;
  if (prevH == null) prevH = last;
  if (prevL == null) prevL = last;

  const piv = pivotLevels(prevH, prevL, prevC);
  const wr = weeklyRange(highs, lows);

  const scenarios = {
    bullish: {
      condition: 'Hold above S1 / rising 50-day smoothing',
      outcome: piv ? `Target R1 ${piv.r1 != null ? piv.r1.toFixed(4) : '—'} then R2` : 'Target prior range high',
    },
    bearish: {
      condition: 'Fail at R1 or lose S1 with momentum',
      outcome: piv ? `Target S1 ${piv.s1 != null ? piv.s1.toFixed(4) : '—'} then S2` : 'Target prior range low',
    },
    noTrade: {
      when: eventHighImpactSoon
        ? 'High-impact macro window — spread widens, false breaks'
        : 'Choppy tape with no follow-through after breaks',
    },
  };

  const cross = crossAssetLines(displaySymbol, marketType, {
    dxyRising,
    yieldsRising,
    eurUsdDp: dxy.eurUsdDp,
  });

  const momentum = computeMomentum(closes, sma50);
  const volLabel = volatilityLabel(highs, lows, closes);
  const pulseState = computePulseMarketState({
    eventSoon: eventHighImpactSoon,
    conviction,
    volLabel,
    net,
  });
  const tradeReadiness = computeTradeReadiness({
    conviction,
    momentum,
    eventSoon: eventHighImpactSoon,
    pulseState,
    net,
  });
  const environmentLine = computeEnvironmentLine({
    tradeReadiness,
    pulseState,
    net,
  });

  const marketPulse = {
    biasScore: net,
    biasLabel: biasLabelFromNet(net),
    gaugePosition: gaugePositionFromNet(net),
    momentum,
    volatility: volLabel,
    marketState: pulseState,
    tradeReadiness,
    environmentLine,
  };

  const exec = buildExecutionGuidance({
    bias,
    last,
    sma50,
    piv,
    condition,
    conviction,
    marketType,
  });

  const postureElite = buildFinalPostureElite({
    net,
    eventHighImpactSoon,
    conviction,
    bias,
    piv,
    last,
    marketType,
  });

  const macroDriver = yieldsRising
    ? 'Rates staying firm — USD & discount-rate sensitivity in focus'
    : 'Rates easing bias — growth assets supported vs USD';
  const technicalDriver =
    last != null && sma50 != null
      ? `Price vs 50/200 SMA (${last.toFixed(4)} vs ${sma50.toFixed(4)} / ${sma200 != null ? sma200.toFixed(4) : '—'})`
      : 'MA stack unavailable — use range levels';
  const riskDriver = eventHighImpactSoon
    ? 'High-impact calendar cluster — gap risk'
    : 'Liquidity pockets around NY fix — watch slippage';

  const events = eventsRaw.slice(0, 4).map((e) => ({
    title: e.title,
    timeUntil: timeUntil(e.date),
    impact: e.impact,
  }));

  const positioning = {
    retailSentiment: marketType === 'Crypto' && fng ? `${fng.score} (${fng.label})` : '—',
    cot: 'Not wired (CFTC feed requires separate subscription)',
    crowdBias: crowdedLongCrypto ? 'Crowded long (contrarian caution)' : 'Neutral / not crowded',
  };

  const dataQuality = {
    candles: candles.ok,
    quote: quoteRes.ok,
    calendar: cal.ok,
  };

  return {
    success: true,
    brief: {
      header: {
        asset: displaySymbol,
        price: last != null ? last : q.c ?? null,
        changePercent: pctDay,
        marketType,
        quoteCurrency: 'USD',
      },
      marketPulse,
      instantRead: {
        bias,
        conviction,
        tradingCondition: condition,
        bestApproach: approach,
      },
      whatMattersNow: whatMattersTemplate({
        macro: macroDriver,
        technical: technicalDriver,
        risk: riskDriver,
      }),
      keyLevels: {
        resistance1: piv?.r1,
        resistance2: piv?.r2,
        support1: piv?.s1,
        support2: piv?.s2,
        previousDayHigh: prevH,
        previousDayLow: prevL,
        weeklyHigh: wr.wh,
        weeklyLow: wr.wl,
      },
      scenarioMap: scenarios,
      crossAssetContext: cross,
      positioning,
      eventRisk: events,
      executionGuidance: exec,
      finalOutput: {
        currentPosture: postureElite.headline,
        postureSubtitle: postureElite.subtitle,
        reason: postureElite.reason,
        whatWouldChangeThis: postureElite.whatWouldChangeThis,
      },
      meta: {
        bullScore: bull,
        bearScore: bear,
        netScore: net,
        dataQuality,
        finnhubSymbol,
      },
    },
  };
}

module.exports = { runMarketDecoder, resolveAsset };
