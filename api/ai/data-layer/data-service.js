/**
 * Unified Data Service
 * Provides a simple interface for the AI to fetch all market data
 * 
 * Key Features:
 * - Parallel fetching with timeouts
 * - Automatic caching
 * - Circuit breakers
 * - Safe fallbacks
 * - Never blocks - always returns something
 */

const MarketDataAdapter = require('./adapters/market-data-adapter');
const CalendarAdapter = require('./adapters/calendar-adapter');
const NewsAdapter = require('./adapters/news-adapter');
const { createLogger, CONFIG } = require('./index');
const { getCached, setCached } = require('../../cache');

class DataService {
  constructor() {
    this.marketData = new MarketDataAdapter();
    this.calendar = new CalendarAdapter();
    this.news = new NewsAdapter();
    
    // Background prefetch interval
    this.prefetchInterval = null;
    this.popularSymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'SPY', 'AAPL'];
  }

  // Generate request ID
  generateRequestId() {
    return `ds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get market data with guaranteed response
   * Never throws - always returns data or safe default
   */
  async getMarketData(symbol, requestId = null) {
    const rid = requestId || this.generateRequestId();
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        this.marketData.fetch({ symbol }),
        new Promise(resolve => setTimeout(() => resolve({
          symbol,
          price: 0,
          error: 'Timeout',
          source: 'timeout_fallback'
        }), CONFIG.TIMEOUTS.ADAPTER_DEFAULT))
      ]);

      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        requestId: rid,
        adapter: 'MarketData',
        symbol,
        duration,
        cached: result.cached || false,
        source: result.source
      }));

      return result;
    } catch (error) {
      console.error(JSON.stringify({
        requestId: rid,
        adapter: 'MarketData',
        symbol,
        error: error.message,
        duration: Date.now() - startTime
      }));

      return {
        symbol,
        price: 0,
        error: 'Failed to fetch',
        source: 'error_fallback'
      };
    }
  }

  /**
   * Get economic calendar with guaranteed response
   */
  async getCalendar(date = null, impact = null, requestId = null) {
    const rid = requestId || this.generateRequestId();
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        this.calendar.fetch({ date, impact }),
        new Promise(resolve => setTimeout(() => resolve({
          events: [],
          error: 'Timeout',
          source: 'timeout_fallback'
        }), CONFIG.TIMEOUTS.ADAPTER_DEFAULT))
      ]);

      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        requestId: rid,
        adapter: 'Calendar',
        date: date || 'today',
        eventCount: result.events?.length || 0,
        duration,
        cached: result.cached || false
      }));

      return result;
    } catch (error) {
      console.error(JSON.stringify({
        requestId: rid,
        adapter: 'Calendar',
        error: error.message,
        duration: Date.now() - startTime
      }));

      return {
        events: [],
        error: 'Failed to fetch',
        source: 'error_fallback'
      };
    }
  }

  /**
   * Get news with guaranteed response
   */
  async getNews(symbol = null, category = 'general', limit = 10, requestId = null) {
    const rid = requestId || this.generateRequestId();
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        this.news.fetch({ symbol, category, limit }),
        new Promise(resolve => setTimeout(() => resolve({
          news: [],
          error: 'Timeout',
          source: 'timeout_fallback'
        }), CONFIG.TIMEOUTS.ADAPTER_DEFAULT))
      ]);

      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        requestId: rid,
        adapter: 'News',
        symbol: symbol || 'general',
        newsCount: result.news?.length || 0,
        duration,
        cached: result.cached || false
      }));

      return result;
    } catch (error) {
      console.error(JSON.stringify({
        requestId: rid,
        adapter: 'News',
        error: error.message,
        duration: Date.now() - startTime
      }));

      return {
        news: [],
        error: 'Failed to fetch',
        source: 'error_fallback'
      };
    }
  }

  /**
   * Fetch all data for a symbol in parallel
   * Returns as soon as data is available, doesn't wait for everything
   */
  async getAllDataForSymbol(symbol, requestId = null) {
    const rid = requestId || this.generateRequestId();
    const startTime = Date.now();

    // Fetch all in parallel with individual timeouts
    const [marketData, calendar, news] = await Promise.all([
      this.getMarketData(symbol, rid),
      this.getCalendar(null, null, rid),
      this.getNews(symbol, 'general', 5, rid)
    ]);

    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
      requestId: rid,
      operation: 'getAllDataForSymbol',
      symbol,
      totalDuration: duration,
      hasPrice: marketData.price > 0,
      eventCount: calendar.events?.length || 0,
      newsCount: news.news?.length || 0
    }));

    return {
      marketData,
      calendar,
      news,
      fetchDuration: duration,
      requestId: rid
    };
  }

  /**
   * Start background prefetch for popular symbols
   */
  startBackgroundPrefetch(intervalMs = 60000) {
    if (this.prefetchInterval) {
      clearInterval(this.prefetchInterval);
    }

    // Initial prefetch
    this.prefetchPopularSymbols();

    // Set up recurring prefetch
    this.prefetchInterval = setInterval(() => {
      this.prefetchPopularSymbols();
    }, intervalMs);
  }

  async prefetchPopularSymbols() {
    for (const symbol of this.popularSymbols) {
      try {
        await this.getMarketData(symbol);
      } catch (e) {
        // Ignore errors in background prefetch
      }
    }
  }

  /**
   * Get health status of all adapters
   */
  getHealth() {
    const adapters = {
      marketData: this.marketData.getStatus(),
      calendar: this.calendar.getStatus(),
      news: this.news.getStatus()
    };
    
    // Determine overall health based on circuit breaker states
    const adapterStatuses = Object.values(adapters);
    const anyOpen = adapterStatuses.some(s => s.circuitBreaker?.state === 'OPEN');
    const anyHalfOpen = adapterStatuses.some(s => s.circuitBreaker?.state === 'HALF_OPEN');
    
    let healthy = true;
    let status = 'healthy';
    
    if (anyOpen) {
      healthy = false;
      status = 'degraded';
    } else if (anyHalfOpen) {
      status = 'recovering';
    }
    
    return {
      healthy,
      status,
      adapters,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Stop background services
   */
  stop() {
    if (this.prefetchInterval) {
      clearInterval(this.prefetchInterval);
      this.prefetchInterval = null;
    }
  }
}

// Singleton instance
const dataService = new DataService();

module.exports = dataService;
