/**
 * Lightweight Twelve Data instrumentation (per-process).
 */

const tdGate = require('./tdRateLimiter');

const WINDOW_MS = 60000;
const events = [];

/** @type {{ twelvedata: number, fallback: number, byFeature: Record<string, {td:number,fb:number}> }} */
const totals = { twelvedata: 0, fallback: 0, byFeature: {} };

/** In-process FX quote/series cache instrumentation (peek-based, see marketDataLayer). */
const fxCache = {
  quoteHits: 0,
  quoteMisses: 0,
  seriesHits: 0,
  seriesMisses: 0,
};

/** Crypto quote/series cache (same pattern as FX layer). */
const cryptoCache = {
  quoteHits: 0,
  quoteMisses: 0,
  seriesHits: 0,
  seriesMisses: 0,
};

function bump(feature, provider) {
  const now = Date.now();
  events.push({ t: now, feature: feature || 'unknown', provider: provider || 'unknown' });
  const cutoff = now - WINDOW_MS;
  while (events.length && events[0].t < cutoff) events.shift();

  if (provider === 'twelvedata') totals.twelvedata += 1;
  else totals.fallback += 1;
  const f = feature || 'unknown';
  if (!totals.byFeature[f]) totals.byFeature[f] = { td: 0, fb: 0 };
  if (provider === 'twelvedata') totals.byFeature[f].td += 1;
  else totals.byFeature[f].fb += 1;
}

function bumpFxLayerCache(kind, hit) {
  if (kind === 'quote') {
    if (hit) fxCache.quoteHits += 1;
    else fxCache.quoteMisses += 1;
  } else if (kind === 'series') {
    if (hit) fxCache.seriesHits += 1;
    else fxCache.seriesMisses += 1;
  }
}

function bumpCryptoLayerCache(kind, hit) {
  if (kind === 'quote') {
    if (hit) cryptoCache.quoteHits += 1;
    else cryptoCache.quoteMisses += 1;
  } else if (kind === 'series') {
    if (hit) cryptoCache.seriesHits += 1;
    else cryptoCache.seriesMisses += 1;
  }
}

function layerCacheSnapshot(cache) {
  const qh = cache.quoteHits;
  const qm = cache.quoteMisses;
  const sh = cache.seriesHits;
  const sm = cache.seriesMisses;
  const quoteTotal = qh + qm;
  const seriesTotal = sh + sm;
  return {
    quote: {
      hits: qh,
      misses: qm,
      hitRate: quoteTotal ? Number((qh / quoteTotal).toFixed(4)) : null,
    },
    series: {
      hits: sh,
      misses: sm,
      hitRate: seriesTotal ? Number((sh / seriesTotal).toFixed(4)) : null,
    },
  };
}

function fxLayerCacheSnapshot() {
  return layerCacheSnapshot(fxCache);
}

function cryptoLayerCacheSnapshot() {
  return layerCacheSnapshot(cryptoCache);
}

function fxFeatureFallbackRatio() {
  const fxKeys = Object.keys(totals.byFeature || {}).filter((k) => k.startsWith('fx-'));
  let td = 0;
  let fb = 0;
  for (const k of fxKeys) {
    td += totals.byFeature[k].td;
    fb += totals.byFeature[k].fb;
  }
  const t = td + fb;
  return {
    features: fxKeys,
    twelvedata: td,
    fallback: fb,
    fallbackRatio: t > 0 ? Number((fb / t).toFixed(4)) : null,
  };
}

function equityDatasetFeatureRatio() {
  const keys = Object.keys(totals.byFeature || {}).filter((k) => k.startsWith('equity-td-'));
  let td = 0;
  let fb = 0;
  for (const k of keys) {
    td += totals.byFeature[k].td;
    fb += totals.byFeature[k].fb;
  }
  const t = td + fb;
  return {
    datasetFeatures: keys,
    twelvedata: td,
    fallback: fb,
    fallbackRatio: t > 0 ? Number((fb / t).toFixed(4)) : null,
  };
}

function cryptoFeatureFallbackRatio() {
  const keys = Object.keys(totals.byFeature || {}).filter((k) => k.startsWith('crypto'));
  let td = 0;
  let fb = 0;
  for (const k of keys) {
    td += totals.byFeature[k].td;
    fb += totals.byFeature[k].fb;
  }
  const t = td + fb;
  return {
    features: keys,
    twelvedata: td,
    fallback: fb,
    fallbackRatio: t > 0 ? Number((fb / t).toFixed(4)) : null,
  };
}

/** Rolling ratio for Cboe Europe UK–tagged features (cboe-uk-*), for admin health. */
function cboeUkFeatureFallbackRatio() {
  const keys = Object.keys(totals.byFeature || {}).filter((k) => k.includes('cboe-uk'));
  let td = 0;
  let fb = 0;
  for (const k of keys) {
    td += totals.byFeature[k].td;
    fb += totals.byFeature[k].fb;
  }
  const t = td + fb;
  return {
    features: keys,
    twelvedata: td,
    fallback: fb,
    fallbackRatio: t > 0 ? Number((fb / t).toFixed(4)) : null,
  };
}

function cboeAuFeatureFallbackRatio() {
  const keys = Object.keys(totals.byFeature || {}).filter((k) => k.includes('cboe-au'));
  let td = 0;
  let fb = 0;
  for (const k of keys) {
    td += totals.byFeature[k].td;
    fb += totals.byFeature[k].fb;
  }
  const t = td + fb;
  return {
    features: keys,
    twelvedata: td,
    fallback: fb,
    fallbackRatio: t > 0 ? Number((fb / t).toFixed(4)) : null,
  };
}

/** Last run of buildLiveHotSnapshot (GET /api/markets/snapshot refresh path). */
let liveHotSnapshotLast = null;

function recordLiveHotSnapshotRun(stats) {
  liveHotSnapshotLast = stats && typeof stats === 'object' ? { ...stats, recordedAt: Date.now() } : null;
}

function snapshot() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const inWin = events.filter((e) => e.t >= cutoff);
  const td = inWin.filter((e) => e.provider === 'twelvedata').length;
  return {
    windowMs: WINDOW_MS,
    twelveDataCallsLast60s: td,
    totalCallsLast60s: inWin.length,
    lifetime: { ...totals },
    twelveDataGate: tdGate.stats(),
    fxLayerCache: fxLayerCacheSnapshot(),
    cryptoLayerCache: cryptoLayerCacheSnapshot(),
    fxRoutes: fxFeatureFallbackRatio(),
    cryptoRoutes: cryptoFeatureFallbackRatio(),
    cboeUkRoutes: cboeUkFeatureFallbackRatio(),
    cboeAuRoutes: cboeAuFeatureFallbackRatio(),
    equityDatasets: equityDatasetFeatureRatio(),
    liveHotSnapshot: liveHotSnapshotLast,
  };
}

function reset() {
  events.length = 0;
  totals.twelvedata = 0;
  totals.fallback = 0;
  totals.byFeature = {};
  liveHotSnapshotLast = null;
  tdGate.resetDiagnostics();
  fxCache.quoteHits = 0;
  fxCache.quoteMisses = 0;
  fxCache.seriesHits = 0;
  fxCache.seriesMisses = 0;
  cryptoCache.quoteHits = 0;
  cryptoCache.quoteMisses = 0;
  cryptoCache.seriesHits = 0;
  cryptoCache.seriesMisses = 0;
}

module.exports = {
  bump,
  bumpFxLayerCache,
  bumpCryptoLayerCache,
  snapshot,
  recordLiveHotSnapshotRun,
  reset,
  WINDOW_MS,
};
