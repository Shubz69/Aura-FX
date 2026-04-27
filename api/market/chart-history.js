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
const TD_USAGE_TTL_MS = 5 * 60_000;
const responseCache = new Map();
const inFlight = new Map();
const providerCallCounts = new Map();
const VALID_INTERVALS = new Set(['1', '15', '60', '240', '1D', 'D']);
const VALID_RANGES = new Set(['1D', '1W', '1M', '3M', '6M', '1Y']);
const TWELVE_BASE = 'https://api.twelvedata.com/time_series';

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
  if (raw === 'D') return '1D';
  return VALID_INTERVALS.has(raw) ? raw : '60';
}

function normalizeRange(input) {
  const raw = String(input || '3M').toUpperCase();
  return VALID_RANGES.has(raw) ? raw : '3M';
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
    default:
      return 92 * 24;
  }
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
    default:
      return '3mo';
  }
}

const TD_MAX_OUTPUT = 5000;

const YAHOO_RANGE_LADDER = ['1d', '5d', '7d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'];

function computeMinBarsWanted(interval, range) {
  const i = normalizeInterval(interval);
  const rr = normalizeRange(range);
  const days = { '1D': 1, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366 }[rr] || 31;
  if (i === '1') return Math.min(1500, Math.max(300, Math.floor(days * 24 * 60 * 0.6)));
  if (i === '15') return Math.max(1000, Math.floor((days * 24 * 60) / 15 * 0.7));
  if (i === '60') return rr === '3M' ? 1500 : Math.max(900, Math.floor(days * 24 * 0.8));
  if (i === '240') return rr === '1Y' ? 1000 : Math.max(400, Math.floor((days * 24 * 0.55) / 4));
  if (i === '1D') return rr === '1Y' ? 250 : Math.max(90, Math.floor(days * 0.9));
  return 80;
}

function desiredTwelveOutputsize(interval, range, from, to) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (Number.isFinite(from) || Number.isFinite(to)) {
    return TD_MAX_OUTPUT;
  }
  const d = { '1D': 1, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366 }[rr] || 31;
  if (r === '1') return Math.min(TD_MAX_OUTPUT, Math.max(900, Math.ceil(d * 24 * 60 * 0.5)));
  if (r === '15') return Math.min(TD_MAX_OUTPUT, Math.max(500, Math.ceil((d * 24 * 60) / 15)));
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
  if (u === '5m' || u === '15m' || u === '30m') return '15';
  if (u === '60m' || u === '1h') return '60';
  if (u === '1d' || u === '5d' || u === '1wk' || u === '1mo') return '1D';
  return '60';
}

function providerPlan({ interval, range, from, to }) {
  const hasDateWindow = Number.isFinite(from) || Number.isFinite(to);
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (r === '1' || hasDateWindow) {
    return { prefer: 'twelvedata', fallback: 'yahoo', hasDateWindow };
  }
  const intraday = r === '1' || r === '15' || r === '60' || r === '240';
  const deep = rr === '1M' || rr === '3M' || rr === '6M' || rr === '1Y';
  if (intraday && deep) {
    return { prefer: 'twelvedata', fallback: 'yahoo', hasDateWindow: false };
  }
  return { prefer: 'yahoo', fallback: 'twelvedata', hasDateWindow: false };
}

function planWithoutTwelve(plan, hasTwKey) {
  if (hasTwKey) return plan;
  return { prefer: 'yahoo', fallback: 'yahoo', hasDateWindow: plan.hasDateWindow };
}

function yahooRangeParams({ interval, range }) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (r === '1D') {
    return { interval: '1d', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '1D' };
  }
  if (r === '240') {
    return { interval: '1h', range: toYahooRange(rr), aggregateTo4h: true, returnedInterval: '240' };
  }
  if (r === '1') {
    const range1m = rr === '1D' ? '1d' : rr === '1W' ? '5d' : '7d';
    return { interval: '1m', range: range1m, aggregateTo4h: false, returnedInterval: '1' };
  }
  if (r === '15') {
    return { interval: '15m', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '15' };
  }
  return { interval: '1h', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '60' };
}

