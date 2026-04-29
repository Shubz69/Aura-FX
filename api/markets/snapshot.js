require('../utils/suppress-warnings');

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
const { snapshotDiagnostics: wsSnapshotDiagnostics } = require('../market-data/twelveWsManager');
const { stats: tdRestStats } = require('../market-data/tdRateLimiter');

const CACHE_KEY = 'markets:snapshot:v1';
const CACHE_TTL_MS = 5 * 1000;
const STALE_OK_MS = 5 * 60 * 1000;
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=30, s-maxage=30, stale-while-revalidate=15';

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
let snapshotBuildInFlight = null;
let snapshotFallbackCount = 0;
const recentCallerWindow = new Map();
const RECENT_CALLER_WINDOW_MS = Math.max(1000, parseInt(process.env.MARKETS_SNAPSHOT_RATE_WINDOW_MS || '1500', 10) || 1500);

function callerKey(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'ua';
  const diag = String(req.query?.diagnostics || '0');
  return `${ip}|${ua}|${diag}`;
}

function callerBurstBlocked(req) {
  const key = callerKey(req);
  const now = Date.now();
  const prev = recentCallerWindow.get(key) || 0;
  recentCallerWindow.set(key, now);
  if (recentCallerWindow.size > 2000) {
    const cutoff = now - (RECENT_CALLER_WINDOW_MS * 4);
    for (const [k, t] of recentCallerWindow.entries()) {
      if (t < cutoff) recentCallerWindow.delete(k);
    }
  }
  return now - prev < RECENT_CALLER_WINDOW_MS;
}

function liveDiagnostics() {
  const rest = tdRestStats();
  const ws = wsSnapshotDiagnostics();
  return {
    twelveRestCallsThisMinute: rest.rollingWindowUsedSlots,
    twelveRestBudgetRemaining: Math.max(0, rest.maxRpm - rest.rollingWindowUsedSlots),
    twelveWsActiveSubscriptions: ws.twelveWsActiveSubscriptions,
    twelveWsMessagesReceived: ws.twelveWsMessagesReceived,
    inFlightDedupe: rest.dedupeJoinsLifetime,
    skippedRestDueToBudget: 0,
  };
}

async function buildSnapshotWithBudget() {
  const built = await Promise.race([
    buildLiveHotSnapshot(getSnapshotSymbols()),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(Object.assign(new Error('markets-snapshot-hard-timeout'), { code: 'HARD_TIMEOUT' })),
        HARD_BUILD_MS
      );
    }),
  ]);
  return {
    prices: built.prices,
    snapshotTimestamp: built.timestamp,
    diagnostics: built.diagnostics,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', SNAPSHOT_CACHE_CONTROL);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const wantDiagnostics = String(req.query.diagnostics || '').trim() === '1';
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[markets/snapshot] request', { diagnostics: wantDiagnostics });
  }
  snapshotFallbackCount += 1;

  const burstBlocked = callerBurstBlocked(req);

  const cached = getCached(CACHE_KEY, CACHE_TTL_MS);
  if (cached && cached.prices && typeof cached.snapshotTimestamp === 'number') {
    const priceKeys = Object.keys(cached.prices || {});
    const body = {
      success: true,
      prices: cached.prices,
      snapshotTimestamp: cached.snapshotTimestamp,
      cached: true,
      meta: {
        serverRouteCacheHit: true,
        cacheTtlMs: CACHE_TTL_MS,
        symbolCount: priceKeys.length,
        staleFallback: false,
      },
    };
    if (wantDiagnostics) {
      body.diagnostics = {
        routeCacheHit: true,
        cacheTtlMs: CACHE_TTL_MS,
        hotUniverseSymbols: getSnapshotSymbols(),
        lastEngineRun: tdMetricsSnapshot().liveHotSnapshot,
        ...liveDiagnostics(),
      };
    }
    return res.status(200).json(body);
  }

  if (burstBlocked) {
    return res.status(429).json({
      success: false,
      message: 'Snapshot rate limited',
      retryAfterMs: RECENT_CALLER_WINDOW_MS,
    });
  }

  try {
    if (!snapshotBuildInFlight) {
      snapshotBuildInFlight = buildSnapshotWithBudget().finally(() => {
        snapshotBuildInFlight = null;
      });
    }
    const built = await snapshotBuildInFlight;
    const snapshot = {
      prices: built.prices,
      snapshotTimestamp: built.snapshotTimestamp,
    };
    setCached(CACHE_KEY, snapshot, CACHE_TTL_MS);
    lastGoodSnapshot = snapshot;
    lastGoodSnapshotTime = Date.now();

    const priceKeys = Object.keys(snapshot.prices || {});
    const body = {
      success: true,
      prices: snapshot.prices,
      snapshotTimestamp: snapshot.snapshotTimestamp,
      cached: false,
      meta: {
        serverRouteCacheHit: false,
        cacheTtlMs: CACHE_TTL_MS,
        symbolCount: priceKeys.length,
        staleFallback: false,
        buildDurationMs: built.diagnostics?.durationMs ?? null,
      },
    };
    if (wantDiagnostics) {
      body.diagnostics = {
        routeCacheHit: false,
        cacheTtlMs: CACHE_TTL_MS,
        hotUniverseSymbols: getSnapshotSymbols(),
        sharedBuild: true,
        ...built.diagnostics,
        ...liveDiagnostics(),
      };
    }
    return res.status(200).json(body);
  } catch (err) {
    const msg = err.code === 'HARD_TIMEOUT' || String(err.message || '').includes('hard-timeout')
      ? `Markets snapshot exceeded ${HARD_BUILD_MS}ms budget`
      : err.message;
    console.error('Markets snapshot fetch error:', msg);

    if (lastGoodSnapshot && (Date.now() - lastGoodSnapshotTime) < STALE_OK_MS) {
      const priceKeys = Object.keys(lastGoodSnapshot.prices || {});
      const body = {
        success: true,
        prices: lastGoodSnapshot.prices,
        snapshotTimestamp: lastGoodSnapshot.snapshotTimestamp,
        cached: true,
        stale: true,
        meta: {
          serverRouteCacheHit: true,
          cacheTtlMs: CACHE_TTL_MS,
          symbolCount: priceKeys.length,
          staleFallback: true,
        },
      };
      if (wantDiagnostics) {
        body.diagnostics = {
          staleOk: true,
          hotUniverseSymbols: getSnapshotSymbols(),
          lastEngineRun: tdMetricsSnapshot().liveHotSnapshot,
          ...liveDiagnostics(),
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

module.exports.getSnapshotRouteDiagnostics = function getSnapshotRouteDiagnostics() {
  return {
    snapshotFallbackCount,
    cacheTtlMs: CACHE_TTL_MS,
  };
};
