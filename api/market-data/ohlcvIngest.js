/**
 * Incremental / backfill OHLCV from Twelve Data into MySQL (tier-1 symbols, daily).
 */

const {
  ensurePipelineTables,
  upsertOhlcvBars,
  upsertOhlcvBackfillState,
  getOhlcvBackfillState,
  upsertAssetPrices,
} = require('./pipeline-store');
const { fetchTimeSeriesDtoFromNetwork, fetchEarliestTimestampCached, fetchQuoteDto } = require('./marketDataLayer');
const td = require('./providers/twelveDataClient');
const { getOhlcvTier1Symbols, FX_OHLCV_PRIORITY_V1, CRYPTO_OHLCV_PRIORITY_V1 } = require('./ohlcvTier1');
const { getMarketStreamProvider } = require('./marketStreamProvider');
const {
  usesForexSessionContext,
  getResolvedSymbol,
  getAssetClass,
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
} = require('../ai/utils/symbol-registry');
const { changeVsPreviousClose } = require('./priceMath');

const INTERVAL = '1day';
const CHUNK_BARS = 5000;

function parseEarliestMetaToMs(meta) {
  if (!meta) return null;
  if (meta.unix_time != null && Number.isFinite(Number(meta.unix_time))) {
    const u = Number(meta.unix_time);
    return u > 1e12 ? u : u * 1000;
  }
  const s = String(meta.datetime || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.UTC(
      parseInt(s.slice(0, 4), 10),
      parseInt(s.slice(5, 7), 10) - 1,
      parseInt(s.slice(8, 10), 10)
    );
  }
  const t = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).getTime();
  return Number.isFinite(t) ? t : null;
}

function quoteDtoToAssetPriceRow(canonical, dto) {
  const r = getResolvedSymbol(canonical);
  const vs = changeVsPreviousClose(dto);
  let ch = vs.change;
  let pct = vs.changePct;
  if (ch == null && dto.open != null && Number.isFinite(dto.open) && dto.open !== 0) {
    ch = dto.last - dto.open;
    pct = (ch / Math.abs(dto.open)) * 100;
  }
  if (ch == null) ch = 0;
  if (pct == null) pct = 0;
  const pc =
    dto.prevClose != null && Number.isFinite(dto.prevClose)
      ? dto.prevClose
      : dto.open != null && Number.isFinite(dto.open)
        ? dto.open
        : dto.last;
  return {
    symbol: r.canonical,
    providerSymbol: r.twelveDataSymbol,
    assetClass: r.assetClass,
    price: dto.last,
    previousClose: pc,
    change: ch,
    changePercent: pct,
    high: dto.high,
    low: dto.low,
    open: dto.open,
    source: 'twelvedata',
    snapshotTs: dto.tsUtcMs ? new Date(dto.tsUtcMs) : new Date(),
    freshnessStatus: 'fresh',
    rawPayload: { forexContext: dto.forexContext, source: 'ohlcv-ingest' },
  };
}

function ohlcvHistoryEarliestFeature(sym) {
  if (usesForexSessionContext(sym)) return 'fx-history-backfill';
  if (getAssetClass(sym) === 'crypto') return 'crypto-history-backfill';
  if (isCboeEuropeUkListedEquity(sym)) return 'cboe-uk-history-backfill';
  if (isCboeAustraliaListedEquity(sym)) return 'cboe-au-history-backfill';
  if (isUkListedEquity(sym)) return 'uk-history-backfill';
  if (isAsxListedEquity(sym)) return 'asx-history-backfill';
  return 'ohlcv-history-backfill';
}

function ohlcvHistoryChunkFeature(sym) {
  if (usesForexSessionContext(sym)) return 'fx-history-chunk';
  if (getAssetClass(sym) === 'crypto') return 'crypto-history-chunk';
  if (isCboeEuropeUkListedEquity(sym)) return 'cboe-uk-history-chunk';
  if (isCboeAustraliaListedEquity(sym)) return 'cboe-au-history-chunk';
  if (isUkListedEquity(sym)) return 'uk-history-chunk';
  if (isAsxListedEquity(sym)) return 'asx-history-chunk';
  return 'ohlcv-history-chunk';
}

function ohlcvIncrementalSeriesFeature(sym) {
  if (usesForexSessionContext(sym)) return 'fx-ohlcv-incremental';
  if (getAssetClass(sym) === 'crypto') return 'crypto-ohlcv-incremental';
  if (isCboeEuropeUkListedEquity(sym)) return 'cboe-uk-ohlcv-incremental';
  if (isCboeAustraliaListedEquity(sym)) return 'cboe-au-ohlcv-incremental';
  if (isUkListedEquity(sym)) return 'uk-ohlcv-incremental';
  if (isAsxListedEquity(sym)) return 'asx-ohlcv-incremental';
  return 'ingest';
}

