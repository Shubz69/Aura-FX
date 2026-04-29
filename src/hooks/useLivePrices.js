/**
 * useLivePrices - Shared hook for market prices
 *
 * - GET /api/markets/snapshot (edge/browser cache ~30s, same payload for all users)
 * - Poll interval matches Cache-Control max-age/s-maxage to avoid useless origin hits
 * - Pauses polling while tab is hidden (Page Visibility)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Api from '../services/Api';

/** Matches Api.js routing: REACT_APP_API_URL, or www.auraterminal.ai when hostname is apex/marketing. */
function getMarketApiBaseUrl() {
  const base = Api.getBaseUrl();
  if (typeof base === 'string' && base.length > 0) {
    return base.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}
/** Snapshot fallback only; primary live path is SSE quotes stream. */
const SNAPSHOT_POLL_MS = 120000;
const STREAM_STALE_MS = 10000;
const SSE_RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000];

// ============================================================================
// Singleton: one snapshot poll for the whole app
// ============================================================================

let globalPriceData = {};
let globalListeners = new Set();
let snapshotInterval = null;
let fetchInFlight = false;
let isConnected = false;
let lastFetchTime = 0;
let watchlistConfig = null;
/** Built from watchlist.groups + decimals payload — used before hardcoded DECIMALS */
let serverDecimalsBySymbol = {};
/** symbol → { symbol, displayName, decimals } from server watchlist */
let serverSymbolRows = {};
let activeSymbols = new Set();
let activeSymbolRefCounts = new Map();
let visibilityListenerAttached = false;
let pollingSuspendedHidden = false;
let liveStream = null;
let liveStreamConnected = false;
let liveStreamSymbols = new Set();
let liveStreamReconnectTimer = null;
let liveStreamReconnectAttempts = 0;

function isDocumentHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function attachSnapshotVisibilityHandler() {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (isDocumentHidden()) {
      pollingSuspendedHidden = true;
      if (snapshotInterval) {
        clearInterval(snapshotInterval);
        snapshotInterval = null;
      }
      return;
    }
    pollingSuspendedHidden = false;
    if (globalListeners.size === 0) return;
    fetchSnapshot('visibility');
    if (!snapshotInterval) {
      snapshotInterval = setInterval(() => fetchSnapshot('interval'), SNAPSHOT_POLL_MS);
    }
  });
}

// Health monitoring
const healthStats = {
  totalUpdates: 0,
  lastUpdateTime: 0,
  avgLatency: 0,
  errors: 0,
  liveSymbols: 0,
  delayedSymbols: 0,
  /** Last `meta` object from GET /api/markets/snapshot (server cache hit, symbol count, stale fallback). */
  lastSnapshotMeta: null,
  liveStreamConnected: false,
  liveStreamMessages: 0,
  liveStreamLastEventAt: 0,
  liveStreamDiagnostics: null,
  snapshotFallbackFetches: 0,
  snapshotFetchSkippedDueToLiveStream: 0,
  snapshotFallbackReasons: {},
};

// Decimals configuration
const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'XRPUSD': 4, 'BNBUSD': 2,
  'ADAUSD': 4, 'DOGEUSD': 5, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'USDCHF': 4, 'AUDUSD': 4, 'USDCAD': 4, 'NZDUSD': 4, 'XAUUSD': 2,
  'XAGUSD': 3,
  'USOIL': 2,
  'UKOIL': 2,
  'XNGUSD': 3,
  'XCUUSD': 4,
  'XPTUSD': 2,
  'XPDUSD': 2,
  'CORN': 2,
  'WHEAT': 2,
  'SOYBEAN': 2,
  'COFFEE': 2,
  'SUGAR': 2,
  'COCOA': 0,
  'WTI': 2,
  'BRENT': 2,
  'SPX': 2,
  'NDX': 2,
  'DJI': 2,
  'DAX': 2, 'FTSE': 2, 'NIKKEI': 2, 'DXY': 3, 'US10Y': 3, 'VIX': 2,
  'AAPL': 2, 'MSFT': 2, 'NVDA': 2, 'AMZN': 2, 'GOOGL': 2, 'META': 2, 'TSLA': 2
};

