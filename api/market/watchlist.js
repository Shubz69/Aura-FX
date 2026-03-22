/**
 * Market Watchlist API
 *
 * GET /api/market/watchlist
 * Server-driven groups + symbols (see instrument-universe.js).
 */

const { buildWatchlist } = require('./instrument-universe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const built = buildWatchlist();

  const watchlist = {
    ...built,
    lastUpdated: new Date().toISOString(),
    decimals: {
      crypto: { default: 2, BTC: 2, ETH: 2, SOL: 2, XRP: 4, ADA: 4, DOGE: 5, BNB: 2 },
      forex: { default: 4, JPY: 2 },
      commodities: { XAUUSD: 2, XAGUSD: 2, WTI: 2, BRENT: 2 },
      indices: { default: 2 },
      futures: { default: 2, NG: 3, HG: 3, ZB: 3, ZN: 3 },
      stocks: { default: 2 },
      macro: { DXY: 3, US10Y: 3 },
    },
    providerMapping: {},
    refreshIntervals: {
      live: 5000,
      polling: 10000,
      stale: 30000,
    },
  };

  return res.status(200).json({
    success: true,
    watchlist,
  });
};
