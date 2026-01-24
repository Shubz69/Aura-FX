/**
 * Market Watchlist API
 * 
 * GET /api/market/watchlist
 * Returns server-driven watchlist configuration with default groups
 */

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Complete watchlist configuration
  const watchlist = {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    
    // Decimal places by instrument type
    decimals: {
      crypto: { default: 2, BTC: 2, ETH: 2, SOL: 2, XRP: 4, ADA: 4, DOGE: 5, BNB: 2 },
      forex: { default: 4, JPY: 2 }, // JPY pairs use 2 decimals
      commodities: { XAUUSD: 2, XAGUSD: 2, WTI: 2, BRENT: 2 },
      indices: { default: 2 },
      stocks: { default: 2 },
      macro: { DXY: 3, US10Y: 3, VIX: 2 }
    },
    
    // Default groups with symbols
    groups: {
      crypto: {
        name: 'Crypto',
        icon: '₿',
        order: 1,
        symbols: [
          { symbol: 'BTCUSD', displayName: 'BTC/USD', decimals: 2 },
          { symbol: 'ETHUSD', displayName: 'ETH/USD', decimals: 2 },
          { symbol: 'SOLUSD', displayName: 'SOL/USD', decimals: 2 },
          { symbol: 'XRPUSD', displayName: 'XRP/USD', decimals: 4 },
          { symbol: 'BNBUSD', displayName: 'BNB/USD', decimals: 2 },
          { symbol: 'ADAUSD', displayName: 'ADA/USD', decimals: 4 },
          { symbol: 'DOGEUSD', displayName: 'DOGE/USD', decimals: 5 }
        ]
      },
      stocks: {
        name: 'Stocks',
        icon: '📈',
        order: 2,
        symbols: [
          { symbol: 'AAPL', displayName: 'AAPL', decimals: 2 },
          { symbol: 'MSFT', displayName: 'MSFT', decimals: 2 },
          { symbol: 'NVDA', displayName: 'NVDA', decimals: 2 },
          { symbol: 'AMZN', displayName: 'AMZN', decimals: 2 },
          { symbol: 'GOOGL', displayName: 'GOOGL', decimals: 2 },
          { symbol: 'META', displayName: 'META', decimals: 2 },
          { symbol: 'TSLA', displayName: 'TSLA', decimals: 2 }
        ]
      },
      forex: {
        name: 'Forex',
        icon: '💱',
        order: 3,
        symbols: [
          { symbol: 'EURUSD', displayName: 'EUR/USD', decimals: 4 },
          { symbol: 'GBPUSD', displayName: 'GBP/USD', decimals: 4 },
          { symbol: 'USDJPY', displayName: 'USD/JPY', decimals: 2 },
          { symbol: 'USDCHF', displayName: 'USD/CHF', decimals: 4 },
          { symbol: 'AUDUSD', displayName: 'AUD/USD', decimals: 4 },
          { symbol: 'USDCAD', displayName: 'USD/CAD', decimals: 4 },
          { symbol: 'NZDUSD', displayName: 'NZD/USD', decimals: 4 }
        ]
      },
      commodities: {
        name: 'Commodities',
        icon: '🥇',
        order: 4,
        symbols: [
          { symbol: 'XAUUSD', displayName: 'Gold', decimals: 2 },
          { symbol: 'XAGUSD', displayName: 'Silver', decimals: 2 },
          { symbol: 'WTI', displayName: 'WTI Oil', decimals: 2 },
          { symbol: 'BRENT', displayName: 'Brent', decimals: 2 }
        ]
      },
      indices: {
        name: 'Indices',
        icon: '📊',
        order: 5,
        symbols: [
          { symbol: 'SPX', displayName: 'S&P 500', decimals: 2 },
          { symbol: 'NDX', displayName: 'Nasdaq', decimals: 2 },
          { symbol: 'DJI', displayName: 'Dow Jones', decimals: 2 },
          { symbol: 'DAX', displayName: 'DAX 40', decimals: 2 },
          { symbol: 'FTSE', displayName: 'FTSE 100', decimals: 2 },
          { symbol: 'NIKKEI', displayName: 'Nikkei', decimals: 2 }
        ]
      },
      macro: {
        name: 'Macro',
        icon: '🌐',
        order: 6,
        symbols: [
          { symbol: 'DXY', displayName: 'Dollar Index', decimals: 3 },
          { symbol: 'US10Y', displayName: '10Y Yield', decimals: 3 },
          { symbol: 'VIX', displayName: 'VIX', decimals: 2 }
        ]
      }
    },
    
    // Beginner-friendly initial set (top 10-14 instruments)
    beginnerSet: [
      'BTCUSD', 'ETHUSD',           // Crypto
      'AAPL', 'NVDA', 'TSLA',       // Stocks
      'EURUSD', 'GBPUSD',           // Forex
      'XAUUSD',                      // Commodities
      'SPX', 'NDX',                  // Indices
      'DXY', 'VIX'                   // Macro
    ],
    
    // Symbol to provider mapping
    providerMapping: {
      // Yahoo Finance symbols
      'SPX': '^GSPC',
      'NDX': '^IXIC',
      'DJI': '^DJI',
      'FTSE': '^FTSE',
      'DAX': '^GDAXI',
      'NIKKEI': '^N225',
      'VIX': '^VIX',
      'DXY': 'DX-Y.NYB',
      'US10Y': '^TNX',
      'WTI': 'CL=F',
      'BRENT': 'BZ=F',
      // Crypto
      'BTCUSD': 'BTC-USD',
      'ETHUSD': 'ETH-USD',
      'SOLUSD': 'SOL-USD',
      'XRPUSD': 'XRP-USD',
      'BNBUSD': 'BNB-USD',
      'ADAUSD': 'ADA-USD',
      'DOGEUSD': 'DOGE-USD',
      // Forex
      'EURUSD': 'EURUSD=X',
      'GBPUSD': 'GBPUSD=X',
      'USDJPY': 'JPY=X',
      'USDCHF': 'CHF=X',
      'AUDUSD': 'AUDUSD=X',
      'USDCAD': 'CAD=X',
      'NZDUSD': 'NZDUSD=X',
      // Commodities
      'XAUUSD': 'GC=F',
      'XAGUSD': 'SI=F'
    },
    
    // Refresh intervals (ms)
    refreshIntervals: {
      live: 5000,        // Live WebSocket updates
      polling: 10000,    // Fallback HTTP polling
      stale: 30000       // Consider data stale after this
    }
  };

  return res.status(200).json({
    success: true,
    watchlist
  });
};