// Display names for symbols
const DISPLAY_NAMES = {
  'BTCUSD': 'BTC/USD', 'ETHUSD': 'ETH/USD', 'SOLUSD': 'SOL/USD',
  'XRPUSD': 'XRP/USD', 'BNBUSD': 'BNB/USD', 'ADAUSD': 'ADA/USD',
  'DOGEUSD': 'DOGE/USD', 'EURUSD': 'EUR/USD', 'GBPUSD': 'GBP/USD',
  'USDJPY': 'USD/JPY', 'USDCHF': 'USD/CHF', 'AUDUSD': 'AUD/USD',
  'USDCAD': 'USD/CAD', 'NZDUSD': 'NZD/USD', 'XAUUSD': 'GOLD',
  'XAGUSD': 'SILVER',
  'USOIL': 'WTI / US Oil',
  'UKOIL': 'Brent',
  'XNGUSD': 'Natural Gas',
  'XCUUSD': 'Copper',
  'XPTUSD': 'Platinum',
  'XPDUSD': 'Palladium',
  'CORN': 'Corn',
  'WHEAT': 'Wheat',
  'SOYBEAN': 'Soybeans',
  'COFFEE': 'Coffee',
  'SUGAR': 'Sugar #11',
  'COCOA': 'Cocoa',
  'WTI': 'WTI Oil',
  'BRENT': 'Brent',
  'SPX': 'S&P 500', 'NDX': 'Nasdaq 100', 'DJI': 'Dow Jones',
  'DAX': 'DAX 40', 'FTSE': 'FTSE 100', 'NIKKEI': 'Nikkei',
  'DXY': 'DXY', 'US10Y': '10Y YIELD', 'VIX': 'VIX'
};

function getDecimals(symbol) {
  const fromServer = serverDecimalsBySymbol[symbol];
  if (typeof fromServer === 'number' && fromServer >= 0) return fromServer;
  return DECIMALS[symbol] || 2;
}

function buildServerDecimalsMap(watchlist) {
  const map = {};
  if (!watchlist?.groups) return map;
  Object.values(watchlist.groups).forEach((g) => {
    (g.symbols || []).forEach((row) => {
      if (row?.symbol && typeof row.decimals === 'number') map[row.symbol] = row.decimals;
    });
  });
  return map;
}

function buildServerSymbolRows(watchlist) {
  const map = {};
  if (!watchlist?.groups) return map;
  Object.values(watchlist.groups).forEach((g) => {
    (g.symbols || []).forEach((row) => {
      if (row?.symbol) map[row.symbol] = row;
    });
  });
  return map;
}

