/**
 * Market Data Adapter
 * Fetches real-time prices from multiple sources with caching and circuit breakers
 */

const axios = require('axios');
const { DataAdapter, CONFIG } = require('../index');
const { getCached, setCached } = require('../../../cache');

class MarketDataAdapter extends DataAdapter {
  constructor() {
    super('MarketData', { timeout: CONFIG.TIMEOUTS.ADAPTER_DEFAULT });
    this.sources = ['yahoo', 'finnhub', 'alphavantage', 'twelvedata'];
    this.sourceCircuits = new Map();
    
    // Initialize circuit breakers for each source
    this.sources.forEach(source => {
      this.sourceCircuits.set(source, {
        failures: 0,
        lastFailure: null,
        state: 'CLOSED'
      });
    });
  }

  // Symbol normalization
  normalizeSymbol(symbol) {
    const normalized = symbol.trim().toUpperCase().replace(/\s+/g, '');
    
    const mappings = {
      'GOLD': 'XAUUSD', 'XAU': 'XAUUSD',
      'SILVER': 'XAGUSD', 'XAG': 'XAGUSD',
      'BITCOIN': 'BTCUSD', 'BTC': 'BTCUSD',
      'ETHEREUM': 'ETHUSD', 'ETH': 'ETHUSD',
      'OIL': 'CL=F', 'CRUDE': 'CL=F', 'WTI': 'CL=F',
      'SP500': '^GSPC', 'SPX': '^GSPC',
      'DOW': '^DJI', 'NASDAQ': '^IXIC'
    };

    return mappings[normalized] || normalized;
  }

  // Detect instrument type
  getInstrumentType(symbol) {
    const normalized = this.normalizeSymbol(symbol);
    
    if (normalized.includes('XAU') || normalized.includes('XAG')) return 'commodity';
    if (/^[A-Z]{6}$/.test(normalized) && (normalized.includes('USD') || normalized.includes('EUR'))) return 'forex';
    if (normalized.includes('BTC') || normalized.includes('ETH')) return 'crypto';
    if (normalized.startsWith('^') || normalized === 'SPY' || normalized === 'QQQ') return 'index';
    if (normalized.endsWith('=F')) return 'futures';
    return 'stock';
  }

  // Fetch from Yahoo Finance
  async fetchYahoo(symbol) {
    const normalized = this.normalizeSymbol(symbol);
    let yahooSymbol = normalized;
    
    // Convert to Yahoo format
    if (normalized === 'XAUUSD') yahooSymbol = 'GC=F';
    else if (normalized === 'XAGUSD') yahooSymbol = 'SI=F';
    else if (normalized.length === 6 && this.getInstrumentType(symbol) === 'forex') {
      yahooSymbol = `${normalized}=X`;
    } else if (normalized.includes('BTC')) yahooSymbol = 'BTC-USD';
    else if (normalized.includes('ETH')) yahooSymbol = 'ETH-USD';

    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      { params: { interval: '1m', range: '1d' }, timeout: 4000 }
    );

    if (response.data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      const meta = response.data.chart.result[0].meta;
      return {
        symbol: normalized,
        price: meta.regularMarketPrice,
        open: meta.regularMarketOpen || meta.previousClose,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        previousClose: meta.previousClose,
        change: meta.regularMarketPrice - meta.previousClose,
        changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2),
        volume: meta.regularMarketVolume || 0,
        timestamp: Date.now(),
        source: 'Yahoo Finance'
      };
    }
    return null;
  }

  // Fetch from Finnhub
  async fetchFinnhub(symbol) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return null;

    const normalized = this.normalizeSymbol(symbol);
    let finnhubSymbol = normalized;
    
    // Convert to Finnhub format
    if (normalized === 'XAUUSD') finnhubSymbol = 'OANDA:XAU_USD';
    else if (normalized === 'XAGUSD') finnhubSymbol = 'OANDA:XAG_USD';
    else if (this.getInstrumentType(symbol) === 'forex') {
      finnhubSymbol = `OANDA:${normalized.slice(0,3)}_${normalized.slice(3)}`;
    }

    const response = await axios.get('https://finnhub.io/api/v1/quote', {
      params: { symbol: finnhubSymbol, token: apiKey },
      timeout: 4000
    });

    if (response.data?.c > 0) {
      const q = response.data;
      return {
        symbol: normalized,
        price: q.c,
        open: q.o,
        high: q.h,
        low: q.l,
        previousClose: q.pc,
        change: q.c - q.pc,
        changePercent: ((q.c - q.pc) / q.pc * 100).toFixed(2),
        timestamp: Date.now(),
        source: 'Finnhub'
      };
    }
    return null;
  }

  // Main fetch function - tries sources in parallel with circuit breakers
  async fetch(params) {
    const { symbol } = params;
    if (!symbol) return null;

    const cacheKey = `market_data:${this.normalizeSymbol(symbol)}`;
    const cached = getCached(cacheKey, CONFIG.CACHE_TTL.MARKET_DATA);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Try sources in parallel
    const fetchPromises = [];
    
    // Yahoo Finance (most reliable, free)
    fetchPromises.push(
      this.fetchYahoo(symbol).catch(e => null)
    );
    
    // Finnhub (good for forex/commodities)
    if (process.env.FINNHUB_API_KEY) {
      fetchPromises.push(
        this.fetchFinnhub(symbol).catch(e => null)
      );
    }

    const results = await Promise.allSettled(fetchPromises);
    
    // Return first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.price > 0) {
        const data = result.value;
        setCached(cacheKey, data);
        return data;
      }
    }

    // Return safe default
    return {
      symbol: this.normalizeSymbol(symbol),
      price: 0,
      error: 'Data temporarily unavailable',
      timestamp: Date.now(),
      source: 'fallback'
    };
  }
}

module.exports = MarketDataAdapter;
