/**
 * Market Prices API - Batch price fetcher with fallback providers
 * 
 * GET /api/market/prices?symbols=BTCUSD,ETHUSD,AAPL
 * Returns current prices for multiple symbols
 * 
 * Features:
 * - Primary provider (Yahoo Finance) with secondary fallback (Finnhub)
 * - Persistent cache to prevent 0.00 prices
 * - Never returns 0.00 - uses cached price with "delayed" flag
 * - Timeout protection (5s per provider)
 * - Health monitoring
 */

const axios = require('axios');
const {
  yahooSymbolFor,
  COINGECKO_IDS,
  CRYPTO_DECIMALS,
  CRYPTO_SYMBOL_SET,
  STOOQ_FX_PARAM,
  FOREX_SYMBOL_SET,
} = require('./instrument-universe');
const { enrichSnapshotPrices } = require('./market-session');

// Persistent price cache (survives between requests)
// Key: symbol, Value: { ...priceData, timestamp }
const priceCache = new Map();
const CACHE_TTL = 2000; // Fresh data TTL: 2 seconds for accuracy
const STALE_TTL = 300000; // Stale data TTL: 5 minutes (use as delayed fallback)
const REQUEST_TIMEOUT = 5000; // 5 second timeout per request

// Health stats
const healthStats = {
  totalRequests: 0,
  successfulFetches: 0,
  cacheHits: 0,
  staleFallbacks: 0,
  errors: 0,
  lastSuccessTime: 0,
  avgLatency: 0
};

// Finnhub symbol mapping - OANDA for forex/metals (spot), Binance for crypto (real-time)
// Prioritized for TradingView-like accuracy
const FINNHUB_SYMBOLS = {
  'BTCUSD': 'BINANCE:BTCUSDT', 'ETHUSD': 'BINANCE:ETHUSDT',
  'SOLUSD': 'BINANCE:SOLUSDT', 'XRPUSD': 'BINANCE:XRPUSDT',
  'BNBUSD': 'BINANCE:BNBUSDT', 'ADAUSD': 'BINANCE:ADAUSDT',
  'DOGEUSD': 'BINANCE:DOGEUSDT', 'AVAXUSD': 'BINANCE:AVAXUSDT',
  'DOTUSD': 'BINANCE:DOTUSDT', 'MATICUSD': 'BINANCE:MATICUSDT',
  'LINKUSD': 'BINANCE:LINKUSDT', 'UNIUSD': 'BINANCE:UNIUSDT',
  'ATOMUSD': 'BINANCE:ATOMUSDT', 'LTCUSD': 'BINANCE:LTCUSDT',
  'BCHUSD': 'BINANCE:BCHUSDT', 'APTUSD': 'BINANCE:APTUSDT',
  'ARBUSD': 'BINANCE:ARBUSDT', 'OPUSD': 'BINANCE:OPUSDT',
  'NEARUSD': 'BINANCE:NEARUSDT', 'INJUSD': 'BINANCE:INJUSDT',
  'EURUSD': 'OANDA:EUR_USD',
  'GBPUSD': 'OANDA:GBP_USD', 'USDJPY': 'OANDA:USD_JPY',
  'USDCHF': 'OANDA:USD_CHF', 'AUDUSD': 'OANDA:AUD_USD',
  'USDCAD': 'OANDA:USD_CAD', 'NZDUSD': 'OANDA:NZD_USD',
  'XAUUSD': 'OANDA:XAU_USD', 'XAGUSD': 'OANDA:XAG_USD'
};