async function persistQuoteAfterOhlcv(canonical) {
  if (!process.env.MYSQL_HOST) return;
  const c = String(canonical || '').toUpperCase();
  if (
    !usesForexSessionContext(c) &&
    getAssetClass(c) !== 'crypto' &&
    !isAsxListedEquity(c) &&
    !isUkListedEquity(c) &&
    !isCboeEuropeUkListedEquity(c) &&
    !isCboeAustraliaListedEquity(c)
  ) {
    return;
  }
  const feat = usesForexSessionContext(c)
    ? 'fx-ohlcv-ingest-quote'
    : isCboeEuropeUkListedEquity(c)
      ? 'cboe-uk-ohlcv-ingest-quote'
      : isCboeAustraliaListedEquity(c)
        ? 'cboe-au-ohlcv-ingest-quote'
        : isUkListedEquity(c)
        ? 'uk-ohlcv-ingest-quote'
        : isAsxListedEquity(c)
          ? 'asx-ohlcv-ingest-quote'
          : 'crypto-ohlcv-ingest-quote';
  try {
    const dto = await fetchQuoteDto(c, { feature: feat });
    if (dto && dto.last != null && Number.isFinite(dto.last) && dto.last > 0) {
      await upsertAssetPrices([quoteDtoToAssetPriceRow(c, dto)]);
    }
  } catch (_) {
    /* non-fatal */
  }
}

/**
 * Walk backward from latest stored bar using chunked time_series (Twelve Data 5000 bar cap).
 * Use for initial FX history depth beyond incremental forward updates.
 */
async function ingestSymbolHistoricalBackfill(canonical, maxChunks = 12) {
  const sym = String(canonical || '').toUpperCase();
  if (!sym || !process.env.MYSQL_HOST) return { symbol: sym, ok: false, error: 'no_mysql' };
  if (!td.apiKey()) return { symbol: sym, ok: false, error: 'no_td_key' };
  await ensurePipelineTables();

  const earliestMeta = await fetchEarliestTimestampCached(sym, INTERVAL, ohlcvHistoryEarliestFeature(sym));
  const earliestMs = parseEarliestMetaToMs(earliestMeta);
  if (!earliestMs) {
    return { symbol: sym, ok: false, error: 'no_earliest' };
  }

  let state = await getOhlcvBackfillState(sym, INTERVAL);
  let cursorEndMs = Date.now();
  if (state && state.latest_ts != null && Number.isFinite(Number(state.latest_ts))) {
    cursorEndMs = Number(state.latest_ts);
  }

  let totalBars = 0;
  let chunksRun = 0;
  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (let chunk = 0; chunk < maxChunks; chunk += 1) {
    if (cursorEndMs <= earliestMs + 86400000) break;
    const endStr = new Date(cursorEndMs).toISOString().slice(0, 10);
    const startMs = Math.max(earliestMs, cursorEndMs - 4990 * 86400000);
    const startStr = new Date(startMs).toISOString().slice(0, 10);
    if (startStr >= endStr) break;

    /* eslint-disable no-await-in-loop */
    const series = await fetchTimeSeriesDtoFromNetwork(
      sym,
      INTERVAL,
      { start_date: startStr, end_date: endStr, outputsize: CHUNK_BARS },
      ohlcvHistoryChunkFeature(sym)
    );
    /* eslint-enable no-await-in-loop */
    if (!series || !series.bars.length) break;

    const ingestedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const rows = series.bars.map((b) => ({
      canonicalSymbol: sym,
      intervalKey: INTERVAL,
      barTimeUtc: b.tUtcMs,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
      provider: 'twelvedata',
      ingestedAt,
    }));
    /* eslint-disable no-await-in-loop */
    await upsertOhlcvBars(rows);
    /* eslint-enable no-await-in-loop */
    totalBars += rows.length;
    const firstT = series.bars[0].tUtcMs;
    const lastT = series.bars[series.bars.length - 1].tUtcMs;
    const prevEarliest = state && state.earliest_ts != null ? Number(state.earliest_ts) : null;
    const prevLatest = state && state.latest_ts != null ? Number(state.latest_ts) : null;
    await upsertOhlcvBackfillState({
      canonicalSymbol: sym,
      intervalKey: INTERVAL,
      earliestTs: prevEarliest != null ? Math.min(prevEarliest, firstT) : firstT,
      latestTs: prevLatest != null ? Math.max(prevLatest, lastT) : lastT,
      lastFullBackfillAt: ingestedAt,
      lastIncrementalAt: nowSql,
      status: 'backfill',
      errorNote: null,
    });
    state = await getOhlcvBackfillState(sym, INTERVAL);
    cursorEndMs = firstT - 86400000;
    chunksRun += 1;
    if (series.bars.length < 50) break;
  }

  await upsertOhlcvBackfillState({
    canonicalSymbol: sym,
    intervalKey: INTERVAL,
    lastIncrementalAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    status: 'ok',
    errorNote: null,
  });

  await persistQuoteAfterOhlcv(sym);

  return { symbol: sym, ok: true, bars: totalBars, chunks: chunksRun };
}

