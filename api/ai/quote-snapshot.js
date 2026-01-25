/**
 * Quote Snapshot - Live Market Price Layer for AURA AI
 * 
 * This module fetches fresh quote snapshots for instruments mentioned in AI queries.
 * It uses the SAME providers as the price-action bar (Yahoo Finance, Finnhub) for consistency.
 * 
 * Features:
 * - Fetches bid/ask/last, timestamp, session open/prev close, decimals
 * - Staleness check (15s threshold)
 * - Symbol mapping (XAUUSD spot vs GC futures)
 * - Returns structured JSON for injection into AI prompts
 */

const axios = require('axios');

// Configuration
const CONFIG = {
  STALE_THRESHOLD_MS: 15000,     // 15 seconds - quotes older than this are "stale"
  REQUEST_TIMEOUT_MS: 5000,      // 5 seconds per provider
  MAX_RETRY_ATTEMPTS: 2,
  CACHE_TTL_MS: 3000,            // 3 seconds fresh cache
};

// In-memory quote cache
const quoteCache = new Map();

// ============= SYMBOL MAPPING =============
// This ensures consistency: XAUUSD = spot, GC = futures
// We NEVER mix them - if user asks about XAU/USD, we use spot

const SYMBOL_MAPPINGS = {
  // Spot Gold (XAUUSD) - Use OANDA for spot prices
  'XAUUSD': { 
    yahoo: 'GC=F',                    // Yahoo only has futures
    finnhub: 'OANDA:XAU_USD',        // Finnhub has OANDA spot (preferred)
    type: 'spot',
    name: 'Gold Spot',
    decimals: 2,
    instrument: 'XAUUSD',
    preferredSource: 'finnhub'        // Prefer Finnhub OANDA for spot
  },
  'GOLD': { alias: 'XAUUSD' },
  'XAU/USD': { alias: 'XAUUSD' },
  
  // Gold Futures (GC) - Explicitly different from spot
  'GC': { 
    yahoo: 'GC=F',
    finnhub: null,  // Finnhub doesn't have CME futures
    type: 'futures',
    name: 'Gold Futures (CME)',
    decimals: 2,
    instrument: 'GC',
    preferredSource: 'yahoo'
  },
  'GC=F': { alias: 'GC' },
  
  // Spot Silver
  'XAGUSD': { 
    yahoo: 'SI=F',
    finnhub: 'OANDA:XAG_USD',
    type: 'spot',
    name: 'Silver Spot',
    decimals: 3,
    instrument: 'XAGUSD',
    preferredSource: 'finnhub'
  },
  'SILVER': { alias: 'XAGUSD' },
  'XAG/USD': { alias: 'XAGUSD' },
  
  // Major Forex
  'EURUSD': { 
    yahoo: 'EURUSD=X',
    finnhub: 'OANDA:EUR_USD',
    type: 'spot',
    name: 'EUR/USD',
    decimals: 5,
    instrument: 'EURUSD',
    preferredSource: 'finnhub'
  },
  'EUR/USD': { alias: 'EURUSD' },
  
  'GBPUSD': { 
    yahoo: 'GBPUSD=X',
    finnhub: 'OANDA:GBP_USD',
    type: 'spot',
    name: 'GBP/USD',
    decimals: 5,
    instrument: 'GBPUSD',
    preferredSource: 'finnhub'
  },
  'GBP/USD': { alias: 'GBPUSD' },
  
  'USDJPY': { 
    yahoo: 'USDJPY=X',
    finnhub: 'OANDA:USD_JPY',
    type: 'spot',
    name: 'USD/JPY',
    decimals: 3,
    instrument: 'USDJPY',
    preferredSource: 'finnhub'
  },
  'USD/JPY': { alias: 'USDJPY' },
  
  // Crypto
  'BTCUSD': { 
    yahoo: 'BTC-USD',
    finnhub: 'BINANCE:BTCUSDT',
    type: 'spot',
    name: 'Bitcoin',
    decimals: 2,
    instrument: 'BTCUSD',
    preferredSource: 'yahoo'
  },
  'BITCOIN': { alias: 'BTCUSD' },
  'BTC': { alias: 'BTCUSD' },
  
  'ETHUSD': { 
    yahoo: 'ETH-USD',
    finnhub: 'BINANCE:ETHUSDT',
    type: 'spot',
    name: 'Ethereum',
    decimals: 2,
    instrument: 'ETHUSD',
    preferredSource: 'yahoo'
  },
  'ETHEREUM': { alias: 'ETHUSD' },
  'ETH': { alias: 'ETHUSD' },
  
  // Indices
  'SPX': { 
    yahoo: '^GSPC',
    finnhub: null,
    type: 'index',
    name: 'S&P 500',
    decimals: 2,
    instrument: 'SPX',
    preferredSource: 'yahoo'
  },
  'SP500': { alias: 'SPX' },
  'S&P500': { alias: 'SPX' },
  
  'NDX': { 
    yahoo: '^IXIC',
    finnhub: null,
    type: 'index',
    name: 'NASDAQ Composite',
    decimals: 2,
    instrument: 'NDX',
    preferredSource: 'yahoo'
  },
  'NASDAQ': { alias: 'NDX' },
  
  // Oil
  'WTI': { 
    yahoo: 'CL=F',
    finnhub: null,
    type: 'futures',
    name: 'WTI Crude Oil',
    decimals: 2,
    instrument: 'WTI',
    preferredSource: 'yahoo'
  },
  'USOIL': { alias: 'WTI' },
  'CRUDE': { alias: 'WTI' },
  'OIL': { alias: 'WTI' },
};

