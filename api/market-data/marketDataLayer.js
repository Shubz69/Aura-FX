/**
 * Twelve Data–first market data layer: normalized QuoteDTO / CandleSeriesDTO, cache, throttle, metrics.
 */

const { getOrFetch, peekCached } = require('../cache');
const {
  getResolvedSymbol,
  usesForexSessionContext,
  getAssetClass,
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
  isVentureRegionalEquity,
  canonicalUsesUkVenueMoneyNormalization,
} = require('../ai/utils/symbol-registry');
const { ukTdQuoteScaleToPounds, scaleUkTdNumericFields } = require('./equities/ukMarketGuards');
const { emptyQuoteDTO, emptyCandleSeriesDTO } = require('./dto');
const {
  quoteKey,
  seriesKey,
  earliestKey,
  forexMarketStateKey,
  forexExchangeScheduleKey,
  cryptoMarketStateKey,
  exchangeRateKey,
  currencyConversionKey,
  QUOTE_TTL_MS,
  FX_QUOTE_TTL_MS,
  SERIES_TTL_MS,
  EARLIEST_TTL_MS,
  FX_MARKET_STATE_TTL_MS,
  FX_EXCHANGE_SCHEDULE_TTL_MS,
  CRYPTO_MARKET_STATE_TTL_MS,
  EXCHANGE_RATE_TTL_MS,
  CURRENCY_CONVERSION_TTL_MS,
} = require('./cachePolicy');
const td = require('./providers/twelveDataClient');
const metrics = require('./tdMetrics');

