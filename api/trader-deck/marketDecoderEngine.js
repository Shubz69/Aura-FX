/**
 * Market Decoder — rules-first asset brief engine (institutional-style decision brief).
 * Data: Finnhub quotes + candles; FMP calendar; FRED 10Y; optional Fear & Greed (crypto).
 * AI may polish language only in the API layer — never overrides scores here.
 */

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getQuote } = require('./services/finnhubService');
const { getEconomicCalendar } = require('./services/fmpService');
const { getResolvedSymbol, forProvider } = require('../ai/utils/symbol-registry');
const {
  fetchDailySeriesWithQuoteFallback,
  fetchQuoteWithLog,
  fetchCrossAssetQuotes,
  fetchMarketDecoderContextNews,
} = require('./marketDecoderData');
const { rankInstrumentHeadlines } = require('./instrumentHeadlines');

const DECODER_ENGINE_VERSION = 2;

const TIMEOUT_MS = 9000;

/** @typedef {'FX'|'Crypto'|'Index'|'Commodity'|'Equity'} MarketType */

/**
 * Normalize user input → display symbol + Finnhub routing.
 */
function resolveAsset(raw) {
  const resolved = getResolvedSymbol(raw);
  if (!resolved?.canonical) return null;
  return {
    displaySymbol: resolved.displaySymbol,
    marketType: resolved.marketType,
    candleKind: resolved.candleKind,
    finnhubSymbol: resolved.finnhubSymbol,
    canonicalSymbol: resolved.canonical,
    decoderProxySymbol: resolved.decoderProxySymbol,
  };
}

function sma(values, period) {
  if (!values.length || period <= 0) return null;
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((s, x) => s + x, 0);
  return sum / period;
}

