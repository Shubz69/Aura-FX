/**
 * Market Decoder — data acquisition with provider logging and deterministic fallbacks.
 * Order: Twelve Data → MySQL OHLCV (daily) → Twelve Data time_series → Finnhub → FMP → Alpha Vantage.
 */

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getQuote } = require('./services/finnhubService');
const {
  getResolvedSymbol,
  forProvider,
  usesForexSessionContext,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
} = require('../ai/utils/symbol-registry');
const { minTdDailyBarsBeforeOhlcvFallback } = require('../market-data/equities/equityReadPolicy');

/** Twelve Data → Finnhub → FMP fallback quote for any resolved symbol (shared by primary + cross-asset). */
async function fetchQuoteNumbersForResolved(resolved) {
  /** @type {{ name: string, status: string, detail?: string }[]} */
  const log = [];
  try {
    const { fetchQuoteDto } = require('../market-data/marketDataLayer');
    const { changeVsPreviousClose, changeVsPreviousCloseOnly } = require('../market-data/priceMath');
    const qFeat =
      resolved.marketType === 'FX' || resolved.candleKind === 'forex'
        ? 'fx-decoder-quote'
        : isCboeEuropeUkListedEquity(resolved.canonical)
          ? 'cboe-uk-decoder-quote'
          : isCboeAustraliaListedEquity(resolved.canonical)
            ? 'cboe-au-decoder-quote'
            : isUkListedEquity(resolved.canonical)
            ? 'uk-decoder-quote'
            : 'decoder';
    const dto = await fetchQuoteDto(resolved.canonical, { feature: qFeat });
    if (dto && dto.last != null && Number.isFinite(dto.last) && dto.last > 0) {
      const fxSession = usesForexSessionContext(resolved.canonical);
      const vs = changeVsPreviousClose(dto);
      const vsOnly = changeVsPreviousCloseOnly(dto);
      const c = dto.last;
      let pc;
      let d;
      let dp;
      if (fxSession) {
        pc = dto.prevClose != null && Number.isFinite(dto.prevClose) ? dto.prevClose : null;
        if (vsOnly.change != null && vsOnly.changePct != null) {
          d = vsOnly.change;
          dp = vsOnly.changePct;
        } else {
          d = dto.open != null && Number.isFinite(dto.open) ? c - dto.open : null;
          dp = null;
        }
      } else {
        pc = dto.prevClose;
        if ((pc == null || !Number.isFinite(pc)) && dto.open != null && Number.isFinite(dto.open)) {
          pc = dto.open;
        }
        if (pc == null || !Number.isFinite(pc)) pc = c;
        d = c - pc;
        dp = vs.changePct != null && Number.isFinite(vs.changePct) ? vs.changePct : pc !== 0 ? (d / Math.abs(pc)) * 100 : 0;
      }
      log.push({ name: 'Twelve Data quote', status: 'ok' });
      return {
        ok: true,
        data: { c, pc, dp, h: dto.high, l: dto.low, o: dto.open, d },
        providerLog: log,
      };
    }
  } catch (e) {
    log.push({ name: 'Twelve Data quote', status: 'failed', detail: e.message || String(e) });
  }

  const q = await getQuote(resolved.finnhubSymbol);
  if (q.ok && q.data && (q.data.c != null || q.data.pc != null)) {
    log.push({ name: 'Finnhub quote', status: 'ok' });
    return { ok: true, data: q.data, providerLog: log };
  }
  log.push({ name: 'Finnhub quote', status: 'failed', detail: q.error || 'empty' });

  const fmpSym = toFmpSymbol(resolved);
  const { fmpApiKey } = getConfig();
  if (fmpApiKey) {
    try {
      const url = `${FMP_BASE}/api/v3/quote/${encodeURIComponent(fmpSym)}?apikey=${encodeURIComponent(fmpApiKey)}`;
      const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
      if (res.ok) {
        const arr = await res.json();
        const row = Array.isArray(arr) ? arr[0] : arr;
        if (row && row.price != null) {
          const c = Number(row.price);
          const pc = row.previousClose != null ? Number(row.previousClose) : c;
          const dp = pc && pc !== 0 ? ((c - pc) / Math.abs(pc)) * 100 : 0;
          log.push({ name: 'FMP quote', status: 'fallback', detail: fmpSym });
          return {
            ok: true,
            data: { c, pc, dp, h: row.dayHigh, l: row.dayLow, o: row.open, d: c - pc },
            providerLog: log,
          };
        }
      }
    } catch (e) {
      log.push({ name: 'FMP quote', status: 'failed', detail: e.message || String(e) });
    }
  }

  return { ok: false, data: {}, providerLog: log };
}

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FMP_BASE = 'https://financialmodelingprep.com';
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 11000;

