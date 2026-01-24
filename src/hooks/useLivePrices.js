/**
 * useLivePrices - Shared hook for live market prices
 * 
 * Features:
 * - Single connection per browser session (shared across pages)
 * - Automatic reconnection with exponential backoff
 * - Stale data detection
 * - Green/red flash on price updates
 * - Correct decimals per instrument type
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = window.location.origin;

// Singleton connection manager
let globalPriceData = {};
let globalListeners = new Set();
let fetchInterval = null;
let isConnected = false;
let lastFetchTime = 0;
let reconnectAttempts = 0;
let watchlistConfig = null;

// Health monitoring
const healthStats = {
  totalUpdates: 0,
  lastUpdateTime: 0,
  avgLatency: 0,
  errors: 0
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

function getDecimals(symbol) {
  return DECIMALS[symbol] || 2;
}

function formatPrice(price, symbol) {
  if (!price || isNaN(price)) return '0.00';
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

// Notify all listeners of price updates
function notifyListeners() {
  globalListeners.forEach(listener => {
    try {
      listener({ ...globalPriceData });
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
    const response = await fetch(
      `${API_BASE_URL}/api/market/prices?symbols=${symbols.join(',')}`,
      { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      }
    );
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.success && data.prices) {
      const latency = Date.now() - startTime;
      healthStats.avgLatency = (healthStats.avgLatency * healthStats.totalUpdates + latency) / (healthStats.totalUpdates + 1);
      healthStats.totalUpdates++;
      healthStats.lastUpdateTime = Date.now();
      
      // Update global price data with flash detection
      Object.entries(data.prices).forEach(([symbol, priceData]) => {
        const prev = globalPriceData[symbol];
        const newPrice = parseFloat(priceData.rawPrice || priceData.price);
        const oldPrice = prev ? parseFloat(prev.rawPrice || prev.price) : newPrice;
        
        // Detect price direction for flash
        let flash = null;
        if (prev && newPrice !== oldPrice) {
          flash = newPrice > oldPrice ? 'up' : 'down';
        }
        
        globalPriceData[symbol] = {
          ...priceData,
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
    
    // Exponential backoff on errors
    reconnectAttempts++;
    const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    
    if (fetchInterval) {
      clearInterval(fetchInterval);
      fetchInterval = setTimeout(() => startPolling(symbols), backoffTime);
    }
  }
}

// Start polling for prices
function startPolling(symbols) {
  if (fetchInterval) {
    clearInterval(fetchInterval);
  }
  
  // Initial fetch
  fetchPrices(symbols);
  
  // Set up interval (5 seconds for live-ish updates)
  fetchInterval = setInterval(() => fetchPrices(symbols), 5000);
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
    groups: {}
  };
}

/**
 * useLivePrices Hook
 * 
 * @param {Object} options
 * @param {string[]} options.symbols - Symbols to track (optional, uses beginner set if not provided)
 * @param {boolean} options.beginnerMode - Use beginner-friendly subset
 * @param {string} options.category - Filter by category (crypto, stocks, forex, etc.)
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
      
      // Start polling if not already running
      if (!fetchInterval && symbolsToTrack.length > 0) {
        startPolling(symbolsToTrack);
      } else if (fetchInterval) {
        // Already running, just get current data
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
  const getPricesArray = useCallback(() => {
    return symbolsRef.current.map(symbol => ({
      symbol,
      ...(prices[symbol] || {
        price: '0.00',
        change: '0.00',
        changePercent: '0.00',
        isUp: true,
        loading: true
      })
    }));
  }, [prices]);

  // Get prices grouped by category
  const getPricesGrouped = useCallback(() => {
    if (!watchlist?.groups) return {};
    
    const grouped = {};
    Object.entries(watchlist.groups).forEach(([key, group]) => {
      grouped[key] = {
        ...group,
        prices: group.symbols.map(s => ({
          ...s,
          ...(prices[s.symbol] || {
            price: '0.00',
            change: '0.00',
            changePercent: '0.00',
            isUp: true,
            loading: true
          })
        }))
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
    lastFetchTime,
    reconnectAttempts
  };
}

export default useLivePrices;