// Twelve Data symbol mapping (spot prices - XAU/USD format for commodities/forex)
const TWELVE_DATA_SYMBOLS = {
  'BTCUSD': 'BTC/USD', 'ETHUSD': 'ETH/USD', 'SOLUSD': 'SOL/USD',
  'XRPUSD': 'XRP/USD', 'BNBUSD': 'BNB/USD', 'ADAUSD': 'ADA/USD',
  'DOGEUSD': 'DOGE/USD', 'AVAXUSD': 'AVAX/USD', 'DOTUSD': 'DOT/USD',
  'MATICUSD': 'MATIC/USD', 'LINKUSD': 'LINK/USD', 'UNIUSD': 'UNI/USD',
  'ATOMUSD': 'ATOM/USD', 'LTCUSD': 'LTC/USD', 'BCHUSD': 'BCH/USD',
  'APTUSD': 'APT/USD', 'ARBUSD': 'ARB/USD', 'OPUSD': 'OP/USD',
  'NEARUSD': 'NEAR/USD', 'INJUSD': 'INJ/USD',
  'EURUSD': 'EUR/USD', 'GBPUSD': 'GBP/USD',
  'USDJPY': 'USD/JPY', 'USDCHF': 'USD/CHF', 'AUDUSD': 'AUD/USD',
  'USDCAD': 'USD/CAD', 'NZDUSD': 'NZD/USD',
  'XAUUSD': 'XAU/USD', 'XAGUSD': 'XAG/USD',
  'AAPL': 'AAPL', 'MSFT': 'MSFT', 'NVDA': 'NVDA', 'AMZN': 'AMZN',
  'GOOGL': 'GOOGL', 'META': 'META', 'TSLA': 'TSLA'
};

// Spot instruments: prefer Finnhub (OANDA spot) / Twelve Data over Yahoo (futures/delayed)
const SPOT_SYMBOLS = new Set([
  ...FOREX_SYMBOL_SET,
  'XAUUSD', 'XAGUSD',
  ...CRYPTO_SYMBOL_SET,
]);

/** Stooq spot FX + XAU/XAG */
const STOOQ_PARAM_BY_SYMBOL = STOOQ_FX_PARAM;
const STOOQ_FOREX_METALS = new Set(Object.keys(STOOQ_FX_PARAM));

function buildStooqPriceRow(symbol, close) {
  if (!close || !Number.isFinite(close) || close <= 0) return null;
  return {
    symbol,
    price: formatPrice(close, symbol),
    rawPrice: close,
    previousClose: formatPrice(close, symbol),
    change: '0.00',
    changeSign: '+',
    changePercent: '0.00',
    isUp: true,
    timestamp: Date.now(),
    source: 'stooq',
    delayed: true,
  };
}

/**
 * One HTTP request: batch spot FX + gold/silver from Stooq (free, no API key).
 * @param {string[]} symbols - internal symbols e.g. EURUSD, XAUUSD
 * @returns {Record<string, ReturnType<buildStooqPriceRow>>}
 */
async function fetchStooqBatchMap(symbols) {
  const params = [...new Set(symbols.map((s) => STOOQ_PARAM_BY_SYMBOL[s]).filter(Boolean))];
  if (params.length === 0) return {};

  const url = `https://stooq.com/q/l/?s=${params.join('+')}&i=d`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraTerminal/1.0)' },
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    clearTimeout(timeoutId);

    const text = typeof response.data === 'string' ? response.data : String(response.data || '');
    const out = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(',');
      if (parts.length < 7) continue;
      if (parts[1] === 'N/D' || String(parts[6]).toUpperCase() === 'N/D') continue;
      const sym = String(parts[0] || '').toUpperCase();
      if (!STOOQ_FOREX_METALS.has(sym)) continue;
      const close = parseFloat(parts[6]);
      const row = buildStooqPriceRow(sym, close);
      if (row) out[sym] = row;
    }
    return out;
  } catch (e) {
    return {};
  }
}

// Decimals by symbol
const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'XRPUSD': 4, 'BNBUSD': 2,
  'ADAUSD': 4, 'DOGEUSD': 5, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'USDCHF': 4, 'AUDUSD': 4, 'USDCAD': 4, 'NZDUSD': 4, 'XAUUSD': 2,
  'XAGUSD': 2, 'WTI': 2, 'BRENT': 2, 'SPX': 2, 'NDX': 2, 'DJI': 2,
  'DAX': 2, 'FTSE': 2, 'NIKKEI': 2, 'DXY': 3, 'US10Y': 3, 'VIX': 2,
  'AAPL': 2, 'MSFT': 2, 'NVDA': 2, 'AMZN': 2, 'GOOGL': 2, 'META': 2, 'TSLA': 2
};

