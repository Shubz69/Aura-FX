/**
 * Central symbol normalization registry for Aura AI and market data backends.
 * Uses the server watchlist as the main symbol universe, then layers provider-specific
 * aliases and fallback heuristics for symbols that are not direct market-watch rows.
 */

const { getWatchlistPayload } = require('../../market/defaultWatchlist');

const WATCHLIST = getWatchlistPayload();
const WATCHLIST_GROUPS = WATCHLIST?.groups || {};
const WATCHLIST_PROVIDER_MAPPING = WATCHLIST?.providerMapping || {};

const WATCHLIST_SYMBOL_TO_GROUP = {};
Object.entries(WATCHLIST_GROUPS).forEach(([groupKey, group]) => {
  (group.symbols || []).forEach((row) => {
    if (row?.symbol) WATCHLIST_SYMBOL_TO_GROUP[String(row.symbol).toUpperCase()] = groupKey;
  });
});

const CANONICAL_EQUIVALENTS = {
  SPX: 'SPX',
  '^GSPC': 'SPX',
  SP500: 'SPX',
  'S&P500': 'SPX',
  'S&P 500': 'SPX',
  NDX: 'NDX',
  '^NDX': 'NDX',
  NAS100: 'NDX',
  NASDAQ100: 'NDX',
  DJI: 'DJI',
  '^DJI': 'DJI',
  DOW: 'DJI',
  DAX: 'DAX',
  '^GDAXI': 'DAX',
  GOLD: 'XAUUSD',
  XAU: 'XAUUSD',
  'XAU/USD': 'XAUUSD',
  SILVER: 'XAGUSD',
  XAG: 'XAGUSD',
  'XAG/USD': 'XAGUSD',
  BITCOIN: 'BTCUSD',
  BTC: 'BTCUSD',
  'BTC/USD': 'BTCUSD',
  ETHEREUM: 'ETHUSD',
  ETH: 'ETHUSD',
  'ETH/USD': 'ETHUSD',
  OIL: 'WTI',
  CRUDE: 'WTI',
  WTI: 'WTI',
  BRENT: 'BRENT',
  DXY: 'DXY',
  USDX: 'DXY',
};

const CANONICAL_TO_FINNHUB = {
  XAUUSD: 'OANDA:XAU_USD',
  XAGUSD: 'OANDA:XAG_USD',
  BTCUSD: 'BINANCE:BTCUSDT',
  ETHUSD: 'BINANCE:ETHUSDT',
  SOLUSD: 'BINANCE:SOLUSDT',
  XRPUSD: 'BINANCE:XRPUSDT',
  BNBUSD: 'BINANCE:BNBUSDT',
  ADAUSD: 'BINANCE:ADAUSDT',
  DOGEUSD: 'BINANCE:DOGEUSDT',
  LINKUSD: 'BINANCE:LINKUSDT',
  DOTUSD: 'BINANCE:DOTUSDT',
  MATICUSD: 'BINANCE:MATICUSDT',
  AVAXUSD: 'BINANCE:AVAXUSDT',
  ATOMUSD: 'BINANCE:ATOMUSDT',
  LTCUSD: 'BINANCE:LTCUSDT',
  SHIBUSD: 'BINANCE:SHIBUSDT',
  TRXUSD: 'BINANCE:TRXUSDT',
  TONUSD: 'BINANCE:TONUSDT',
  NEARUSD: 'BINANCE:NEARUSDT',
  APTUSD: 'BINANCE:APTUSDT',
  ARBUSD: 'BINANCE:ARBUSDT',
  OPUSD: 'BINANCE:OPUSDT',
};

const CANONICAL_TO_DECODER_PROXY = {
  SPX: 'SPY',
  NDX: 'QQQ',
  DJI: 'DIA',
  DXY: 'UUP',
  WTI: 'USO',
  BRENT: 'BNO',
};

function normalizeInput(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\//g, '')
    .replace(/_/g, '')
    .replace(/:/g, '');
}

