// Provider Abstraction Layer
// Unified interface for all market data sources across all asset classes

const axios = require('axios');

// Unified instrument schema
class Instrument {
  constructor(data) {
    this.symbol_internal = data.symbol_internal;
    this.asset_class = data.asset_class; // 'forex', 'crypto', 'stock', 'commodity', 'index', 'future', 'option', 'bond'
    this.venue = data.venue; // 'MT5', 'BINANCE', 'NYSE', 'OANDA', etc.
    this.tick_size = data.tick_size || 0.0001;
    this.contract_multiplier = data.contract_multiplier || 1;
    this.min_size = data.min_size || 0.01;
    this.trading_hours = data.trading_hours || '24/5';
    this.margin_rules = data.margin_rules || {};
    this.pip_rules = data.pip_rules || {};
  }
}

// Provider base class
class DataProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.timeout = config.timeout || 12000;
  }

  async getLivePrice(symbol, venue = null) {
    throw new Error('getLivePrice must be implemented by provider');
  }

  async getOHLCV(symbol, timeframe, limit = 100, venue = null) {
    throw new Error('getOHLCV must be implemented by provider');
  }

  async getOrderbook(symbol, venue = null) {
    throw new Error('getOrderbook must be implemented by provider');
  }

  async getInstrumentSpecs(symbol, venue = null) {
    throw new Error('getInstrumentSpecs must be implemented by provider');
  }
}

// Alpha Vantage Provider
class AlphaVantageProvider extends DataProvider {
  constructor(config) {
    super('Alpha Vantage', config);
    this.apiKey = config.apiKey || process.env.ALPHA_VANTAGE_API_KEY;
  }

  async getLivePrice(symbol, venue = null) {
    if (!this.apiKey) throw new Error('Alpha Vantage API key not configured');
    
    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol,
          apikey: this.apiKey
        },
        timeout: this.timeout
      });

      if (response.data && response.data['Global Quote'] && !response.data['Note']) {
        const quote = response.data['Global Quote'];
        return {
          symbol: quote['01. symbol'],
          price: parseFloat(quote['05. price']),
          open: parseFloat(quote['02. open']),
          high: parseFloat(quote['03. high']),
          low: parseFloat(quote['04. low']),
          volume: parseInt(quote['06. volume']) || 0,
          change: parseFloat(quote['09. change']),
          changePercent: quote['10. change percent'],
          timestamp: new Date().toISOString(),
          source: 'Alpha Vantage'
        };
      }
      return null;
    } catch (error) {
      console.error(`Alpha Vantage error for ${symbol}:`, error.message);
      return null;
    }
  }

  async getOHLCV(symbol, timeframe, limit = 100, venue = null) {
    if (!this.apiKey) throw new Error('Alpha Vantage API key not configured');
    
    const intervalMap = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '1h': '60min',
      '1d': 'daily'
    };

    const interval = intervalMap[timeframe] || '5min';

    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'TIME_SERIES_INTRADAY',
          symbol: symbol,
          interval: interval,
          apikey: this.apiKey
        },
        timeout: this.timeout
      });

      if (response.data && response.data[`Time Series (${interval})`]) {
        const timeSeries = response.data[`Time Series (${interval})`];
        const timestamps = Object.keys(timeSeries).slice(0, limit);
        
        return timestamps.map(timestamp => ({
          timestamp,
          open: parseFloat(timeSeries[timestamp]['1. open']),
          high: parseFloat(timeSeries[timestamp]['2. high']),
          low: parseFloat(timeSeries[timestamp]['3. low']),
          close: parseFloat(timeSeries[timestamp]['4. close']),
          volume: parseInt(timeSeries[timestamp]['5. volume']) || 0
        }));
      }
      return null;
    } catch (error) {
      console.error(`Alpha Vantage OHLCV error for ${symbol}:`, error.message);
      return null;
    }
  }
}

// Yahoo Finance Provider
class YahooFinanceProvider extends DataProvider {
  constructor(config) {
    super('Yahoo Finance', config);
  }

  async getLivePrice(symbol, venue = null) {
    try {
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: {
          interval: '1m',
          range: '1d'
        },
        timeout: this.timeout
      });

