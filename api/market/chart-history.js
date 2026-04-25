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
const cache = new Map();
const CACHE_TTL_MS = 30000;
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

function providerPlan({ interval, range, from, to }) {
  const hasDateWindow = Number.isFinite(from) || Number.isFinite(to);
  const isDeep = range === '1Y' || hasDateWindow;
  const preferTwelve = interval === '1' || isDeep;
  return {
    prefer: preferTwelve ? 'twelvedata' : 'yahoo',
    fallback: preferTwelve ? 'yahoo' : 'twelvedata',
    hasDateWindow,
  };
}

function yahooRangeParams({ interval, range }) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (r === '1D') return { interval: '1d', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '1D' };
  if (r === '240') return { interval: '1h', range: toYahooRange(rr), aggregateTo4h: true, returnedInterval: '240' };
  if (r === '1') return { interval: '1m', range: '7d', aggregateTo4h: false, returnedInterval: '1' };
  if (r === '15') return { interval: '15m', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '15' };
  return { interval: '1h', range: toYahooRange(rr), aggregateTo4h: false, returnedInterval: '60' };
}

function twelveDataParams({ interval, range, from, to }) {
  const r = normalizeInterval(interval);
  const rr = normalizeRange(range);
  if (r === '1D') {
    return { interval: '1day', aggregateTo4h: false, outputsize: Math.max(120, barsByRange(rr) / 24), returnedInterval: '1D' };
  }
  if (r === '240') {
    return { interval: '1h', aggregateTo4h: true, outputsize: Math.max(200, barsByRange(rr)), returnedInterval: '240' };
  }
  if (r === '1') {
    return { interval: '1min', aggregateTo4h: false, outputsize: Math.max(500, barsByRange(rr) * 4), returnedInterval: '1' };
  }
  if (r === '15') {
    return { interval: '15min', aggregateTo4h: false, outputsize: Math.max(200, Math.ceil(barsByRange(rr) / 0.25)), returnedInterval: '15' };
  }
  return { interval: '1h', aggregateTo4h: false, outputsize: Math.max(200, barsByRange(rr)), returnedInterval: '60' };
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

function buildChartRequestUrl(yahooSymbol, interval, range) {
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;
  const qs = new URLSearchParams({
    interval: String(interval),
    range: String(range),
    includePrePost: 'false',
  }).toString();
  return `${base}?${qs}`;
}

/**
 * @returns {Promise<{ bars: Array, requestUrl: string, responseStatus: number|null }>}
 */
async function fetchYahooChartBars(yahooSymbol, interval, range) {
  const key = cacheKey(yahooSymbol, interval, range);
  const hit = cache.get(key);
  const requestUrl = buildChartRequestUrl(yahooSymbol, interval, range);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return {
      bars: hit.bars,
      requestUrl,
      responseStatus: hit.responseStatus ?? 200,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;
    const response = await axios.get(url, {
      params: { interval, range, includePrePost: 'false' },
      timeout: REQUEST_TIMEOUT,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);
    const status = response.status ?? 200;
    const result = response.data?.chart?.result?.[0];
    const bars = result ? yahooResultToBars(result) : [];
    cache.set(key, { at: Date.now(), bars, responseStatus: status });
    return { bars, requestUrl, responseStatus: status };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
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
  const params = {
    symbol,
    interval,
    outputsize: String(outputsize),
    apikey,
    order: 'ASC',
    format: 'JSON',
  };
  if (Number.isFinite(from)) params.start_date = new Date(from * 1000).toISOString();
  if (Number.isFinite(to)) params.end_date = new Date(to * 1000).toISOString();
  const key = cacheKey(`TD:${symbol}`, interval, JSON.stringify({ outputsize, from: params.start_date || '', to: params.end_date || '' }));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.payload;
  }
  const response = await axios.get(TWELVE_BASE, {
    params,
    timeout: REQUEST_TIMEOUT,
    headers: { Accept: 'application/json' },
  });
  const status = response.status ?? 200;
  const values = Array.isArray(response.data?.values) ? response.data.values : [];
  const bars = values.map(twelveBarToUnified).filter(Boolean).sort((a, b) => a.time - b.time);
  if (response.data?.status === 'error') {
    throw new Error(response.data?.message || 'Twelve Data error');
  }
  const payload = { bars, requestUrl: `${TWELVE_BASE}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`, responseStatus: status };
  cache.set(key, { at: Date.now(), payload });
  return payload;
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
  const plan = providerPlan({ interval: normalizedInterval, range: normalizedRange, from: requestedFrom, to: requestedTo });

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
      const out = await fetchYahooChartBars(yahoo, yPlan.interval, yPlan.range);
      return {
        provider,
        bars: yPlan.aggregateTo4h ? aggregateHourlyToFourHour(out.bars) : out.bars,
        requestUrl: out.requestUrl,
        responseStatus: out.responseStatus,
        returnedInterval: yPlan.returnedInterval,
        fourHourAggregated: yPlan.aggregateTo4h,
        yahooFetchInterval: yPlan.interval,
        yahooRange: yPlan.range,
      };
    }
    if (!twKey) throw new Error('TWELVE_DATA_API_KEY is required for Twelve Data provider');
    const out = await fetchTwelveDataBars({
      symbol: twelveDataSymbol,
      interval: tPlan.interval,
      outputsize: tPlan.outputsize,
      from: requestedFrom,
      to: requestedTo,
      apikey: twKey,
    });
    return {
      provider,
      bars: tPlan.aggregateTo4h ? aggregateHourlyToFourHour(out.bars) : out.bars,
      requestUrl: out.requestUrl,
      responseStatus: out.responseStatus,
      returnedInterval: tPlan.returnedInterval,
      fourHourAggregated: tPlan.aggregateTo4h,
      yahooFetchInterval: '',
      yahooRange: '',
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
      const aggHit = cache.get(aggKey);
      if (aggHit && Date.now() - aggHit.at < CACHE_TTL_MS) {
        bars = aggHit.bars;
      } else {
        bars = sourceFresh;
        cache.set(aggKey, { at: Date.now(), bars });
      }
    }

    const barCount = bars.length;
    const firstBarTime = barCount ? bars[0].time : null;
    const lastBarTime = barCount ? bars[barCount - 1].time : null;

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
    });

    if (barCount < 2) {
      return res.status(200).json({
        success: false,
        message: 'Not enough chart data for this symbol yet.',
        canonical,
        yahooSymbol: yahoo,
        twelveDataSymbol,
        bars,
        diagnostics,
        source: selected,
        delayed: true,
      });
    }

    return res.status(200).json({
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
    });
  } catch (err) {
    const status = err.response?.status;
    const httpStatus = status && status >= 400 && status < 600 ? status : 502;
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
      responseStatus: status != null ? status : null,
      barCount: 0,
      firstBarTime: null,
      lastBarTime: null,
      error: msg || 'Chart data fetch failed',
    });
    return res.status(httpStatus).json({
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
