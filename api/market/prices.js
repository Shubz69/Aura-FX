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

// Persistent price cache (survives between requests)
// Key: symbol, Value: { ...priceData, timestamp }
const priceCache = new Map();
const CACHE_TTL = 5000; // Fresh data TTL: 5 seconds
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

// Provider mapping for Yahoo Finance
const YAHOO_SYMBOLS = {
  'SPX': '^GSPC', 'NDX': '^IXIC', 'DJI': '^DJI', 'FTSE': '^FTSE',
  'DAX': '^GDAXI', 'NIKKEI': '^N225', 'VIX': '^VIX', 'DXY': 'DX-Y.NYB',
  'US10Y': '^TNX', 'WTI': 'CL=F', 'BRENT': 'BZ=F',
  'BTCUSD': 'BTC-USD', 'ETHUSD': 'ETH-USD', 'SOLUSD': 'SOL-USD',
  'XRPUSD': 'XRP-USD', 'BNBUSD': 'BNB-USD', 'ADAUSD': 'ADA-USD',
  'DOGEUSD': 'DOGE-USD', 'EURUSD': 'EURUSD=X', 'GBPUSD': 'GBPUSD=X',
  'USDJPY': 'JPY=X', 'USDCHF': 'CHF=X', 'AUDUSD': 'AUDUSD=X',
  'USDCAD': 'CAD=X', 'NZDUSD': 'NZDUSD=X', 'XAUUSD': 'GC=F', 'XAGUSD': 'SI=F'
};

// Finnhub symbol mapping (secondary provider)
const FINNHUB_SYMBOLS = {
  'BTCUSD': 'BINANCE:BTCUSDT', 'ETHUSD': 'BINANCE:ETHUSDT',
  'SOLUSD': 'BINANCE:SOLUSDT', 'XRPUSD': 'BINANCE:XRPUSDT',
  'BNBUSD': 'BINANCE:BNBUSDT', 'ADAUSD': 'BINANCE:ADAUSDT',
  'DOGEUSD': 'BINANCE:DOGEUSDT', 'EURUSD': 'OANDA:EUR_USD',
  'GBPUSD': 'OANDA:GBP_USD', 'USDJPY': 'OANDA:USD_JPY',
  'XAUUSD': 'OANDA:XAU_USD'
};

// Decimals by symbol
const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'XRPUSD': 4, 'BNBUSD': 2,
  'ADAUSD': 4, 'DOGEUSD': 5, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'USDCHF': 4, 'AUDUSD': 4, 'USDCAD': 4, 'NZDUSD': 4, 'XAUUSD': 2,
  'XAGUSD': 2, 'WTI': 2, 'BRENT': 2, 'SPX': 2, 'NDX': 2, 'DJI': 2,
  'DAX': 2, 'FTSE': 2, 'NIKKEI': 2, 'DXY': 3, 'US10Y': 3, 'VIX': 2,
  'AAPL': 2, 'MSFT': 2, 'NVDA': 2, 'AMZN': 2, 'GOOGL': 2, 'META': 2, 'TSLA': 2
};

// Realistic fallback prices (last known good prices for when all providers fail)
// This ensures we NEVER show 0.00
const FALLBACK_PRICES = {
  'BTCUSD': 98500, 'ETHUSD': 3450, 'SOLUSD': 185, 'XRPUSD': 2.35,
  'BNBUSD': 685, 'ADAUSD': 0.95, 'DOGEUSD': 0.32, 'EURUSD': 1.0420,
  'GBPUSD': 1.2210, 'USDJPY': 155.50, 'USDCHF': 0.9150, 'AUDUSD': 0.6280,
  'USDCAD': 1.4350, 'NZDUSD': 0.5680, 'XAUUSD': 2755, 'XAGUSD': 30.85,
  'WTI': 74.50, 'BRENT': 78.20, 'SPX': 6050, 'NDX': 21500, 'DJI': 44200,
  'DAX': 21200, 'FTSE': 8520, 'NIKKEI': 39800, 'DXY': 108.5, 'US10Y': 4.65, 'VIX': 16.5,
  'AAPL': 232, 'MSFT': 448, 'NVDA': 138, 'AMZN': 235, 'GOOGL': 198, 'META': 625, 'TSLA': 395
};

function getDecimals(symbol) {
  return DECIMALS[symbol] || 2;
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
  const yahooSymbol = YAHOO_SYMBOLS[symbol] || symbol;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      { 
        params: { interval: '1m', range: '1d' }, 
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
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
        delayed: false
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
 * Fetch price with fallback chain:
 * 1. Check fresh cache
 * 2. Try Yahoo Finance
 * 3. Try Finnhub
 * 4. Use stale cache or static fallback (NEVER 0.00)
 */
async function fetchPrice(symbol) {
  // Check fresh cache first
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    healthStats.cacheHits++;
    return { ...cached, fromCache: true, delayed: false };
  }
  
  // Try primary provider (Yahoo)
  let result = await fetchYahooPrice(symbol);
  
  // Try secondary provider if primary fails
  if (!result) {
    result = await fetchFinnhubPrice(symbol);
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
 * Does not use per-request cache; snapshot endpoint has its own 60s cache.
 */
async function fetchPricesForSymbols(symbols) {
  if (!symbols || symbols.length === 0) return { prices: {}, timestamp: Date.now() };
  const REQUEST_TIMEOUT_MS = 5000;
  const results = await Promise.allSettled(
    symbols.map(symbol =>
      Promise.race([
        fetchPrice(symbol),
        new Promise(resolve => setTimeout(() => resolve(getFallbackPrice(symbol)), REQUEST_TIMEOUT_MS + 1000))
      ])
    )
  );
  const prices = {};
  results.forEach((result, index) => {
    const symbol = symbols[index];
    if (result.status === 'fulfilled' && result.value) {
      const priceData = result.value;
      if (!priceData.price || priceData.price === '0.00' || parseFloat(priceData.price) === 0) {
        const fallback = getFallbackPrice(symbol);
        if (fallback) prices[symbol] = fallback;
      } else {
        prices[symbol] = priceData;
      }
    } else {
      const fallback = getFallbackPrice(symbol);
      if (fallback) prices[symbol] = fallback;
    }
  });
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
  
  // Fetch all prices in parallel with timeout
  const results = await Promise.allSettled(
    symbols.map(symbol => 
      Promise.race([
        fetchPrice(symbol),
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
