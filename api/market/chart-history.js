/**
 * GET /api/market/chart-history
 * OHLC bars for Lightweight Charts — Yahoo + Twelve Data (server-side, CORS-safe).
 *
 * Query: symbol (canonical or TradingView-style, e.g. XAUUSD | OANDA:XAUUSD | BINANCE:SOLUSDT)
 *        interval (optional): 1 | 15 | 60 | 240 | 1D | D
 *        range (optional): 1D | 1W | 1M | 3M | 6M | 1Y
 *        from/to (optional): unix seconds or ISO date/time
 *
 * 4H rule: if provider returns 1H, aggregate server-side.
 */

const axios = require('axios');
const { toCanonical, forProvider } = require('../ai/utils/symbol-registry');

const REQUEST_TIMEOUT = 12000;
const TD_USAGE_TTL_MS = Math.max(5 * 60_000, parseInt(process.env.TWELVE_DATA_USAGE_CACHE_MS || '900000', 10) || 900000);
const responseCache = new Map();
const inFlight = new Map();
/** Serialize identical chart requests (same symbol/interval/range/window) to avoid parallel TwelveData work. */
const chartBuildMutexes = new Map();
const providerCallCounts = new Map();

async function withChartBuildLock(lockKey, fn) {
  const key = String(lockKey || '');
  if (!chartBuildMutexes.has(key)) {
    chartBuildMutexes.set(key, { locked: false, queue: [] });
  }
  const m = chartBuildMutexes.get(key);
  await new Promise((resolve) => {
    if (!m.locked) {
      m.locked = true;
      resolve();
    } else {
      m.queue.push(resolve);
    }
  });
  try {
    return await fn();
  } finally {
    const next = m.queue.shift();
    if (next) next();
    else m.locked = false;
  }
}
const VALID_INTERVALS = new Set(['1', '5', '15', '30', '45', '60', '240', '1D', 'D', '1W', '1M', '1Y']);
const VALID_RANGES = new Set(['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', '10Y', '20Y', '50Y']);
const TWELVE_BASE = 'https://api.twelvedata.com/time_series';
const TD_PAGE_SIZE = 5000;
const TD_MAX_CALLS_PER_MINUTE = 500;
const TD_DEFAULT_MAX_CHUNKS = 3;
const TD_DEEP_MAX_CHUNKS = 5;
const TD_USAGE_WINDOW_MS = 60_000;
const twelveUsageWindow = {
  minuteStart: Date.now(),
  calls: 0,
};

const FOUR_HOUR_SEC = 4 * 3600;

/** Trader Lab / Replay tickers that do not round-trip through `toCanonical` cleanly. */
const TV_INPUT_TO_CANONICAL = {
  'OANDA:SPX500USD': 'SPX',
  'OANDA:NAS100USD': 'NDX',
  'OANDA:US30USD': 'DJI',
  'BINANCE:SOLUSDT': 'SOLUSD',
  'BINANCE:XRPUSDT': 'XRPUSD',
  'BINANCE:ADAUSDT': 'ADAUSD',
  'TVC:NATGASUSD': 'XNGUSD',
  'TVC:USOIL': 'USOIL',
  'TVC:UKOIL': 'UKOIL',
  'TVC:DXY': 'DXY',
  'TVC:VIX': 'VIX',
  'AMEX:IWM': 'IWM',
  'AMEX:GLD': 'GLD',
  'NASDAQ:TLT': 'TLT',
};

function resolveCanonicalFromInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const up = s.toUpperCase();
  if (TV_INPUT_TO_CANONICAL[up]) return toCanonical(TV_INPUT_TO_CANONICAL[up]);
  return toCanonical(s);
}

function yahooSymbolForCanonical(canonical) {
  const c = String(canonical || '').trim().toUpperCase();
  if (!c) return '';
  return forProvider(c, 'yahoo') || c;
}

function twelveDataSymbolForCanonical(canonical) {
  const c = String(canonical || '').trim().toUpperCase();
  if (!c) return '';
  return forProvider(c, 'twelvedata') || c;
}

/**
 * Map lab/replay resolution to Yahoo `interval` + `range`.
 * 240 → fetch 1h then aggregate to 4H.
 */
function normalizeInterval(input) {
  const raw = String(input || '60').toUpperCase();
  if (raw === 'Y' || raw === '1Y') return '1Y';
  if (raw === 'MO' || raw === '1MO') return '1M';
  if (raw === 'D') return '1D';
  if (raw === 'W') return '1W';
  if (raw === 'M') return '1M';
  return VALID_INTERVALS.has(raw) ? raw : '60';
}

function normalizeRange(input, fallback = '3M') {
  const raw = String(input || fallback).toUpperCase();
  return VALID_RANGES.has(raw) ? raw : fallback;
}

function defaultRangeForInterval(interval) {
  const i = normalizeInterval(interval);
  if (i === '1' || i === '5' || i === '15' || i === '30' || i === '45') return '1M';
  if (i === '60') return '1Y';
  if (i === '240') return '5Y';
  if (i === '1D' || i === '1W' || i === '1M' || i === '1Y') return '50Y';
  return '1Y';
}

function parseMaybeDate(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n > 2_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function barsByRange(range) {
  switch (range) {
    case '1D':
      return 24;
    case '1W':
      return 7 * 24;
    case '1M':
      return 31 * 24;
    case '3M':
      return 92 * 24;
    case '6M':
      return 183 * 24;
    case '1Y':
      return 366 * 24;
    case '5Y':
      return 5 * 366 * 24;
    case '10Y':
      return 10 * 366 * 24;
    case '20Y':
      return 20 * 366 * 24;
    case '50Y':
      return 50 * 366 * 24;
    default:
      return 92 * 24;
  }
}

function rangeToDays(range) {
  return (
    {
      '1D': 1,
      '1W': 7,
      '1M': 31,
      '3M': 92,
      '6M': 183,
      '1Y': 366,
      '5Y': 5 * 366,
      '10Y': 10 * 366,
      '20Y': 20 * 366,
      '50Y': 50 * 366,
    }[String(range || '').toUpperCase()] || 31
  );
}

function toYahooRange(range) {
  switch (range) {
    case '1D':
      return '1d';
    case '1W':
      return '7d';
    case '1M':
      return '1mo';
    case '3M':
      return '3mo';
    case '6M':
      return '6mo';
    case '1Y':
      return '1y';
    case '5Y':
      return '5y';
    case '10Y':
    case '20Y':
    case '50Y':
      return 'max';
    default:
      return '3mo';
  }
}

const TD_MAX_OUTPUT = 5000;

const YAHOO_RANGE_LADDER = ['1d', '5d', '7d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'];

function computeMinBarsWanted(interval, range) {
  const i = normalizeInterval(interval);
  const rr = normalizeRange(range);
  const days = rangeToDays(rr);
  if (i === '1') return Math.min(1500, Math.max(300, Math.floor(days * 24 * 60 * 0.6)));
  if (i === '5') return Math.max(1200, Math.floor((days * 24 * 60) / 5 * 0.65));
  if (i === '15') return Math.max(1000, Math.floor((days * 24 * 60) / 15 * 0.7));
  if (i === '30') return Math.max(900, Math.floor((days * 24 * 60) / 30 * 0.7));
  if (i === '45') return Math.max(700, Math.floor((days * 24 * 60) / 45 * 0.7));
  if (i === '60') return rr === '3M' ? 1500 : Math.max(900, Math.floor(days * 24 * 0.8));
  if (i === '240') return rr === '1Y' ? 1000 : Math.max(400, Math.floor((days * 24 * 0.55) / 4));
  if (i === '1D') return rr === '1Y' ? 250 : Math.max(90, Math.floor(days * 0.9));
  if (i === '1Y') return 20;
  return 80;
}

function desiredTwelveOutputsize(interval, range, from, to) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (Number.isFinite(from) || Number.isFinite(to)) {
    return TD_MAX_OUTPUT;
  }
  const d = rangeToDays(rr);
  if (r === '1') return Math.min(TD_MAX_OUTPUT, Math.max(900, Math.ceil(d * 24 * 60 * 0.5)));
  if (r === '5') return Math.min(TD_MAX_OUTPUT, Math.max(900, Math.ceil((d * 24 * 60) / 5)));
  if (r === '15') return Math.min(TD_MAX_OUTPUT, Math.max(500, Math.ceil((d * 24 * 60) / 15)));
  if (r === '30') return Math.min(TD_MAX_OUTPUT, Math.max(500, Math.ceil((d * 24 * 60) / 30)));
  if (r === '45') return Math.min(TD_MAX_OUTPUT, Math.max(500, Math.ceil((d * 24 * 60) / 45)));
  if (r === '60') return Math.min(TD_MAX_OUTPUT, Math.max(600, d * 28));
  if (r === '240') return Math.min(TD_MAX_OUTPUT, Math.max(220, Math.ceil(d * 8) + 120));
  if (r === '1D') return Math.min(TD_MAX_OUTPUT, Math.max(280, d + 60));
  return 500;
}