async function runFxPriorityDeepBackfill(maxPairs = 6, maxChunksPerPair = 10) {
  const n = Math.max(1, Math.min(20, Number(maxPairs) || 6));
  const ch = Math.max(1, Math.min(30, Number(maxChunksPerPair) || 10));
  const slice = FX_OHLCV_PRIORITY_V1.slice(0, n);
  const results = [];
  for (const sym of slice) {
    /* eslint-disable no-await-in-loop */
    const r = await ingestSymbolHistoricalBackfill(sym, ch);
    /* eslint-enable no-await-in-loop */
    results.push(r);
  }
  return { ok: true, count: results.length, results };
}

async function runCryptoPriorityDeepBackfill(maxPairs = 10, maxChunksPerPair = 10) {
  const n = Math.max(1, Math.min(25, Number(maxPairs) || 10));
  const ch = Math.max(1, Math.min(30, Number(maxChunksPerPair) || 10));
  const slice = CRYPTO_OHLCV_PRIORITY_V1.slice(0, n);
  const results = [];
  for (const sym of slice) {
    /* eslint-disable no-await-in-loop */
    const r = await ingestSymbolHistoricalBackfill(sym, ch);
    /* eslint-enable no-await-in-loop */
    results.push(r);
  }
  return { ok: true, count: results.length, results };
}

async function ingestSymbolIncremental(canonical) {
  const sym = String(canonical || '').toUpperCase();
  if (!sym || !process.env.MYSQL_HOST) return { symbol: sym, ok: false, error: 'no_mysql' };
  await ensurePipelineTables();

  const state = await getOhlcvBackfillState(sym, INTERVAL);
  const now = new Date();
  const endStr = now.toISOString().slice(0, 10);
  let startStr;
  if (state && state.latest_ts) {
    const next = new Date(Number(state.latest_ts) + 86400000);
    startStr = next.toISOString().slice(0, 10);
  } else {
    const ago = new Date(now.getTime() - 365 * 86400000 * 5);
    startStr = ago.toISOString().slice(0, 10);
  }

  if (startStr > endStr) {
    await upsertOhlcvBackfillState({
      canonicalSymbol: sym,
      intervalKey: INTERVAL,
      lastIncrementalAt: now.toISOString().slice(0, 19).replace('T', ' '),
      status: 'idle',
    });
    return { symbol: sym, ok: true, skipped: true };
  }

  const series = await fetchTimeSeriesDtoFromNetwork(
    sym,
    INTERVAL,
    { start_date: startStr, end_date: endStr, outputsize: CHUNK_BARS },
    ohlcvIncrementalSeriesFeature(sym)
  );
  if (!series || !series.bars.length) {
    await upsertOhlcvBackfillState({
      canonicalSymbol: sym,
      intervalKey: INTERVAL,
      lastIncrementalAt: now.toISOString().slice(0, 19).replace('T', ' '),
      status: 'empty',
      errorNote: 'no_bars',
    });
    return { symbol: sym, ok: false, error: 'no_bars' };
  }

  const ingestedAt = now.toISOString().slice(0, 19).replace('T', ' ');
  const rows = series.bars.map((b) => ({
    canonicalSymbol: sym,
    intervalKey: INTERVAL,
    barTimeUtc: b.tUtcMs,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
    provider: 'twelvedata',
    ingestedAt,
  }));
  await upsertOhlcvBars(rows);
  try {
    await getMarketStreamProvider().onOhlcvBarsWritten({
      canonicalSymbol: sym,
      intervalKey: INTERVAL,
      barCount: rows.length,
      latestBarTimeUtcMs: rows.length ? rows[rows.length - 1].barTimeUtc : undefined,
    });
  } catch (_) {}

  const earliest = series.bars[0].tUtcMs;
  const latest = series.bars[series.bars.length - 1].tUtcMs;
  await upsertOhlcvBackfillState({
    canonicalSymbol: sym,
    intervalKey: INTERVAL,
    earliestTs: earliest,
    latestTs: latest,
    lastIncrementalAt: ingestedAt,
    status: 'ok',
    errorNote: null,
  });

  await persistQuoteAfterOhlcv(sym);

  return { symbol: sym, ok: true, bars: series.bars.length };
}

async function runTier1Incremental(limit = 80) {
  if (!process.env.MYSQL_HOST) {
    return { ok: false, error: 'MYSQL_HOST unset', results: [] };
  }
  if (!td.apiKey()) {
    return { ok: false, error: 'TWELVE_DATA_API_KEY unset', results: [] };
  }
  await ensurePipelineTables();
  const symbols = getOhlcvTier1Symbols().slice(0, Math.max(1, Number(limit) || 80));
  const results = [];
  for (const sym of symbols) {
    // eslint-disable-next-line no-await-in-loop
    const r = await ingestSymbolIncremental(sym);
    results.push(r);
  }
  return { ok: true, count: results.length, results };
}

module.exports = {
  ingestSymbolIncremental,
  ingestSymbolHistoricalBackfill,
  runTier1Incremental,
  runFxPriorityDeepBackfill,
  runCryptoPriorityDeepBackfill,
  INTERVAL,
};
