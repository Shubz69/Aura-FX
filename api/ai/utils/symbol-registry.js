/**
 * Central symbol normalization registry for Aura AI.
 * Maps canonical symbols to each provider's format. Used by market-data-adapter and data-layer.
 * Supports: Forex, Commodities, Indices, Crypto, Futures, Stocks (no hardcoded instrument list limit).
 */

const ALIAS_TO_CANONICAL = {
  GOLD: 'XAUUSD', XAU: 'XAUUSD', 'XAU/USD': 'XAUUSD',
  SILVER: 'XAGUSD', XAG: 'XAGUSD', 'XAG/USD': 'XAGUSD',
  BITCOIN: 'BTCUSD', BTC: 'BTCUSD', 'BTC/USD': 'BTCUSD',
  ETHEREUM: 'ETHUSD', ETH: 'ETHUSD', 'ETH/USD': 'ETHUSD',
  OIL: 'CL=F', CRUDE: 'CL=F', WTI: 'CL=F',
  SP500: '^GSPC', SPX: '^GSPC', 'S&P500': '^GSPC',
  DOW: '^DJI', DJI: '^DJI', NASDAQ: '^IXIC', NAS100: '^IXIC',
  EURUSD: 'EURUSD', 'EUR/USD': 'EURUSD',
  GBPUSD: 'GBPUSD', 'GBP/USD': 'GBPUSD',
  USDJPY: 'USDJPY', 'USD/JPY': 'USDJPY',
  AUDUSD: 'AUDUSD', USDCAD: 'USDCAD', NZDUSD: 'NZDUSD', USDCHF: 'USDCHF',
};

/** Canonical -> Twelve Data symbol (e.g. XAU/USD) */
const CANONICAL_TO_TWELVEDATA = {
  XAUUSD: 'XAU/USD', XAGUSD: 'XAG/USD',
  EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY',
  AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', NZDUSD: 'NZD/USD', USDCHF: 'USD/CHF',
  BTCUSD: 'BTC/USD', ETHUSD: 'ETH/USD', SOLUSD: 'SOL/USD',
  XRPUSD: 'XRP/USD', BNBUSD: 'BNB/USD', ADAUSD: 'ADA/USD', DOGEUSD: 'DOGE/USD',
};
/** Canonical -> Finnhub symbol (OANDA/BINANCE) */
const CANONICAL_TO_FINNHUB = {
  XAUUSD: 'OANDA:XAU_USD', XAGUSD: 'OANDA:XAG_USD',
  EURUSD: 'OANDA:EUR_USD', GBPUSD: 'OANDA:GBP_USD', USDJPY: 'OANDA:USD_JPY',
  AUDUSD: 'OANDA:AUD_USD', USDCAD: 'OANDA:USD_CAD', NZDUSD: 'OANDA:NZD_USD', USDCHF: 'OANDA:USD_CHF',
  BTCUSD: 'BINANCE:BTCUSDT', ETHUSD: 'BINANCE:ETHUSDT',
};
/** Canonical -> Alpha Vantage (FX: for forex, else as-is) */
function canonicalToAlphaVantage(canonical) {
  if (/^[A-Z]{6}$/.test(canonical) && (canonical.includes('USD') || canonical.includes('EUR') || canonical.includes('JPY'))) {
    return `FX:${canonical}`;
  }
  return canonical;
}
/** Canonical -> Yahoo (GC=F, SI=F, SYMBOL=X, etc.) */
const CANONICAL_TO_YAHOO = {
  XAUUSD: 'GC=F', XAGUSD: 'SI=F', 'CL=F': 'CL=F', 'BZ=F': 'BZ=F',
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X', USDCAD: 'USDCAD=X', NZDUSD: 'NZDUSD=X', USDCHF: 'USDCHF=X',
  BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD',
  '^GSPC': '^GSPC', '^DJI': '^DJI', '^IXIC': '^IXIC',
};

/**
 * Normalize user input to canonical symbol (uppercase, no spaces/slashes for 6-char forex).
 * @param {string} input
 * @returns {string} canonical symbol
 */
function toCanonical(input) {
  if (!input || typeof input !== 'string') return '';
  const s = input.trim().toUpperCase().replace(/\s+/g, '').replace(/\//g, '');
  return ALIAS_TO_CANONICAL[s] || s;
}

/**
 * Get provider-specific symbol for API calls. Returns canonical if no mapping.
 * @param {string} canonical
 * @param {'twelvedata'|'finnhub'|'alphavantage'|'yahoo'} provider
 * @returns {string}
 */
function forProvider(canonical, provider) {
  const c = toCanonical(canonical);
  switch (provider) {
    case 'twelvedata':
      return CANONICAL_TO_TWELVEDATA[c] || c.replace(/([A-Z]{3})([A-Z]{3})/, '$1/$2') || c;
    case 'finnhub':
      if (CANONICAL_TO_FINNHUB[c]) return CANONICAL_TO_FINNHUB[c];
      if (/^[A-Z]{6}$/.test(c) && (c.includes('USD') || c.includes('EUR') || c.includes('JPY'))) {
        const base = c.slice(0, 3), quote = c.slice(3, 6);
        return `OANDA:${base}_${quote}`;
      }
      return c;
    case 'alphavantage':
      return canonicalToAlphaVantage(c);
    case 'yahoo':
      return CANONICAL_TO_YAHOO[c] || (c.length === 6 && /^[A-Z]{6}$/.test(c) ? `${c}=X` : c);
    default:
      return c;
  }
}

/**
 * Detect asset class from canonical symbol (forex, commodity, crypto, index, futures, stock).
 */
function getAssetClass(canonical) {
  const c = toCanonical(canonical);
  if (/^[A-Z]{6}$/.test(c) && (c.includes('USD') || c.includes('EUR') || c.includes('JPY') || c.includes('GBP'))) return 'forex';
  if (c.includes('XAU') || c.includes('XAG') || c.includes('CL') || c.includes('NG') || c.includes('GC') || c.includes('SI=')) return 'commodity';
  if (c.includes('BTC') || c.includes('ETH') || c.includes('SOL') || c.includes('USD') && (c.startsWith('BTC') || c.startsWith('ETH'))) return 'crypto';
  if (c.startsWith('^') || c === 'SPY' || c === 'QQQ' || c === 'DIA') return 'index';
  if (c.endsWith('=F')) return 'futures';
  return 'stock';
}

module.exports = {
  toCanonical,
  forProvider,
  getAssetClass,
  ALIAS_TO_CANONICAL,
  CANONICAL_TO_TWELVEDATA,
  CANONICAL_TO_FINNHUB,
  CANONICAL_TO_YAHOO,
};
