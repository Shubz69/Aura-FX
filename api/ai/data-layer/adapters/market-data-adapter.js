/**
 * Market Data Adapter – data-first, provider priority with retry and fallback.
 * Order: Twelve Data (primary) → Finnhub → Alpha Vantage → Yahoo.
 * Uses central symbol registry and validators. Never returns fabricated prices.
 */

let axios;
try {
  axios = require('axios');
} catch (_) {
  axios = require('axios/dist/node/axios.cjs');
}
const { DataAdapter, CONFIG } = require('../index');
const { getCached, setCached } = require('../../../cache');
const {
  toCanonical,
  forProvider,
  getAssetClass,
  usesForexSessionContext,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
} = require('../../utils/symbol-registry');
const { withRetry } = require('../../utils/retries');
const { validateQuote } = require('../../utils/validators');

const PROVIDER_ORDER = ['twelvedata', 'finnhub', 'alphavantage', 'yahoo'];

class MarketDataAdapter extends DataAdapter {
  constructor() {
    super('MarketData', { timeout: CONFIG.TIMEOUTS.ADAPTER_DEFAULT });
    this.sources = PROVIDER_ORDER;
    this.sourceCircuits = new Map();
    this.sources.forEach(source => {
      this.sourceCircuits.set(source, { failures: 0, lastFailure: null, state: 'CLOSED' });
    });
  }

  normalizeSymbol(symbol) {
    return toCanonical(symbol || '');
  }

  getInstrumentType(symbol) {
    return getAssetClass(symbol || '');
  }

  /** Twelve Data – primary for live prices (normalized via marketDataLayer). */
  async fetchTwelveData(symbol) {
    const { fetchQuoteDto } = require('../../../market-data/marketDataLayer');
    const canonical = toCanonical(symbol);
    const cls = getAssetClass(canonical);
    const aFeat =
      usesForexSessionContext(canonical)
        ? 'fx-ai-adapter'
        : cls === 'crypto'
          ? 'crypto-ai-adapter'
          : isCboeEuropeUkListedEquity(canonical)
            ? 'cboe-uk-ai-adapter'
            : isCboeAustraliaListedEquity(canonical)
              ? 'cboe-au-ai-adapter'
              : isUkListedEquity(canonical)
                ? 'uk-ai-adapter'
                : 'ai-adapter';
    const dto = await fetchQuoteDto(canonical, { feature: aFeat });
    if (!dto || dto.last == null || !Number.isFinite(dto.last) || dto.last <= 0) return null;
    return {
      symbol: canonical,
      price: dto.last,
      open: dto.open != null ? dto.open : undefined,
      high: dto.high != null ? dto.high : undefined,
      low: dto.low != null ? dto.low : undefined,
      previousClose: dto.prevClose != null ? dto.prevClose : undefined,
      timestamp: dto.tsUtcMs || Date.now(),
      source: 'Twelve Data',
    };
  }

  /** Finnhub – secondary quotes, tick data. */
  async fetchFinnhub(symbol) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return null;
    const canonical = toCanonical(symbol);
    const finnhubSymbol = forProvider(canonical, 'finnhub');

    const response = await axios.get('https://finnhub.io/api/v1/quote', {
      params: { symbol: finnhubSymbol, token: apiKey },
      timeout: 5000
    });