function num(x) {
  if (x == null || x === '') return null;
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseTdDatetimeToUtcMs(datetimeStr, unixFallback) {
  if (unixFallback != null && Number.isFinite(Number(unixFallback))) {
    const u = Number(unixFallback);
    return u > 1e12 ? u : u * 1000;
  }
  if (!datetimeStr) return null;
  const s = String(datetimeStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.UTC(
      parseInt(s.slice(0, 4), 10),
      parseInt(s.slice(5, 7), 10) - 1,
      parseInt(s.slice(8, 10), 10)
    );
  }
  const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function mapTdQuotePayload(data, canonical, providerSymbol, assetClass) {
  if (!data || data.code || data.status === 'error') return null;
  const c = String(canonical || '').toUpperCase();
  let work = data;
  let currencyOut = data.currency || null;
  if (canonicalUsesUkVenueMoneyNormalization(c)) {
    const scale = ukTdQuoteScaleToPounds(data.currency);
    if (scale !== 1) {
      work = { ...data };
      scaleUkTdNumericFields(work, scale);
      currencyOut = 'GBP';
    }
  }
  const close = num(work.close);
  const last = close != null ? close : num(work.price);
  if (last == null || last <= 0) return null;
  const prev = num(work.previous_close);
  return emptyQuoteDTO({
    canonicalSymbol: canonical,
    providerSymbol,
    assetClass,
    source: 'twelvedata',
    last,
    bid: num(work.bid),
    ask: num(work.ask),
    open: num(work.open),
    high: num(work.high),
    low: num(work.low),
    prevClose: prev,
    volume: num(work.volume),
    averageVolume: num(work.average_volume),
    currency: currencyOut,
    exchange: work.exchange || null,
    tsUtcMs: parseTdDatetimeToUtcMs(work.datetime, work.timestamp),
    raw: data,
  });
}

function mapTdPricePayload(data, canonical, providerSymbol, assetClass) {
  if (!data || data.code || data.status === 'error') return null;
  const c = String(canonical || '').toUpperCase();
  let work = data;
  let currencyOut = data.currency || null;
  if (canonicalUsesUkVenueMoneyNormalization(c)) {
    const scale = ukTdQuoteScaleToPounds(data.currency);
    if (scale !== 1) {
      work = { ...data };
      scaleUkTdNumericFields(work, scale);
      currencyOut = 'GBP';
    }
  }
  const last = num(work.price);
  if (last == null || last <= 0) return null;
  return emptyQuoteDTO({
    canonicalSymbol: canonical,
    providerSymbol,
    assetClass,
    source: 'twelvedata',
    last,
    prevClose: null,
    open: null,
    high: null,
    low: null,
    currency: currencyOut,
    tsUtcMs: Date.now(),
    raw: data,
  });
}

function normalizeTdMarketStatePayload(data) {
  if (!data || data.code || data.status === 'error') return null;
  return {
    isMarketOpen: data.is_market_open === true || data.is_market_open === 'true',
    exchange: data.exchange || null,
    name: data.name || null,
    country: data.country || null,
    currency: data.currency || null,
    timezone: data.timezone || null,
    timeToOpen: data.time_to_open || null,
    timeToClose: data.time_to_close || null,
    session: data.session || null,
  };
}

async function attachTdSessionContext(dto, resolved) {
  if (!dto) return dto;
  const wantMs = usesForexSessionContext(resolved.canonical) || resolved.assetClass === 'crypto';
  if (!wantMs) return dto;
  try {
    const sym = resolved.twelveDataSymbol;
    const msKey =
      resolved.assetClass === 'crypto' ? cryptoMarketStateKey(resolved.canonical) : forexMarketStateKey(resolved.canonical);
    const msTtl =
      resolved.assetClass === 'crypto' ? CRYPTO_MARKET_STATE_TTL_MS : FX_MARKET_STATE_TTL_MS;
    const ms = await getOrFetch(
      msKey,
      async () => {
        const r = await td.fetchMarketState(sym);
        if (!r.ok || !r.data) return null;
        return normalizeTdMarketStatePayload(r.data);
      },
      msTtl
    );
    let exchangeSchedule = null;
    if (usesForexSessionContext(resolved.canonical)) {
      const mic = String(process.env.TWELVE_DATA_FX_EXCHANGE_MIC || '').trim();
      if (mic) {
        const today = new Date().toISOString().slice(0, 10);
        exchangeSchedule = await getOrFetch(
          forexExchangeScheduleKey(mic, today, today),
          async () => {
            const r = await td.fetchExchangeSchedule({
              exchange: mic,
              start_date: today,
              end_date: today,
            });
            if (!r.ok || !r.data || r.data.status === 'error') return null;
            return r.data;
          },
          FX_EXCHANGE_SCHEDULE_TTL_MS
        );
      }
    }
    dto.forexContext = { marketState: ms, exchangeSchedule };
  } catch (_) {
    /* non-fatal */
  }
  return dto;
}

async function twelveDataQuoteToDto(canonical, feature) {
  const resolved = getResolvedSymbol(canonical);
  const sym = resolved.twelveDataSymbol;
  const assetClass = resolved.assetClass || 'stock';
  let res = await td.fetchQuote(sym);
  if (res.ok && res.data) {
    const dto = mapTdQuotePayload(res.data, resolved.canonical, sym, assetClass);
    if (dto) {
      metrics.bump(feature, 'twelvedata');
      await attachTdSessionContext(dto, resolved);
      return dto;
    }
  }
  res = await td.fetchPrice(sym);
  if (res.ok && res.data) {
    const dto = mapTdPricePayload(res.data, resolved.canonical, sym, assetClass);
    if (dto) {
      metrics.bump(feature, 'twelvedata');
      await attachTdSessionContext(dto, resolved);
      return dto;
    }
  }
  return null;
}

/**
 * @param {string} canonical
 * @param {{ feature?: string }} [opts]
 * @returns {Promise<import('./dto').QuoteDTO|null>}
 */
function isFxLayerSymbol(canonical) {
  return usesForexSessionContext(canonical);
}

function isCryptoLayerSymbol(canonical) {
  return getAssetClass(canonical) === 'crypto';
}

function isAsxEquityLayerSymbol(canonical) {
  return isAsxListedEquity(canonical);
}

function isUkEquityLayerSymbol(canonical) {
  return isUkListedEquity(canonical);
}

function isCboeUkEquityLayerSymbol(canonical) {
  return isCboeEuropeUkListedEquity(canonical);
}

function isCboeAuEquityLayerSymbol(canonical) {
  return isCboeAustraliaListedEquity(canonical);
}

function isVentureEquityLayerSymbol(canonical) {
  return isVentureRegionalEquity(canonical);
}

async function fetchQuoteDto(canonical, opts = {}) {
  const c = String(canonical || '').toUpperCase();
  const isFx = isFxLayerSymbol(c);
  const isCrypto = isCryptoLayerSymbol(c);
  const feature =
    opts.feature ||
    (isFx
      ? 'fx-quote'
      : isCrypto
        ? 'crypto-quote'
        : isCboeUkEquityLayerSymbol(c)
          ? 'cboe-uk-quote'
          : isUkEquityLayerSymbol(c)
            ? 'uk-quote'
            : isCboeAuEquityLayerSymbol(c)
              ? 'cboe-au-quote'
              : isVentureEquityLayerSymbol(c)
                ? 'venture-quote'
                : isAsxEquityLayerSymbol(c)
                  ? 'asx-quote'
                  : 'quote');
  if (!td.apiKey() || td.primaryDisabled()) return null;
  const key = quoteKey(c);
  const quoteTtl = isFx ? FX_QUOTE_TTL_MS : QUOTE_TTL_MS;
  if (isFx || isCrypto) {
    const hit = peekCached(key, quoteTtl);
    if (hit != null) {
      if (isFx) metrics.bumpFxLayerCache('quote', true);
      else metrics.bumpCryptoLayerCache('quote', true);
      return hit;
    }
    if (isFx) metrics.bumpFxLayerCache('quote', false);
    else metrics.bumpCryptoLayerCache('quote', false);
  }
  return getOrFetch(key, () => twelveDataQuoteToDto(c, feature), quoteTtl);
}

/**
 * Invalidate quote cache for symbol (e.g. after WS update — future).
 */
function invalidateQuoteCache(canonical) {
  const { deleteCached } = require('../cache');
  deleteCached(quoteKey(String(canonical || '').toUpperCase()));
}

function mapTdTimeSeriesToCandles(data, canonical, providerSymbol, interval) {
  if (!data || data.code || data.status === 'error' || !Array.isArray(data.values)) return null;
  const tz = data.meta && data.meta.timezone ? data.meta.timezone : null;
  const canon = String(canonical || '').toUpperCase();
  const metaCur = data.meta && (data.meta.currency || data.meta.exchange_currency);
  const pxScale =
    canonicalUsesUkVenueMoneyNormalization(canon) && metaCur ? ukTdQuoteScaleToPounds(metaCur) : 1;
  const bars = [];
  for (const row of data.values) {
    const tMs = parseTdDatetimeToUtcMs(row.datetime, row.unix_time);
    let o = num(row.open);
    let h = num(row.high);
    let l = num(row.low);
    let c = num(row.close);
    const v = num(row.volume);
    if (pxScale !== 1) {
      if (o != null) o *= pxScale;
      if (h != null) h *= pxScale;
      if (l != null) l *= pxScale;
      if (c != null) c *= pxScale;
    }
    if (c == null && o == null) continue;
    bars.push({
      tUtcMs: tMs || 0,
      o: o != null ? o : c,
      h: h != null ? h : c,
      l: l != null ? l : c,
      c: c != null ? c : o,
      v,
    });
  }
  bars.sort((a, b) => a.tUtcMs - b.tUtcMs);
  return emptyCandleSeriesDTO({
    canonicalSymbol: canonical,
    providerSymbol,
    interval,
    source: 'twelvedata',
    timezone: tz,
    bars,
    raw: data,
  });
}

function parseRangeOptsToMs(rangeOpts) {
  if (!rangeOpts) return null;
  const sd = rangeOpts.start_date ?? rangeOpts.startDate;
  const ed = rangeOpts.end_date ?? rangeOpts.endDate;
  if (!sd || !ed) return null;
  const start = String(sd).trim().slice(0, 10);
  const end = String(ed).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const fromMs = Date.UTC(
    parseInt(start.slice(0, 4), 10),
    parseInt(start.slice(5, 7), 10) - 1,
    parseInt(start.slice(8, 10), 10)
  );
  const toMs = Date.UTC(
    parseInt(end.slice(0, 4), 10),
    parseInt(end.slice(5, 7), 10) - 1,
    parseInt(end.slice(8, 10), 10),
    23,
    59,
    59,
    999
  );
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return null;
  return { fromMs, toMs };
}

function fxDbSeriesUsable(rows, fromMs, toMs, intervalKey, dailyFreshMs) {
  if (!rows || rows.length < 3) return false;
  const firstT = Number(rows[0].bar_time_utc);
  const lastT = Number(rows[rows.length - 1].bar_time_utc);
  if (!Number.isFinite(firstT) || !Number.isFinite(lastT)) return false;
  const slack = 5 * 86400000;
  if (firstT > fromMs + slack) return false;
  if (lastT < toMs - slack) return false;
  if (intervalKey === '1day') {
    const age = Date.now() - lastT;
    if (age > dailyFreshMs) return false;
  }
  return true;
}

function candleSeriesFromOhlcvRows(canonical, providerSymbol, interval, rows, meta = {}) {
  const bars = [];
  for (const r of rows) {
    const tMs = Number(r.bar_time_utc);
    const o = num(r.open_p);
    const h = num(r.high_p);
    const l = num(r.low_p);
    const c = num(r.close_p);
    const v = r.volume != null ? num(r.volume) : null;
    if (!Number.isFinite(tMs) || (c == null && o == null)) continue;
    bars.push({
      tUtcMs: tMs,
      o: o != null ? o : c,
      h: h != null ? h : c,
      l: l != null ? l : c,
      c: c != null ? c : o,
      v,
    });
  }
  bars.sort((a, b) => a.tUtcMs - b.tUtcMs);
  return emptyCandleSeriesDTO({
    canonicalSymbol: canonical,
    providerSymbol,
    interval,
    source: 'mysql_ohlcv',
    timezone: null,
    bars,
    raw: meta,
  });
}

async function fetchTimeSeriesDtoFromNetwork(canonical, interval, rangeOpts, feature) {
  const resolved = getResolvedSymbol(canonical);
  const sym = resolved.twelveDataSymbol;
  if (!td.apiKey() || td.primaryDisabled()) return null;
  const res = await td.fetchTimeSeries(sym, interval, rangeOpts || {});
  if (!res.ok || !res.data) {
    return null;
  }
  const series = mapTdTimeSeriesToCandles(res.data, resolved.canonical, sym, interval);
  if (series && series.bars.length) {
    metrics.bump(feature || 'series', 'twelvedata');
    return series;
  }
  return null;
}

/**
 * @param {string} canonical
 * @param {string} interval
 * @param {string} rangeToken - stable id for cache (e.g. start_end or outputsize)
 * @param {object} rangeOpts - twelveData time_series params
 * @param {string} [feature]
 */
async function fetchTimeSeriesDto(canonical, interval, rangeToken, rangeOpts, feature) {
  const c = String(canonical || '').toUpperCase();
  const isFx = isFxLayerSymbol(c);
  const isCrypto = isCryptoLayerSymbol(c);
  const feat = feature || (isFx ? 'fx-series' : isCrypto ? 'crypto-series' : 'series');
  const key = seriesKey(c, interval, rangeToken);
  if (isFx || isCrypto) {
    const hit = peekCached(key, SERIES_TTL_MS);
    if (hit != null) {
      if (isFx) metrics.bumpFxLayerCache('series', true);
      else metrics.bumpCryptoLayerCache('series', true);
      return hit;
    }
    if (isFx) metrics.bumpFxLayerCache('series', false);
    else metrics.bumpCryptoLayerCache('series', false);
  }
  return getOrFetch(
    key,
    async () => {
      const intNorm = String(interval || '').toLowerCase();
      const isAsxEq = isAsxEquityLayerSymbol(c);
      const isUkEq = isUkEquityLayerSymbol(c);
      const isCboeUkEq = isCboeUkEquityLayerSymbol(c);
      const isCboeAuEq = isCboeAuEquityLayerSymbol(c);
      const isVentureEq = isVentureEquityLayerSymbol(c);
      if ((isFx || isAsxEq || isUkEq || isCboeUkEq || isCboeAuEq || isVentureEq) && process.env.MYSQL_HOST && intNorm === '1day') {
        const rangeMs = parseRangeOptsToMs(rangeOpts);
        if (rangeMs) {
          const { queryOhlcvRange, OHLCV_DAILY_FRESH_MS } = require('./pipeline-store');
          const rows = await queryOhlcvRange(c, '1day', rangeMs.fromMs, rangeMs.toMs);
          if (fxDbSeriesUsable(rows, rangeMs.fromMs, rangeMs.toMs, '1day', OHLCV_DAILY_FRESH_MS)) {
            const resolved = getResolvedSymbol(c);
            return candleSeriesFromOhlcvRows(
              resolved.canonical,
              resolved.twelveDataSymbol,
              interval,
              rows,
              { fromDb: true, rowCount: rows.length }
            );
          }
        }
      }
      return fetchTimeSeriesDtoFromNetwork(c, interval, rangeOpts, feat);
    },
    SERIES_TTL_MS
  );
}

async function fetchEarliestTimestampCached(canonical, interval, feature) {
  const resolved = getResolvedSymbol(canonical);
  const sym = resolved.twelveDataSymbol;
  const c = resolved.canonical;
  const key = earliestKey(c, interval);
  if (!td.apiKey() || td.primaryDisabled()) return null;
  const isFx = isFxLayerSymbol(c);
  const isCrypto = isCryptoLayerSymbol(c);
  const isAsxEq = isAsxEquityLayerSymbol(c);
  const isUkEq = isUkEquityLayerSymbol(c);
  const isCboeUkEq = isCboeUkEquityLayerSymbol(c);
  const isCboeAuEq = isCboeAuEquityLayerSymbol(c);
  const isVentureEq = isVentureEquityLayerSymbol(c);
  const feat =
    feature ||
    (isFx
      ? 'fx-earliest'
      : isCrypto
        ? 'crypto-earliest'
        : isCboeUkEq
          ? 'cboe-uk-earliest'
          : isUkEq
            ? 'uk-earliest'
            : isCboeAuEq
              ? 'cboe-au-earliest'
              : isVentureEq
                ? 'venture-earliest'
                : isAsxEq
                  ? 'asx-earliest'
                  : 'earliest');
  return getOrFetch(
    key,
    async () => {
      const res = await td.fetchEarliestTimestamp(sym, interval);
      if (!res.ok || !res.data || res.data.datetime == null) {
        return null;
      }
      metrics.bump(feat, 'twelvedata');
      return { datetime: res.data.datetime, unix_time: res.data.unix_time };
    },
    EARLIEST_TTL_MS
  );
}

/**
 * Normalized exchange rate (Twelve Data /exchange_rate). Pair symbol e.g. BTC/USD, USD/EUR.
 * @param {string} pairSymbol - BASE/QUOTE for Twelve Data
 * @param {{ feature?: string }} [opts]
 */
async function fetchExchangeRateNormalized(pairSymbol, opts = {}) {
  const sym = String(pairSymbol || '').trim();
  if (!sym || !td.apiKey() || td.primaryDisabled()) return null;
  const key = exchangeRateKey(sym);
  const feat = opts.feature || 'md-exchange-rate';
  return getOrFetch(
    key,
    async () => {
      const r = await td.fetchExchangeRate({ symbol: sym });
      if (!r.ok || !r.data || r.data.status === 'error') return null;
      metrics.bump(feat, 'twelvedata');
      return {
        schemaVersion: 1,
        pair: sym,
        rate: num(r.data.rate ?? r.data.close ?? r.data.price),
        datetime: r.data.datetime || null,
        raw: r.data,
      };
    },
    EXCHANGE_RATE_TTL_MS
  );
}

/**
 * Normalized currency conversion (Twelve Data /currency_conversion).
 * @param {string} pairSymbol - e.g. USD/EUR
 * @param {number|string} [amount]
 */
async function fetchCurrencyConversionNormalized(pairSymbol, amount = 1, opts = {}) {
  const sym = String(pairSymbol || '').trim();
  if (!sym || !td.apiKey() || td.primaryDisabled()) return null;
  const key = currencyConversionKey(sym, amount);
  const feat = opts.feature || 'md-currency-conversion';
  return getOrFetch(
    key,
    async () => {
      const r = await td.fetchCurrencyConversion({ symbol: sym, amount });
      if (!r.ok || !r.data || r.data.status === 'error') return null;
      metrics.bump(feat, 'twelvedata');
      return {
        schemaVersion: 1,
        pair: sym,
        amount: num(r.data.amount) ?? Number(amount),
        rate: num(r.data.rate),
        result: num(r.data.result ?? r.data.converted),
        raw: r.data,
      };
    },
    CURRENCY_CONVERSION_TTL_MS
  );
}

/**
 * One technical indicator series (central gate). Off unless TD_CRYPTO_TECH_INDICATORS=1.
 * @param {string} indicator - e.g. rsi
 * @param {Record<string, string|number>} params - symbol (provider format), interval, outputsize, etc.
 */
async function fetchTechnicalIndicatorNormalized(indicator, params = {}, opts = {}) {
  const techOn =
    String(process.env.TD_TECH_INDICATORS || '').trim() === '1' ||
    String(process.env.TD_CRYPTO_TECH_INDICATORS || '').trim() === '1';
  if (!techOn) return null;
  if (!td.apiKey() || td.primaryDisabled()) return null;
  const feat = opts.feature || `td-ti-${String(indicator || 'ind').toLowerCase()}`;
  const r = await td.fetchTechnicalIndicator(indicator, params);
  if (!r.ok || !r.data || r.data.status === 'error') return null;
  metrics.bump(feat, 'twelvedata');
  return { schemaVersion: 1, indicator: String(indicator), meta: r.data.meta || null, values: r.data.values || [] };
}

/**
 * Twelve Data symbol_search (discovery). Does not use quote cache.
 * @param {string} query
 * @param {{ outputsize?: number }} [opts]
 */
async function searchSymbolsTwelveData(query, opts = {}) {
  if (!td.apiKey() || td.primaryDisabled()) return { ok: false, error: 'td_disabled', data: null };
  const r = await td.fetchSymbolSearch(query, opts);
  metrics.bump(opts.feature || 'symbol-search', 'twelvedata');
  return r;
}

module.exports = {
  fetchQuoteDto,
  fetchTimeSeriesDto,
  fetchTimeSeriesDtoFromNetwork,
  fetchEarliestTimestampCached,
  fetchExchangeRateNormalized,
  fetchCurrencyConversionNormalized,
  fetchTechnicalIndicatorNormalized,
  mapTdQuotePayload,
  mapTdTimeSeriesToCandles,
  invalidateQuoteCache,
  twelveDataQuoteToDto,
  isFxLayerSymbol,
  isAsxEquityLayerSymbol,
  isUkEquityLayerSymbol,
  isCboeUkEquityLayerSymbol,
  isCboeAuEquityLayerSymbol,
  isCryptoLayerSymbol,
  searchSymbolsTwelveData,
  metricsSnapshot: () => metrics.snapshot(),
};