function logProvider(tag, status, detail) {
  const msg = `[market-decoder-data] ${tag} ${status}${detail ? `: ${detail}` : ''}`;
  if (status === 'failed' || status === 'fallback') {
    const code = String(detail || '');
    if (code === '403' || code === '429') {
      console.info(msg);
      return;
    }
    console.warn(msg);
    return;
  }
  console.info(msg);
}

function decoderSeriesFromYahooResult(result) {
  const ts = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const q = result?.indicators?.quote?.[0] || {};
  const opens = Array.isArray(q.open) ? q.open : [];
  const highs = Array.isArray(q.high) ? q.high : [];
  const lows = Array.isArray(q.low) ? q.low : [];
  const closesRaw = Array.isArray(q.close) ? q.close : [];
  const outOpens = [];
  const outHighs = [];
  const outLows = [];
  const outCloses = [];
  const outTimes = [];
  const outDates = [];
  for (let i = 0; i < ts.length; i += 1) {
    const t = Number(ts[i]);
    const c = Number(closesRaw[i]);
    if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
    const o = Number.isFinite(Number(opens[i])) ? Number(opens[i]) : c;
    const h = Number.isFinite(Number(highs[i])) ? Number(highs[i]) : c;
    const l = Number.isFinite(Number(lows[i])) ? Number(lows[i]) : c;
    outTimes.push(t);
    outDates.push(new Date(t * 1000).toISOString().slice(0, 10));
    outOpens.push(o);
    outHighs.push(Math.max(h, l, o, c));
    outLows.push(Math.min(h, l, o, c));
    outCloses.push(c);
  }
  return {
    opens: outOpens,
    highs: outHighs,
    lows: outLows,
    closes: outCloses,
    times: outTimes,
    dates: outDates,
  };
}

