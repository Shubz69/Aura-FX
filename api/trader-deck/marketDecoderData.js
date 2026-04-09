/**
 * Market Decoder — data acquisition with provider logging and deterministic fallbacks.
 * Order: Finnhub → FMP → Alpha Vantage (where configured).
 */

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getQuote } = require('./services/finnhubService');
const { forProvider, getResolvedSymbol } = require('../ai/utils/symbol-registry');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FMP_BASE = 'https://financialmodelingprep.com';
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
  const { displaySymbol, marketType, canonicalSymbol } = resolved;
  const symbol = canonicalSymbol || displaySymbol;
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

  return {
    ok: false,
    closes: [],
    highs: [],
    lows: [],
    opens: [],
    dates: [],
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

async function fetchCrossAssetQuotes() {
  const symbols = [
    { id: 'eurusd', symbol: 'EURUSD', label: 'EURUSD' },
    { id: 'spy', symbol: 'SPY', label: 'SPY' },
    { id: 'xau', symbol: 'XAUUSD', label: 'XAUUSD' },
    { id: 'btc', symbol: 'BTCUSD', label: 'BTCUSD' },
  ];
  const out = {};
  for (const s of symbols) {
    const q = await getQuote(forProvider(s.symbol, 'finnhub'));
    if (q.ok && q.data) {
      out[s.id] = {
        label: s.label,
        c: q.data.c != null ? Number(q.data.c) : null,
        dp: q.data.dp != null ? Number(q.data.dp) : null,
        ok: true,
      };
    } else {
      out[s.id] = { label: s.label, c: null, dp: null, ok: false };
    }
  }
  return out;
}

module.exports = {
  fetchDailySeries,
  fetchDailySeriesWithQuoteFallback,
  fetchQuoteWithLog,
  fetchCrossAssetQuotes,
  fetchMarketDecoderContextNews,
  finnhubCandles,
  minimalSeriesFromQuote,
  toFmpSymbol,
  logProvider,
};
