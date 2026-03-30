/**
 * Market Decoder — data acquisition with provider logging and deterministic fallbacks.
 * Order: Finnhub → FMP → Alpha Vantage (where configured).
 */

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getQuote } = require('./services/finnhubService');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FMP_BASE = 'https://financialmodelingprep.com';
const TIMEOUT_MS = 11000;

function logProvider(tag, status, detail) {
  const msg = `[market-decoder-data] ${tag} ${status}${detail ? `: ${detail}` : ''}`;
  if (status === 'failed' || status === 'fallback') console.warn(msg);
  else console.info(msg);
}

/**
 * @typedef {{ name: string, status: 'ok'|'fallback'|'failed', detail?: string }} ProviderEntry
 */

async function finnhubCandles(candleKind, symbol, fromSec, toSec) {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) {
    logProvider('Finnhub candles', 'failed', 'FINNHUB_API_KEY missing');
    return { ok: false, closes: [], highs: [], lows: [], times: [], error: 'no_key' };
  }
  const path = candleKind === 'forex' ? 'forex/candle' : candleKind === 'crypto' ? 'crypto/candle' : 'stock/candle';
  const url = `${FINNHUB_BASE}/${path}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(finnhubApiKey)}`;
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) {
      logProvider('Finnhub candles', 'failed', String(res.status));
      return { ok: false, closes: [], highs: [], lows: [], times: [], error: String(res.status) };
    }
    const j = await res.json();
    if (!j || j.s !== 'ok' || !Array.isArray(j.c) || j.c.length === 0) {
      logProvider('Finnhub candles', 'failed', 'empty or s!=ok');
      return { ok: false, closes: [], highs: [], lows: [], times: [], error: 'no_data' };
    }
    logProvider('Finnhub candles', 'ok', `${j.c.length} bars`);
    return {
      ok: true,
      closes: j.c.map(Number),
      highs: (j.h || []).map(Number),
      lows: (j.l || []).map(Number),
      times: j.t || [],
      source: 'finnhub',
    };
  } catch (e) {
    logProvider('Finnhub candles', 'failed', e.message || e);
    return { ok: false, closes: [], highs: [], lows: [], times: [], error: e.message || 'err' };
  }
}

/** FMP historical daily — stocks/FX/crypto symbols as FMP expects (e.g. EURUSD, AAPL) */
async function fmpHistoricalDaily(fmpSymbol) {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return { ok: false, closes: [], highs: [], lows: [], error: 'no_fmp_key' };
  try {
    const url = `${FMP_BASE}/api/v3/historical-price-full/${encodeURIComponent(fmpSymbol)}?apikey=${encodeURIComponent(fmpApiKey)}`;
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, closes: [], highs: [], lows: [], error: `http ${res.status}` };
    const j = await res.json();
    const hist = j && Array.isArray(j.historical) ? j.historical : [];
    if (!hist.length) return { ok: false, closes: [], highs: [], lows: [], error: 'empty' };
    const asc = [...hist].reverse();
    const closes = asc.map((r) => Number(r.close)).filter((x) => !Number.isNaN(x));
    const highs = asc.map((r) => Number(r.high)).filter((x) => !Number.isNaN(x));
    const lows = asc.map((r) => Number(r.low)).filter((x) => !Number.isNaN(x));
    if (!closes.length) return { ok: false, closes: [], highs: [], lows: [], error: 'parse' };
    logProvider('FMP historical', 'ok', `${closes.length} bars ${fmpSymbol}`);
    return { ok: true, closes, highs, lows, source: 'fmp' };
  } catch (e) {
    logProvider('FMP historical', 'failed', e.message || e);
    return { ok: false, closes: [], highs: [], lows: [], error: e.message || 'err' };
  }
}

/** Map resolved asset to FMP symbol */
function toFmpSymbol(resolved) {
  const { displaySymbol, marketType } = resolved;
  if (marketType === 'FX' || marketType === 'Crypto') return displaySymbol;
  return displaySymbol.split('.')[0];
}

async function alphaVantageDaily(symbolForAv) {
  const key = process.env.ALPHA_VANTAGE_API_KEY && String(process.env.ALPHA_VANTAGE_API_KEY).trim();
  if (!key) return { ok: false, closes: [], highs: [], lows: [], error: 'no_av_key' };
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbolForAv)}&apikey=${encodeURIComponent(key)}&outputsize=compact`;
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, closes: [], highs: [], lows: [], error: String(res.status) };
    const j = await res.json();
    const series = j && (j['Time Series (Daily)'] || j['Time Series Daily']);
    if (!series || typeof series !== 'object') {
      logProvider('Alpha Vantage daily', 'failed', j['Note'] || j['Error Message'] || 'no series');
      return { ok: false, closes: [], highs: [], lows: [], error: 'no_series' };
    }
    const dates = Object.keys(series).sort();
    const closes = [];
    const highs = [];
    const lows = [];
    for (const d of dates) {
      const o = series[d];
      closes.push(Number(o['5. adjusted close'] || o['4. close']));
      highs.push(Number(o['2. high']));
      lows.push(Number(o['3. low']));
    }
    if (!closes.length) return { ok: false, closes: [], highs: [], lows: [], error: 'empty' };
    logProvider('Alpha Vantage daily', 'ok', `${closes.length} bars`);
    return { ok: true, closes, highs, lows, source: 'alphavantage' };
  } catch (e) {
    logProvider('Alpha Vantage daily', 'failed', e.message || e);
    return { ok: false, closes: [], highs: [], lows: [], error: e.message || 'err' };
  }
}

/**
 * Resolve OHLC series: Finnhub → FMP → Alpha Vantage (stocks only for AV).
 */
async function fetchDailySeries(resolved, fromSec, toSec) {
  /** @type {ProviderEntry[]} */
  const log = [];
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

  return {
    ok: false,
    closes: [],
    highs: [],
    lows: [],
    times: [],
    providerLog: log,
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
      times: [],
      source: mini.source,
      providerLog: log,
      isSparse: true,
    };
  }
  return primary;
}

async function fetchQuoteWithLog(finnhubSymbol, resolved) {
  /** @type {ProviderEntry[]} */
  const log = [];
  const q = await getQuote(finnhubSymbol);
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

async function fetchCrossAssetQuotes() {
  const symbols = [
    { id: 'eurusd', fh: 'OANDA:EUR_USD', label: 'EURUSD' },
    { id: 'spy', fh: 'SPY', label: 'SPY' },
    { id: 'xau', fh: 'OANDA:XAU_USD', label: 'XAUUSD' },
    { id: 'btc', fh: 'BINANCE:BTCUSDT', label: 'BTCUSD' },
  ];
  const out = {};
  for (const s of symbols) {
    const q = await getQuote(s.fh);
    if (q.ok && q.data) {
      out[s.id] = { label: s.label, dp: q.data.dp != null ? Number(q.data.dp) : null, ok: true };
    } else {
      out[s.id] = { label: s.label, dp: null, ok: false };
    }
  }
  return out;
}

module.exports = {
  fetchDailySeries,
  fetchDailySeriesWithQuoteFallback,
  fetchQuoteWithLog,
  fetchCrossAssetQuotes,
  finnhubCandles,
  minimalSeriesFromQuote,
  toFmpSymbol,
  logProvider,
};