    if (response.data?.c > 0) {
      const q = response.data;
      return {
        symbol: canonical,
        price: q.c,
        open: q.o,
        high: q.h,
        low: q.l,
        previousClose: q.pc,
        change: q.c - q.pc,
        changePercent: q.pc ? ((q.c - q.pc) / q.pc * 100).toFixed(2) : undefined,
        timestamp: (q.t && q.t > 1e9 ? q.t : Date.now() / 1000) * 1000,
        source: 'Finnhub'
      };
    }
    return null;
  }

  /** Alpha Vantage – backup indicators and market feeds. */
  async fetchAlphaVantage(symbol) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey || apiKey === 'demo') return null;
    const canonical = toCanonical(symbol);
    const avSymbol = forProvider(canonical, 'alphavantage');

    const response = await axios.get('https://www.alphavantage.co/query', {
      params: { function: 'GLOBAL_QUOTE', symbol: avSymbol, apikey: apiKey },
      timeout: 6000
    });

    const quote = response.data?.['Global Quote'];
    if (quote && !response.data.Note) {
      const price = parseFloat(quote['05. price']);
      if (Number.isFinite(price) && price > 0) {
        return {
          symbol: (quote['01. symbol'] || '').replace('FX:', '') || canonical,
          price,
          open: parseFloat(quote['02. open']),
          high: parseFloat(quote['03. high']),
          low: parseFloat(quote['04. low']),
          previousClose: parseFloat(quote['08. previous close']),
          change: parseFloat(quote['09. change']),
          timestamp: Date.now(),
          source: 'Alpha Vantage'
        };
      }
    }
    return null;
  }

  /** Yahoo Finance – fallback. */
  async fetchYahoo(symbol) {
    const canonical = toCanonical(symbol);
    const yahooSymbol = forProvider(canonical, 'yahoo');

    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      {
        params: { interval: '1m', range: '1d' },
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      }
    );

    const meta = response.data?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice > 0) {
      const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
      return {
        symbol: canonical,
        price: meta.regularMarketPrice,
        open: meta.regularMarketOpen || prev,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        previousClose: prev,
        change: meta.regularMarketPrice - prev,
        changePercent: prev ? ((meta.regularMarketPrice - prev) / prev * 100).toFixed(2) : undefined,
        volume: meta.regularMarketVolume || 0,
        timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
        source: 'Yahoo Finance'
      };
    }
    return null;
  }

  async _trySource(sourceName, symbol) {
    const circuit = this.sourceCircuits.get(sourceName);
    if (circuit?.state === 'OPEN' && circuit.lastFailure && (Date.now() - circuit.lastFailure) < 30000) {
      return null;
    }
    let result = null;
    try {
      if (sourceName === 'twelvedata') result = await this.fetchTwelveData(symbol);
      else if (sourceName === 'finnhub') result = await this.fetchFinnhub(symbol);
      else if (sourceName === 'alphavantage') result = await this.fetchAlphaVantage(symbol);
      else if (sourceName === 'yahoo') result = await this.fetchYahoo(symbol);
      if (result?.price > 0) {
        if (circuit) { circuit.failures = 0; circuit.state = 'CLOSED'; }
        return result;
      }
    } catch (e) {
      if (circuit) { circuit.failures = (circuit.failures || 0) + 1; circuit.lastFailure = Date.now(); if (circuit.failures >= 3) circuit.state = 'OPEN'; }
    }
    return null;
  }

  async fetch(params) {
    const { symbol } = params;
    if (!symbol) return null;

    const canonical = toCanonical(symbol);
    const cacheKey = `market_data:${canonical}`;
    const cached = getCached(cacheKey, CONFIG.CACHE_TTL.MARKET_DATA);
    if (cached && cached.price > 0) {
      const validation = validateQuote(cached);
      if (validation.valid) return { ...cached, cached: true };
    }

    // Primary then fallbacks: try each source with 1 retry
    for (const sourceName of PROVIDER_ORDER) {
      const { ok, data } = await withRetry(async () => {
        const r = await this._trySource(sourceName, symbol);
        if (r && r.price > 0) return r;
        throw new Error('No data');
      }, { maxAttempts: 2 });
      if (ok && data && data.price > 0) {
        const validation = validateQuote(data);
        if (validation.valid) {
          setCached(cacheKey, data);
          return data;
        }
      }
    }

    return {
      symbol: canonical,
      price: 0,
      error: 'Live market data temporarily unavailable. Analysis will use general market context.',
      timestamp: Date.now(),
      source: 'fallback'
    };
  }
}

module.exports = MarketDataAdapter;