function yahooRangeDowngradeChainFrom(targetYahooRange) {
  const t = String(targetYahooRange || '3mo');
  const out = [t];
  for (const r of YAHOO_RANGE_LADDER) {
    if (r !== t) out.push(r);
  }
  return [...new Set(out)];
}

function yahooIntervalCoarseFallbacks(yInt) {
  const u = String(yInt);
  const m = {
    '1m': ['2m', '5m', '15m', '30m', '60m', '1h'],
    '2m': ['5m', '15m', '30m', '60m', '1h'],
    '5m': ['15m', '30m', '60m', '1h'],
    '15m': ['30m', '60m', '1h'],
    '30m': ['60m', '1h'],
    '60m': ['1h'],
    '1h': [],
    '4h': [],
  };
  return m[u] || ['15m', '1h', '1d'];
}

function yahooToReturnedCode(yi) {
  const u = String(yi);
  if (u === '1m' || u === '2m') return '1';
  if (u === '5m') return '5';
  if (u === '15m') return '15';
  if (u === '30m') return '30';
  if (u === '60m' || u === '1h') return '60';
  if (u === '1d' || u === '5d' || u === '1wk' || u === '1mo') return '1D';
  return '60';
}

function providerPlan({ interval, range, from, to }) {
  const hasDateWindow = Number.isFinite(from) || Number.isFinite(to);
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  const longRange = rr === '5Y' || rr === '10Y' || rr === '20Y' || rr === '50Y';
  if (r === '1') {
    return { prefer: 'twelvedata', fallback: 'yahoo', hasDateWindow };
  }
  if (hasDateWindow || longRange) {
    return { prefer: 'twelvedata', fallback: 'yahoo', hasDateWindow };
  }
  return { prefer: 'yahoo', fallback: 'twelvedata', hasDateWindow: false };
}

function rangeStartUnix(range, nowSec = Math.floor(Date.now() / 1000)) {
  const days = rangeToDays(range);
  return nowSec - days * 86400;
}

function coerceIntervalForRange(interval, range) {
  const requestedInterval = normalizeInterval(interval);
  const requestedRange = normalizeRange(range);
  const longRange = requestedRange === '5Y' || requestedRange === '10Y' || requestedRange === '20Y' || requestedRange === '50Y';
  if (longRange && (requestedInterval === '1' || requestedInterval === '15' || requestedInterval === '60' || requestedInterval === '240')) {
    return {
      requestedInterval,
      effectiveInterval: '1D',
      effectiveRange: requestedRange,
      autoAdjusted: true,
      note: `Interval ${requestedInterval} downgraded to 1D for ${requestedRange} range`,
    };
  }
  return {
    requestedInterval,
    effectiveInterval: requestedInterval,
    effectiveRange: requestedRange,
    autoAdjusted: false,
    note: '',
  };
}

function planWithoutTwelve(plan, hasTwKey) {
  if (hasTwKey) return plan;
  return { prefer: 'yahoo', fallback: 'yahoo', hasDateWindow: plan.hasDateWindow };
}

function yahooRangeParams({ interval, range }) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (r === '1W') {
    return { interval: '1wk', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '1W' };
  }
  if (r === '1M') {
    return { interval: '1mo', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '1M' };
  }
  if (r === '1D') {
    return { interval: '1d', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '1D' };
  }
  if (r === '1Y') {
    return { interval: '1mo', range: 'max', aggregateTo4h: false, returnedInterval: '1Y' };
  }
  if (r === '240') {
    return { interval: '1h', range: toYahooRange(rr), aggregateTo4h: true, returnedInterval: '240' };
  }
  if (r === '1') {
    const range1m = rr === '1D' ? '1d' : rr === '1W' ? '5d' : '7d';
    return { interval: '1m', range: range1m, aggregateTo4h: false, returnedInterval: '1' };
  }
  if (r === '5') {
    return { interval: '5m', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '5' };
  }
  if (r === '15') {
    return { interval: '15m', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '15' };
  }
  if (r === '30') {
    return { interval: '30m', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '30' };
  }
  if (r === '45') {
    return { interval: '15m', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '45' };
  }
  return { interval: '1h', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '60' };
}

function twelveDataParams({ interval, range, from, to }) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  const cap = (n) => Math.min(TD_MAX_OUTPUT, Math.max(1, n));
  const hasDateWindow = Number.isFinite(from) || Number.isFinite(to);
  const deepIntraday = rr === '1M' || rr === '3M' || rr === '6M' || rr === '1Y';
  if (r === '1M') {
    return {
      interval: '1month',
      aggregateTo4h: false,
      outputsize: cap(Math.max(600, Math.ceil(rangeToDays(rr) / 30) + 120)),
      returnedInterval: '1M',
    };
  }
  if (r === '1W') {
    return {
      interval: '1week',
      aggregateTo4h: false,
      outputsize: cap(Math.max(700, Math.ceil(rangeToDays(rr) / 7) + 160)),
      returnedInterval: '1W',
    };
  }
  if (r === '1D') {
    return {
      interval: '1day',
      aggregateTo4h: false,
      outputsize: cap(hasDateWindow ? TD_MAX_OUTPUT : Math.max(250, Math.ceil(barsByRange(rr) / 24))),
      returnedInterval: '1D',
    };
  }
  if (r === '240') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('240', rr, from, to);
    return {
      interval: '4h',
      aggregateTo4h: false,
      outputsize: cap(Math.max(220, out)),
      returnedInterval: '240',
    };
  }
  if (r === '1') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('1', rr, from, to);
    return { interval: '1min', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '1' };
  }
  if (r === '5') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('5', rr, from, to);
    return { interval: '5min', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '5' };
  }
  if (r === '15') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('15', rr, from, to);
    return { interval: '15min', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '15' };
  }
  if (r === '30') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('30', rr, from, to);
    return { interval: '30min', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '30' };
  }
  if (r === '45') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('45', rr, from, to);
    return { interval: '45min', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '45' };
  }
  if (r === '1Y') {
    return { interval: '1month', aggregateTo4h: false, outputsize: cap(Math.max(900, rangeToDays(rr) / 30)), returnedInterval: '1Y' };
  }
  const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('60', rr, from, to);
  return { interval: '1h', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '60' };
}

function isIntradayInterval(interval) {
  const i = normalizeInterval(interval);
  return i === '1' || i === '15' || i === '60' || i === '240';
}