function toCanonical(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();
  if (WATCHLIST_SYMBOL_TO_GROUP[upper]) return upper;

  if (upper.includes(':')) {
    const tail = upper.split(':').pop();
    if (WATCHLIST_SYMBOL_TO_GROUP[tail]) return tail;
    if (/^[A-Z]{3}_[A-Z]{3}$/.test(tail)) return tail.replace('_', '');
  }

  const normalized = normalizeInput(raw);
  if (WATCHLIST_SYMBOL_TO_GROUP[normalized]) return normalized;
  if (CANONICAL_EQUIVALENTS[normalized]) return CANONICAL_EQUIVALENTS[normalized];

  return normalized;
}

function canonicalToAlphaVantage(canonical) {
  if (/^[A-Z]{6}$/.test(canonical)) {
    return `FX:${canonical}`;
  }
  return canonical;
}

function getAssetClass(canonical) {
  const c = toCanonical(canonical);
  const group = WATCHLIST_SYMBOL_TO_GROUP[c];
  if (group === 'forex') return 'forex';
  if (group === 'commodities') return 'commodity';
  if (group === 'crypto') return 'crypto';
  if (group === 'indices' || group === 'macro') return 'index';
  if (group === 'stocks' || group === 'etfs') return 'stock';
  if (c.endsWith('=F')) return 'future';
  if (/^[A-Z]{6}$/.test(c)) return 'forex';
  return 'stock';
}

function getMarketType(canonical) {
  const cls = getAssetClass(canonical);
  if (cls === 'forex') return 'FX';
  if (cls === 'crypto') return 'Crypto';
  if (cls === 'commodity') return 'Commodity';
  if (cls === 'index') return 'Index';
  return 'Equity';
}

function forProvider(canonical, provider) {
  const c = toCanonical(canonical);
  switch (provider) {
    case 'twelvedata':
      if (getAssetClass(c) === 'stock' || getAssetClass(c) === 'index') return c;
      if (/^[A-Z]{6}$/.test(c)) return `${c.slice(0, 3)}/${c.slice(3, 6)}`;
      return c.replace(/([A-Z]{3})(USD)$/, '$1/$2');
    case 'finnhub':
      if (CANONICAL_TO_FINNHUB[c]) return CANONICAL_TO_FINNHUB[c];
      if (/^[A-Z]{6}$/.test(c)) {
        return `OANDA:${c.slice(0, 3)}_${c.slice(3, 6)}`;
      }
      return CANONICAL_TO_DECODER_PROXY[c] || c;
    case 'alphavantage':
      return canonicalToAlphaVantage(c);
    case 'yahoo':
      return WATCHLIST_PROVIDER_MAPPING[c] || (/^[A-Z]{6}$/.test(c) ? `${c}=X` : c);
    default:
      return c;
  }
}

function getResolvedSymbol(input) {
  const canonical = toCanonical(input);
  const marketType = getMarketType(canonical);
  const assetClass = getAssetClass(canonical);
  return {
    canonical,
    displaySymbol: canonical,
    assetClass,
    marketType,
    candleKind: marketType === 'FX' || marketType === 'Commodity' ? 'forex' : marketType === 'Crypto' ? 'crypto' : 'stock',
    finnhubSymbol: forProvider(canonical, 'finnhub'),
    twelveDataSymbol: forProvider(canonical, 'twelvedata'),
    yahooSymbol: forProvider(canonical, 'yahoo'),
    alphaVantageSymbol: forProvider(canonical, 'alphavantage'),
    decoderProxySymbol: CANONICAL_TO_DECODER_PROXY[canonical] || canonical,
    watchlistGroup: WATCHLIST_SYMBOL_TO_GROUP[canonical] || null,
  };
}

module.exports = {
  toCanonical,
  forProvider,
  getAssetClass,
  getMarketType,
  getResolvedSymbol,
  ALIAS_TO_CANONICAL: CANONICAL_EQUIVALENTS,
  CANONICAL_TO_FINNHUB,
};