      if (response.data && response.data.chart && response.data.chart.result && response.data.chart.result.length > 0) {
        const result = response.data.chart.result[0];
        const meta = result.meta;
        
        if (meta && meta.regularMarketPrice) {
          return {
            symbol: meta.symbol || symbol,
            price: meta.regularMarketPrice,
            open: meta.regularMarketOpen || meta.previousClose,
            high: meta.regularMarketDayHigh || meta.regularMarketPrice,
            low: meta.regularMarketDayLow || meta.regularMarketPrice,
            previousClose: meta.previousClose,
            volume: meta.regularMarketVolume || 0,
            change: meta.regularMarketPrice - meta.previousClose,
            changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2) + '%',
            timestamp: new Date(meta.regularMarketTime * 1000).toISOString(),
            source: 'Yahoo Finance'
          };
        }
      }
      return null;
    } catch (error) {
      console.error(`Yahoo Finance error for ${symbol}:`, error.message);
      return null;
    }
  }
}

// Finnhub Provider
class FinnhubProvider extends DataProvider {
  constructor(config) {
    super('Finnhub', config);
    this.apiKey = config.apiKey || process.env.FINNHUB_API_KEY;
  }

  async getLivePrice(symbol, venue = null) {
    if (!this.apiKey) throw new Error('Finnhub API key not configured');
    
    try {
      const response = await axios.get('https://finnhub.io/api/v1/quote', {
        params: {
          symbol: symbol,
          token: this.apiKey
        },
        timeout: this.timeout
      });

      if (response.data && response.data.c && response.data.c > 0) {
        const quote = response.data;
        return {
          symbol: symbol,
          price: quote.c,
          open: quote.o,
          high: quote.h,
          low: quote.l,
          previousClose: quote.pc,
          change: quote.c - quote.pc,
          changePercent: ((quote.c - quote.pc) / quote.pc * 100).toFixed(2) + '%',
          timestamp: new Date(quote.t * 1000).toISOString(),
          source: 'Finnhub'
        };
      }
      return null;
    } catch (error) {
      console.error(`Finnhub error for ${symbol}:`, error.message);
      return null;
    }
  }
}

// Provider Manager - Routes to appropriate provider
class ProviderManager {
  constructor() {
    this.providers = {
      'alpha_vantage': new AlphaVantageProvider({}),
      'yahoo_finance': new YahooFinanceProvider({}),
      'finnhub': new FinnhubProvider({})
    };
    this.providerPriority = ['yahoo_finance', 'finnhub', 'alpha_vantage']; // Priority order
  }

  async getLivePrice(symbol, assetClass = null, venue = null) {
    // Try providers in priority order
    for (const providerName of this.providerPriority) {
      const provider = this.providers[providerName];
      if (!provider) continue;

      try {
        const result = await provider.getLivePrice(symbol, venue);
        if (result) {
          result.assetClass = assetClass;
          result.venue = venue;
          return result;
        }
      } catch (error) {
        console.error(`${providerName} failed for ${symbol}:`, error.message);
        continue;
      }
    }
    return null;
  }

  async getOHLCV(symbol, timeframe, limit = 100, assetClass = null, venue = null) {
    // Try providers in priority order
    for (const providerName of this.providerPriority) {
      const provider = this.providers[providerName];
      if (!provider || typeof provider.getOHLCV !== 'function') continue;

      try {
        const result = await provider.getOHLCV(symbol, timeframe, limit, venue);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error(`${providerName} OHLCV failed for ${symbol}:`, error.message);
        continue;
      }
    }
    return null;
  }

  getInstrumentSpecs(symbol, assetClass) {
    // Return standardized instrument specs based on asset class
    const specs = {
      forex: {
        tick_size: 0.0001,
        contract_multiplier: 100000,
        min_size: 0.01,
        pip_value: 10, // per standard lot
        trading_hours: '24/5'
      },
      crypto: {
        tick_size: 0.01,
        contract_multiplier: 1,
        min_size: 0.0001,
        trading_hours: '24/7'
      },
      stock: {
        tick_size: 0.01,
        contract_multiplier: 1,
        min_size: 1,
        trading_hours: '9:30-16:00 ET'
      },
      commodity: {
        tick_size: 0.01,
        contract_multiplier: 100, // for gold futures
        min_size: 0.01,
        trading_hours: '24/5'
      }
    };

    return specs[assetClass] || specs.forex;
  }
}

module.exports = {
  ProviderManager,
  Instrument,
  DataProvider,
  AlphaVantageProvider,
  YahooFinanceProvider,
  FinnhubProvider
};