// ============= HELPER FUNCTIONS =============

/**
 * Resolve symbol alias to canonical symbol
 */
function resolveSymbol(input) {
  if (!input) return null;
  const upper = input.toUpperCase().replace(/\s+/g, '');
  
  let mapping = SYMBOL_MAPPINGS[upper];
  
  // Follow alias chain
  let maxIterations = 5;
  while (mapping?.alias && maxIterations > 0) {
    mapping = SYMBOL_MAPPINGS[mapping.alias];
    maxIterations--;
  }
  
  if (!mapping) {
    // Unknown symbol - return a basic config
    return {
      yahoo: upper,
      finnhub: null,
      type: 'unknown',
      name: upper,
      decimals: 2,
      instrument: upper,
      preferredSource: 'yahoo'
    };
  }
  
  return mapping;
}

/**
 * Format price with correct decimals
 */
function formatPrice(price, decimals = 2) {
  if (price === null || price === undefined || isNaN(price)) return null;
  return parseFloat(parseFloat(price).toFixed(decimals));
}

// ============= YAHOO FINANCE FETCHER =============

async function fetchFromYahoo(symbolConfig) {
  if (!symbolConfig.yahoo) return null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbolConfig.yahoo}`,
      { 
        params: { interval: '1m', range: '1d' }, 
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta;
    
    if (!meta?.regularMarketPrice || meta.regularMarketPrice <= 0) {
      return null;
    }
    
    const price = meta.regularMarketPrice;
    const previousClose = meta.previousClose || meta.chartPreviousClose || price;
    const change = price - previousClose;
    const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
    
    // Get bid/ask from current trading session if available
    const bid = meta.bid || null;
    const ask = meta.ask || null;
    const spread = (bid && ask) ? (ask - bid) : null;
    
    return {
      symbol: symbolConfig.instrument,
      displayName: symbolConfig.name,
      type: symbolConfig.type,
      
      // Current prices
      last: formatPrice(price, symbolConfig.decimals),
      bid: bid ? formatPrice(bid, symbolConfig.decimals) : null,
      ask: ask ? formatPrice(ask, symbolConfig.decimals) : null,
      spread: spread ? formatPrice(spread, symbolConfig.decimals + 1) : null,
      
      // Session data
      open: formatPrice(meta.regularMarketOpen, symbolConfig.decimals),
      high: formatPrice(meta.regularMarketDayHigh, symbolConfig.decimals),
      low: formatPrice(meta.regularMarketDayLow, symbolConfig.decimals),
      previousClose: formatPrice(previousClose, symbolConfig.decimals),
      
      // Change
      change: formatPrice(change, symbolConfig.decimals),
      changePercent: formatPrice(changePercent, 2),
      direction: change >= 0 ? 'up' : 'down',
      
      // Metadata
      decimals: symbolConfig.decimals,
      timestamp: Date.now(),
      timestampISO: new Date().toISOString(),
      source: 'yahoo',
      isStale: false,
      
      // Raw for validation
      _raw: {
        provider: 'yahoo',
        yahooSymbol: symbolConfig.yahoo,
        exchangeTimezone: meta.exchangeTimezoneName,
        marketState: meta.marketState
      }
    };
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.log(`Yahoo fetch error for ${symbolConfig.instrument}: ${error.message}`);
    }
    return null;
  }
}

// ============= FINNHUB FETCHER =============

async function fetchFromFinnhub(symbolConfig) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || !symbolConfig.finnhub) return null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    
    const response = await axios.get(
      'https://finnhub.io/api/v1/quote',
      { 
        params: { symbol: symbolConfig.finnhub, token: apiKey },
        timeout: CONFIG.REQUEST_TIMEOUT_MS,
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    const data = response.data;
    if (!data?.c || data.c <= 0) {
      return null;
    }
    
    const price = data.c;
    const previousClose = data.pc || price;
    const change = price - previousClose;
    const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
    
    return {
      symbol: symbolConfig.instrument,
      displayName: symbolConfig.name,
      type: symbolConfig.type,
      
      // Current prices (Finnhub doesn't provide bid/ask for most)
      last: formatPrice(price, symbolConfig.decimals),
      bid: null,
      ask: null,
      spread: null,
      
      // Session data
      open: formatPrice(data.o, symbolConfig.decimals),
      high: formatPrice(data.h, symbolConfig.decimals),
      low: formatPrice(data.l, symbolConfig.decimals),
      previousClose: formatPrice(previousClose, symbolConfig.decimals),
      
      // Change
      change: formatPrice(change, symbolConfig.decimals),
      changePercent: formatPrice(changePercent, 2),
      direction: change >= 0 ? 'up' : 'down',
      
      // Metadata
      decimals: symbolConfig.decimals,
      timestamp: Date.now(),
      timestampISO: new Date().toISOString(),
      source: 'finnhub',
      isStale: false,
      
      // Raw for validation
      _raw: {
        provider: 'finnhub',
        finnhubSymbol: symbolConfig.finnhub,
        updateTimestamp: data.t ? data.t * 1000 : Date.now()
      }
    };
  } catch (error) {
    return null;
  }
}

// ============= MAIN QUOTE FETCHER =============

/**
 * Fetch a fresh quote snapshot for a single symbol
 * 
 * @param {string} symbol - The symbol to fetch (e.g., 'XAUUSD', 'gold', 'EUR/USD')
 * @returns {Object|null} Quote snapshot or null if unavailable
 */
async function fetchQuoteSnapshot(symbol) {
  if (!symbol) return null;
  
  const symbolConfig = resolveSymbol(symbol);
  if (!symbolConfig) return null;
  
  // Check cache first
  const cacheKey = symbolConfig.instrument;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
    return { ...cached, fromCache: true };
  }
  
  let quote = null;
  
  // Try preferred source first
  if (symbolConfig.preferredSource === 'finnhub') {
    quote = await fetchFromFinnhub(symbolConfig);
    if (!quote) {
      quote = await fetchFromYahoo(symbolConfig);
    }
  } else {
    quote = await fetchFromYahoo(symbolConfig);
    if (!quote) {
      quote = await fetchFromFinnhub(symbolConfig);
    }
  }
  
  // Cache the result
  if (quote) {
    quoteCache.set(cacheKey, quote);
  }
  
  return quote;
}

/**
 * Fetch quote snapshots for multiple symbols in parallel
 * 
 * @param {string[]} symbols - Array of symbols to fetch
 * @returns {Object} Map of symbol -> quote snapshot
 */
async function fetchMultipleQuotes(symbols) {
  if (!symbols || symbols.length === 0) return {};
  
  // Dedupe and resolve symbols
  const uniqueSymbols = [...new Set(symbols.map(s => {
    const config = resolveSymbol(s);
    return config?.instrument || s.toUpperCase();
  }))];
  
  // Fetch all in parallel
  const results = await Promise.allSettled(
    uniqueSymbols.map(s => fetchQuoteSnapshot(s))
  );
  
  const quotes = {};
  results.forEach((result, index) => {
    const symbol = uniqueSymbols[index];
    if (result.status === 'fulfilled' && result.value) {
      quotes[symbol] = result.value;
    } else {
      quotes[symbol] = null;
    }
  });
  
  return quotes;
}

/**
 * Check if a quote is stale (older than STALE_THRESHOLD_MS)
 */
function isQuoteStale(quote) {
  if (!quote || !quote.timestamp) return true;
  return Date.now() - quote.timestamp > CONFIG.STALE_THRESHOLD_MS;
}

/**
 * Build a structured quote context for injection into AI prompt
 * This is the JSON that gets passed to the AI as the "source of truth"
 * 
 * @param {Object} quotes - Map of symbol -> quote snapshot
 * @returns {Object} Structured context for AI prompt
 */
function buildQuoteContext(quotes) {
  if (!quotes || Object.keys(quotes).length === 0) {
    return {
      available: false,
      timestamp: new Date().toISOString(),
      instruments: {},
      message: 'No live quotes available'
    };
  }
  
  const instruments = {};
  let hasValidQuotes = false;
  
  for (const [symbol, quote] of Object.entries(quotes)) {
    if (!quote) {
      instruments[symbol] = {
        available: false,
        reason: 'Quote fetch failed'
      };
      continue;
    }
    
    if (isQuoteStale(quote)) {
      instruments[symbol] = {
        available: false,
        reason: 'Quote is stale (older than 15 seconds)',
        lastKnown: quote.last,
        lastTimestamp: quote.timestampISO
      };
      continue;
    }
    
    hasValidQuotes = true;
    instruments[symbol] = {
      available: true,
      displayName: quote.displayName,
      type: quote.type,
      last: quote.last,
      bid: quote.bid,
      ask: quote.ask,
      spread: quote.spread,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      direction: quote.direction,
      decimals: quote.decimals,
      timestamp: quote.timestampISO,
      source: quote.source
    };
  }
  
  return {
    available: hasValidQuotes,
    timestamp: new Date().toISOString(),
    instruments,
    _validationNote: 'AI MUST ONLY use prices from this context. Do NOT guess or make up prices.'
  };
}

/**
 * Detect all instruments mentioned in a message
 * This is used to know which quotes to fetch before calling the AI
 * 
 * @param {string} message - User's message
 * @returns {string[]} Array of detected symbols
 */
function detectInstruments(message) {
  if (!message) return [];
  
  const instruments = [];
  const upperMessage = message.toUpperCase();
  
  // Direct symbol mentions
  const symbolPatterns = [
    // Forex pairs
    /\b(EUR\/?USD|GBP\/?USD|USD\/?JPY|USD\/?CHF|AUD\/?USD|USD\/?CAD|NZD\/?USD)\b/gi,
    /\b(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)\b/gi,
    
    // Gold/Silver
    /\b(XAU\/?USD|XAUUSD|GOLD)\b/gi,
    /\b(XAG\/?USD|XAGUSD|SILVER)\b/gi,
    /\b(GC=?F?)\b/g,  // Gold futures
    
    // Crypto
    /\b(BTC\/?USD|BTCUSD|BITCOIN|BTC)\b/gi,
    /\b(ETH\/?USD|ETHUSD|ETHEREUM|ETH)\b/gi,
    
    // Indices
    /\b(SPX|SP500|S&P\s*500)\b/gi,
    /\b(NDX|NASDAQ|NAS100)\b/gi,
    
    // Oil
    /\b(WTI|USOIL|CRUDE|OIL|CL=?F?)\b/gi,
    
    // Stocks (common ones)
    /\b(AAPL|MSFT|GOOGL|AMZN|TSLA|META|NVDA)\b/gi,
  ];
  
  for (const pattern of symbolPatterns) {
    const matches = message.match(pattern);
    if (matches) {
      instruments.push(...matches.map(m => m.toUpperCase()));
    }
  }
  
  // Dedupe and normalize
  const normalized = [...new Set(instruments)].map(s => {
    const config = resolveSymbol(s);
    return config?.instrument || s;
  });
  
  return [...new Set(normalized)];
}

/**
 * Check if user explicitly asked for futures vs spot
 * This helps maintain symbol consistency
 * 
 * @param {string} message - User's message
 * @param {string} symbol - Detected symbol
 * @returns {Object} { isFutures: boolean, isSpot: boolean, explicit: boolean }
 */
function detectInstrumentType(message, symbol) {
  const lower = message.toLowerCase();
  
  const futuresKeywords = ['futures', 'future', 'contract', 'gc=f', 'cl=f', 'si=f', 'cme', 'comex'];
  const spotKeywords = ['spot', 'xau/usd', 'xauusd', 'forex', 'fx'];
  
  const hasFutures = futuresKeywords.some(k => lower.includes(k));
  const hasSpot = spotKeywords.some(k => lower.includes(k));
  
  return {
    isFutures: hasFutures && !hasSpot,
    isSpot: hasSpot || !hasFutures, // Default to spot
    explicit: hasFutures || hasSpot
  };
}

// ============= SINGLE ENTRY POINT: getLiveQuote =============

/**
 * getLiveQuote - THE PRIMARY FUNCTION for getting live market prices
 * 
 * This is the single entry point that the AI and all price-checking code should use.
 * It handles provider selection, fallback, caching, and returns a consistent format.
 * 
 * @param {string} symbol - The instrument symbol (e.g., 'XAUUSD', 'EURUSD', 'BTCUSD')
 * @returns {Object} Quote object with bid, ask, mid, last, timestamp, sessionOpen, prevClose
 *                   OR { available: false, reason: '...' } if quote unavailable
 */
async function getLiveQuote(symbol) {
  if (!symbol) {
    return {
      available: false,
      reason: 'No symbol provided'
    };
  }
  
  try {
    const quote = await fetchQuoteSnapshot(symbol);
    
    if (!quote) {
      return {
        available: false,
        symbol: symbol.toUpperCase(),
        reason: 'Quote fetch failed - provider unavailable'
      };
    }
    
    if (isQuoteStale(quote)) {
      return {
        available: false,
        symbol: quote.symbol,
        reason: 'Quote is stale (older than 15 seconds)',
        lastKnown: quote.last,
        lastTimestamp: quote.timestampISO
      };
    }
    
    // Calculate mid price if bid/ask available
    const mid = (quote.bid && quote.ask) 
      ? formatPrice((quote.bid + quote.ask) / 2, quote.decimals)
      : quote.last;
    
    return {
      available: true,
      symbol: quote.symbol,
      displayName: quote.displayName,
      type: quote.type,
      
      // Core prices
      bid: quote.bid,
      ask: quote.ask,
      mid: mid,
      last: quote.last,
      spread: quote.spread,
      
      // Session data
      sessionOpen: quote.open,
      prevClose: quote.previousClose,
      high: quote.high,
      low: quote.low,
      
      // Change
      change: quote.change,
      changePercent: quote.changePercent,
      direction: quote.direction,
      
      // Metadata
      decimals: quote.decimals,
      timestamp: quote.timestamp,
      timestampISO: quote.timestampISO,
      source: quote.source,
      
      // For validation
      _raw: quote._raw
    };
    
  } catch (error) {
    console.error(`getLiveQuote error for ${symbol}:`, error.message);
    return {
      available: false,
      symbol: symbol.toUpperCase(),
      reason: `Error fetching quote: ${error.message}`
    };
  }
}

/**
 * getLiveQuotes - Get multiple quotes at once (parallel fetch)
 * 
 * @param {string[]} symbols - Array of symbols
 * @returns {Object} Map of symbol -> quote result
 */
async function getLiveQuotes(symbols) {
  if (!symbols || symbols.length === 0) return {};
  
  const results = {};
  const promises = symbols.map(async (symbol) => {
    const quote = await getLiveQuote(symbol);
    results[quote.symbol || symbol.toUpperCase()] = quote;
  });
  
  await Promise.all(promises);
  return results;
}

// ============= EXPORTS =============

module.exports = {
  // Primary entry point - use this!
  getLiveQuote,
  getLiveQuotes,
  
  // Lower-level functions
  fetchQuoteSnapshot,
  fetchMultipleQuotes,
  isQuoteStale,
  buildQuoteContext,
  detectInstruments,
  detectInstrumentType,
  resolveSymbol,
  formatPrice,
  
  // Configuration
  SYMBOL_MAPPINGS,
  CONFIG
};