async function yahooDailySeries(resolved) {
  const ySym = forProvider(resolved.canonical, 'yahoo') || resolved.canonical;
  const url = `${YAHOO_BASE}/${encodeURIComponent(ySym)}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    }, TIMEOUT_MS);
    if (!res.ok) {
      return {
        ok: false, opens: [], highs: [], lows: [], closes: [], dates: [], times: [],
        error: `http ${res.status}`, providerSymbol: ySym,
      };
    }
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    if (!result) {
      return {
        ok: false, opens: [], highs: [], lows: [], closes: [], dates: [], times: [],
        error: 'empty', providerSymbol: ySym,
      };
    }
    const s = decoderSeriesFromYahooResult(result);
    if (!s.closes.length) {
      return {
        ok: false, opens: [], highs: [], lows: [], closes: [], dates: [], times: [],
        error: 'parse-empty', providerSymbol: ySym,
      };
    }
    return { ok: true, ...s, source: 'yahoo', providerSymbol: ySym };
  } catch (e) {
    return {
      ok: false, opens: [], highs: [], lows: [], closes: [], dates: [], times: [],
      error: e.message || 'err', providerSymbol: ySym,
    };
  }
}

/**
 * @typedef {{ name: string, status: 'ok'|'fallback'|'failed', detail?: string }} ProviderEntry
 */

async function finnhubCandles(candleKind, symbol, fromSec, toSec) {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) {
    logProvider('Finnhub candles', 'failed', 'FINNHUB_API_KEY missing');
    return { ok: false, closes: [], highs: [], lows: [], opens: [], times: [], dates: [], error: 'no_key' };
  }
  const path = candleKind === 'forex' ? 'forex/candle' : candleKind === 'crypto' ? 'crypto/candle' : 'stock/candle';
  const url = `${FINNHUB_BASE}/${path}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(finnhubApiKey)}`;
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) {
      logProvider('Finnhub candles', 'failed', String(res.status));
      return { ok: false, closes: [], highs: [], lows: [], opens: [], times: [], dates: [], error: String(res.status) };
    }
    const j = await res.json();
    if (!j || j.s !== 'ok' || !Array.isArray(j.c) || j.c.length === 0) {
      logProvider('Finnhub candles', 'failed', 'empty or s!=ok');
      return { ok: false, closes: [], highs: [], lows: [], opens: [], times: [], dates: [], error: 'no_data' };
    }
    logProvider('Finnhub candles', 'ok', `${j.c.length} bars`);
    return {
      ok: true,
      closes: j.c.map(Number),
      highs: (j.h || []).map(Number),
      lows: (j.l || []).map(Number),
      opens: (j.o || []).map(Number),
      times: j.t || [],
      dates: [],
      source: 'finnhub',
    };
  } catch (e) {
    logProvider('Finnhub candles', 'failed', e.message || e);
    return { ok: false, closes: [], highs: [], lows: [], opens: [], times: [], dates: [], error: e.message || 'err' };
  }
}

/** FMP historical daily — stocks/FX/crypto symbols as FMP expects (e.g. EURUSD, AAPL) */
async function fmpHistoricalDaily(fmpSymbol) {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: 'no_fmp_key' };
  try {
    const url = `${FMP_BASE}/api/v3/historical-price-full/${encodeURIComponent(fmpSymbol)}?apikey=${encodeURIComponent(fmpApiKey)}`;
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: `http ${res.status}` };
    const j = await res.json();
    const hist = j && Array.isArray(j.historical) ? j.historical : [];
    if (!hist.length) return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: 'empty' };
    const asc = [...hist].reverse();
    const closes = asc.map((r) => Number(r.close));
    const highs = asc.map((r) => Number(r.high));
    const lows = asc.map((r) => Number(r.low));
    const opens = asc.map((r) => Number(r.open));
    const dates = asc.map((r) => String(r.date || '').slice(0, 10));
    if (!closes.length || closes.every((x) => Number.isNaN(x))) {
      return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: 'parse' };
    }
    logProvider('FMP historical', 'ok', `${closes.length} bars ${fmpSymbol}`);
    return { ok: true, closes, highs, lows, opens, dates, times: [], source: 'fmp' };
  } catch (e) {
    logProvider('FMP historical', 'failed', e.message || e);
    return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: e.message || 'err' };
  }
}

/** Map resolved asset to FMP symbol */
function toFmpSymbol(resolved) {
  const { displaySymbol, marketType, canonicalSymbol, canonical } = resolved;
  const symbol = canonicalSymbol || canonical || displaySymbol;
  if (marketType === 'FX' || marketType === 'Crypto') return symbol;
  return symbol.split('.')[0];
}

async function alphaVantageDaily(symbolForAv) {
  const key = process.env.ALPHA_VANTAGE_API_KEY && String(process.env.ALPHA_VANTAGE_API_KEY).trim();
  if (!key) return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: 'no_av_key' };
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbolForAv)}&apikey=${encodeURIComponent(key)}&outputsize=compact`;
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: String(res.status) };
    const j = await res.json();
    const series = j && (j['Time Series (Daily)'] || j['Time Series Daily']);
    if (!series || typeof series !== 'object') {
      logProvider('Alpha Vantage daily', 'failed', j['Note'] || j['Error Message'] || 'no series');
      return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: 'no_series' };
    }
    const dateKeys = Object.keys(series).sort();
    const closes = [];
    const highs = [];
    const lows = [];
    const opens = [];
    const barDates = [];
    for (const d of dateKeys) {
      const row = series[d];
      barDates.push(d.slice(0, 10));
      opens.push(Number(row['1. open']));
      closes.push(Number(row['5. adjusted close'] || row['4. close']));
      highs.push(Number(row['2. high']));
      lows.push(Number(row['3. low']));
    }
    if (!closes.length) return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: 'empty' };
    logProvider('Alpha Vantage daily', 'ok', `${closes.length} bars`);
    return { ok: true, closes, highs, lows, opens, dates: barDates, times: [], source: 'alphavantage' };
  } catch (e) {
    logProvider('Alpha Vantage daily', 'failed', e.message || e);
    return { ok: false, closes: [], highs: [], lows: [], opens: [], dates: [], error: e.message || 'err' };
  }
}