function twelveDataParams({ interval, range, from, to }) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  const cap = (n) => Math.min(TD_MAX_OUTPUT, Math.max(1, n));
  const hasDateWindow = Number.isFinite(from) || Number.isFinite(to);
  const deepIntraday = rr === '1M' || rr === '3M' || rr === '6M' || rr === '1Y';
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
  if (r === '15') {
    const out = hasDateWindow || deepIntraday ? TD_MAX_OUTPUT : desiredTwelveOutputsize('15', rr, from, to);
    return { interval: '15min', aggregateTo4h: false, outputsize: cap(out), returnedInterval: '15' };
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

function ttlByIntervalMs(interval) {
  const i = normalizeInterval(interval);
  if (i === '1') return 20_000;
  if (i === '15') return 90_000;
  if (i === '60') return 7 * 60_000;
  if (i === '240') return 20 * 60_000;
  return 3 * 60 * 60_000;
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

async function fetchTwelveDataBars({ symbol, interval, outputsize, from, to, apikey }) {
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
  const ttlMs = ttlByIntervalMs(interval);
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

async function fetchTwelveApiUsage(apikey) {
  const key = 'TD:api_usage';
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < TD_USAGE_TTL_MS) return hit.payload;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = (async () => {
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
    fallbackProvider: base.fallbackProvider || '',
    requestedInterval: base.requestedInterval,
    returnedInterval: base.returnedInterval || '',
    requestedRange: base.requestedRange || '',
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
    minBarsWanted: base.minBarsWanted != null ? base.minBarsWanted : null,
    providerLimitHit: Boolean(base.providerLimitHit),
    twelveDataCreditsUsed: base.twelveDataCreditsUsed != null ? base.twelveDataCreditsUsed : null,
    twelveDataCreditsLeft: base.twelveDataCreditsLeft != null ? base.twelveDataCreditsLeft : null,
    twelveDataApiUsage: base.twelveDataApiUsage || null,
    cacheHit: Boolean(base.cacheHit),
    cacheTtlMs: base.cacheTtlMs != null ? base.cacheTtlMs : null,
    inFlightDeduped: Boolean(base.inFlightDeduped),
    providerCallMade: Boolean(base.providerCallMade),
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
  const normalizedInterval = normalizeInterval(intervalParam);
  const normalizedRange = normalizeRange(req.query.range != null ? String(req.query.range) : '3M');
  const requestedFrom = parseMaybeDate(req.query.from);
  const requestedTo = parseMaybeDate(req.query.to);
  const twKey = String(process.env.TWELVE_DATA_API_KEY || '').trim();
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
        requestedRange: normalizedRange,
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
  const responseTtlMs = ttlByIntervalMs(normalizedInterval);
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
        requestedRange: normalizedRange,
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
        requestedOutputSize: null,
        twelveDataCreditsUsed: out.tdCreditsUsed ?? null,
        twelveDataCreditsLeft: out.tdCreditsLeft ?? null,
      };
    }
    if (!twKey) throw new Error('TWELVE_DATA_API_KEY is required for Twelve Data provider');
    let out = await fetchTwelveDataBars({
      symbol: twelveDataSymbol,
      interval: tPlan.interval,
      outputsize: Math.min(TD_MAX_OUTPUT, tPlan.outputsize),
      from: requestedFrom,
      to: requestedTo,
      apikey: twKey,
    });
    let bars = out.bars || [];
    if (normalizedInterval === '240' && tPlan.interval === '4h' && bars.length < 2) {
      const hPlan = { ...tPlan, interval: '1h', aggregateTo4h: true, returnedInterval: '240' };
      const out2 = await fetchTwelveDataBars({
        symbol: twelveDataSymbol,
        interval: hPlan.interval,
        outputsize: Math.min(TD_MAX_OUTPUT, desiredTwelveOutputsize('240', normalizedRange, requestedFrom, requestedTo)),
        from: requestedFrom,
        to: requestedTo,
        apikey: twKey,
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
      returnedInterval: tPlan.returnedInterval,
      fourHourAggregated: tPlan.aggregateTo4h,
      yahooFetchInterval: '',
      yahooRange: '',
      cacheHit: out.cacheHit,
      cacheTtlMs: out.cacheTtlMs,
      inFlightDeduped: out.inFlightDeduped,
      providerCallMade: out.providerCallMade,
      requestedOutputSize: Math.min(TD_MAX_OUTPUT, tPlan.outputsize),
      twelveDataCreditsUsed: out.tdCreditsUsed ?? null,
      twelveDataCreditsLeft: out.tdCreditsLeft ?? null,
    };
  }

  let selected = plan.prefer;
  let fallbackUsed = '';
  let providerError = '';
  try {
    let fetched;
    try {
      fetched = await fetchProvider(plan.prefer);
    } catch (primaryErr) {
      providerError = String(primaryErr.message || primaryErr);
      fetched = await fetchProvider(plan.fallback);
      selected = plan.fallback;
      fallbackUsed = plan.prefer;
    }

    let bars = fetched.bars || [];
    if (fetched.fourHourAggregated) {
      const aggKey = cacheKey(selected === 'yahoo' ? yahoo : twelveDataSymbol, normalizedInterval, normalizedRange, 'agg4h');
      const sourceFresh = bars;
      const aggHit = responseCache.get(aggKey);
      const aggTtlMs = ttlByIntervalMs(normalizedInterval);
      if (aggHit && Date.now() - aggHit.at < aggTtlMs) {
        bars = aggHit.bars;
      } else {
        bars = sourceFresh;
        responseCache.set(aggKey, { at: Date.now(), bars });
      }
    }

    const barCount = bars.length;
    const minBarsWanted = computeMinBarsWanted(normalizedInterval, normalizedRange);
    const firstBarTime = barCount ? bars[0].time : null;
    const lastBarTime = barCount ? bars[barCount - 1].time : null;
    const requestedOutputSize = Number.isFinite(Number(fetched.requestedOutputSize)) ? Number(fetched.requestedOutputSize) : null;
    const providerLimitHit = Boolean(
      selected === 'twelvedata' &&
      requestedOutputSize != null &&
      requestedOutputSize >= TD_MAX_OUTPUT &&
      barCount < minBarsWanted
    );

    const diagnostics = buildDiagnostics({
      requestSymbol: symbol,
      canonical,
      yahooSymbol: yahoo,
      twelveDataSymbol,
      selectedProvider: selected,
      fallbackProvider: fallbackUsed,
      requestedInterval: intervalParam,
      returnedInterval: fetched.returnedInterval,
      requestedRange: normalizedRange,
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
      rangeDowngrade: undefined,
      requestedOutputSize,
      returnedBarCount: barCount,
      minBarsWanted,
      providerLimitHit,
      twelveDataCreditsUsed: fetched.twelveDataCreditsUsed ?? null,
      twelveDataCreditsLeft: fetched.twelveDataCreditsLeft ?? null,
      cacheHit: fetched.cacheHit,
      cacheTtlMs: fetched.cacheTtlMs,
      inFlightDeduped: fetched.inFlightDeduped,
      providerCallMade: fetched.providerCallMade,
    });
    if (twKey && (selected === 'twelvedata' || fallbackUsed === 'twelvedata')) {
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
    const diagnostics = buildDiagnostics({
      requestSymbol: symbol,
      canonical,
      yahooSymbol: yahoo,
      twelveDataSymbol,
      selectedProvider: plan.prefer,
      fallbackProvider: plan.fallback,
      requestedInterval: intervalParam,
      returnedInterval: normalizedInterval,
      requestedRange: normalizedRange,
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