// Realistic fallback prices (when all providers fail) - updated Mar 2026
const FALLBACK_PRICES = {
  'BTCUSD': 84500, 'ETHUSD': 1920, 'SOLUSD': 132, 'XRPUSD': 2.38,
  'BNBUSD': 590, 'ADAUSD': 0.72, 'DOGEUSD': 0.175, 'EURUSD': 1.0840,
  'GBPUSD': 1.2920, 'USDJPY': 149.50, 'USDCHF': 0.8840, 'AUDUSD': 0.6270,
  'USDCAD': 1.4380, 'NZDUSD': 0.5720, 'XAUUSD': 3035, 'XAGUSD': 33.80,
  'WTI': 68.40, 'BRENT': 72.10, 'SPX': 5650, 'NDX': 19600, 'DJI': 41800,
  'DAX': 22300, 'FTSE': 8650, 'NIKKEI': 37200, 'DXY': 103.6, 'US10Y': 4.32, 'VIX': 20.4,
  'AAPL': 214, 'MSFT': 388, 'NVDA': 112, 'AMZN': 196, 'GOOGL': 163, 'META': 590, 'TSLA': 248
};

function getDecimals(symbol) {
  if (DECIMALS[symbol] != null) return DECIMALS[symbol];
  if (CRYPTO_DECIMALS[symbol] != null) return CRYPTO_DECIMALS[symbol];
  if (FOREX_SYMBOL_SET.has(symbol)) return symbol.includes('JPY') ? 2 : 4;
  return 2;
}

function formatPrice(price, symbol) {
  if (price === null || price === undefined || isNaN(price)) return null;
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

/**
 * Fetch from Yahoo Finance (primary provider)
 */
async function fetchYahooPrice(symbol) {
  const yahooSymbol = yahooSymbolFor(symbol);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      { 
        params: { interval: '1m', range: '1d' }, 
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta;
    
    if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
      const price = meta.regularMarketPrice;
      const previousClose = meta.previousClose || meta.chartPreviousClose || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      
      const marketState = meta.marketState || null;
      return {
        symbol,
        price: formatPrice(price, symbol),
        rawPrice: price,
        previousClose: formatPrice(previousClose, symbol),
        change: formatPrice(Math.abs(change), symbol),
        changeSign: change >= 0 ? '+' : '-',
        changePercent: Math.abs(changePercent).toFixed(2),
        isUp: change >= 0,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        open: meta.regularMarketOpen,
        timestamp: Date.now(),
        source: 'yahoo',
        delayed: false,
        marketState,
      };
    }
    return null;
  } catch (e) {
    // Don't log timeout errors as they're expected
    if (e.name !== 'AbortError') {
      console.log(`Yahoo fetch error for ${symbol}: ${e.message}`);
    }
    return null;
  }
}

/**
 * Fetch from CoinGecko (free, no API key, real-time crypto)
 */
