/**
 * GET /api/markets/snapshot
 * Single server-side source of truth for market prices. All users see the same snapshot.
 * - In-memory cache with TTL. Fetch from provider only when cache expired.
 * - If provider fails, return last known good snapshot (stale-ok up to 15 min).
 */

const { getCached, setCached } = require('../cache');
const { getSnapshotSymbols } = require('../market/defaultWatchlist');
const { buildLiveHotSnapshot } = require('../market-data/liveHotSnapshot');
const { snapshot: tdMetricsSnapshot } = require('../market-data/tdMetrics');

const CACHE_KEY = 'markets:snapshot:v1';
const CACHE_TTL_MS = 20 * 1000;
const STALE_OK_MS = 15 * 60 * 1000;

/** Wall-clock ceiling for building the snapshot (large watchlist × waves can exceed Vercel maxDuration). */
const HARD_BUILD_MS = Math.min(
  58000,
  Math.max(
    15000,
    parseInt(process.env.MARKETS_SNAPSHOT_HARD_MS || (process.env.VERCEL ? '52000' : '88000'), 10) ||
      (process.env.VERCEL ? 52000 : 88000)
  )
);

let lastGoodSnapshot = null;
let lastGoodSnapshotTime = 0;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=15');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const wantDiagnostics = String(req.query.diagnostics || '').trim() === '1';

  const cached = getCached(CACHE_KEY, CACHE_TTL_MS);
  if (cached && cached.prices && typeof cached.snapshotTimestamp === 'number') {
    const body = {
      success: true,
      prices: cached.prices,
      snapshotTimestamp: cached.snapshotTimestamp,
      cached: true,
    };
    if (wantDiagnostics) {
      body.diagnostics = {
        routeCacheHit: true,
        cacheTtlMs: CACHE_TTL_MS,
        hotUniverseSymbols: getSnapshotSymbols(),
        lastEngineRun: tdMetricsSnapshot().liveHotSnapshot,
      };
    }
    return res.status(200).json(body);
  }

  try {
    const built = await Promise.race([
      buildLiveHotSnapshot(getSnapshotSymbols()),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(Object.assign(new Error('markets-snapshot-hard-timeout'), { code: 'HARD_TIMEOUT' })),
          HARD_BUILD_MS
        );
      }),
    ]);
    const snapshot = {
      prices: built.prices,
      snapshotTimestamp: built.timestamp,
    };
    setCached(CACHE_KEY, snapshot, CACHE_TTL_MS);
    lastGoodSnapshot = snapshot;
    lastGoodSnapshotTime = Date.now();

    const body = {
      success: true,
      prices: snapshot.prices,
      snapshotTimestamp: snapshot.snapshotTimestamp,
      cached: false,
    };
    if (wantDiagnostics) {
      body.diagnostics = {
        routeCacheHit: false,
        cacheTtlMs: CACHE_TTL_MS,
        hotUniverseSymbols: getSnapshotSymbols(),
        ...built.diagnostics,
      };
    }
    return res.status(200).json(body);
  } catch (err) {
    const msg = err.code === 'HARD_TIMEOUT' || String(err.message || '').includes('hard-timeout')
      ? `Markets snapshot exceeded ${HARD_BUILD_MS}ms budget`
      : err.message;
    console.error('Markets snapshot fetch error:', msg);

    if (lastGoodSnapshot && (Date.now() - lastGoodSnapshotTime) < STALE_OK_MS) {
      const body = {
        success: true,
        prices: lastGoodSnapshot.prices,
        snapshotTimestamp: lastGoodSnapshot.snapshotTimestamp,
        cached: true,
        stale: true,
      };
      if (wantDiagnostics) {
        body.diagnostics = {
          staleOk: true,
          hotUniverseSymbols: getSnapshotSymbols(),
          lastEngineRun: tdMetricsSnapshot().liveHotSnapshot,
        };
      }
      return res.status(200).json(body);
    }

    return res.status(503).json({
      success: false,
      message: 'Market data temporarily unavailable',
      snapshotTimestamp: null,
    });
  }
};
