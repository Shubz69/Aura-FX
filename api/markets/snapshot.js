/**
 * GET /api/markets/snapshot
 * Single server-side source of truth for market prices. All users see the same snapshot.
 * - In-memory cache with TTL. Fetch from provider only when cache expired.
 * - If provider fails, return last known good snapshot (stale-ok up to 15 min).
 */

const { getCached, setCached } = require('../cache');
const { getSnapshotSymbols } = require('../market/defaultWatchlist');

const CACHE_KEY = 'markets:snapshot:v1';
const CACHE_TTL_MS = 20 * 1000;
const STALE_OK_MS = 15 * 60 * 1000;

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

  const cached = getCached(CACHE_KEY, CACHE_TTL_MS);
  if (cached && cached.prices && typeof cached.snapshotTimestamp === 'number') {
    return res.status(200).json({
      success: true,
      prices: cached.prices,
      snapshotTimestamp: cached.snapshotTimestamp,
      cached: true,
    });
  }

  try {
    const { fetchPricesForSymbols } = require('../market/prices');
    const { prices, timestamp } = await fetchPricesForSymbols(getSnapshotSymbols());

    const snapshot = {
      prices,
      snapshotTimestamp: timestamp,
    };
    setCached(CACHE_KEY, snapshot, CACHE_TTL_MS);
    lastGoodSnapshot = snapshot;
    lastGoodSnapshotTime = Date.now();

    return res.status(200).json({
      success: true,
      prices: snapshot.prices,
      snapshotTimestamp: snapshot.snapshotTimestamp,
      cached: false,
    });
  } catch (err) {
    console.error('Markets snapshot fetch error:', err.message);

    if (lastGoodSnapshot && (Date.now() - lastGoodSnapshotTime) < STALE_OK_MS) {
      return res.status(200).json({
        success: true,
        prices: lastGoodSnapshot.prices,
        snapshotTimestamp: lastGoodSnapshot.snapshotTimestamp,
        cached: true,
        stale: true,
      });
    }

    return res.status(503).json({
      success: false,
      message: 'Market data temporarily unavailable',
      snapshotTimestamp: null,
    });
  }
};