function formatPrice(price, symbol) {
  if (!price || isNaN(price)) return null;
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

function getDisplayName(symbol, rowFromWatchlist) {
  if (rowFromWatchlist?.displayName) return rowFromWatchlist.displayName;
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

function streamHealthy() {
  if (!liveStreamConnected) return false;
  if (healthStats.liveStreamLastEventAt <= 0) return false;
  return Date.now() - healthStats.liveStreamLastEventAt <= STREAM_STALE_MS;
}

function addTrackedSymbols(symbols) {
  (symbols || []).forEach((symbol) => {
    if (!symbol) return;
    const key = String(symbol).toUpperCase();
    const next = (activeSymbolRefCounts.get(key) || 0) + 1;
    activeSymbolRefCounts.set(key, next);
  });
  activeSymbols = new Set([...activeSymbolRefCounts.keys()]);
}

function removeTrackedSymbols(symbols) {
  (symbols || []).forEach((symbol) => {
    if (!symbol) return;
    const key = String(symbol).toUpperCase();
    const curr = activeSymbolRefCounts.get(key) || 0;
    if (curr <= 1) activeSymbolRefCounts.delete(key);
    else activeSymbolRefCounts.set(key, curr - 1);
  });
  activeSymbols = new Set([...activeSymbolRefCounts.keys()]);
}

function updatePriceFromLiveQuote(quote) {
  if (!quote || !quote.symbol) return;
  const symbol = quote.symbol;
  const prev = globalPriceData[symbol];
  const newPrice = Number(quote.price);
  if (!Number.isFinite(newPrice) || newPrice <= 0) return;
  const oldPrice = prev ? parseFloat(prev.rawPrice || prev.price) : newPrice;
  const flash = prev && oldPrice !== newPrice ? (newPrice > oldPrice ? 'up' : 'down') : null;
  globalPriceData[symbol] = {
    ...(prev || {}),
    symbol,
    displayName: prev?.displayName || getDisplayName(symbol, serverSymbolRows[symbol]),
    price: formatPrice(newPrice, symbol),
    rawPrice: newPrice,
    source: 'twelvedata-ws',
    delayed: false,
    loading: false,
    quoteUnavailable: false,
    timestamp: quote.timestamp || Date.now(),
    flash,
    flashTime: flash ? Date.now() : prev?.flashTime || 0,
    lastUpdate: Date.now(),
  };
}

function stopLiveStream() {
  if (liveStreamReconnectTimer) {
    clearTimeout(liveStreamReconnectTimer);
    liveStreamReconnectTimer = null;
  }
  if (liveStream) {
    try {
      liveStream.close();
    } catch (e) {
      // ignore
    }
  }
  liveStream = null;
  liveStreamConnected = false;
  healthStats.liveStreamConnected = false;
}

function connectLiveStream() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  const symbols = Array.from(activeSymbols).sort();
  if (symbols.length === 0) {
    stopLiveStream();
    return;
  }
  const sameSymbols =
    liveStreamSymbols.size === symbols.length &&
    symbols.every((s) => liveStreamSymbols.has(s));
  if (liveStream && sameSymbols) return;

  stopLiveStream();
  liveStreamSymbols = new Set(symbols);
  const url = `${getMarketApiBaseUrl()}/api/market/live-quotes-stream?symbols=${encodeURIComponent(symbols.join(','))}`;
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[LivePrices] SSE connect', { symbolCount: symbols.length });
  }
  const es = new EventSource(url);
  liveStream = es;
  es.addEventListener('ready', (evt) => {
    liveStreamConnected = true;
    liveStreamReconnectAttempts = 0;
    healthStats.liveStreamConnected = true;
    healthStats.liveStreamLastEventAt = Date.now();
    try {
      const payload = JSON.parse(evt.data || '{}');
      healthStats.liveStreamDiagnostics = payload?.diagnostics || null;
      const quotes = payload?.quotes || {};
      Object.values(quotes).forEach((q) => updatePriceFromLiveQuote(q));
      notifyListeners();
    } catch (e) {
      // ignore payload parse errors
    }
  });
  es.addEventListener('quote', (evt) => {
    healthStats.liveStreamMessages += 1;
    healthStats.liveStreamLastEventAt = Date.now();
    try {
      const quote = JSON.parse(evt.data || '{}');
      updatePriceFromLiveQuote(quote);
      notifyListeners();
    } catch (e) {
      // ignore malformed quote events
    }
  });
  es.addEventListener('diag', (evt) => {
    try {
      healthStats.liveStreamDiagnostics = JSON.parse(evt.data || '{}');
    } catch (e) {
      // ignore
    }
  });
  es.onerror = () => {
    liveStreamConnected = false;
    healthStats.liveStreamConnected = false;
    try {
      es.close();
    } catch (e) {
      // ignore
    }
    liveStream = null;
    if (liveStreamReconnectTimer) return;
    const wait = SSE_RECONNECT_BACKOFF_MS[Math.min(liveStreamReconnectAttempts, SSE_RECONNECT_BACKOFF_MS.length - 1)];
    liveStreamReconnectAttempts += 1;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[LivePrices] SSE disconnect', { waitMs: wait, reconnectAttempt: liveStreamReconnectAttempts });
    }
    liveStreamReconnectTimer = setTimeout(() => {
      liveStreamReconnectTimer = null;
      connectLiveStream();
    }, wait);
  };
}

function shouldSkipSnapshotFetch(reason = 'interval') {
  if (streamHealthy()) {
    healthStats.snapshotFetchSkippedDueToLiveStream += 1;
    return true;
  }
  const hasData = Object.keys(globalPriceData || {}).length > 0;
  if (reason === 'interval' && hasData) {
    healthStats.snapshotFetchSkippedDueToLiveStream += 1;
    return true;
  }
  return false;
}

