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
      { symbol: 'DOGEUSD', displayName: 'DOGE/USD', decimals: 5 },
      { symbol: 'LINKUSD', displayName: 'LINK/USD', decimals: 2 },
      { symbol: 'DOTUSD', displayName: 'DOT/USD', decimals: 2 },
      { symbol: 'MATICUSD', displayName: 'MATIC/USD', decimals: 4 },
      { symbol: 'AVAXUSD', displayName: 'AVAX/USD', decimals: 2 },
      { symbol: 'ATOMUSD', displayName: 'ATOM/USD', decimals: 2 },
      { symbol: 'LTCUSD', displayName: 'LTC/USD', decimals: 2 },
      { symbol: 'SHIBUSD', displayName: 'SHIB/USD', decimals: 8 },
      { symbol: 'TRXUSD', displayName: 'TRX/USD', decimals: 4 },
      { symbol: 'TONUSD', displayName: 'TON/USD', decimals: 2 },
      { symbol: 'NEARUSD', displayName: 'NEAR/USD', decimals: 2 },
      { symbol: 'APTUSD', displayName: 'APT/USD', decimals: 2 },
      { symbol: 'ARBUSD', displayName: 'ARB/USD', decimals: 4 },
      { symbol: 'OPUSD', displayName: 'OP/USD', decimals: 4 }
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
      { symbol: 'TSLA', displayName: 'TSLA', decimals: 2 },
      { symbol: 'AVGO', displayName: 'AVGO', decimals: 2 },
      { symbol: 'JPM', displayName: 'JPM', decimals: 2 },
      { symbol: 'V', displayName: 'V', decimals: 2 },
      { symbol: 'UNH', displayName: 'UNH', decimals: 2 },
      { symbol: 'JNJ', displayName: 'JNJ', decimals: 2 },
      { symbol: 'WMT', displayName: 'WMT', decimals: 2 },
      { symbol: 'XOM', displayName: 'XOM', decimals: 2 },
      { symbol: 'MA', displayName: 'MA', decimals: 2 },
      { symbol: 'PG', displayName: 'PG', decimals: 2 },
      { symbol: 'HD', displayName: 'HD', decimals: 2 },
      { symbol: 'ORCL', displayName: 'ORCL', decimals: 2 },
      { symbol: 'COST', displayName: 'COST', decimals: 2 },
      { symbol: 'MRK', displayName: 'MRK', decimals: 2 },
      { symbol: 'ABBV', displayName: 'ABBV', decimals: 2 },
      { symbol: 'PEP', displayName: 'PEP', decimals: 2 },
      { symbol: 'KO', displayName: 'KO', decimals: 2 },
      { symbol: 'BAC', displayName: 'BAC', decimals: 2 },
      { symbol: 'CRM', displayName: 'CRM', decimals: 2 },
      { symbol: 'AMD', displayName: 'AMD', decimals: 2 },
      { symbol: 'TMO', displayName: 'TMO', decimals: 2 },
      { symbol: 'MCD', displayName: 'MCD', decimals: 2 },
      { symbol: 'CSCO', displayName: 'CSCO', decimals: 2 },
      { symbol: 'ACN', displayName: 'ACN', decimals: 2 },
      { symbol: 'NFLX', displayName: 'NFLX', decimals: 2 },
      { symbol: 'DIS', displayName: 'DIS', decimals: 2 },
      { symbol: 'ADBE', displayName: 'ADBE', decimals: 2 },
      { symbol: 'WFC', displayName: 'WFC', decimals: 2 },
      { symbol: 'ISRG', displayName: 'ISRG', decimals: 2 },
      { symbol: 'QCOM', displayName: 'QCOM', decimals: 2 },
      { symbol: 'TXN', displayName: 'TXN', decimals: 2 },
      { symbol: 'UPS', displayName: 'UPS', decimals: 2 },
      { symbol: 'MS', displayName: 'MS', decimals: 2 },
      { symbol: 'PM', displayName: 'PM', decimals: 2 },
      { symbol: 'INTU', displayName: 'INTU', decimals: 2 },
      { symbol: 'AMAT', displayName: 'AMAT', decimals: 2 },
      { symbol: 'GE', displayName: 'GE', decimals: 2 },
      { symbol: 'HON', displayName: 'HON', decimals: 2 },
      { symbol: 'IBM', displayName: 'IBM', decimals: 2 },
      { symbol: 'SPGI', displayName: 'SPGI', decimals: 2 },
      { symbol: 'CAT', displayName: 'CAT', decimals: 2 },
      { symbol: 'BKNG', displayName: 'BKNG', decimals: 2 },
      { symbol: 'LMT', displayName: 'LMT', decimals: 2 },
      { symbol: 'DE', displayName: 'DE', decimals: 2 },
      { symbol: 'BRK-B', displayName: 'BRK.B', decimals: 2 }
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
      { symbol: 'NZDUSD', displayName: 'NZD/USD', decimals: 4 },
      { symbol: 'EURJPY', displayName: 'EUR/JPY', decimals: 2 },
      { symbol: 'GBPJPY', displayName: 'GBP/JPY', decimals: 2 },
      { symbol: 'EURGBP', displayName: 'EUR/GBP', decimals: 4 },
      { symbol: 'EURAUD', displayName: 'EUR/AUD', decimals: 4 },
      { symbol: 'EURCHF', displayName: 'EUR/CHF', decimals: 4 },
      { symbol: 'EURCAD', displayName: 'EUR/CAD', decimals: 4 },
      { symbol: 'EURNZD', displayName: 'EUR/NZD', decimals: 4 },
      { symbol: 'EURSEK', displayName: 'EUR/SEK', decimals: 4 },
      { symbol: 'EURNOK', displayName: 'EUR/NOK', decimals: 4 },
      { symbol: 'EURDKK', displayName: 'EUR/DKK', decimals: 4 },
      { symbol: 'GBPAUD', displayName: 'GBP/AUD', decimals: 4 },
      { symbol: 'GBPCHF', displayName: 'GBP/CHF', decimals: 4 },
      { symbol: 'GBPCAD', displayName: 'GBP/CAD', decimals: 4 },
      { symbol: 'GBPNZD', displayName: 'GBP/NZD', decimals: 4 },
      { symbol: 'AUDJPY', displayName: 'AUD/JPY', decimals: 2 },
      { symbol: 'AUDCHF', displayName: 'AUD/CHF', decimals: 4 },
      { symbol: 'AUDCAD', displayName: 'AUD/CAD', decimals: 4 },
      { symbol: 'AUDNZD', displayName: 'AUD/NZD', decimals: 4 },
      { symbol: 'NZDJPY', displayName: 'NZD/JPY', decimals: 2 },
      { symbol: 'NZDCHF', displayName: 'NZD/CHF', decimals: 4 },
      { symbol: 'NZDCAD', displayName: 'NZD/CAD', decimals: 4 },
      { symbol: 'CADJPY', displayName: 'CAD/JPY', decimals: 2 },
      { symbol: 'CADCHF', displayName: 'CAD/CHF', decimals: 4 },
      { symbol: 'CHFJPY', displayName: 'CHF/JPY', decimals: 2 },
      { symbol: 'USDSEK', displayName: 'USD/SEK', decimals: 4 },
      { symbol: 'USDNOK', displayName: 'USD/NOK', decimals: 4 },
      { symbol: 'USDDKK', displayName: 'USD/DKK', decimals: 4 },
      { symbol: 'USDHKD', displayName: 'USD/HKD', decimals: 4 },
      { symbol: 'USDSGD', displayName: 'USD/SGD', decimals: 4 },
      { symbol: 'USDZAR', displayName: 'USD/ZAR', decimals: 4 },
      { symbol: 'USDMXN', displayName: 'USD/MXN', decimals: 4 },
      { symbol: 'USDTRY', displayName: 'USD/TRY', decimals: 4 },
      { symbol: 'USDPLN', displayName: 'USD/PLN', decimals: 4 },
      { symbol: 'USDINR', displayName: 'USD/INR', decimals: 2 },
      { symbol: 'USDTHB', displayName: 'USD/THB', decimals: 2 },
      { symbol: 'USDILS', displayName: 'USD/ILS', decimals: 4 },
      { symbol: 'USDCNH', displayName: 'USD/CNH', decimals: 4 },
      { symbol: 'EURPLN', displayName: 'EUR/PLN', decimals: 4 },
      { symbol: 'EURTRY', displayName: 'EUR/TRY', decimals: 4 }
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
      { symbol: 'BRENT', displayName: 'Brent', decimals: 2 },
      { symbol: 'NATGAS', displayName: 'Nat Gas', decimals: 2 },
      { symbol: 'COPPER', displayName: 'Copper', decimals: 2 },
      { symbol: 'PLAT', displayName: 'Platinum', decimals: 2 },
      { symbol: 'PALL', displayName: 'Palladium', decimals: 2 }
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
      { symbol: 'NIKKEI', displayName: 'Nikkei 225', decimals: 2 },
      { symbol: 'HSI', displayName: 'Hang Seng', decimals: 2 },
      { symbol: 'CAC', displayName: 'CAC 40', decimals: 2 },
      { symbol: 'RUT', displayName: 'Russell 2000', decimals: 2 },
      { symbol: 'ASX', displayName: 'ASX 200', decimals: 2 },
      { symbol: 'STOXX50', displayName: 'EURO STOXX 50', decimals: 2 },
      { symbol: 'IBEX', displayName: 'IBEX 35', decimals: 2 },
      { symbol: 'KOSPI', displayName: 'KOSPI', decimals: 2 },
      { symbol: 'CSI300', displayName: 'CSI 300', decimals: 2 }
    ]
  },
  macro: {
    name: 'Macro',
    icon: '🌐',
    order: 6,
    symbols: [
      { symbol: 'DXY', displayName: 'DXY', decimals: 3 },
      { symbol: 'US10Y', displayName: 'US 10Y', decimals: 3 },
      { symbol: 'US30Y', displayName: 'US 30Y', decimals: 3 },
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
  crypto: { default: 2, BTC: 2, ETH: 2, SOL: 2, XRP: 4, ADA: 4, DOGE: 5, BNB: 2, SHIB: 8 },
  forex: { default: 4, JPY: 2 },
  commodities: { default: 2 },
  indices: { default: 2 },
  stocks: { default: 2 },
  macro: { DXY: 3, US10Y: 3, US30Y: 3, VIX: 2 }
};

const PROVIDER_MAPPING = {
  SPX: '^GSPC',
  NDX: '^NDX',
  DJI: '^DJI',
  FTSE: '^FTSE',
  DAX: '^GDAXI',
  NIKKEI: '^N225',
  HSI: '^HSI',
  CAC: '^FCHI',
  RUT: '^RUT',
  ASX: '^AXJO',
  STOXX50: '^STOXX50E',
  IBEX: '^IBEX',
  KOSPI: '^KS11',
  CSI300: '000300.SS',
  VIX: '^VIX',
  DXY: 'DX-Y.NYB',
  US10Y: '^TNX',
  US30Y: '^TYX',
  WTI: 'CL=F',
  BRENT: 'BZ=F',
  NATGAS: 'NG=F',
  COPPER: 'HG=F',
  PLAT: 'PL=F',
  PALL: 'PA=F',
  BTCUSD: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  SOLUSD: 'SOL-USD',
  XRPUSD: 'XRP-USD',
  BNBUSD: 'BNB-USD',
  ADAUSD: 'ADA-USD',
  DOGEUSD: 'DOGE-USD',
  LINKUSD: 'LINK-USD',
  DOTUSD: 'DOT-USD',
  MATICUSD: 'MATIC-USD',
  AVAXUSD: 'AVAX-USD',
  ATOMUSD: 'ATOM-USD',
  LTCUSD: 'LTC-USD',
  SHIBUSD: 'SHIB-USD',
  TRXUSD: 'TRX-USD',
  TONUSD: 'TON-USD',
  NEARUSD: 'NEAR-USD',
  APTUSD: 'APT-USD',
  ARBUSD: 'ARB-USD',
  OPUSD: 'OP-USD',
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
    version: '2.0.0',
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