function decoderSeriesFromDbRows(rows) {
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const times = [];
  const dates = [];
  for (const r of rows || []) {
    opens.push(Number(r.open_p));
    highs.push(Number(r.high_p));
    lows.push(Number(r.low_p));
    closes.push(Number(r.close_p));
    const ms = Number(r.bar_time_utc);
    times.push(Math.floor(ms / 1000));
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return { opens, highs, lows, closes, times, dates };
}

function decoderSeriesFromCandleDtoBars(bars) {
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const times = [];
  const dates = [];
  for (const b of bars || []) {
    opens.push(b.o);
    highs.push(b.h);
    lows.push(b.l);
    closes.push(b.c);
    times.push(Math.floor(b.tUtcMs / 1000));
    dates.push(new Date(b.tUtcMs).toISOString().slice(0, 10));
  }
  return { opens, highs, lows, closes, times, dates };
}

/**
 * Resolve OHLC series: MySQL → Twelve Data time_series → Finnhub → FMP → Alpha Vantage (stocks only for AV).
 */
async function fetchDailySeries(resolved, fromSec, toSec) {
  /** @type {ProviderEntry[]} */
  const log = [];
  const fromMs = fromSec * 1000;
  const toMs = toSec * 1000;

  try {
    const { ohlcvCoverageOk, upsertOhlcvBars } = require('../market-data/pipeline-store');
    const cov = await ohlcvCoverageOk(resolved.canonical, '1day', fromMs, toMs);
    if (cov.ok && cov.rows.length) {
      log.push({ name: 'MySQL OHLCV daily', status: 'ok', detail: `${cov.rows.length} bars` });
      const s = decoderSeriesFromDbRows(cov.rows);
      return {
        ok: true,
        closes: s.closes,
        highs: s.highs,
        lows: s.lows,
        opens: s.opens,
        times: s.times,
        dates: s.dates,
        source: 'mysql',
        providerLog: log,
      };
    }
  } catch (e) {
    log.push({ name: 'MySQL OHLCV daily', status: 'failed', detail: e.message || String(e) });
  }

  try {
    const { fetchTimeSeriesDtoFromNetwork } = require('../market-data/marketDataLayer');
    const { upsertOhlcvBars } = require('../market-data/pipeline-store');
    const start = new Date(fromMs).toISOString().slice(0, 10);
    const end = new Date(toMs).toISOString().slice(0, 10);
    const tdFeature =
      resolved.marketType === 'FX' || resolved.candleKind === 'forex'
        ? 'fx-decoder-series'
        : resolved.candleKind === 'crypto' || resolved.assetClass === 'crypto'
          ? 'crypto-decoder-series'
          : isCboeEuropeUkListedEquity(resolved.canonical)
            ? 'cboe-uk-decoder-series'
            : isCboeAustraliaListedEquity(resolved.canonical)
              ? 'cboe-au-decoder-series'
              : isUkListedEquity(resolved.canonical)
              ? 'uk-decoder-series'
              : 'decoder';
    const tdSeries = await fetchTimeSeriesDtoFromNetwork(
      resolved.canonical,
      '1day',
      { start_date: start, end_date: end },
      tdFeature
    );
    const minTdBars = minTdDailyBarsBeforeOhlcvFallback(resolved.canonical);
    if (tdSeries && tdSeries.bars && tdSeries.bars.length >= minTdBars) {
      log.push({ name: 'Twelve Data time_series', status: 'ok', detail: `${tdSeries.bars.length} bars` });
      if (process.env.MYSQL_HOST) {
        const ingestRows = tdSeries.bars.map((b) => ({
          canonicalSymbol: resolved.canonical,
          intervalKey: '1day',
          barTimeUtc: b.tUtcMs,
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
          volume: b.v,
          provider: 'twelvedata',
        }));
        upsertOhlcvBars(ingestRows).catch(() => {});
      }
      const s = decoderSeriesFromCandleDtoBars(tdSeries.bars);
      return {
        ok: true,
        closes: s.closes,
        highs: s.highs,
        lows: s.lows,
        opens: s.opens,
        times: s.times,
        dates: s.dates,
        source: 'twelvedata',
        providerLog: log,
      };
    }
    if (tdSeries && tdSeries.bars && tdSeries.bars.length > 0) {
      log.push({
        name: 'Twelve Data time_series',
        status: 'fallback',
        detail: `${tdSeries.bars.length} bars (prefer ${minTdBars}+ for full stack — trying Finnhub)`,
      });
    } else {
      log.push({ name: 'Twelve Data time_series', status: 'failed', detail: 'empty or insufficient' });
    }
  } catch (e) {
    log.push({ name: 'Twelve Data time_series', status: 'failed', detail: e.message || String(e) });
  }

  const fh = await finnhubCandles(resolved.candleKind, resolved.finnhubSymbol, fromSec, toSec);
  if (fh.ok && fh.closes.length >= 50) {
    log.push({ name: 'Finnhub daily candles', status: 'ok', detail: `${fh.closes.length} sessions` });
    return { ...fh, providerLog: log };
  }
  if (fh.ok && fh.closes.length > 0) {
    log.push({
      name: 'Finnhub daily candles',
      status: 'fallback',
      detail: `${fh.closes.length} sessions (prefer 50+ for full stack — trying FMP)`,
    });
  } else {
    log.push({
      name: 'Finnhub daily candles',
      status: 'failed',
      detail: fh.error || 'insufficient history',
    });
  }

  const fmpSym = toFmpSymbol(resolved);
  const fmp = await fmpHistoricalDaily(fmpSym);
  if (fmp.ok && fmp.closes.length >= 10) {
    log.push({
      name: 'FMP historical-price-full',
      status: 'ok',
      detail: `${fmp.closes.length} sessions`,
    });
    return {
      ok: true,
      closes: fmp.closes,
      highs: fmp.highs,
      lows: fmp.lows,
      opens: fmp.opens || [],
      dates: fmp.dates || [],
      times: [],
      source: fmp.source,
      providerLog: log,
    };
  }
  log.push({ name: 'FMP historical-price-full', status: 'failed', detail: fmp.error || 'no data' });

  if (fh.ok && fh.closes.length > 0) {
    log.push({ name: 'Finnhub partial', status: 'fallback', detail: `using ${fh.closes.length} Finnhub bars` });
    return { ...fh, providerLog: log };
  }

  if (resolved.marketType === 'Equity' || resolved.marketType === 'Index') {
    const av = await alphaVantageDaily(fmpSym);
    if (av.ok && av.closes.length >= 10) {
      log.push({ name: 'Alpha Vantage TIME_SERIES_DAILY', status: 'fallback', detail: `${av.closes.length} sessions` });
      return {
        ok: true,
        closes: av.closes,
        highs: av.highs,
        lows: av.lows,
        opens: av.opens || [],
        dates: av.dates || [],
        times: [],
        source: av.source,
        providerLog: log,
      };
    }
    log.push({ name: 'Alpha Vantage TIME_SERIES_DAILY', status: 'failed', detail: av.error || 'no data' });
  } else {
    log.push({
      name: 'Alpha Vantage daily',
      status: 'failed',
      detail: 'skipped for FX/crypto/commodity — use Finnhub/FMP',
    });
  }

  const y = await yahooDailySeries(resolved);
  if (y.ok && y.closes.length >= 10) {
    log.push({ name: 'Yahoo chart daily', status: 'fallback', detail: `${y.closes.length} sessions ${y.providerSymbol}` });
    return {
      ok: true,
      closes: y.closes,
      highs: y.highs,
      lows: y.lows,
      opens: y.opens || [],
      dates: y.dates || [],
      times: y.times || [],
      source: y.source,
      providerLog: log,
      diagnostics: {
        symbol: resolved.displaySymbol,
        canonical: resolved.canonical,
        provider: 'yahoo',
        providerSymbol: y.providerSymbol,
        interval: '1D',
        range: '1Y',
        barCount: y.closes.length,
        providerError: null,
      },
    };
  }
  log.push({ name: 'Yahoo chart daily', status: 'failed', detail: y.error || 'no data' });

  return {
    ok: false,
    closes: [],
    highs: [],
    lows: [],
    opens: [],
    dates: [],
    times: [],
    providerLog: log,
    diagnostics: {
      symbol: resolved.displaySymbol,
      canonical: resolved.canonical,
      provider: 'none',
      providerSymbol: '',
      interval: '1D',
      range: '1Y',
      barCount: 0,
      providerError: y.error || 'all providers failed',
      twelveDataKeyPresent: Boolean(String(process.env.TWELVE_DATA_API_KEY || '').trim()),
    },
  };
}

/**
 * Last-resort: two-point series from live quote so pivots/MAs degrade gracefully (not empty).
 */
function minimalSeriesFromQuote(quoteData) {
  const q = quoteData || {};
  const c = q.c != null ? Number(q.c) : null;
  const pc = q.pc != null ? Number(q.pc) : q.o != null ? Number(q.o) : null;
  if (c == null || Number.isNaN(c)) return null;
  const anchor = pc != null && !Number.isNaN(pc) ? pc : c * 0.999;
  const h = q.h != null ? Number(q.h) : Math.max(c, anchor);
  const l = q.l != null ? Number(q.l) : Math.min(c, anchor);
  return {
    closes: [anchor, c],
    highs: [h, h],
    lows: [l, l],
    opens: [anchor, anchor],
    dates: [],
    source: 'quote_snapshot',
  };
}

async function fetchDailySeriesWithQuoteFallback(resolved, fromSec, toSec, quoteData) {
  const primary = await fetchDailySeries(resolved, fromSec, toSec);
  if (primary.ok && primary.closes.length >= 2) return primary;

  const mini = minimalSeriesFromQuote(quoteData);
  if (mini) {
    const log = [...(primary.providerLog || [])];
    log.push({
      name: 'Snapshot synthesis',
      status: 'fallback',
      detail: '2-point series from live quote — MAs and pivots are indicative only',
    });
    return {
      ok: true,
      closes: mini.closes,
      highs: mini.highs,
      lows: mini.lows,
      opens: mini.opens || [],
      dates: mini.dates || [],
      times: [],
      source: mini.source,
      providerLog: log,
      isSparse: true,
      diagnostics: {
        ...(primary.diagnostics || {}),
        provider: 'quote_snapshot',
        providerSymbol: resolved.displaySymbol,
        interval: '1D',
        range: '1Y',
        barCount: mini.closes.length,
        providerError: primary.diagnostics?.providerError || null,
      },
    };
  }
  return primary;
}

async function fetchQuoteWithLog(finnhubSymbol, resolved) {
  void finnhubSymbol;
  return fetchQuoteNumbersForResolved(resolved);
}

/**
 * Headlines with outbound URLs for the decoded symbol (Finnhub + FMP; best-effort without extra paid feeds).
 * @returns {Promise<{ title: string, url: string, source: string, datetime: string }[]>}
 */
async function fetchMarketDecoderContextNews(resolved, limit = 12) {
  const { finnhubApiKey, fmpApiKey } = getConfig();
  const cap = Math.min(20, Math.max(4, limit));
  const buckets = [];

  const { displaySymbol, marketType, finnhubSymbol } = resolved;
  const symU = String(displaySymbol || '').toUpperCase();
  const fmpSym = toFmpSymbol(resolved);

  async function finnhubCompanyNews() {
    if (!finnhubApiKey || (marketType !== 'Equity' && marketType !== 'Index')) return [];
    const tick = String(finnhubSymbol || displaySymbol)
      .split(':')
      .pop()
      .split('.')[0];
    if (!tick) return [];
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);
    try {
      const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(tick)}&from=${fromStr}&to=${toStr}&token=${encodeURIComponent(finnhubApiKey)}`;
      const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr.map((row) => ({
        title: row.headline || row.title || '',
        url: row.url || '',
        source: row.source || 'Finnhub',
        datetime:
          row.datetime != null
            ? new Date(
                typeof row.datetime === 'number' ? row.datetime * 1000 : Number(row.datetime)
              ).toISOString()
            : '',
      }));
    } catch (e) {
      logProvider('Finnhub company-news', 'failed', e.message || e);
      return [];
    }
  }

  async function finnhubCategoryNews() {
    if (!finnhubApiKey) return [];
    const cat =
      marketType === 'Crypto' ? 'crypto' : marketType === 'FX' || marketType === 'Commodity' ? 'forex' : null;
    if (!cat) return [];
    try {
      const url = `${FINNHUB_BASE}/news?category=${cat}&token=${encodeURIComponent(finnhubApiKey)}`;
      const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      const keywords = [];
      if (symU.includes('XAU') || symU.includes('GOLD')) {
        keywords.push('GOLD', 'XAU', 'PRECIOUS', 'METAL');
      }
      if (marketType === 'Crypto') {
        const base = symU.replace(/USDT|USD/g, '');
        keywords.push(base, 'CRYPTO', 'BITCOIN', 'ETHEREUM');
      }
      if (marketType === 'FX' && symU.length === 6 && /^[A-Z]{6}$/.test(symU)) {
        keywords.push(symU.slice(0, 3), symU.slice(3), `${symU.slice(0, 3)}/${symU.slice(3)}`, symU);
      }
      if (marketType === 'Commodity' && !keywords.length) {
        keywords.push(symU);
      }
      const filtered = [];
      for (const row of arr) {
        const h = `${row.headline || ''} ${row.summary || ''}`.toUpperCase();
        const hit =
          keywords.length === 0 ||
          keywords.some((k) => k && h.includes(String(k).toUpperCase())) ||
          h.includes(symU);
        if (!hit) continue;
        filtered.push({
          title: row.headline || row.title || '',
          url: row.url || '',
          source: row.source || 'Finnhub',
          datetime:
            row.datetime != null
              ? new Date(
                  typeof row.datetime === 'number' ? row.datetime * 1000 : Number(row.datetime)
                ).toISOString()
              : '',
        });
      }
      return filtered;
    } catch (e) {
      logProvider('Finnhub market news', 'failed', e.message || e);
      return [];
    }
  }

  async function fmpStockNews() {
    if (!fmpApiKey || (marketType !== 'Equity' && marketType !== 'Index')) return [];
    try {
      const url = `${FMP_BASE}/api/v3/stock_news?tickers=${encodeURIComponent(fmpSym)}&limit=20&apikey=${encodeURIComponent(fmpApiKey)}`;
      const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr.map((row) => ({
        title: row.title || '',
        url: row.url || '',
        source: row.site || 'FMP',
        datetime: row.publishedDate ? String(row.publishedDate) : '',
      }));
    } catch (e) {
      logProvider('FMP stock_news', 'failed', e.message || e);
      return [];
    }
  }

  async function fmpGeneralNewsFiltered() {
    if (!fmpApiKey) return [];
    try {
      const url = `${FMP_BASE}/api/v4/general_news?page=0&limit=40&apikey=${encodeURIComponent(fmpApiKey)}`;
      const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      const needle = symU.replace(/USDT|USD/g, '');
      const out = [];
      for (const row of arr) {
        const blob = `${row.title || ''} ${row.text || ''}`.toUpperCase();
        if (!blob.includes(symU) && !(needle.length >= 2 && blob.includes(needle))) continue;
        out.push({
          title: row.title || '',
          url: row.url || '',
          source: row.site || 'FMP',
          datetime: row.publishedDate ? String(row.publishedDate) : '',
        });
      }
      return out;
    } catch (e) {
      logProvider('FMP general_news', 'failed', e.message || e);
      return [];
    }
  }

  if (marketType === 'Equity' || marketType === 'Index') {
    buckets.push(await finnhubCompanyNews(), await fmpStockNews(), await fmpGeneralNewsFiltered());
  } else {
    buckets.push(await finnhubCategoryNews(), await fmpGeneralNewsFiltered());
  }

  const seen = new Set();
  const merged = [];
  for (const b of buckets) {
    for (const item of b) {
      const title = String(item.title || '').trim();
      const url = String(item.url || '').trim();
      if (!title && !url) continue;
      const key = url || title;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        title: title || 'Article',
        url: url || '#',
        source: String(item.source || '').slice(0, 80),
        datetime: item.datetime || '',
      });
      if (merged.length >= cap) break;
    }
    if (merged.length >= cap) break;
  }
  return merged.slice(0, cap);
}

/** Parallel cross-asset quotes with Finnhub → FMP fallback per leg (same path as primary quote). */
async function fetchCrossAssetQuotes() {
  const specs = [
    { id: 'eurusd', canonical: 'EURUSD' },
    { id: 'spy', canonical: 'SPY' },
    { id: 'xau', canonical: 'XAUUSD' },
    { id: 'btc', canonical: 'BTCUSD' },
  ];
  const settled = await Promise.all(
    specs.map(async (s) => {
      const r = getResolvedSymbol(s.canonical);
      const pack = await fetchQuoteNumbersForResolved(r);
      const d = pack.data || {};
      const c = d.c != null ? Number(d.c) : null;
      const dp = d.dp != null ? Number(d.dp) : null;
      const usable = pack.ok && (c != null || (dp != null && Number.isFinite(dp)));
      return {
        id: s.id,
        label: s.canonical,
        c: usable ? c : null,
        dp: dp != null && Number.isFinite(dp) ? dp : null,
        ok: usable,
      };
    })
  );
  const out = {};
  for (const row of settled) {
    out[row.id] = { label: row.label, c: row.c, dp: row.dp, ok: row.ok };
  }
  if (process.env.AURA_DECODER_DEBUG === '1') {
    const miss = settled.filter((x) => !x.ok).map((x) => x.id);
    if (miss.length) console.info('[market-decoder-data] cross-asset quote gaps', { legs: miss });
  }
  return out;
}

module.exports = {
  fetchDailySeries,
  fetchDailySeriesWithQuoteFallback,
  fetchQuoteWithLog,
  fetchQuoteNumbersForResolved,
  fetchCrossAssetQuotes,
  fetchMarketDecoderContextNews,
  finnhubCandles,
  minimalSeriesFromQuote,
  toFmpSymbol,
  logProvider,
};