// Fetch snapshot fallback — allow HTTP caching (CDN + browser) per api/markets/snapshot Cache-Control
async function fetchSnapshot(reason = 'manual') {
  if (fetchInFlight) return;
  if (isDocumentHidden()) return;
  if (shouldSkipSnapshotFetch(reason)) return;
  fetchInFlight = true;
  const startTime = Date.now();
  healthStats.snapshotFallbackFetches += 1;
  healthStats.snapshotFallbackReasons[reason] = (healthStats.snapshotFallbackReasons[reason] || 0) + 1;

  try {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[LivePrices] REST snapshot fallback', { reason });
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const url = `${getMarketApiBaseUrl()}/api/markets/snapshot`;

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'default'
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data.success && data.prices && typeof data.snapshotTimestamp === 'number') {
      healthStats.avgLatency = (healthStats.avgLatency * healthStats.totalUpdates + (Date.now() - startTime)) / (healthStats.totalUpdates + 1);
      healthStats.totalUpdates++;
      healthStats.lastUpdateTime = Date.now();
      healthStats.liveSymbols = Object.keys(data.prices).length;
      healthStats.delayedSymbols = 0;
      if (data.meta && typeof data.meta === 'object') {
        healthStats.lastSnapshotMeta = { ...data.meta, responseStale: Boolean(data.stale) };
      } else {
        healthStats.lastSnapshotMeta = {
          serverRouteCacheHit: Boolean(data.cached),
          symbolCount: Object.keys(data.prices).length,
          staleFallback: Boolean(data.stale),
          responseStale: Boolean(data.stale),
        };
      }

      Object.entries(data.prices).forEach(([symbol, priceData]) => {
        const fallbackNumeric =
          priceData.source === 'fallback' &&
          priceData.unavailable &&
          parseFloat(priceData.rawPrice || priceData.price) > 0;

        if (priceData.source === 'fallback' && priceData.unavailable && !fallbackNumeric) {
          globalPriceData[symbol] = {
            symbol,
            displayName: priceData.displayName || getDisplayName(symbol),
            price: null,
            rawPrice: null,
            change: null,
            changePercent: null,
            isUp: true,
            loading: true,
            quoteUnavailable: true,
            delayed: true,
            source: 'fallback',
            lastUpdate: data.snapshotTimestamp
          };
          return;
        }

        const prev = globalPriceData[symbol];
        const newPrice = parseFloat(priceData.rawPrice || priceData.price);
        const oldPrice = prev ? parseFloat(prev.rawPrice || prev.price) : newPrice;

        if (!newPrice || newPrice === 0) return;

        let flash = null;
        if (prev && prev.rawPrice && newPrice !== oldPrice) {
          flash = newPrice > oldPrice ? 'up' : 'down';
        }

        globalPriceData[symbol] = {
          ...priceData,
          displayName: priceData.displayName || getDisplayName(symbol),
          flash,
          flashTime: flash ? Date.now() : (prev?.flashTime || 0),
          lastUpdate: data.snapshotTimestamp,
          ...(fallbackNumeric
            ? {
                delayed: true,
                quoteUnavailable: false,
                loading: false
              }
            : {})
        };
      });

      lastFetchTime = Date.now();
      isConnected = true;
      notifyListeners();
    }
  } catch (error) {
    console.error('Snapshot fetch error:', error.message);
    healthStats.errors++;
    // Keep existing data; fallback poll will retry
  } finally {
    fetchInFlight = false;
  }
}

// Start global snapshot polling; immediate fetch unless tab is hidden
function startSnapshotPolling() {
  attachSnapshotVisibilityHandler();
  connectLiveStream();
  if (!isDocumentHidden() && Object.keys(globalPriceData || {}).length === 0) {
    fetchSnapshot('bootstrap');
  }
  if (snapshotInterval) return;
  if (isDocumentHidden()) {
    pollingSuspendedHidden = true;
    return;
  }
  pollingSuspendedHidden = false;
  snapshotInterval = setInterval(() => fetchSnapshot('interval'), SNAPSHOT_POLL_MS);
}

function stopSnapshotPolling() {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
  }
  isConnected = false;
  stopLiveStream();
}

