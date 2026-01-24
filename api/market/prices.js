/**
 * Market Prices API - Batch price fetcher
 * 
 * GET /api/market/prices?symbols=BTCUSD,ETHUSD,AAPL
 * Returns current prices for multiple symbols
 * 
 * Features:
 * - Parallel fetching from multiple providers
 * - Caching to reduce API calls
 * - Fallback providers
 */

const axios = require('axios');

// In-memory cache
const priceCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

// Provider mapping
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

// Decimals by symbol
const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'XRPUSD': 4, 'BNBUSD': 2,
  'ADAUSD': 4, 'DOGEUSD': 5, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'USDCHF': 4, 'AUDUSD': 4, 'USDCAD': 4, 'NZDUSD': 4, 'XAUUSD': 2,
  'XAGUSD': 2, 'WTI': 2, 'BRENT': 2, 'SPX': 2, 'NDX': 2, 'DJI': 2,
  'DAX': 2, 'FTSE': 2, 'NIKKEI': 2, 'DXY': 3, 'US10Y': 3, 'VIX': 2,
  'AAPL': 2, 'MSFT': 2, 'NVDA': 2, 'AMZN': 2, 'GOOGL': 2, 'META': 2, 'TSLA': 2
};

function getDecimals(symbol) {
  return DECIMALS[symbol] || 2;
}

function formatPrice(price, symbol) {
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

async function fetchYahooPrice(symbol) {
  const yahooSymbol = YAHOO_SYMBOLS[symbol] || symbol;
  
  try {
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      { params: { interval: '1m', range: '1d' }, timeout: 5000 }
    );
    
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta;
    
    if (meta?.regularMarketPrice) {
      const price = meta.regularMarketPrice;
      const previousClose = meta.previousClose || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      
      return {
        symbol,
        price: formatPrice(price, symbol),
        rawPrice: price,
        previousClose: formatPrice(previousClose, symbol),
        change: formatPrice(change, symbol),
        changePercent: changePercent.toFixed(2),
        isUp: change >= 0,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        open: meta.regularMarketOpen,
        timestamp: Date.now(),
        source: 'yahoo'
      };
    }
    return null;
  } catch (e) {
    console.log(`Yahoo fetch error for ${symbol}: ${e.message}`);
    return null;
  }
}

async function fetchPrice(symbol) {
  // Check cache first
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached, fromCache: true };
  }
  
  // Try Yahoo Finance
  const result = await fetchYahooPrice(symbol);
  
  if (result) {
    priceCache.set(symbol, result);
    return result;
  }
  
  // Return cached data if fresh fetch failed
  if (cached) {
    return { ...cached, stale: true };
  }
  
  return null;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

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
  
  // Fetch all prices in parallel
  const results = await Promise.allSettled(
    symbols.map(symbol => fetchPrice(symbol))
  );
  
  const prices = {};
  const errors = [];
  
  results.forEach((result, index) => {
    const symbol = symbols[index];
    if (result.status === 'fulfilled' && result.value) {
      prices[symbol] = result.value;
    } else {
      errors.push(symbol);
      // Provide fallback structure
      prices[symbol] = {
        symbol,
        price: '0.00',
        change: '0.00',
        changePercent: '0.00',
        isUp: true,
        error: true,
        timestamp: Date.now()
      };
    }
  });

  const latency = Date.now() - startTime;

  return res.status(200).json({
    success: true,
    prices,
    meta: {
      requestedCount: symbols.length,
      successCount: symbols.length - errors.length,
      errors: errors.length > 0 ? errors : undefined,
      latencyMs: latency,
      timestamp: Date.now()
    }
  });
};
