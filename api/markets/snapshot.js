/**
 * GET /api/markets/snapshot
 * Single server-side source of truth for market prices. All users see the same snapshot.
 * - Cache TTL 60s (in-memory). Fetch from provider only when cache expired.
 * - If provider fails, return last known good snapshot (stale-ok up to 30 min).
 * - Cache-Control: public, s-maxage=60, stale-while-revalidate=30.
 * - No per-request or per-user live fetching while cache is warm.
 */

const { getCached, setCached } = require('../cache');

const CACHE_KEY = 'markets:snapshot:v1';
const CACHE_TTL_MS = 60 * 1000;           // 60 seconds
const STALE_OK_MS = 30 * 60 * 1000;      // 30 minutes - use last good snapshot if fetch fails

// All symbols shown in All Markets (same as watchlist groups flattened)
const SNAPSHOT_SYMBOLS = [
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'ADAUSD', 'DOGEUSD',
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA',
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'XAUUSD', 'XAGUSD', 'WTI', 'BRENT',
  'SPX', 'NDX', 'DJI', 'DAX', 'FTSE', 'NIKKEI',
  'DXY', 'US10Y', 'VIX'
];

let lastGoodSnapshot = null;
let lastGoodSnapshotTime = 0;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

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
      cached: true
    });
  }

  try {
    const { fetchPricesForSymbols } = require('../market/prices');
    const { prices, timestamp } = await fetchPricesForSymbols(SNAPSHOT_SYMBOLS);

    const snapshot = {
      prices,
      snapshotTimestamp: timestamp
    };
    setCached(CACHE_KEY, snapshot, CACHE_TTL_MS);
    lastGoodSnapshot = snapshot;
    lastGoodSnapshotTime = Date.now();

    return res.status(200).json({
      success: true,
      prices: snapshot.prices,
      snapshotTimestamp: snapshot.snapshotTimestamp,
      cached: false
    });
  } catch (err) {
    console.error('Markets snapshot fetch error:', err.message);

    if (lastGoodSnapshot && (Date.now() - lastGoodSnapshotTime) < STALE_OK_MS) {
      return res.status(200).json({
        success: true,
        prices: lastGoodSnapshot.prices,
        snapshotTimestamp: lastGoodSnapshot.snapshotTimestamp,
        cached: true,
        stale: true
      });
    }

    return res.status(503).json({
      success: false,
      message: 'Market data temporarily unavailable',
      snapshotTimestamp: null
    });
  }
};