// Fetch watchlist configuration
async function fetchWatchlist() {
  if (watchlistConfig) return watchlistConfig;
  
  try {
    const response = await fetch(`${getMarketApiBaseUrl()}/api/market/watchlist`);
    const data = await response.json();
    if (data.success && data.watchlist) {
      watchlistConfig = data.watchlist;
      serverDecimalsBySymbol = buildServerDecimalsMap(watchlistConfig);
      serverSymbolRows = buildServerSymbolRows(watchlistConfig);
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
        { symbol: 'XAUUSD', displayName: 'GOLD' }
      ]},
      indices: { name: 'Indices', icon: '📊', order: 5, symbols: [
        { symbol: 'SPX', displayName: 'S&P 500' },
        { symbol: 'NDX', displayName: 'Nasdaq 100' }
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

  // Stale = no successful snapshot in last 90s (allow one missed poll); pause checks when tab hidden
  useEffect(() => {
    const tick = () => {
      if (isDocumentHidden()) return;
      const now = Date.now();
      const isStale = lastFetchTime > 0 && now - lastFetchTime > 90000;
      setStale(isStale);
    };
    const staleCheck = setInterval(tick, SNAPSHOT_POLL_MS);
    return () => clearInterval(staleCheck);
  }, []);

  // Optional refresh on window focus if data is older than one poll period
  useEffect(() => {
    const onFocus = () => {
      if (isDocumentHidden()) return;
      if (lastFetchTime > 0 && Date.now() - lastFetchTime > SNAPSHOT_POLL_MS) fetchSnapshot('focus');
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Initialize: watchlist + single snapshot poll (no refetch on modal/focus/tab)
  useEffect(() => {
    let mounted = true;

    async function init() {
      const config = await fetchWatchlist();
      if (!mounted) return;

      serverDecimalsBySymbol = buildServerDecimalsMap(config);
      serverSymbolRows = buildServerSymbolRows(config);

      setWatchlist(config);

      let symbolsToTrack = customSymbols;
      if (!symbolsToTrack) {
        if (category && config.groups?.[category]) {
          symbolsToTrack = config.groups[category].symbols.map(s => s.symbol);
        } else if (beginnerMode) {
          symbolsToTrack = config.beginnerSet;
        } else {
          symbolsToTrack = Object.values(config.groups || {})
            .flatMap(g => g.symbols?.map(s => s.symbol) || []);
        }
      }

      symbolsRef.current = symbolsToTrack || [];
      addTrackedSymbols(symbolsToTrack || []);
      connectLiveStream();

      globalListeners.add(handleUpdate);

      // Single global snapshot poll (SNAPSHOT_POLL_MS; aligns with snapshot Cache-Control)
      if (globalListeners.size > 0) {
        startSnapshotPolling();
      }
      handleUpdate({ ...globalPriceData });
    }

    init();

    return () => {
      mounted = false;
      globalListeners.delete(handleUpdate);
      if (globalListeners.size === 0) {
        stopSnapshotPolling();
        activeSymbols.clear();
        activeSymbolRefCounts.clear();
      } else {
        removeTrackedSymbols(symbolsRef.current || []);
        connectLiveStream();
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
      const displayName = getDisplayName(symbol, serverSymbolRows[symbol]);
      
      if (
        priceData &&
        !priceData.quoteUnavailable &&
        priceData.price &&
        parseFloat(priceData.price) > 0
      ) {
        return {
          symbol,
          displayName,
          ...priceData
        };
      }

      return {
        symbol,
        displayName,
        price: null,
        change: null,
        changePercent: null,
        isUp: true,
        loading: true,
        quoteUnavailable: priceData?.quoteUnavailable,
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
          
          if (
            priceData &&
            !priceData.quoteUnavailable &&
            priceData.price &&
            parseFloat(priceData.price) > 0
          ) {
            return {
              ...s,
              ...priceData
            };
          }

          return {
            ...s,
            price: null,
            change: null,
            changePercent: null,
            isUp: true,
            loading: true,
            quoteUnavailable: priceData?.quoteUnavailable,
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
    lastFetchTime,
    pollIntervalMs: SNAPSHOT_POLL_MS,
    liveStreamConnected,
    liveStreamMessages: healthStats.liveStreamMessages,
    liveStreamLastEventAt: healthStats.liveStreamLastEventAt,
    liveStreamDiagnostics: healthStats.liveStreamDiagnostics,
    snapshotFallbackFetches: healthStats.snapshotFallbackFetches,
    snapshotFetchSkippedDueToLiveStream: healthStats.snapshotFetchSkippedDueToLiveStream,
    snapshotFallbackReasons: healthStats.snapshotFallbackReasons,
  }), [stale]);

  // Trigger an immediate refresh (e.g. when opening All Markets modal or on page focus)
  const refresh = useCallback(() => {
    fetchSnapshot('manual');
  }, []);

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
    getHealth,
    refresh
  };
}

// Export health monitoring for debugging
export function getTickerHealth() {
  return {
    ...healthStats,
    connected: isConnected,
    liveStreamConnected,
    listenerCount: globalListeners.size,
    activeSymbolCount: activeSymbols.size,
    lastFetchTime,
    pollIntervalMs: SNAPSHOT_POLL_MS,
    snapshotFallbackFetches: healthStats.snapshotFallbackFetches,
    snapshotFetchSkippedDueToLiveStream: healthStats.snapshotFetchSkippedDueToLiveStream,
    snapshotFallbackReasons: healthStats.snapshotFallbackReasons,
    liveStreamDiagnostics: healthStats.liveStreamDiagnostics,
  };
}

// Export for testing
export function _getActiveConnections() {
  return {
    listeners: globalListeners.size,
    activeSymbols: activeSymbols.size,
    hasInterval: !!snapshotInterval
  };
}

export default useLivePrices;