async function fetchCoinGeckoPrice(symbol) {
  const cgId = COINGECKO_IDS[symbol];
  if (!cgId) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price`,
      {
        params: { ids: cgId, vs_currencies: 'usd' },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    const price = response.data?.[cgId]?.usd;
    if (!price || isNaN(price) || price <= 0) return null;

    return {
      symbol,
      price: formatPrice(price, symbol),
      rawPrice: price,
      previousClose: formatPrice(price, symbol),
      change: '0.00',
      changeSign: '+',
      changePercent: '0.00',
      isUp: true,
      timestamp: Date.now(),
      source: 'coingecko',
      delayed: false
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fetch crypto batch from CoinGecko (efficient - one request for all crypto)
 */
let coingeckoCache = {};
let coingeckoCacheTime = 0;
const COINGECKO_CACHE_TTL = 5000; // 5s

async function fetchCoinGeckoBatch() {
  if (Date.now() - coingeckoCacheTime < COINGECKO_CACHE_TTL) return coingeckoCache;
  const ids = Object.keys(COINGECKO_IDS).filter(s => CRYPTO_SYMBOL_SET.has(s)).map(s => COINGECKO_IDS[s]).join(',');
  if (!ids) return {};
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids, vs_currencies: 'usd' },
      timeout: REQUEST_TIMEOUT,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const raw = response.data || {};
    const result = {};
    Object.entries(COINGECKO_IDS).forEach(([sym, id]) => {
      const p = raw[id]?.usd;
      if (p && !isNaN(p) && p > 0) result[sym] = p;
    });
    coingeckoCache = result;
    coingeckoCacheTime = Date.now();
    return result;
  } catch (e) {
    return coingeckoCache;
  }
}

/**
 * Fetch from Finnhub (secondary provider)
 * Requires FINNHUB_API_KEY environment variable
 */
async function fetchFinnhubPrice(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  
  const finnhubSymbol = FINNHUB_SYMBOLS[symbol];
  if (!finnhubSymbol) return null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote`,
      { 
        params: { symbol: finnhubSymbol, token: apiKey },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    const data = response.data;
    if (data?.c && data.c > 0) {
      const price = data.c;
      const previousClose = data.pc || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      
      return {
        symbol,
        price: formatPrice(price, symbol),
        rawPrice: price,
        previousClose: formatPrice(previousClose, symbol),
        change: formatPrice(Math.abs(change), symbol),
        changeSign: change >= 0 ? '+' : '-',
        changePercent: Math.abs(changePercent).toFixed(2),
        isUp: change >= 0,
        high: data.h,
        low: data.l,
        open: data.o,
        timestamp: Date.now(),
        source: 'finnhub',
        delayed: false
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch from Twelve Data (spot prices - TradingView accuracy)
 * Requires TWELVE_DATA_API_KEY environment variable
 */
async function fetchTwelveDataPrice(symbol) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const tdSymbol = TWELVE_DATA_SYMBOLS[symbol];
  if (!tdSymbol) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await axios.get(
      'https://api.twelvedata.com/price',
      {
        params: { symbol: tdSymbol, apikey: apiKey },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    const price = parseFloat(response.data?.price);
    if (!response.data?.price || isNaN(price) || price <= 0) return null;

    return {
      symbol,
      price: formatPrice(price, symbol),
      rawPrice: price,
      previousClose: formatPrice(price, symbol),
      change: '0.00',
      changeSign: '+',
      changePercent: '0.00',
      isUp: true,
      timestamp: Date.now(),
      source: 'twelvedata',
      delayed: false
    };
  } catch (e) {
    return null;
  }
}

// Polygon.io symbol mapping for US stocks and indices
const POLYGON_SYMBOLS = {
  'AAPL': 'AAPL', 'MSFT': 'MSFT', 'NVDA': 'NVDA', 'AMZN': 'AMZN',
  'GOOGL': 'GOOGL', 'META': 'META', 'TSLA': 'TSLA',
  'SPX': 'I:SPX', 'NDX': 'I:NDX', 'DJI': 'I:DJI'
};

/**
 * Fetch from Polygon.io (US stocks / indices – 15-min delayed on free tier)
 * Requires POLYGON_API_KEY environment variable
 */
async function fetchPolygonPrice(symbol) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  const polygonSymbol = POLYGON_SYMBOLS[symbol];
  if (!polygonSymbol) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${polygonSymbol}/prev`,
      {
        params: { adjusted: true, apiKey },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);
    const result = response.data?.results?.[0];
    if (result && result.c > 0) {
      const price = result.c;
      const previousClose = result.vw || result.o || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      return {
        symbol,
        price: formatPrice(price, symbol),
        rawPrice: price,
        previousClose: formatPrice(previousClose, symbol),
        change: formatPrice(Math.abs(change), symbol),
        changeSign: change >= 0 ? '+' : '-',
        changePercent: Math.abs(changePercent).toFixed(2),
        isUp: change >= 0,
        high: result.h,
        low: result.l,
        open: result.o,
        timestamp: Date.now(),
        source: 'polygon',
        delayed: true
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// CoinMarketCap symbol mapping (strip USD suffix)
const CMC_SYMBOLS = {
  BTCUSD: 'BTC', ETHUSD: 'ETH', SOLUSD: 'SOL', XRPUSD: 'XRP',
  BNBUSD: 'BNB', ADAUSD: 'ADA', DOGEUSD: 'DOGE', AVAXUSD: 'AVAX',
  DOTUSD: 'DOT', MATICUSD: 'MATIC', LINKUSD: 'LINK', UNIUSD: 'UNI',
  ATOMUSD: 'ATOM', LTCUSD: 'LTC', BCHUSD: 'BCH', APTUSD: 'APT',
  ARBUSD: 'ARB', OPUSD: 'OP', NEARUSD: 'NEAR', INJUSD: 'INJ',
};

let cmcCache = {};
let cmcCacheTime = 0;
const CMC_CACHE_TTL = 30000; // 30s

/**
 * Fetch crypto from CoinMarketCap (paid key, higher reliability than CoinGecko free)
 * Requires COINMARKETCAP_API_KEY environment variable
 */
async function fetchCoinMarketCapPrice(symbol) {
  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) return null;
  const cmcSymbol = CMC_SYMBOLS[symbol];
  if (!cmcSymbol) return null;

  if (Date.now() - cmcCacheTime < CMC_CACHE_TTL && cmcCache[symbol]) {
    return cmcCache[symbol];
  }

  try {
    const allSymbols = Object.values(CMC_SYMBOLS).join(',');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
      {
        params: { symbol: allSymbols, convert: 'USD' },
        headers: { 'X-CMC_PRO_API_KEY': apiKey, 'Accept': 'application/json' },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);
    const data = response.data?.data;
    if (!data) return null;
    const now = Date.now();
    Object.entries(CMC_SYMBOLS).forEach(([sym, cmc]) => {
      const entry = data[cmc];
      if (entry && entry.quote && entry.quote.USD) {
        const q = entry.quote.USD;
        const price = q.price;
        if (price && price > 0) {
          const changePercent = q.percent_change_24h || 0;
          const previousClose = price / (1 + changePercent / 100);
          const change = price - previousClose;
          cmcCache[sym] = {
            symbol: sym,
            price: formatPrice(price, sym),
            rawPrice: price,
            previousClose: formatPrice(previousClose, sym),
            change: formatPrice(Math.abs(change), sym),
            changeSign: change >= 0 ? '+' : '-',
            changePercent: Math.abs(changePercent).toFixed(2),
            isUp: change >= 0,
            timestamp: now,
            source: 'coinmarketcap',
            delayed: false
          };
        }
      }
    });
    cmcCacheTime = now;
    return cmcCache[symbol] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Get fallback price data when all providers fail
 * Uses cached data or static fallback prices - NEVER returns 0.00
 */
function getFallbackPrice(symbol) {
  // First try cached data (even if stale)
  const cached = priceCache.get(symbol);
  if (cached && cached.rawPrice > 0) {
    healthStats.staleFallbacks++;
    return {
      ...cached,
      delayed: true,
      stale: true,
      fromCache: true,
      timestamp: cached.timestamp,
      delayedSince: Date.now() - cached.timestamp
    };
  }
  
  // Use static fallback prices
  const fallbackPrice = FALLBACK_PRICES[symbol];
  if (fallbackPrice) {
    return {
      symbol,
      price: formatPrice(fallbackPrice, symbol),
      rawPrice: fallbackPrice,
      previousClose: formatPrice(fallbackPrice, symbol),
      change: '0.00',
      changeSign: '+',
      changePercent: '0.00',
      isUp: true,
      timestamp: Date.now(),
      source: 'fallback',
      delayed: true,
      unavailable: true
    };
  }
  
  // Absolute last resort - should never happen
  return null;
}

/**
 * Fetch price with fallback chain.
 * For spot instruments (gold, forex, crypto): Finnhub/Twelve Data first (TradingView-like accuracy).
 * For stocks/indices: Yahoo first.
 * 1. Check fresh cache
 * 2. Spot: Finnhub -> Twelve Data -> Yahoo | Non-spot: Yahoo -> Finnhub -> Twelve Data
 * 3. Use stale cache or static fallback (NEVER 0.00)
 */
async function fetchPrice(symbol, options = {}) {
  const { stooqBySymbol = {} } = options;
  // Check fresh cache first
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    healthStats.cacheHits++;
    return { ...cached, fromCache: true, delayed: false };
  }

  const isSpot = SPOT_SYMBOLS.has(symbol);
  let result = null;

  if (CRYPTO_SYMBOL_SET.has(symbol)) {
    // Crypto: CoinGecko (free) -> CoinMarketCap -> Finnhub -> Twelve Data -> Yahoo
    result = await fetchCoinGeckoPrice(symbol);
    if (!result) result = await fetchCoinMarketCapPrice(symbol);
    if (!result) result = await fetchFinnhubPrice(symbol);
    if (!result) result = await fetchTwelveDataPrice(symbol);
    if (!result) result = await fetchYahooPrice(symbol);
  } else if (isSpot) {
    // Forex/metals: Finnhub (OANDA) -> Twelve Data -> Stooq spot (XAU/XAG + FX) -> Yahoo
    result = await fetchFinnhubPrice(symbol);
    if (!result) result = await fetchTwelveDataPrice(symbol);
    if (!result && stooqBySymbol[symbol]) result = stooqBySymbol[symbol];
    if (!result) result = await fetchYahooPrice(symbol);
  } else {
    // Stocks, indices, DXY, etc: Yahoo -> Polygon.io -> Finnhub -> Twelve Data
    result = await fetchYahooPrice(symbol);
    if (!result) result = await fetchPolygonPrice(symbol);
    if (!result) result = await fetchFinnhubPrice(symbol);
    if (!result) result = await fetchTwelveDataPrice(symbol);
  }

  // Got fresh data
  if (result && result.rawPrice > 0) {
    healthStats.successfulFetches++;
    healthStats.lastSuccessTime = Date.now();
    priceCache.set(symbol, result);
    return result;
  }

  // All providers failed - use fallback (NEVER return 0.00)
  healthStats.errors++;
  return getFallbackPrice(symbol);
}

/**
 * Fetch prices for multiple symbols (used by /api/markets/snapshot).
 * Pre-fetches crypto from CoinGecko (free, accurate) then fetches rest.
 */
async function fetchPricesForSymbols(symbols) {
  if (!symbols || symbols.length === 0) return { prices: {}, timestamp: Date.now() };
  const REQUEST_TIMEOUT_MS = 5500;
  const CONCURRENCY = 14;

  const stooqSymbols = symbols.filter((s) => STOOQ_FOREX_METALS.has(s));
  const stooqBySymbol = stooqSymbols.length > 0 ? await fetchStooqBatchMap(stooqSymbols) : {};

  const cryptoSymbols = symbols.filter((s) => CRYPTO_SYMBOL_SET.has(s));
  if (cryptoSymbols.length > 0) {
    const cgPrices = await fetchCoinGeckoBatch();
    cryptoSymbols.forEach((sym) => {
      const p = cgPrices[sym];
      if (p && p > 0) {
        priceCache.set(sym, {
          symbol: sym,
          price: formatPrice(p, sym),
          rawPrice: p,
          previousClose: formatPrice(p, sym),
          change: '0.00',
          changeSign: '+',
          changePercent: '0.00',
          isUp: true,
          timestamp: Date.now(),
          source: 'coingecko',
          delayed: false,
        });
      }
    });
  }

  const prices = {};
  let cursor = 0;

  async function worker() {
    while (cursor < symbols.length) {
      const index = cursor;
      cursor += 1;
      const symbol = symbols[index];
      const priceData = await Promise.race([
        fetchPrice(symbol, { stooqBySymbol }),
        new Promise((resolve) => setTimeout(() => resolve(getFallbackPrice(symbol)), REQUEST_TIMEOUT_MS)),
      ]);
      if (priceData && priceData.price && priceData.price !== '0.00' && parseFloat(priceData.price) > 0) {
        prices[symbol] = priceData;
      } else {
        const fallback = getFallbackPrice(symbol);
        if (fallback) prices[symbol] = fallback;
      }
    }
  }

  const pool = Math.min(CONCURRENCY, Math.max(1, symbols.length));
  await Promise.all(Array.from({ length: pool }, () => worker()));

  enrichSnapshotPrices(prices);
  return { prices, timestamp: Date.now() };
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  healthStats.totalRequests++;

  const symbolsParam = req.query.symbols || '';
  const symbols = symbolsParam.split(',').filter(s => s.trim()).map(s => s.trim().toUpperCase());
  
  if (symbols.length === 0) {
    return res.status(400).json({ success: false, message: 'No symbols provided' });
  }
  
  // Limit to prevent abuse
  if (symbols.length > 50) {
    return res.status(400).json({ success: false, message: 'Max 50 symbols per request' });
  }

  const startTime = Date.now();

  const stooqBySymbol = await fetchStooqBatchMap(symbols.filter((s) => STOOQ_FOREX_METALS.has(s)));

  // Fetch all prices in parallel with timeout
  const results = await Promise.allSettled(
    symbols.map(symbol => 
      Promise.race([
        fetchPrice(symbol, { stooqBySymbol }),
        new Promise(resolve => setTimeout(() => resolve(getFallbackPrice(symbol)), REQUEST_TIMEOUT + 1000))
      ])
    )
  );
  
  const prices = {};
  let liveCount = 0;
  let delayedCount = 0;
  let errorSymbols = [];
  
  results.forEach((result, index) => {
    const symbol = symbols[index];
    
    if (result.status === 'fulfilled' && result.value) {
      const priceData = result.value;
      
      // Ensure we never have 0.00 prices
      if (!priceData.price || priceData.price === '0.00' || parseFloat(priceData.price) === 0) {
        const fallback = getFallbackPrice(symbol);
        if (fallback) {
          prices[symbol] = fallback;
          delayedCount++;
        } else {
          errorSymbols.push(symbol);
        }
      } else {
        prices[symbol] = priceData;
        if (priceData.delayed) {
          delayedCount++;
        } else {
          liveCount++;
        }
      }
    } else {
      // Promise rejected - use fallback
      const fallback = getFallbackPrice(symbol);
      if (fallback) {
        prices[symbol] = fallback;
        delayedCount++;
      } else {
        errorSymbols.push(symbol);
      }
    }
  });

  const latency = Date.now() - startTime;
  healthStats.avgLatency = (healthStats.avgLatency * (healthStats.totalRequests - 1) + latency) / healthStats.totalRequests;

  return res.status(200).json({
    success: true,
    prices,
    meta: {
      requestedCount: symbols.length,
      liveCount,
      delayedCount,
      errorCount: errorSymbols.length,
      errors: errorSymbols.length > 0 ? errorSymbols : undefined,
      latencyMs: latency,
      timestamp: Date.now()
    },
    health: {
      totalRequests: healthStats.totalRequests,
      cacheHitRate: healthStats.totalRequests > 0 
        ? (healthStats.cacheHits / healthStats.totalRequests * 100).toFixed(1) + '%' 
        : '0%',
      avgLatencyMs: Math.round(healthStats.avgLatency),
      lastSuccessTime: healthStats.lastSuccessTime,
      uptime: healthStats.lastSuccessTime > 0
    }
  });
};

module.exports.fetchPricesForSymbols = fetchPricesForSymbols;