function buildTwelveTimeSeriesParams({ symbol, interval, outputsize, from, to, apikey, timezone }) {
  const params = {
    symbol,
    interval,
    outputsize: String(outputsize),
    apikey,
    order: 'ASC',
    format: 'JSON',
    ...(timezone ? { timezone } : {}),
  };
  if (Number.isFinite(from)) params.start_date = new Date(from * 1000).toISOString();
  if (Number.isFinite(to)) params.end_date = new Date(to * 1000).toISOString();
  return params;
}

/** UTC 4-hour bucket start (Unix seconds). */
function fourHourBucketStart(ts) {
  const t = Number(ts);
  if (!Number.isFinite(t)) return 0;
  return Math.floor(t / FOUR_HOUR_SEC) * FOUR_HOUR_SEC;
}

/**
 * Aggregate ascending 1h bars into 4H OHLC (open = first hour, high/low = extrema, close = last hour).
 * @param {{ time: number, open: number, high: number, low: number, close: number }[]} hourlyBars
 */
function aggregateHourlyToFourHour(hourlyBars) {
  if (!hourlyBars || hourlyBars.length === 0) return [];
  const sorted = [...hourlyBars].sort((a, b) => Number(a.time) - Number(b.time));
  const groups = new Map();
  for (const bar of sorted) {
    const start = fourHourBucketStart(bar.time);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(bar);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  return keys.map((start) => {
    const arr = groups.get(start);
    const open = Number(arr[0].open);
    const close = Number(arr[arr.length - 1].close);
    let high = -Infinity;
    let low = Infinity;
    for (const b of arr) {
      high = Math.max(high, Number(b.high));
      low = Math.min(low, Number(b.low));
    }
    return {
      time: start,
      open,
      high,
      low,
      close,
    };
  });
}

function yahooResultToBars(result) {
  const ts = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};
  const { open, high, low, close } = q;
  const bars = [];
  const n = ts.length;
  for (let i = 0; i < n; i += 1) {
    const tRaw = ts[i];
    const c = close?.[i];
    if (c == null || tRaw == null) continue;
    const t = typeof tRaw === 'number' ? tRaw : Math.floor(Number(tRaw) / 1000);
    if (!Number.isFinite(t)) continue;
    const cl = Number(c);
    const o = open?.[i] != null ? Number(open[i]) : cl;
    const h = high?.[i] != null ? Number(high[i]) : cl;
    const l = low?.[i] != null ? Number(low[i]) : cl;
    bars.push({
      time: t,
      open: o,
      high: Math.max(h, l, o, cl),
      low: Math.min(h, l, o, cl),
      close: cl,
    });
  }
  return bars;
}

function cacheKey(yahooSym, interval, range, suffix = '') {
  return `${yahooSym}|${interval}|${range}${suffix ? `|${suffix}` : ''}`;
}

function ttlByIntervalMs(interval, range = '3M') {
  const i = normalizeInterval(interval);
  const r = normalizeRange(range);
  if ((r === '5Y' || r === '10Y' || r === '20Y' || r === '50Y') && i === '1D') return 45 * 60 * 60_000;
  if (r === '50Y' && (i === '1W' || i === '1M')) return 24 * 60 * 60_000;
  if (i === '1D' && r === '1Y') return 45 * 60_000;
  if (i === '1') return 90_000;
  if (i === '5') return 90_000;
  if (i === '15') return 120_000;
  if (i === '30' || i === '45') return 120_000;
  if (i === '60') return 45 * 60_000;
  if (i === '240') return 90 * 60_000;
  if (i === '1D') return 30 * 60 * 60_000;
  if (i === '1W' || i === '1M') return 24 * 60 * 60_000;
  return 6 * 60 * 60_000;
}

function currentTwelveBudgetState() {
  const now = Date.now();
  if (now - twelveUsageWindow.minuteStart >= TD_USAGE_WINDOW_MS) {
    twelveUsageWindow.minuteStart = now;
    twelveUsageWindow.calls = 0;
  }
  return {
    twelveCallsThisMinute: twelveUsageWindow.calls,
    twelveBudgetRemaining: Math.max(0, TD_MAX_CALLS_PER_MINUTE - twelveUsageWindow.calls),
  };
}

function reserveTwelveCallBudget(callCount = 1) {
  const now = Date.now();
  if (now - twelveUsageWindow.minuteStart >= TD_USAGE_WINDOW_MS) {
    twelveUsageWindow.minuteStart = now;
    twelveUsageWindow.calls = 0;
  }
  const next = twelveUsageWindow.calls + Math.max(1, Number(callCount) || 1);
  if (next > TD_MAX_CALLS_PER_MINUTE) {
    const err = new Error('Twelve Data budget exceeded');
    err.code = 'TD_BUDGET_EXCEEDED';
    err.budget = currentTwelveBudgetState();
    throw err;
  }
  twelveUsageWindow.calls = next;
  return currentTwelveBudgetState();
}

function bumpProviderCall(provider) {
  const p = String(provider || 'unknown');
  providerCallCounts.set(p, (providerCallCounts.get(p) || 0) + 1);
}

function makeResponseKey({ requestSymbol, canonical, interval, range, from, to, provider }) {
  return JSON.stringify({
    requestSymbol: String(requestSymbol || '').toUpperCase(),
    canonical: String(canonical || '').toUpperCase(),
    interval: normalizeInterval(interval),
    range: normalizeRange(range),
    from: Number.isFinite(from) ? Number(from) : null,
    to: Number.isFinite(to) ? Number(to) : null,
    provider: String(provider || 'auto').toLowerCase(),
  });
}

function buildChartRequestUrl(yahooSymbol, interval, range, host = 'https://query1.finance.yahoo.com') {
  const base = `${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;
  const qs = new URLSearchParams({
    interval: String(interval),
    range: String(range),
    includePrePost: 'false',
  }).toString();
  return `${base}?${qs}`;
}

async function yahooHttpGet(yahooSymbol, interval, range, signal) {
  const common = {
    params: { interval, range, includePrePost: 'false' },
    timeout: REQUEST_TIMEOUT,
    signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  };
  const path = `/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;
  try {
    return await axios.get(`https://query1.finance.yahoo.com${path}`, common);
  } catch (e) {
    return axios.get(`https://query2.finance.yahoo.com${path}`, common);
  }
}

/**
 * One Yahoo attempt with cache; never throws 422/400 to the HTTP layer (caller may chain).
 * @returns {Promise<{ bars: Array, requestUrl: string, responseStatus: number|null, ... }>}
 */