async function fetchTreasuryContextLogged() {
  const { fredApiKey } = getConfig();
  if (!fredApiKey) {
    console.warn('[market-decoder] FRED DGS10: missing FRED_API_KEY — using neutral rates context');
    return { level: null, rising: null, status: 'failed', detail: 'FRED_API_KEY missing' };
  }
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&sort_order=desc&limit=5&file_type=json&api_key=${encodeURIComponent(fredApiKey)}`;
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) {
      console.warn('[market-decoder] FRED DGS10 HTTP', res.status);
      return { level: null, rising: null, status: 'failed', detail: `HTTP ${res.status}` };
    }
    const j = await res.json();
    const obs = (j && j.observations) || [];
    const vals = obs.map((o) => Number(o.value)).filter((x) => !Number.isNaN(x));
    if (vals.length < 2) return { level: vals[0] ?? null, rising: null, status: 'partial', detail: 'single observation' };
    const level = vals[0];
    const rising = vals[0] > vals[1];
    return { level, rising, status: 'ok' };
  } catch (e) {
    console.warn('[market-decoder] FRED DGS10 error:', e.message || e);
    return { level: null, rising: null, status: 'failed', detail: e.message || 'error' };
  }
}

async function fetchDxyProxy() {
  const q = await getQuote(forProvider('EURUSD', 'finnhub'));
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

const CCY_CAL_HINTS = {
  USD: ['USD', 'US', 'UNITED STATES', 'FED', 'FOMC', 'NFP', 'PCE', 'TREASURY'],
  EUR: ['EUR', 'EU', 'ECB', 'EMU', 'GERMANY', 'FRANCE', 'ITALY', 'SPAIN', 'EURO'],
  GBP: ['GBP', 'UK', 'BOE', 'BRITAIN', 'ENGLAND'],
  JPY: ['JPY', 'JP', 'JAPAN', 'BOJ'],
  CHF: ['CHF', 'CH', 'SNB', 'SWITZ'],
  AUD: ['AUD', 'AU', 'RBA', 'AUSTRALIA'],
  CAD: ['CAD', 'CA', 'BOC', 'CANADA'],
  NZD: ['NZD', 'NZ', 'RBNZ'],
  XAU: ['XAU', 'GOLD', 'PRECIOUS'],
  XAG: ['XAG', 'SILVER'],
  BTC: ['BTC', 'BITCOIN'],
  ETH: ['ETH', 'ETHEREUM'],
};

function calendarTokensForResolved(resolved) {
  const u = String(resolved.displaySymbol || '').toUpperCase();
  const { marketType } = resolved;
  const tokens = new Set();
  const addCcy = (c) => {
    if (!c) return;
    tokens.add(c);
    (CCY_CAL_HINTS[c] || []).forEach((t) => tokens.add(t));
  };
  if (marketType === 'FX' && u.length === 6 && /^[A-Z]{6}$/.test(u)) {
    addCcy(u.slice(0, 3));
    addCcy(u.slice(3));
    return [...tokens];
  }
  if (marketType === 'Crypto') {
    const base = u.replace(/USDT|USD/g, '');
    addCcy(base);
    tokens.add('CRYPTO');
    addCcy('USD');
    return [...tokens];
  }
  if (marketType === 'Commodity' && (u.includes('XAU') || u.includes('GOLD'))) {
    (CCY_CAL_HINTS.XAU || []).forEach((t) => tokens.add(t));
    addCcy('USD');
    return [...tokens];
  }
  if (marketType === 'Commodity' && (u.includes('XAG') || u.includes('SILVER'))) {
    (CCY_CAL_HINTS.XAG || []).forEach((t) => tokens.add(t));
    addCcy('USD');
    return [...tokens];
  }
  addCcy('USD');
  return [...tokens];
}

function calendarRowMatchesTokens(row, tokens) {
  const country = String(row.country || '').toUpperCase();
  const name = String(row.name || '').toUpperCase();
  const curr = String((row.full && row.full.currency) || '').toUpperCase();
  const blob = `${country}|${name}|${curr}`;
  return tokens.some((t) => t && blob.includes(String(t).toUpperCase()));
}

/** Prefer releases tied to the instrument’s currencies; fall back to full calendar. */
function pickEventsForAsset(calendarRows, resolved, limit = 8) {
  const rows = calendarRows || [];
  if (!rows.length) return { events: [], scope: 'none' };
  const tokens = calendarTokensForResolved(resolved);
  const matched = rows.filter((r) => calendarRowMatchesTokens(r, tokens));
  const pool = matched.length >= 2 ? matched : rows;
  const scope = matched.length >= 2 ? 'pair' : 'global';
  return { events: pickEvents(pool, limit), scope };
}

function alignOpens(closes, opens) {
  const n = closes.length;
  if (!n) return [];
  const o = opens && opens.length === n ? opens.map(Number) : null;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (o && o[i] != null && !Number.isNaN(o[i])) out.push(o[i]);
    else out.push(i > 0 ? Number(closes[i - 1]) : Number(closes[i]));
  }
  return out;
}

/** Daily bars for TradingView lightweight-charts: `{ time, open, high, low, close }` in UTC seconds. */
function buildChartBars(seriesPack, maxBars = 120) {
  if (!seriesPack || !seriesPack.ok || !seriesPack.closes || seriesPack.closes.length < 2) return [];
  const closes = seriesPack.closes.map(Number);
  const highs = (seriesPack.highs || []).map(Number);
  const lows = (seriesPack.lows || []).map(Number);
  const times = seriesPack.times || [];
  const dates = seriesPack.dates || [];
  const opens = alignOpens(closes, seriesPack.opens);
  const n = closes.length;
  const start = Math.max(0, n - maxBars);
  const byTime = new Map();
  for (let i = start; i < n; i++) {
    let t = times[i] != null && times[i] !== '' ? Number(times[i]) : null;
    if (t == null || Number.isNaN(t)) {
      const d = dates[i] ? String(dates[i]).slice(0, 10) : '';
      if (d) t = Math.floor(new Date(`${d}T12:00:00.000Z`).getTime() / 1000);
    }
    if (t == null || Number.isNaN(t)) t = Math.floor(Date.now() / 1000) - 86400 * (n - 1 - i);
    const hi = highs[i] != null && !Number.isNaN(highs[i]) ? highs[i] : closes[i];
    const lo = lows[i] != null && !Number.isNaN(lows[i]) ? lows[i] : closes[i];
    const bar = {
      time: t,
      open: opens[i],
      high: Math.max(hi, lo, opens[i], closes[i]),
      low: Math.min(hi, lo, opens[i], closes[i]),
      close: closes[i],
    };
    byTime.set(bar.time, bar);
  }
  return [...byTime.keys()]
    .sort((a, b) => a - b)
    .map((k) => byTime.get(k));
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

function formatLevelStr(x, marketType) {
  const n = Number(x);
  if (x == null || Number.isNaN(n)) return null;
  if (marketType === 'FX' || marketType === 'Commodity') return n.toFixed(5);
  if (marketType === 'Crypto' && n > 200) return n.toFixed(2);
  return n.toFixed(n < 50 ? 4 : 2);
}

/** Always user-facing string — never a lone dash */
function formatLevelDisplay(x, marketType, label) {
  const s = formatLevelStr(x, marketType);
  if (s != null) return s;
  return `Unavailable (${label})`;
}

function adaptiveSmas(closes) {
  const n = closes.length;
  if (n < 2) {
    return {
      sma50: null,
      sma200: null,
      note50: 'Insufficient daily history for moving averages — fewer than two closes in the loaded window.',
      note200: null,
    };
  }
  const w50 = Math.min(50, Math.max(2, n - 1));
  const w200 = n >= 200 ? 200 : null;
  const s50 = sma(closes, w50);
  const s200 = w200 ? sma(closes, w200) : null;
  return {
    sma50: s50,
    sma200: s200,
    note50:
      n < 50
        ? `Using ${w50}-session SMA (full 50-session MA requires more history; currently ${n} sessions).`
        : null,
    note200:
      n < 200
        ? `200-session MA not available (${n} sessions loaded).`
        : null,
  };
}

function buildCrossAssetFromBundle(bundle, marketType, displaySymbol) {
  const lines = [];
  const eur = bundle && bundle.eurusd;
  const spy = bundle && bundle.spy;
  const xau = bundle && bundle.xau;
  const btc = bundle && bundle.btc;

  if (eur && eur.dp != null) {
    const dir = eur.dp >= 0 ? 'firming' : 'soft';
    lines.push(`EURUSD ${eur.dp >= 0 ? '+' : ''}${eur.dp.toFixed(2)}% session → USD ${dir} vs euro`);
  } else {
    lines.push('EURUSD cross: quote unavailable — USD tone from primary pair only');
  }

  if (spy && spy.dp != null) {
    lines.push(`SPY ${spy.dp >= 0 ? '+' : ''}${spy.dp.toFixed(2)}% → US equity risk tone ${spy.dp >= 0 ? 'supportive' : 'defensive'} for risk assets`);
  } else {
    lines.push('SPY: live % move unavailable — treat US equity tone as unconfirmed');
  }

  if (marketType === 'Commodity' || displaySymbol.includes('XAU')) {
    if (xau && xau.dp != null) {
      lines.push(`Gold ${xau.dp >= 0 ? '+' : ''}${xau.dp.toFixed(2)}% → real-yield sensitivity check for metals`);
    } else {
      lines.push('Gold session % unavailable — cross-check XAU separately before sizing metals');
    }
  } else if (xau && xau.dp != null) {
    lines.push(`XAUUSD ${xau.dp >= 0 ? '+' : ''}${xau.dp.toFixed(2)}% → flight-to-quality bias ${xau.dp >= 0 ? 'on' : 'off'}`);
  }

  if (marketType === 'Crypto' || displaySymbol.includes('BTC')) {
    if (btc && btc.dp != null) {
      lines.push(`BTC ${btc.dp >= 0 ? '+' : ''}${btc.dp.toFixed(2)}% → crypto-beta liquidity cue`);
    }
  } else if (btc && btc.dp != null) {
    lines.push(`BTC ${btc.dp >= 0 ? '+' : ''}${btc.dp.toFixed(2)}% → speculative risk appetite read-across`);
  }

  while (lines.length < 4) {
    lines.push('Cross-asset: maintain awareness of USD index tone via EURUSD and rates');
    if (lines.length >= 4) break;
  }
  return lines.slice(0, 4);
}

function decisionPressureText({ net, eventHighImpactSoon, conviction }) {
  if (eventHighImpactSoon) return 'Elevated — reduce size until event passes';
  if (conviction === 'High' && Math.abs(net) >= 2) return 'Directional — execute only at predefined levels';
  if (conviction === 'Low') return 'Compressed — wait for cleaner structure';
  return 'Balanced — confirmation required before commitment';
}

function convictionExplanationText({ conviction, net, bull, bear }) {
  return `${bull} bullish vs ${bear} bearish rule checks (net ${net >= 0 ? '+' : ''}${net}) → ${conviction} conviction.`;
}

function whatChangedLine({ displaySymbol, last, pctDay, q, marketType }) {
  const pct =
    pctDay != null
      ? `${pctDay >= 0 ? '+' : ''}${Number(pctDay).toFixed(2)}%`
      : 'session % unavailable (using close vs prior when possible)';
  const px = last != null ? formatLevelDisplay(last, marketType, 'last') : 'price pending';
  return `${displaySymbol} last ${px} (${pct} vs prior close snapshot). Quote reflects live venue where available.`;
}

function buildScenarioMapElite({ piv, bias, last, lev, eventHighImpactSoon }) {
  const hasPiv = piv && piv.r1 != null && piv.s1 != null;
  if (!hasPiv) {
    return {
      bullish: {
        condition: 'Reclaim prior swing high with follow-through once full daily OHLC history is available.',
        outcome: 'Target next liquidity pocket above; trail stops on structure.',
      },
      bearish: {
        condition: 'Lose prior swing low with expanding range.',
        outcome: 'Target next support shelf; fade failed bounces.',
      },
      noTrade: {
        when: eventHighImpactSoon
          ? 'Binary headline risk — no mechanical edge until prices settle post-release'
          : 'Incomplete level grid — stand down from size until daily pivots populate',
      },
    };
  }
  const above = last != null && last >= piv.pivot;
  return {
    bullish: {
      condition: `Daily hold above pivot ${lev(piv.pivot)} and acceptance through ${lev(piv.r1)} (R1) on a closing basis`,
      outcome: `Open route to ${lev(piv.r2)} (R2) while ${lev(piv.s1)} (S1) holds as intraday support`,
    },
    bearish: {
      condition: `Rejection below ${lev(piv.pivot)} or failed reclaim of ${lev(piv.r1)} with momentum`,
      outcome: `Initial target ${lev(piv.s1)} (S1), extension toward ${lev(piv.s2)} (S2) if flow accelerates`,
    },
    noTrade: {
      when: above
        ? `Chop between ${lev(piv.pivot)} and ${lev(piv.r1)} without a close outside — fade breakouts`
        : `Two-sided trade between ${lev(piv.s1)} and ${lev(piv.r1)} until one side breaks on volume`,
    },
  };
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
  const lev = (x, lab) => formatLevelDisplay(x, marketType, lab || 'level');
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
  const lev = (x, lab) => formatLevelDisplay(x, marketType, lab || 'level');
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
      code: 'UNKNOWN_SYMBOL',
      message: 'Enter a valid symbol (e.g. EURUSD, XAUUSD, BTCUSD, SPY).',
    };
  }

  const { displaySymbol, marketType, finnhubSymbol, canonicalSymbol } = resolved;
  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * 400;

  const quoteRes = await fetchQuoteWithLog(finnhubSymbol, resolved);
  const q = quoteRes.ok && quoteRes.data ? quoteRes.data : {};

  const [seriesPack, fred, dxy, fng, cal, crossBundle, anchorNews] = await Promise.all([
    fetchDailySeriesWithQuoteFallback(resolved, from, to, q),
    fetchTreasuryContextLogged(),
    fetchDxyProxy(),
    marketType === 'Crypto' ? fetchFearGreed() : Promise.resolve(null),
    getEconomicCalendar(),
    fetchCrossAssetQuotes(),
    fetchMarketDecoderContextNews(resolved, 12),
  ]);

  const closes = seriesPack.ok ? seriesPack.closes : [];
  const highs = seriesPack.ok ? seriesPack.highs : [];
  const lows = seriesPack.ok ? seriesPack.lows : [];
  const isSparse = Boolean(seriesPack.isSparse);

  const last =
    closes.length > 0
      ? closes[closes.length - 1]
      : q.c != null
        ? Number(q.c)
        : null;
  const prev = closes.length > 1 ? closes[closes.length - 2] : q.pc != null ? Number(q.pc) : null;

  const { sma50, sma200, note50, note200 } = adaptiveSmas(closes);
  const mom5 = closes.length > 5 ? closes[closes.length - 1] - closes[closes.length - 6] : null;
  const momentumUp = mom5 == null ? null : mom5 > 0;

  const pctDay =
    q.dp != null ? Number(q.dp) : prev != null && last != null && prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null;

  const dxyRising = dxy.ok && dxy.eurUsdDp != null ? dxy.eurUsdDp < 0 : null;

  const yieldsRising = fred.rising === true;
  const crowdedLongCrypto = marketType === 'Crypto' && fng && fng.score >= 75;

  let calRows = cal.ok ? cal.data : [];
  if (!calRows.length) {
    const fmpErr = cal && cal.error ? String(cal.error) : '';
    if (fmpErr.includes('429') || fmpErr.includes('403')) {
      console.info('[market-decoder] economic calendar empty (provider rate limit or auth — check FMP plan / keys)');
    } else {
      console.info('[market-decoder] economic calendar empty — check FMP_API_KEY or calendar range');
    }
  }
  const eventsForScoring = pickEvents(calRows, 12);
  const eventHighImpactSoon = eventsForScoring.some((e) => e.impact === 'High');
  const pairMeetingsPick = pickEventsForAsset(calRows, resolved, 10);

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

  let prevH = highs.length > 1 ? highs[highs.length - 2] : q.h != null ? Number(q.h) : null;
  let prevL = lows.length > 1 ? lows[lows.length - 2] : q.l != null ? Number(q.l) : null;
  const prevC = closes.length > 1 ? closes[closes.length - 2] : q.pc != null ? Number(q.pc) : q.o != null ? Number(q.o) : null;
  if (prevH == null && last != null) prevH = last;
  if (prevL == null && last != null) prevL = last;

  const piv =
    prevH != null && prevL != null && prevC != null && !Number.isNaN(prevH + prevL + prevC)
      ? pivotLevels(prevH, prevL, prevC)
      : null;
  const wr = weeklyRange(highs, lows);

  const lev = (x, lab) => formatLevelDisplay(x, marketType, lab || 'level');
  const scenarios = buildScenarioMapElite({
    piv,
    bias,
    last,
    lev,
    eventHighImpactSoon,
  });

  const cross = buildCrossAssetFromBundle(crossBundle, marketType, displaySymbol);

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
    convictionExplanation: convictionExplanationText({ conviction, net, bull, bear }),
    gaugePosition: gaugePositionFromNet(net),
    momentum,
    volatility: volLabel,
    marketState: pulseState,
    decisionPressure: decisionPressureText({ net, eventHighImpactSoon, conviction }),
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

  const macroDriver =
    fred.status === 'failed' || fred.level == null
      ? 'US 10Y benchmark context unavailable. Treat rates as unconfirmed: assume two-way risk until restored.'
      : yieldsRising
        ? `US 10Y at ${fred.level.toFixed(2)}% and rising vs prior observation — discount-rate sensitivity and USD strength risk.`
        : `US 10Y at ${fred.level.toFixed(2)}% and easing vs prior observation — supports duration and growth proxies.`;

  const technicalParts = [];
  if (last != null && sma50 != null) {
    technicalParts.push(
      `Last ${formatLevelDisplay(last, marketType, 'last')} vs SMA ${formatLevelDisplay(sma50, marketType, 'SMA50')}`
    );
    if (note50) technicalParts.push(note50);
    if (sma200 != null) {
      technicalParts.push(`200-session SMA ${formatLevelDisplay(sma200, marketType, 'SMA200')}`);
    }
    if (note200) technicalParts.push(note200);
  } else {
    technicalParts.push(
      isSparse
        ? 'Daily history compressed to snapshot — moving averages are indicative; wait for full history to anchor structure.'
        : 'SMA stack not computed — insufficient overlapping closes in this series.'
    );
  }
  if (isSparse) technicalParts.push('Sparse series flag: levels are proxy until full daily history returns.');
  const technicalDriver = technicalParts.join(' ');

  const riskDriver = eventHighImpactSoon
    ? 'High-impact macro window in calendar window — gap and headline risk; reduce size into prints.'
    : 'Liquidity pockets around major fixes — size for slippage and avoid market orders in thin prints.';

  let events = eventsForScoring.slice(0, 4).map((e) => ({
    title: e.title,
    timeUntil: timeUntil(e.date) || 'time TBC',
    impact: e.impact,
  }));
  if (!events.length) {
    events = [
      {
        title: 'No scored macro events in the next window',
        timeUntil: 'N/A',
        impact: 'Low',
        note: cal.ok
          ? 'Calendar returned empty for this range — widen the window or refresh later.'
          : 'Economic calendar unavailable for this request.',
      },
    ];
  }

  const positioning = {
    retailSentiment:
      marketType === 'Crypto' && fng
        ? `Crypto Fear & Greed ${fng.score} (${fng.label}) — rules use this as positioning overlay only.`
        : 'Retail sentiment: not available for this asset class in this view (crypto uses a greed/fear index when available).',
    cot: 'COT positioning: not streamed in this build — use CFTC release for positioning if you require it.',
    crowdBias: crowdedLongCrypto
      ? 'Crowded long (contrarian caution) — crypto greed index elevated.'
      : 'Crowd bias: neutral per available sentiment inputs.',
  };

  const providerLogMerged = [
    ...(quoteRes.providerLog || []),
    ...(seriesPack.providerLog || []),
    ...(fred.status
      ? [{ name: 'FRED DGS10', status: fred.status === 'ok' ? 'ok' : 'fallback', detail: fred.detail || '' }]
      : []),
    { name: 'FMP calendar', status: cal.ok ? 'ok' : 'failed', detail: cal.error || (cal.ok ? '' : 'empty') },
  ];

  const dataHealth = {
    summary:
      seriesPack.ok && quoteRes.ok && cal.ok
        ? 'Primary feeds satisfied'
        : 'One or more feeds used fallback — see providerLog',
    sparseSeries: isSparse,
    providerLog: providerLogMerged,
  };

  const sparkline = closes.length ? closes.slice(-40).map((v) => Number(v)) : [];
  const chartBars = buildChartBars(seriesPack, 120);
  const marketMeetingsForPair = (pairMeetingsPick.events || []).map((e) => ({
    title: e.title,
    date: e.date,
    impact: e.impact,
    timeUntil: timeUntil(e.date) || 'time TBC',
  }));

  const anchorList = Array.isArray(anchorNews) ? anchorNews : [];
  const headlineRank = rankInstrumentHeadlines(resolved, displaySymbol, anchorList, { maxRelevant: 6, maxFallback: 4 });

  return {
    success: true,
    brief: {
      header: {
        asset: displaySymbol,
        price: last != null ? last : q.c ?? null,
        changePercent: pctDay,
        marketType,
        quoteCurrency: 'USD',
        whatChanged: whatChangedLine({ displaySymbol, last, pctDay, q, marketType }),
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
        keyLevelsDisplay: {
          resistance1: piv?.r1 != null ? `${lev(piv.r1, 'R1')} (classic R1)` : formatLevelDisplay(null, marketType, 'R1'),
          resistance2: piv?.r2 != null ? `${lev(piv.r2, 'R2')} (classic R2)` : formatLevelDisplay(null, marketType, 'R2'),
          support1: piv?.s1 != null ? `${lev(piv.s1, 'S1')} (classic S1)` : formatLevelDisplay(null, marketType, 'S1'),
          support2: piv?.s2 != null ? `${lev(piv.s2, 'S2')} (classic S2)` : formatLevelDisplay(null, marketType, 'S2'),
          previousDayHigh: prevH != null ? `${lev(prevH, 'PDH')} prior session high` : 'Prior high: not available from loaded bars',
          previousDayLow: prevL != null ? `${lev(prevL, 'PDL')} prior session low` : 'Prior low: not available from loaded bars',
          weeklyHigh:
            wr.wh != null
              ? `${lev(wr.wh, 'WkH')} high of last ${Math.min(5, highs.length)} sessions in window`
              : 'Weekly high: not available from loaded bars',
          weeklyLow:
            wr.wl != null
              ? `${lev(wr.wl, 'WkL')} low of last ${Math.min(5, lows.length)} sessions in window`
              : 'Weekly low: not available from loaded bars',
        },
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
        dataHealth,
        finnhubSymbol,
        canonicalSymbol,
        decoderEngineVersion: DECODER_ENGINE_VERSION,
        sparkline,
        chartBars,
        anchorNews: anchorList,
        instrumentHeadlines: headlineRank.items,
        headlineScope: headlineRank.scope,
        headlineTotal: headlineRank.total,
        marketMeetings: marketMeetingsForPair,
        marketMeetingsScope: pairMeetingsPick.scope,
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

module.exports = { runMarketDecoder, resolveAsset };
