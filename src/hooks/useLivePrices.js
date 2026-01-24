/**
 * useLivePrices - Shared hook for live market prices
 * 
 * Features:
 * - Single connection per browser session (shared across all components)
 * - Only ONE upstream connection per symbol (singleton pattern)
 * - Automatic reconnection with exponential backoff
 * - Never shows 0.00 - uses cached prices with "delayed" indicator
 * - Green/red flash on price updates
 * - Correct decimals per instrument type
 * - Health monitoring
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = window.location.origin;

// ============================================================================
// Singleton Connection Manager
// Ensures only ONE upstream connection exists across entire app
// ============================================================================

let globalPriceData = {};
let globalListeners = new Set();
let fetchInterval = null;
let isConnected = false;
let lastFetchTime = 0;
let reconnectAttempts = 0;
let watchlistConfig = null;
let activeSymbols = new Set();

// Health monitoring
const healthStats = {
  totalUpdates: 0,
  lastUpdateTime: 0,
  avgLatency: 0,
  errors: 0,
  liveSymbols: 0,
  delayedSymbols: 0
};

// Decimals configuration
const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'XRPUSD': 4, 'BNBUSD': 2,
  'ADAUSD': 4, 'DOGEUSD': 5, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'USDCHF': 4, 'AUDUSD': 4, 'USDCAD': 4, 'NZDUSD': 4, 'XAUUSD': 2,
  'XAGUSD': 2, 'WTI': 2, 'BRENT': 2, 'SPX': 2, 'NDX': 2, 'DJI': 2,
  'DAX': 2, 'FTSE': 2, 'NIKKEI': 2, 'DXY': 3, 'US10Y': 3, 'VIX': 2,
  'AAPL': 2, 'MSFT': 2, 'NVDA': 2, 'AMZN': 2, 'GOOGL': 2, 'META': 2, 'TSLA': 2
};

// Display names for symbols
const DISPLAY_NAMES = {
  'BTCUSD': 'BTC/USD', 'ETHUSD': 'ETH/USD', 'SOLUSD': 'SOL/USD',
  'XRPUSD': 'XRP/USD', 'BNBUSD': 'BNB/USD', 'ADAUSD': 'ADA/USD',
  'DOGEUSD': 'DOGE/USD', 'EURUSD': 'EUR/USD', 'GBPUSD': 'GBP/USD',
  'USDJPY': 'USD/JPY', 'USDCHF': 'USD/CHF', 'AUDUSD': 'AUD/USD',
  'USDCAD': 'USD/CAD', 'NZDUSD': 'NZD/USD', 'XAUUSD': 'Gold',
  'XAGUSD': 'Silver', 'WTI': 'WTI Oil', 'BRENT': 'Brent',
  'SPX': 'S&P 500', 'NDX': 'Nasdaq', 'DJI': 'Dow Jones',
  'DAX': 'DAX 40', 'FTSE': 'FTSE 100', 'NIKKEI': 'Nikkei',
  'DXY': 'DXY', 'US10Y': '10Y Yield', 'VIX': 'VIX'
};

function getDecimals(symbol) {
  return DECIMALS[symbol] || 2;
}

function formatPrice(price, symbol) {
  if (!price || isNaN(price)) return null;
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

function getDisplayName(symbol) {
  return DISPLAY_NAMES[symbol] || symbol;
}

// Notify all listeners of price updates
function notifyListeners() {
  const data = { ...globalPriceData };
  globalListeners.forEach(listener => {
    try {
      listener(data);
    } catch (e) {
      console.error('Price listener error:', e);
    }
  });
}

// Fetch prices from API
async function fetchPrices(symbols) {
  if (!symbols || symbols.length === 0) return;
  
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    
    const response = await fetch(
      `${API_BASE_URL}/api/market/prices?symbols=${symbols.join(',')}`,
      { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.success && data.prices) {
      const latency = Date.now() - startTime;
      healthStats.avgLatency = (healthStats.avgLatency * healthStats.totalUpdates + latency) / (healthStats.totalUpdates + 1);
      healthStats.totalUpdates++;
      healthStats.lastUpdateTime = Date.now();
      healthStats.liveSymbols = data.meta?.liveCount || 0;
      healthStats.delayedSymbols = data.meta?.delayedCount || 0;
      
      // Update global price data with flash detection
      Object.entries(data.prices).forEach(([symbol, priceData]) => {
        const prev = globalPriceData[symbol];
        const newPrice = parseFloat(priceData.rawPrice || priceData.price);
        const oldPrice = prev ? parseFloat(prev.rawPrice || prev.price) : newPrice;
        
        // Skip if price is 0 or invalid
        if (!newPrice || newPrice === 0) return;
        
        // Detect price direction for flash animation
        let flash = null;
        if (prev && prev.rawPrice && newPrice !== oldPrice) {
          flash = newPrice > oldPrice ? 'up' : 'down';
        }
        
        globalPriceData[symbol] = {
          ...priceData,
          displayName: priceData.displayName || getDisplayName(symbol),
          flash,
          flashTime: flash ? Date.now() : (prev?.flashTime || 0),
          lastUpdate: Date.now()
        };
      });
      
      lastFetchTime = Date.now();
      isConnected = true;
      reconnectAttempts = 0;
      notifyListeners();
    }
  } catch (error) {
    console.error('Price fetch error:', error.message);
    healthStats.errors++;
    
    // Mark connection as potentially stale but keep existing data
    // NEVER clear prices - they should persist
    
    // Exponential backoff on errors
    reconnectAttempts++;
    const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    
    if (fetchInterval) {
      clearInterval(fetchInterval);
      fetchInterval = setTimeout(() => startPolling(Array.from(activeSymbols)), backoffTime);
    }
  }
}

// Start polling for prices
function startPolling(symbols) {
  if (fetchInterval) {
    clearInterval(fetchInterval);
  }
  
  // Track active symbols
  symbols.forEach(s => activeSymbols.add(s));
  
  // Initial fetch
  fetchPrices(symbols);
  
  // Set up interval (5 seconds for live updates)
  fetchInterval = setInterval(() => fetchPrices(Array.from(activeSymbols)), 5000);
}

// Stop polling
function stopPolling() {
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
  isConnected = false;
}

// Fetch watchlist configuration
async function fetchWatchlist() {
  if (watchlistConfig) return watchlistConfig;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/market/watchlist`);
    const data = await response.json();
    if (data.success && data.watchlist) {
      watchlistConfig = data.watchlist;
      return watchlistConfig;
    }
  } catch (e) {
    console.error('Watchlist fetch error:', e);
  }
  
  // Fallback watchlist
  return {
    beginnerSet: ['BTCUSD', 'ETHUSD', 'AAPL', 'NVDA', 'TSLA', 'EURUSD', 'GBPUSD', 'XAUUSD', 'SPX', 'NDX', 'DXY', 'VIX'],
    groups: {
      crypto: { name: 'Crypto', icon: '₿', order: 1, symbols: [
        { symbol: 'BTCUSD', displayName: 'BTC/USD' },
        { symbol: 'ETHUSD', displayName: 'ETH/USD' }
      ]},
      stocks: { name: 'Stocks', icon: '📈', order: 2, symbols: [
        { symbol: 'AAPL', displayName: 'AAPL' },
        { symbol: 'NVDA', displayName: 'NVDA' },
        { symbol: 'TSLA', displayName: 'TSLA' }
      ]},
      forex: { name: 'Forex', icon: '💱', order: 3, symbols: [
        { symbol: 'EURUSD', displayName: 'EUR/USD' },
        { symbol: 'GBPUSD', displayName: 'GBP/USD' }
      ]},
      commodities: { name: 'Commodities', icon: '🥇', order: 4, symbols: [
        { symbol: 'XAUUSD', displayName: 'Gold' }
      ]},
      indices: { name: 'Indices', icon: '📊', order: 5, symbols: [
        { symbol: 'SPX', displayName: 'S&P 500' },
        { symbol: 'NDX', displayName: 'Nasdaq' }
      ]},
      macro: { name: 'Macro', icon: '🌐', order: 6, symbols: [
        { symbol: 'DXY', displayName: 'DXY' },
        { symbol: 'VIX', displayName: 'VIX' }
      ]}
    }
  };
}

/**
 * useLivePrices Hook
 * 
 * @param {Object} options
 * @param {string[]} options.symbols - Symbols to track (optional)
 * @param {boolean} options.beginnerMode - Use beginner-friendly subset
 * @param {string} options.category - Filter by category
 */