async function fetchYahooChartBarsOnce(yahooSymbol, interval, range) {
  const key = cacheKey(yahooSymbol, interval, range);
  const hit = responseCache.get(key);
  const requestUrl = buildChartRequestUrl(yahooSymbol, interval, range);
  const ttlMs = 90_000;
  if (hit && Date.now() - hit.at < ttlMs) {
    return {
      bars: hit.bars,
      requestUrl,
      responseStatus: hit.responseStatus ?? 200,
      cacheHit: true,
      cacheTtlMs: ttlMs,
      inFlightDeduped: false,
      providerCallMade: false,
    };
  }

  const inFlightKey = `yahoo:${key}`;
  const pending = inFlight.get(inFlightKey);
  if (pending) {
    const out = await pending;
    return { ...out, inFlightDeduped: true, providerCallMade: false };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const run = (async () => {
    bumpProviderCall('yahoo');
    let response;
    try {
      response = await yahooHttpGet(yahooSymbol, interval, range, controller.signal);
    } catch (e) {
      const st = e.response?.status;
      const out = { bars: [], requestUrl, responseStatus: st != null ? st : 502, cacheHit: false, cacheTtlMs: ttlMs, inFlightDeduped: false, providerCallMade: true, httpError: e };
      if (!st || st === 404) responseCache.set(key, { at: Date.now(), bars: [], responseStatus: st });
      return out;
    }
    const status = response.status ?? 200;
    const result = response.data?.chart?.result?.[0];
    const errBlock = response.data?.chart?.error;
    const bars = result && !errBlock ? yahooResultToBars(result) : [];
    if (errBlock) {
      const e = new Error(String(errBlock.description || 'Yahoo chart error'));
      e.response = { status: 422, data: response.data };
      const out = { bars: [], requestUrl, responseStatus: 422, cacheHit: false, cacheTtlMs: ttlMs, inFlightDeduped: false, providerCallMade: true, httpError: e };
      return out;
    }
    responseCache.set(key, { at: Date.now(), bars, responseStatus: status });
    return {
      bars,
      requestUrl,
      responseStatus: status,
      cacheHit: false,
      cacheTtlMs: ttlMs,
      inFlightDeduped: false,
      providerCallMade: true,
    };
  })();
  inFlight.set(inFlightKey, run);
  try {
    return await run;
  } finally {
    clearTimeout(timeoutId);
    inFlight.delete(inFlightKey);
  }
}

/**
 * Tries range / interval downgrades; returns best available bars (never throws to HTTP layer).
 */
async function fetchYahooChartBars(yahooSymbol, yPlan, normalizedUserInterval, userRange) {
  const rangeChain = yahooRangeDowngradeChainFrom(yPlan.range);
  let rest = yPlan.aggregateTo4h
    ? [String(yPlan.interval)]
    : [String(yPlan.interval), ...yahooIntervalCoarseFallbacks(String(yPlan.interval))];
  const uq = new Set();
  const intervalOrder = rest.filter((x) => (uq.has(x) ? false : (uq.add(x), true)));

  let best = null;
  for (const yi of intervalOrder) {
    for (const yRange of rangeChain) {
      const out = await fetchYahooChartBarsOnce(yahooSymbol, yi, yRange);
      const n = out.bars ? out.bars.length : 0;
      if (n < 1) continue;
      const use4h = Boolean(yPlan.aggregateTo4h) && (yi === '1h' || yi === '60m');
      let bars = out.bars;
      if (use4h) {
        bars = aggregateHourlyToFourHour(bars);
      }
      const ab = bars && bars.length ? bars.length : 0;
      const meta = {
        ...out,
        bars,
        yahooRangeUsed: yRange,
        yahooIntervalUsed: yi,
        yahooRangeDowngraded: yRange !== yPlan.range,
        intervalCoarsened: yi !== yPlan.interval,
        fourHourAggregated: use4h,
        returnedInterval: use4h
          ? '240'
          : yahooToReturnedCode(yi) || yPlan.returnedInterval || String(normalizedUserInterval),
        intervalSubstituted: Boolean(
          !use4h && yahooToReturnedCode(yi) && yahooToReturnedCode(yi) !== String(normalizedUserInterval)
        ),
      };
      if (ab >= 2) {
        return meta;
      }
      if (!best || ab > (best.bars && best.bars.length ? best.bars.length : 0)) {
        best = meta;
      }
    }
  }
  if (best) return best;
  const last = await fetchYahooChartBarsOnce(yahooSymbol, yPlan.interval, yPlan.range);
  return {
    ...last,
    yahooRangeUsed: yPlan.range,
    yahooIntervalUsed: yPlan.interval,
    fourHourAggregated: false,
    returnedInterval: yPlan.returnedInterval || String(normalizedUserInterval),
  };
}

function twelveBarToUnified(bar) {
  const tRaw = bar?.datetime;
  const ms = tRaw ? Date.parse(String(tRaw).replace(' ', 'T')) : NaN;
  const t = Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  if (!Number.isFinite(t)) return null;
  const o = Number(bar.open);
  const h = Number(bar.high);
  const l = Number(bar.low);
  const c = Number(bar.close);
  if (![o, h, l, c].every((x) => Number.isFinite(x))) return null;
  return { time: t, open: o, high: Math.max(h, l, o, c), low: Math.min(h, l, o, c), close: c };
}

async function fetchTwelveDataBars({ symbol, interval, outputsize, from, to, apikey, rangeHint = '3M' }) {
  const params = buildTwelveTimeSeriesParams({
    symbol,
    interval,
    outputsize,
    from,
    to,
    apikey,
    timezone: isIntradayInterval(interval) ? 'UTC' : '',
  });
  const key = cacheKey(`TD:${symbol}`, interval, JSON.stringify({ outputsize, from: params.start_date || '', to: params.end_date || '' }));
  const hit = responseCache.get(key);
  const ttlMs = ttlByIntervalMs(interval, rangeHint);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.payload;
  }
  const inFlightKey = `td:${key}`;
  const pending = inFlight.get(inFlightKey);
  if (pending) {
    const out = await pending;
    return { ...out, inFlightDeduped: true, providerCallMade: false };
  }
  const run = (async () => {
    const budget = reserveTwelveCallBudget(1);
    bumpProviderCall('twelvedata');
    const response = await axios.get(TWELVE_BASE, {
      params,
      timeout: REQUEST_TIMEOUT,
      headers: { Accept: 'application/json' },
    });
    const status = response.status ?? 200;
    const values = Array.isArray(response.data?.values) ? response.data.values : [];
    const bars = values.map(twelveBarToUnified).filter(Boolean).sort((a, b) => a.time - b.time);
    if (response.data?.status === 'error') {
      const msg = String(response.data?.message || 'Twelve Data error');
      const err = new Error(msg);
      err.code = /rate|quota|limit|429/i.test(msg) ? 'TD_RATE_LIMIT' : 'TD_ERROR';
      throw err;
    }
    const payload = {
      bars,
      requestUrl: `${TWELVE_BASE}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
      responseStatus: status,
      tdCreditsUsed: Number(response.headers?.['api-credits-used'] || 0),
      tdCreditsLeft: Number(response.headers?.['api-credits-left'] || 0),
      cacheHit: false,
      cacheTtlMs: ttlMs,
      inFlightDeduped: false,
      providerCallMade: true,
      twelveCallsThisMinute: budget.twelveCallsThisMinute,
      twelveBudgetRemaining: budget.twelveBudgetRemaining,
    };
    responseCache.set(key, { at: Date.now(), payload });
    return payload;
  })();
  inFlight.set(inFlightKey, run);
  try {
    return await run;
  } finally {
    inFlight.delete(inFlightKey);
  }
}

function mergeBarsAscendingDedupe(chunks) {
  const byTime = new Map();
  for (const part of chunks || []) {
    for (const bar of part || []) {
      const t = Number(bar?.time);
      if (!Number.isFinite(t)) continue;
      byTime.set(t, bar);
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function pricePrecisionForSymbol(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (/JPY/.test(s)) return 3;
  if (/^(EUR|GBP|AUD|NZD|USD|CHF|CAD)[A-Z]{3}$/.test(s)) return 5;
  return 2;
}

function sanitizeBarsForScale(bars, canonical) {
  const list = Array.isArray(bars) ? bars : [];
  const out = [];
  let removedInvalidBars = 0;
  let removedOutlierBars = 0;
  const closes = [];
  const c = String(canonical || '').toUpperCase();
  const isFx = /^[A-Z]{6}$/.test(c);
  const isJpyFx = isFx && /JPY/.test(c);
  const isCrypto = /^(BTC|ETH|SOL|ADA|XRP|LTC|DOGE)/.test(c);

  for (const b of list) {
    const t = Number(b?.time);
    const o = Number(b?.open);
    const h = Number(b?.high);
    const l = Number(b?.low);
    const cl = Number(b?.close);
    if (![t, o, h, l, cl].every(Number.isFinite) || l <= 0 || h <= 0 || o <= 0 || cl <= 0 || h < l) {
      removedInvalidBars += 1;
      continue;
    }
    if (isFx && !isJpyFx) {
      if (h > 20 || l < 0.00001) {
        removedOutlierBars += 1;
        continue;
      }
    }
    if (isJpyFx && (h > 1000 || l < 0.01)) {
      removedOutlierBars += 1;
      continue;
    }
    if (isCrypto && h < 1) {
      removedOutlierBars += 1;
      continue;
    }
    closes.push(cl);
    out.push({ time: t, open: o, high: h, low: l, close: cl });
  }

  if (closes.length > 20) {
    const sorted = [...closes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const maxRatio = isFx ? 10 : isCrypto ? 80 : 25;
    const filtered = [];
    for (const b of out) {
      if (median > 0 && (b.high / median > maxRatio || median / b.low > maxRatio)) {
        removedOutlierBars += 1;
        continue;
      }
      filtered.push(b);
    }
    return { bars: filtered, removedInvalidBars, removedOutlierBars };
  }
  return { bars: out, removedInvalidBars, removedOutlierBars };
}

function intervalWindowSeconds(interval) {
  const iv = String(interval || '').toLowerCase();
  if (iv === '1min') return 14 * 86400;
  if (iv === '15min') return 90 * 86400;
  if (iv === '1h') return 365 * 86400;
  if (iv === '4h') return 4 * 365 * 86400;
  if (iv === '1day') return 8 * 365 * 86400;
  if (iv === '1week') return 20 * 365 * 86400;
  if (iv === '1month') return 50 * 365 * 86400;
  return 365 * 86400;
}

async function fetchTwelveDataBarsPaged({ symbol, interval, from, to, apikey, maxChunks = TD_DEFAULT_MAX_CHUNKS }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = Number.isFinite(from) ? from : nowSec - 50 * 366 * 86400;
  const endSec = Number.isFinite(to) ? to : nowSec;
  if (endSec <= startSec) {
    return { bars: [], chunksFetched: 0, providerLimitHit: false, requestUrl: '', responseStatus: 200 };
  }
  const windowSec = intervalWindowSeconds(interval);
  const barsByChunk = [];
  let chunksFetched = 0;
  let providerLimitHit = false;
  let requestUrl = '';
  let responseStatus = 200;
  let creditsUsed = 0;
  let creditsLeft = 0;
  let chunkCapHit = false;
  for (let cursor = startSec; cursor <= endSec; cursor += windowSec) {
    if (chunksFetched >= maxChunks) {
      chunkCapHit = true;
      break;
    }
    const chunkFrom = cursor;
    const chunkTo = Math.min(endSec, cursor + windowSec);
    const out = await fetchTwelveDataBars({
      symbol,
      interval,
      outputsize: TD_PAGE_SIZE,
      from: chunkFrom,
      to: chunkTo,
      apikey,
      rangeHint: '50Y',
    });
    const list = Array.isArray(out.bars) ? out.bars : [];
    if (list.length >= TD_PAGE_SIZE - 5) providerLimitHit = true;
    barsByChunk.push(list);
    chunksFetched += 1;
    requestUrl = out.requestUrl || requestUrl;
    responseStatus = out.responseStatus ?? responseStatus;
    creditsUsed = out.tdCreditsUsed ?? creditsUsed;
    creditsLeft = out.tdCreditsLeft ?? creditsLeft;
  }
  return {
    bars: mergeBarsAscendingDedupe(barsByChunk),
    chunksFetched,
    chunkSize: TD_PAGE_SIZE,
    providerLimitHit,
    chunkCapHit,
    requestUrl,
    responseStatus,
    tdCreditsUsed: creditsUsed,
    tdCreditsLeft: creditsLeft,
    cacheHit: false,
    cacheTtlMs: ttlByIntervalMs(interval, '50Y'),
    inFlightDeduped: false,
    providerCallMade: true,
  };
}

async function fetchTwelveApiUsage(apikey) {
  const key = 'TD:api_usage';
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < TD_USAGE_TTL_MS) return hit.payload;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = (async () => {
    reserveTwelveCallBudget(1);
    bumpProviderCall('twelvedata');
    const response = await axios.get('https://api.twelvedata.com/api_usage', {
      params: { apikey, format: 'JSON', timezone: 'UTC' },
      timeout: REQUEST_TIMEOUT,
      headers: { Accept: 'application/json' },
    });
    const body = response.data || {};
    const payload = {
      timestamp: body.timestamp || null,
      currentUsage: Number(body.current_usage || 0),
      planLimit: Number(body.plan_limit || 0),
      planCategory: body.plan_category || '',
    };
    responseCache.set(key, { at: Date.now(), payload });
    return payload;
  })();
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

function buildDiagnostics(base) {
  return {
    requestSymbol: base.requestSymbol,
    canonical: base.canonical,
    yahooSymbol: base.yahooSymbol,
    twelveDataSymbol: base.twelveDataSymbol || '',
    selectedProvider: base.selectedProvider || '',
    provider: base.selectedProvider || '',
    providerSymbol: base.providerSymbol || '',
    fallbackProvider: base.fallbackProvider || '',
    providerUsed: base.providerUsed || '',
    fallbackReason: base.fallbackReason || '',
    requestedInterval: base.requestedInterval,
    effectiveInterval: base.effectiveInterval || '',
    returnedInterval: base.returnedInterval || '',
    requestedRange: base.requestedRange || '',
    effectiveRange: base.effectiveRange || '',
    requestedFrom: base.requestedFrom != null ? base.requestedFrom : null,
    requestedTo: base.requestedTo != null ? base.requestedTo : null,
    yahooFetchInterval: base.yahooFetchInterval,
    yahooRange: base.yahooRange,
    fourHourAggregated: Boolean(base.fourHourAggregated),
    requestUrl: base.requestUrl || '',
    responseStatus: base.responseStatus != null ? base.responseStatus : null,
    barCount: base.barCount != null ? base.barCount : 0,
    firstBarTime: base.firstBarTime != null ? base.firstBarTime : null,
    lastBarTime: base.lastBarTime != null ? base.lastBarTime : null,
    error: base.error || undefined,
    yahooRangeDowngraded: base.yahooRangeDowngraded,
    intervalCoarsened: base.intervalCoarsened,
    intervalSubstituted: base.intervalSubstituted,
    rangeDowngrade: base.rangeDowngrade,
    requestedOutputSize: base.requestedOutputSize != null ? base.requestedOutputSize : null,
    returnedBarCount: base.returnedBarCount != null ? base.returnedBarCount : 0,
    chunksFetched: base.chunksFetched != null ? base.chunksFetched : 0,
    chunkSize: base.chunkSize != null ? base.chunkSize : null,
    minBarsWanted: base.minBarsWanted != null ? base.minBarsWanted : null,
    providerLimitHit: Boolean(base.providerLimitHit),
    twelveBudgetRemaining: base.twelveBudgetRemaining != null ? base.twelveBudgetRemaining : null,
    twelveCallsThisMinute: base.twelveCallsThisMinute != null ? base.twelveCallsThisMinute : null,
    twelveCallSkippedDueToBudget: Boolean(base.twelveCallSkippedDueToBudget),
    twelveDataCreditsUsed: base.twelveDataCreditsUsed != null ? base.twelveDataCreditsUsed : null,
    twelveDataCreditsLeft: base.twelveDataCreditsLeft != null ? base.twelveDataCreditsLeft : null,
    twelveDataApiUsage: base.twelveDataApiUsage || null,
    cacheHit: Boolean(base.cacheHit),
    cacheTtlMs: base.cacheTtlMs != null ? base.cacheTtlMs : null,
    inFlightDeduped: Boolean(base.inFlightDeduped),
    providerCallMade: Boolean(base.providerCallMade),
    removedInvalidBars: base.removedInvalidBars != null ? base.removedInvalidBars : 0,
    removedOutlierBars: base.removedOutlierBars != null ? base.removedOutlierBars : 0,
    pricePrecision: base.pricePrecision != null ? base.pricePrecision : null,
    priceScaleMode: base.priceScaleMode || 'auto',
    providerCallCounts: {
      yahoo: providerCallCounts.get('yahoo') || 0,
      twelvedata: providerCallCounts.get('twelvedata') || 0,
    },
  };
}

function resolveChartYahooSymbol(symbolInput) {
  const canonical = resolveCanonicalFromInput(symbolInput);
  if (!canonical) return { canonical: '', yahoo: '' };
  const yahoo = yahooSymbolForCanonical(canonical);
  return { canonical, yahoo };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      diagnostics: buildDiagnostics({
        requestSymbol: String(req.query.symbol || ''),
        canonical: '',
        yahooSymbol: '',
        requestedInterval: String(req.query.interval || ''),
        yahooFetchInterval: '',
        yahooRange: '',
        fourHourAggregated: false,
        requestUrl: '',
        responseStatus: 405,
        barCount: 0,
        firstBarTime: null,
        lastBarTime: null,
        error: 'Method not allowed',
      }),
    });
  }

  const symbol = String(req.query.symbol || '').trim();
  if (!symbol) {
    return res.status(400).json({
      success: false,
      message: 'symbol query parameter is required',
      diagnostics: buildDiagnostics({
        requestSymbol: '',
        canonical: '',
        yahooSymbol: '',
        requestedInterval: String(req.query.interval || ''),
        yahooFetchInterval: '',
        yahooRange: '',
        fourHourAggregated: false,
        requestUrl: '',
        responseStatus: 400,
        barCount: 0,
        firstBarTime: null,
        lastBarTime: null,
        error: 'Missing symbol',
      }),
    });
  }

  const intervalParam = req.query.interval != null ? String(req.query.interval) : '60';
  const requestedInterval = normalizeInterval(intervalParam);
  const hasRangeQuery = req.query.range != null && String(req.query.range).trim() !== '';
  const autoRange = defaultRangeForInterval(requestedInterval);
  const requestedRange = normalizeRange(hasRangeQuery ? String(req.query.range) : autoRange, autoRange);
  const coercion = coerceIntervalForRange(requestedInterval, requestedRange);
  const normalizedInterval = coercion.effectiveInterval;
  const normalizedRange = coercion.effectiveRange;
  let requestedFrom = parseMaybeDate(req.query.from);
  let requestedTo = parseMaybeDate(req.query.to);
  if (!Number.isFinite(requestedFrom) && !Number.isFinite(requestedTo) && (normalizedRange === '5Y' || normalizedRange === '10Y' || normalizedRange === '20Y' || normalizedRange === '50Y')) {
    requestedTo = Math.floor(Date.now() / 1000);
    requestedFrom = rangeStartUnix(normalizedRange, requestedTo);
  }
  const twKey = String(process.env.TWELVE_DATA_API_KEY || '').trim();
  const wantDiagnostics = String(req.query.diagnostics || '').trim() === '1';
  const plan = planWithoutTwelve(
    providerPlan({ interval: normalizedInterval, range: normalizedRange, from: requestedFrom, to: requestedTo }),
    Boolean(twKey)
  );

  let canonical;
  let yahoo;
  let twelveDataSymbol;
  try {
    ({ canonical, yahoo } = resolveChartYahooSymbol(symbol));
    twelveDataSymbol = twelveDataSymbolForCanonical(canonical);
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: 'Invalid symbol',
      detail: String(e.message || e),
      diagnostics: buildDiagnostics({
        requestSymbol: symbol,
        canonical: '',
        yahooSymbol: '',
        requestedInterval: intervalParam,
        returnedInterval: normalizedInterval,
        requestedRange,
        requestedFrom,
        requestedTo,
        yahooFetchInterval: '',
        yahooRange: '',
        fourHourAggregated: false,
        requestUrl: '',
        responseStatus: 400,
        barCount: 0,
        firstBarTime: null,
        lastBarTime: null,
        error: String(e.message || e),
      }),
    });
  }

  const yPlan = yahooRangeParams({ interval: normalizedInterval, range: normalizedRange });
  const tPlan = twelveDataParams({ interval: normalizedInterval, range: normalizedRange, from: requestedFrom, to: requestedTo });
  const requestUrl = buildChartRequestUrl(yahoo, yPlan.interval, yPlan.range);
  const responseTtlMs = ttlByIntervalMs(normalizedInterval, normalizedRange);
  const responseKeyAuto = makeResponseKey({
    requestSymbol: symbol,
    canonical,
    interval: normalizedInterval,
    range: normalizedRange,
    from: requestedFrom,
    to: requestedTo,
    provider: 'auto',
  });
  const responseHit = responseCache.get(responseKeyAuto);
  if (responseHit && Date.now() - responseHit.at < responseTtlMs) {
    return res.status(200).json({
      ...responseHit.payload,
      diagnostics: {
        ...(responseHit.payload.diagnostics || {}),
        cacheHit: true,
        cacheTtlMs: responseTtlMs,
        inFlightDeduped: false,
        providerCallMade: false,
      },
    });
  }

  if (!yahoo) {
    return res.status(400).json({
      success: false,
      message: 'Could not resolve symbol for chart data',
      canonical,
      diagnostics: buildDiagnostics({
        requestSymbol: symbol,
        canonical,
        yahooSymbol: '',
        requestedInterval: intervalParam,
        returnedInterval: normalizedInterval,
        requestedRange,
        requestedFrom,
        requestedTo,
        yahooFetchInterval: yPlan.interval,
        yahooRange: yPlan.range,
        fourHourAggregated: yPlan.aggregateTo4h,
        requestUrl,
        responseStatus: 400,
        barCount: 0,
        firstBarTime: null,
        lastBarTime: null,
        error: 'Unresolved yahoo symbol',
      }),
    });
  }

  async function fetchProvider(provider) {
    if (provider === 'yahoo') {
      const out = await fetchYahooChartBars(yahoo, yPlan, normalizedInterval, normalizedRange);
      const budget = currentTwelveBudgetState();
      return {
        provider,
        bars: out.bars || [],
        requestUrl: out.requestUrl,
        responseStatus: out.responseStatus,
        returnedInterval: out.returnedInterval || yPlan.returnedInterval,
        fourHourAggregated: Boolean(out.fourHourAggregated),
        yahooFetchInterval: out.yahooIntervalUsed || yPlan.interval,
        yahooRange: out.yahooRangeUsed || yPlan.range,
        cacheHit: out.cacheHit,
        cacheTtlMs: out.cacheTtlMs,
        inFlightDeduped: out.inFlightDeduped,
        providerCallMade: out.providerCallMade,
        yahooRangeDowngraded: out.yahooRangeDowngraded,
        intervalCoarsened: out.intervalCoarsened,
        intervalSubstituted: out.intervalSubstituted,
        chunksFetched: 1,
        chunkSize: null,
        providerLimitHit: false,
        requestedOutputSize: null,
        twelveDataCreditsUsed: out.tdCreditsUsed ?? null,
        twelveDataCreditsLeft: out.tdCreditsLeft ?? null,
        twelveCallsThisMinute: budget.twelveCallsThisMinute,
        twelveBudgetRemaining: budget.twelveBudgetRemaining,
      };
    }
    if (!twKey) throw new Error('TWELVE_DATA_API_KEY is required for Twelve Data provider');
    const longRange = normalizedRange === '5Y' || normalizedRange === '10Y' || normalizedRange === '20Y' || normalizedRange === '50Y';
    const usePaged = Number.isFinite(requestedFrom) || longRange;
    const maxChunks = normalizedRange === '50Y' || Number.isFinite(requestedFrom) ? TD_DEEP_MAX_CHUNKS : TD_DEFAULT_MAX_CHUNKS;
    let out = usePaged
      ? await fetchTwelveDataBarsPaged({
          symbol: twelveDataSymbol,
          interval: tPlan.interval,
          from: requestedFrom,
          to: requestedTo,
          apikey: twKey,
          maxChunks,
        })
      : await fetchTwelveDataBars({
          symbol: twelveDataSymbol,
          interval: tPlan.interval,
          outputsize: Math.min(TD_MAX_OUTPUT, tPlan.outputsize),
          from: requestedFrom,
          to: requestedTo,
          apikey: twKey,
          rangeHint: normalizedRange,
        });
    let bars = out.bars || [];
    let returnedInterval = tPlan.returnedInterval;
    let providerLimitHit = out.providerLimitHit || out.chunkCapHit || false;
    let fallbackReason = out.chunkCapHit ? 'chunk_limit_reached' : '';
    if (normalizedInterval === '1D' && longRange && bars.length < 1200) {
      try {
        const outW = await fetchTwelveDataBarsPaged({
          symbol: twelveDataSymbol,
          interval: '1week',
          from: requestedFrom,
          to: requestedTo,
          apikey: twKey,
          maxChunks,
        });
        if ((outW.bars || []).length > bars.length) {
          out = outW;
          bars = outW.bars || [];
          returnedInterval = '1W';
          providerLimitHit = outW.providerLimitHit || providerLimitHit;
        }
      } catch {
        /* keep daily result */
      }
    }
    if (normalizedInterval === '1D' && longRange && bars.length < 300) {
      try {
        const outM = await fetchTwelveDataBarsPaged({
          symbol: twelveDataSymbol,
          interval: '1month',
          from: requestedFrom,
          to: requestedTo,
          apikey: twKey,
          maxChunks,
        });
        if ((outM.bars || []).length > bars.length) {
          out = outM;
          bars = outM.bars || [];
          returnedInterval = '1M';
          providerLimitHit = outM.providerLimitHit || providerLimitHit;
        }
      } catch {
        /* keep prior result */
      }
    }
    if (normalizedInterval === '240' && tPlan.interval === '4h' && bars.length < 2) {
      const hPlan = { ...tPlan, interval: '1h', aggregateTo4h: true, returnedInterval: '240' };
      const out2 = await fetchTwelveDataBars({
        symbol: twelveDataSymbol,
        interval: hPlan.interval,
        outputsize: Math.min(TD_MAX_OUTPUT, desiredTwelveOutputsize('240', normalizedRange, requestedFrom, requestedTo)),
        from: requestedFrom,
        to: requestedTo,
        apikey: twKey,
        rangeHint: normalizedRange,
      });
      if ((out2.bars || []).length >= 1) {
        out = out2;
        bars = aggregateHourlyToFourHour(out2.bars);
        return {
          provider,
          bars,
          requestUrl: out2.requestUrl,
          responseStatus: out2.responseStatus,
          returnedInterval: '240',
          fourHourAggregated: true,
          yahooFetchInterval: '',
          yahooRange: '',
          cacheHit: out2.cacheHit,
          cacheTtlMs: out2.cacheTtlMs,
          inFlightDeduped: out2.inFlightDeduped,
          providerCallMade: out2.providerCallMade,
          twelve4hTo1hFallback: true,
          requestedOutputSize: Math.min(TD_MAX_OUTPUT, desiredTwelveOutputsize('240', normalizedRange, requestedFrom, requestedTo)),
          twelveDataCreditsUsed: out2.tdCreditsUsed ?? null,
          twelveDataCreditsLeft: out2.tdCreditsLeft ?? null,
        };
      }
    }
    return {
      provider,
      bars: tPlan.aggregateTo4h ? aggregateHourlyToFourHour(bars) : bars,
      requestUrl: out.requestUrl,
      responseStatus: out.responseStatus,
      returnedInterval,
      fourHourAggregated: tPlan.aggregateTo4h,
      yahooFetchInterval: '',
      yahooRange: '',
      cacheHit: out.cacheHit,
      cacheTtlMs: out.cacheTtlMs,
      inFlightDeduped: out.inFlightDeduped,
      providerCallMade: out.providerCallMade,
      chunksFetched: out.chunksFetched || 1,
      chunkSize: out.chunkSize || null,
      providerLimitHit,
      fallbackReason,
      twelveCallsThisMinute: out.twelveCallsThisMinute ?? null,
      twelveBudgetRemaining: out.twelveBudgetRemaining ?? null,
      requestedOutputSize: Math.min(TD_MAX_OUTPUT, tPlan.outputsize),
      twelveDataCreditsUsed: out.tdCreditsUsed ?? null,
      twelveDataCreditsLeft: out.tdCreditsLeft ?? null,
    };
  }

  await withChartBuildLock(responseKeyAuto, async () => {
    const hitInside = responseCache.get(responseKeyAuto);
    if (hitInside && Date.now() - hitInside.at < responseTtlMs) {
      return res.status(200).json({
        ...hitInside.payload,
        diagnostics: {
          ...(hitInside.payload.diagnostics || {}),
          cacheHit: true,
          cacheTtlMs: responseTtlMs,
          inFlightDeduped: false,
          providerCallMade: false,
          chartBuildLockWait: true,
        },
      });
    }

    let selected = plan.prefer;
    let fallbackUsed = '';
    let providerError = '';
    let fallbackReason = '';
    let twelveCallSkippedDueToBudget = false;
    try {
      let fetched;
      try {
        fetched = await fetchProvider(plan.prefer);
      } catch (primaryErr) {
        providerError = String(primaryErr.message || primaryErr);
        if (primaryErr?.code === 'TD_BUDGET_EXCEEDED') {
          twelveCallSkippedDueToBudget = true;
          fallbackReason = 'twelve_budget_exceeded';
        }
        fetched = await fetchProvider(plan.fallback);
        selected = plan.fallback;
        fallbackUsed = plan.prefer;
      }

      let bars = fetched.bars || [];
    if (fetched.fourHourAggregated) {
      const aggKey = cacheKey(selected === 'yahoo' ? yahoo : twelveDataSymbol, normalizedInterval, normalizedRange, 'agg4h');
      const sourceFresh = bars;
      const aggHit = responseCache.get(aggKey);
      const aggTtlMs = ttlByIntervalMs(normalizedInterval, normalizedRange);
      if (aggHit && Date.now() - aggHit.at < aggTtlMs) {
        bars = aggHit.bars;
      } else {
        bars = sourceFresh;
        responseCache.set(aggKey, { at: Date.now(), bars });
      }
    }

    const sanitized = sanitizeBarsForScale(bars, canonical);
    bars = sanitized.bars;
    const barCount = bars.length;
    const minBarsWanted = computeMinBarsWanted(normalizedInterval, normalizedRange);
    const firstBarTime = barCount ? bars[0].time : null;
    const lastBarTime = barCount ? bars[barCount - 1].time : null;
    const requestedOutputSize = Number.isFinite(Number(fetched.requestedOutputSize)) ? Number(fetched.requestedOutputSize) : null;
    const providerLimitHit = Boolean(
      fetched.providerLimitHit ||
      (selected === 'twelvedata' &&
        requestedOutputSize != null &&
        requestedOutputSize >= TD_MAX_OUTPUT &&
        barCount < minBarsWanted)
    );

    const diagnostics = buildDiagnostics({
      requestSymbol: symbol,
      canonical,
      yahooSymbol: yahoo,
      twelveDataSymbol,
      selectedProvider: selected,
      fallbackProvider: fallbackUsed,
      providerUsed: selected,
      fallbackReason: fetched.fallbackReason || fallbackReason,
      requestedInterval: intervalParam,
      effectiveInterval: normalizedInterval,
      returnedInterval: fetched.returnedInterval,
      requestedRange,
      effectiveRange: normalizedRange,
      requestedFrom,
      requestedTo,
      yahooFetchInterval: fetched.yahooFetchInterval,
      yahooRange: fetched.yahooRange,
      fourHourAggregated: fetched.fourHourAggregated,
      requestUrl: fetched.requestUrl,
      responseStatus: fetched.responseStatus,
      barCount,
      firstBarTime,
      lastBarTime,
      error: providerError || undefined,
      yahooRangeDowngraded: fetched.yahooRangeDowngraded,
      intervalCoarsened: fetched.intervalCoarsened,
      intervalSubstituted: fetched.intervalSubstituted,
      rangeDowngrade: coercion.autoAdjusted ? { note: coercion.note } : undefined,
      requestedOutputSize,
      returnedBarCount: barCount,
      minBarsWanted,
      providerLimitHit,
      twelveBudgetRemaining: fetched.twelveBudgetRemaining ?? currentTwelveBudgetState().twelveBudgetRemaining,
      twelveCallsThisMinute: fetched.twelveCallsThisMinute ?? currentTwelveBudgetState().twelveCallsThisMinute,
      twelveCallSkippedDueToBudget,
      chunksFetched: fetched.chunksFetched || 0,
      chunkSize: fetched.chunkSize || null,
      providerSymbol: selected === 'twelvedata' ? twelveDataSymbol : yahoo,
      twelveDataCreditsUsed: fetched.twelveDataCreditsUsed ?? null,
      twelveDataCreditsLeft: fetched.twelveDataCreditsLeft ?? null,
      cacheHit: fetched.cacheHit,
      cacheTtlMs: fetched.cacheTtlMs,
      inFlightDeduped: fetched.inFlightDeduped,
      providerCallMade: fetched.providerCallMade,
      removedInvalidBars: sanitized.removedInvalidBars,
      removedOutlierBars: sanitized.removedOutlierBars,
      pricePrecision: pricePrecisionForSymbol(canonical),
      priceScaleMode: 'auto',
    });
    if (wantDiagnostics && twKey && (selected === 'twelvedata' || fallbackUsed === 'twelvedata')) {
      try {
        diagnostics.twelveDataApiUsage = await fetchTwelveApiUsage(twKey);
      } catch (e) {
        diagnostics.twelveDataApiUsage = { error: String(e.message || e) };
      }
    }

    if (barCount < 2) {
      const payload = {
        success: false,
        message: 'Not enough chart data for this symbol yet.',
        canonical,
        yahooSymbol: yahoo,
        twelveDataSymbol,
        bars,
        diagnostics,
        source: selected,
        delayed: true,
      };
      responseCache.set(responseKeyAuto, { at: Date.now(), payload });
      responseCache.set(
        makeResponseKey({
          requestSymbol: symbol,
          canonical,
          interval: normalizedInterval,
          range: normalizedRange,
          from: requestedFrom,
          to: requestedTo,
          provider: selected,
        }),
        { at: Date.now(), payload }
      );
      return res.status(200).json(payload);
    }

    const payload = {
      success: true,
      canonical,
      yahooSymbol: yahoo,
      twelveDataSymbol,
      interval: normalizedInterval,
      range: normalizedRange,
      from: requestedFrom,
      to: requestedTo,
      returnedInterval: fetched.returnedInterval,
      yahooFetchInterval: fetched.yahooFetchInterval,
      yahooRange: fetched.yahooRange,
      fourHourAggregated: fetched.fourHourAggregated,
      bars,
      source: selected,
      delayed: true,
      diagnostics,
    };
    responseCache.set(responseKeyAuto, { at: Date.now(), payload });
    responseCache.set(
      makeResponseKey({
        requestSymbol: symbol,
        canonical,
        interval: normalizedInterval,
        range: normalizedRange,
        from: requestedFrom,
        to: requestedTo,
        provider: selected,
      }),
      { at: Date.now(), payload }
    );
      return res.status(200).json(payload);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.code === 'ECONNABORTED' || err.name === 'AbortError' ? 'Chart request timed out' : err.message;
      console.error('[chart-history]', symbol, yahoo, msg);
      const budget = currentTwelveBudgetState();
      const diagnostics = buildDiagnostics({
        requestSymbol: symbol,
        canonical,
        yahooSymbol: yahoo,
        twelveDataSymbol,
        selectedProvider: plan.prefer,
        fallbackProvider: plan.fallback,
        requestedInterval: intervalParam,
        returnedInterval: normalizedInterval,
        requestedRange,
        requestedFrom,
        requestedTo,
        yahooFetchInterval: yPlan.interval,
        yahooRange: yPlan.range,
        fourHourAggregated: yPlan.aggregateTo4h,
        requestUrl,
        responseStatus: status != null ? status : 502,
        barCount: 0,
        firstBarTime: null,
        lastBarTime: null,
        error: msg || 'Chart data fetch failed',
        providerUsed: plan.prefer,
        fallbackReason: err?.code === 'TD_BUDGET_EXCEEDED' ? 'twelve_budget_exceeded' : '',
        twelveCallSkippedDueToBudget: err?.code === 'TD_BUDGET_EXCEEDED',
        twelveBudgetRemaining: budget.twelveBudgetRemaining,
        twelveCallsThisMinute: budget.twelveCallsThisMinute,
        rangeDowngrade: { providerHttpStatus: status, note: 'Chart fetch failed; response uses HTTP 200 for recoverable provider errors' },
      });
      return res.status(200).json({
        success: false,
        message: msg || 'Chart data fetch failed',
        canonical,
        yahooSymbol: yahoo,
        diagnostics,
      });
    }
  });
};

module.exports.resolveChartYahooSymbol = resolveChartYahooSymbol;
module.exports.yahooRangeParams = yahooRangeParams;
module.exports.resolveCanonicalFromInput = resolveCanonicalFromInput;
module.exports.aggregateHourlyToFourHour = aggregateHourlyToFourHour;
module.exports.fourHourBucketStart = fourHourBucketStart;
module.exports.normalizeInterval = normalizeInterval;
module.exports.normalizeRange = normalizeRange;
module.exports.providerPlan = providerPlan;
module.exports.twelveDataSymbolForCanonical = twelveDataSymbolForCanonical;
module.exports.twelveDataParams = twelveDataParams;
module.exports.computeMinBarsWanted = computeMinBarsWanted;
module.exports.desiredTwelveOutputsize = desiredTwelveOutputsize;
module.exports.buildTwelveTimeSeriesParams = buildTwelveTimeSeriesParams;
module.exports.isIntradayInterval = isIntradayInterval;
module.exports.coerceIntervalForRange = coerceIntervalForRange;
module.exports.rangeToDays = rangeToDays;
module.exports.mergeBarsAscendingDedupe = mergeBarsAscendingDedupe;
module.exports.currentTwelveBudgetState = currentTwelveBudgetState;
module.exports.reserveTwelveCallBudget = reserveTwelveCallBudget;
module.exports.__resetTwelveBudgetForTests = () => {
  twelveUsageWindow.minuteStart = Date.now();
  twelveUsageWindow.calls = 0;
};
module.exports.ttlByIntervalMs = ttlByIntervalMs;
