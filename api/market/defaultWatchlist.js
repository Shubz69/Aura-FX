/**
 * Single source of truth for All Markets / ticker symbol groups and snapshot fetch list.
 * Used by GET /api/market/watchlist and GET /api/markets/snapshot (via getSnapshotSymbols).
 */

const GROUPS = {
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
      { symbol: 'XAUUSD', displayName: 'GOLD', decimals: 2 },
      { symbol: 'XAGUSD', displayName: 'SILVER', decimals: 2 },
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
      { symbol: 'NDX', displayName: 'Nasdaq 100', decimals: 2 },
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
      { symbol: 'DXY', displayName: 'DXY', decimals: 3 },
      { symbol: 'US10Y', displayName: '10Y YIELD', decimals: 3 },
      { symbol: 'VIX', displayName: 'VIX', decimals: 2 }
    ]
  }
};

const BEGINNER_SET = [
  'BTCUSD', 'ETHUSD',
  'AAPL', 'NVDA', 'TSLA',
  'EURUSD', 'GBPUSD',
  'XAUUSD',
  'SPX', 'NDX',
  'DXY', 'VIX'
];

const DECIMALS = {
  crypto: { default: 2, BTC: 2, ETH: 2, SOL: 2, XRP: 4, ADA: 4, DOGE: 5, BNB: 2 },
  forex: { default: 4, JPY: 2 },
  commodities: { XAUUSD: 2, XAGUSD: 2, WTI: 2, BRENT: 2 },
  indices: { default: 2 },
  stocks: { default: 2 },
  macro: { DXY: 3, US10Y: 3, VIX: 2 }
};

const PROVIDER_MAPPING = {
  SPX: '^GSPC',
  NDX: '^NDX',
  DJI: '^DJI',
  FTSE: '^FTSE',
  DAX: '^GDAXI',
  NIKKEI: '^N225',
  VIX: '^VIX',
  DXY: 'DX-Y.NYB',
  US10Y: '^TNX',
  WTI: 'CL=F',
  BRENT: 'BZ=F',
  BTCUSD: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  SOLUSD: 'SOL-USD',
  XRPUSD: 'XRP-USD',
  BNBUSD: 'BNB-USD',
  ADAUSD: 'ADA-USD',
  DOGEUSD: 'DOGE-USD',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'JPY=X',
  USDCHF: 'CHF=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'CAD=X',
  NZDUSD: 'NZDUSD=X',
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F'
};

const REFRESH_INTERVALS = {
  live: 5000,
  polling: 10000,
  stale: 30000
};

/**
 * Flatten group order → symbol list (matches former SNAPSHOT_SYMBOLS order).
 */
function getSnapshotSymbols() {
  return Object.keys(GROUPS)
    .sort((a, b) => GROUPS[a].order - GROUPS[b].order)
    .flatMap((k) => GROUPS[k].symbols.map((s) => s.symbol));
}

function getWatchlistPayload() {
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    decimals: DECIMALS,
    groups: GROUPS,
    beginnerSet: [...BEGINNER_SET],
    providerMapping: { ...PROVIDER_MAPPING },
    refreshIntervals: { ...REFRESH_INTERVALS }
  };
}

module.exports = {
  getSnapshotSymbols,
  getWatchlistPayload,
  GROUPS,
  BEGINNER_SET
};