export function useLivePrices(options = {}) {
  const { symbols: customSymbols, beginnerMode = true, category = null } = options;
  
  const [prices, setPrices] = useState({});
  const [watchlist, setWatchlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  
  const symbolsRef = useRef([]);

  // Update prices when global data changes
  const handleUpdate = useCallback((newPrices) => {
    setPrices(prev => {
      // Clear flash after 600ms
      const updated = { ...newPrices };
      Object.keys(updated).forEach(symbol => {
        if (updated[symbol].flash && Date.now() - updated[symbol].flashTime > 600) {
          updated[symbol] = { ...updated[symbol], flash: null };
        }
      });
      return updated;
    });
    setConnected(isConnected);
    setLoading(false);
  }, []);

  // Check for stale data
  useEffect(() => {
    const staleCheck = setInterval(() => {
      const now = Date.now();
      const isStale = lastFetchTime > 0 && now - lastFetchTime > 30000;
      setStale(isStale);
    }, 5000);
    
    return () => clearInterval(staleCheck);
  }, []);

  // Initialize and subscribe
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      // Fetch watchlist config
      const config = await fetchWatchlist();
      if (!mounted) return;
      
      setWatchlist(config);
      
      // Determine symbols to track
      let symbolsToTrack = customSymbols;
      
      if (!symbolsToTrack) {
        if (category && config.groups?.[category]) {
          symbolsToTrack = config.groups[category].symbols.map(s => s.symbol);
        } else if (beginnerMode) {
          symbolsToTrack = config.beginnerSet;
        } else {
          // All symbols from all groups
          symbolsToTrack = Object.values(config.groups || {})
            .flatMap(g => g.symbols?.map(s => s.symbol) || []);
        }
      }
      
      symbolsRef.current = symbolsToTrack;
      
      // Register listener
      globalListeners.add(handleUpdate);
      
      // Start polling if not already running, or merge symbols
      if (!fetchInterval && symbolsToTrack.length > 0) {
        startPolling(symbolsToTrack);
      } else if (fetchInterval) {
        // Add new symbols to tracking
        symbolsToTrack.forEach(s => activeSymbols.add(s));
        // Get current data immediately
        handleUpdate({ ...globalPriceData });
      }
    }
    
    init();
    
    return () => {
      mounted = false;
      globalListeners.delete(handleUpdate);
      
      // Stop polling if no more listeners
      if (globalListeners.size === 0) {
        stopPolling();
        activeSymbols.clear();
      }
    };
  }, [customSymbols, beginnerMode, category, handleUpdate]);

  // Get price for a specific symbol
  const getPrice = useCallback((symbol) => {
    return prices[symbol] || null;
  }, [prices]);

  // Format price with correct decimals
  const formatPriceValue = useCallback((symbol, value) => {
    return formatPrice(value, symbol);
  }, []);

  // Get all prices as array (for rendering)
  // NEVER returns 0.00 - shows loading state instead
  const getPricesArray = useCallback(() => {
    return symbolsRef.current.map(symbol => {
      const priceData = prices[symbol];
      const displayName = getDisplayName(symbol);
      
      if (priceData && priceData.price && parseFloat(priceData.price) > 0) {
        return {
          symbol,
          displayName,
          ...priceData
        };
      }
      
      // No valid price - show loading state (NOT 0.00)
      return {
        symbol,
        displayName,
        price: null,
        change: null,
        changePercent: null,
        isUp: true,
        loading: true,
        delayed: priceData?.delayed || false
      };
    });
  }, [prices]);

  // Get prices grouped by category
  const getPricesGrouped = useCallback(() => {
    if (!watchlist?.groups) return {};
    
    const grouped = {};
    Object.entries(watchlist.groups).forEach(([key, group]) => {
      grouped[key] = {
        ...group,
        prices: group.symbols.map(s => {
          const priceData = prices[s.symbol];
          
          if (priceData && priceData.price && parseFloat(priceData.price) > 0) {
            return {
              ...s,
              ...priceData
            };
          }
          
          // No valid price - loading state
          return {
            ...s,
            price: null,
            change: null,
            changePercent: null,
            isUp: true,
            loading: true,
            delayed: priceData?.delayed || false
          };
        })
      };
    });
    return grouped;
  }, [prices, watchlist]);

  // Health stats
  const getHealth = useCallback(() => ({
    ...healthStats,
    connected: isConnected,
    stale,
    listenerCount: globalListeners.size,
    activeSymbolCount: activeSymbols.size,
    lastFetchTime
  }), [stale]);

  return {
    prices,
    loading,
    connected,
    stale,
    watchlist,
    getPrice,
    formatPrice: formatPriceValue,
    getPricesArray,
    getPricesGrouped,
    getHealth
  };
}

// Export health monitoring for debugging
export function getTickerHealth() {
  return {
    ...healthStats,
    connected: isConnected,
    listenerCount: globalListeners.size,
    activeSymbolCount: activeSymbols.size,
    lastFetchTime,
    reconnectAttempts
  };
}

// Export for testing
export function _getActiveConnections() {
  return {
    listeners: globalListeners.size,
    activeSymbols: activeSymbols.size,
    hasInterval: !!fetchInterval
  };
}

export default useLivePrices;
