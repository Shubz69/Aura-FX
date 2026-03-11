/**
 * Asset metadata for Aura Analysis (display list, dropdown).
 * Single source of truth: forex, metals, commodities, energy, indices, stocks, futures, crypto.
 */

function f(symbol, displayName, assetClass, distanceType, pipMultiplier, pricePrecision, quantityPrecision, contractSizeHint, pipValueHint, quoteType) {
  return {
    symbol,
    displayName,
    assetClass,
    distanceType,
    pipMultiplier,
    pricePrecision,
    quantityPrecision,
    contractSizeHint,
    pipValueHint,
    quoteType,
  };
}

const ASSETS = [
  { symbol: 'EURUSD', displayName: 'EUR/USD', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'GBPUSD', displayName: 'GBP/USD', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'USDJPY', displayName: 'USD/JPY', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 100, pricePrecision: 3, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'JPY' },
  { symbol: 'USDCHF', displayName: 'USD/CHF', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'CHF' },
  { symbol: 'USDCAD', displayName: 'USD/CAD', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'AUDUSD', displayName: 'AUD/USD', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'NZDUSD', displayName: 'NZD/USD', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'EURGBP', displayName: 'EUR/GBP', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'GBP' },
  { symbol: 'EURJPY', displayName: 'EUR/JPY', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 100, pricePrecision: 3, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'JPY' },
  { symbol: 'GBPJPY', displayName: 'GBP/JPY', assetClass: 'forex', distanceType: 'pip', pipMultiplier: 100, pricePrecision: 3, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'JPY' },
  { symbol: 'XAUUSD', displayName: 'XAU/USD (Gold)', assetClass: 'metals', distanceType: 'point', pipMultiplier: 10, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: 100, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'XAGUSD', displayName: 'XAG/USD (Silver)', assetClass: 'metals', distanceType: 'point', pipMultiplier: 100, pricePrecision: 3, quantityPrecision: 2, contractSizeHint: 5000, pipValueHint: 0.5, quoteType: 'USD' },
  { symbol: 'XTIUSD', displayName: 'WTI Crude Oil', assetClass: 'energy', distanceType: 'point', pipMultiplier: 100, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'XBRUSD', displayName: 'Brent Crude Oil', assetClass: 'energy', distanceType: 'point', pipMultiplier: 100, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 10, quoteType: 'USD' },
  { symbol: 'US30', displayName: 'US30 (Dow)', assetClass: 'indices', distanceType: 'point', pipMultiplier: 1, pricePrecision: 0, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'NAS100', displayName: 'NAS100 (Nasdaq)', assetClass: 'indices', distanceType: 'point', pipMultiplier: 1, pricePrecision: 0, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'SPX500', displayName: 'SPX500 (S&P 500)', assetClass: 'indices', distanceType: 'point', pipMultiplier: 1, pricePrecision: 0, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'GER40', displayName: 'GER40 (DAX)', assetClass: 'indices', distanceType: 'point', pipMultiplier: 1, pricePrecision: 0, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'AAPL', displayName: 'Apple', assetClass: 'stocks', distanceType: 'point', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'TSLA', displayName: 'Tesla', assetClass: 'stocks', distanceType: 'point', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'NVDA', displayName: 'NVIDIA', assetClass: 'stocks', distanceType: 'point', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'ES', displayName: 'E-mini S&P 500', assetClass: 'futures', distanceType: 'point', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 50, quoteType: 'USD' },
  { symbol: 'NQ', displayName: 'E-mini Nasdaq', assetClass: 'futures', distanceType: 'point', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 20, quoteType: 'USD' },
  { symbol: 'GC', displayName: 'Gold', assetClass: 'futures', distanceType: 'point', pipMultiplier: 10, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 100, quoteType: 'USD' },
  { symbol: 'CL', displayName: 'Crude Oil WTI', assetClass: 'futures', distanceType: 'point', pipMultiplier: 100, pricePrecision: 2, quantityPrecision: 2, contractSizeHint: null, pipValueHint: 1000, quoteType: 'USD' },
  { symbol: 'BTCUSD', displayName: 'BTC/USD', assetClass: 'crypto', distanceType: 'price', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 4, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
  { symbol: 'ETHUSD', displayName: 'ETH/USD', assetClass: 'crypto', distanceType: 'price', pipMultiplier: 1, pricePrecision: 2, quantityPrecision: 4, contractSizeHint: null, pipValueHint: 1, quoteType: 'USD' },
];

const bySymbol = new Map();
ASSETS.forEach((a) => bySymbol.set(a.symbol.toUpperCase(), a));

export const ASSET_CLASS_ORDER = ['forex', 'metals', 'commodity', 'energy', 'indices', 'stocks', 'futures', 'crypto'];

export const ASSET_CLASS_LABELS = {
  forex: 'Forex',
  metals: 'Metals',
  commodity: 'Commodities',
  energy: 'Energy',
  indices: 'Indices',
  stocks: 'Stocks',
  futures: 'Futures',
  crypto: 'Crypto',
};

export function getAssetMetadata(symbol) {
  const upper = String(symbol).toUpperCase();
  const known = bySymbol.get(upper);
  if (known) return known;
  const fallback = ASSETS[0];
  return fallback ? { ...fallback, symbol: upper, displayName: upper } : { symbol: upper, displayName: upper, assetClass: 'forex', distanceType: 'pip', pipMultiplier: 10000, pricePrecision: 5, quantityPrecision: 2, contractSizeHint: 100000, pipValueHint: 10, quoteType: 'USD' };
}

export function getAllAssetMetadata() {
  return [...ASSETS];
}

export function getAssetsByClass() {
  const map = new Map();
  for (const cls of ASSET_CLASS_ORDER) {
    map.set(cls, ASSETS.filter((a) => a.assetClass === cls));
  }
  return map;
}
