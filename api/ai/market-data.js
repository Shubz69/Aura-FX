// Real-time market data API endpoint
// Integrates with multiple data sources for comprehensive market analysis

const axios = require('axios');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { symbol, type = 'quote' } = req.body;

    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol is required' });
    }

    // Normalize symbol (remove spaces, convert to uppercase)
    const normalizedSymbol = symbol.trim().toUpperCase();

    // Try multiple data sources
    let marketData = null;

    // Source 1: Alpha Vantage (free tier available)
    try {
      const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
      
      if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === 'demo') {
        console.log('Alpha Vantage API key not set, trying alternative sources...');
        throw new Error('Alpha Vantage key not configured');
      }
      
      if (type === 'quote') {
        const response = await axios.get(`https://www.alphavantage.co/query`, {
          params: {
            function: 'GLOBAL_QUOTE',
            symbol: normalizedSymbol,
            apikey: ALPHA_VANTAGE_API_KEY
          },
          timeout: 5000
        });

        if (response.data && response.data['Global Quote'] && !response.data['Note']) {
          const quote = response.data['Global Quote'];
          marketData = {
            symbol: quote['01. symbol'],
            open: parseFloat(quote['02. open']),
            high: parseFloat(quote['03. high']),
            low: parseFloat(quote['04. low']),
            price: parseFloat(quote['05. price']),
            volume: parseInt(quote['06. volume']),
            latestTradingDay: quote['07. latest trading day'],
            previousClose: parseFloat(quote['08. previous close']),
            change: parseFloat(quote['09. change']),
            changePercent: quote['10. change percent'],
            source: 'Alpha Vantage'
          };
        }
      } else if (type === 'intraday') {
        const response = await axios.get(`https://www.alphavantage.co/query`, {
          params: {
            function: 'TIME_SERIES_INTRADAY',
            symbol: normalizedSymbol,
            interval: '5min',
            apikey: ALPHA_VANTAGE_API_KEY
          },
          timeout: 5000
        });

        if (response.data && response.data['Time Series (5min)'] && !response.data['Note']) {
          const timeSeries = response.data['Time Series (5min)'];
          const timestamps = Object.keys(timeSeries).slice(0, 100); // Last 100 data points
          
          marketData = {
            symbol: normalizedSymbol,
            interval: '5min',
            data: timestamps.map(timestamp => ({
              timestamp,
              open: parseFloat(timeSeries[timestamp]['1. open']),
              high: parseFloat(timeSeries[timestamp]['2. high']),
              low: parseFloat(timeSeries[timestamp]['3. low']),
              close: parseFloat(timeSeries[timestamp]['4. close']),
              volume: parseInt(timeSeries[timestamp]['5. volume'])
            })),
            source: 'Alpha Vantage'
          };
        }
      }
    } catch (alphaVantageError) {
      console.log('Alpha Vantage error:', alphaVantageError.message);
    }

    // Source 2: Finnhub (if API key is available)
    if (!marketData) {
      try {
        const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
        
        if (FINNHUB_API_KEY) {
          // Try quote endpoint
          const quoteResponse = await axios.get(`https://finnhub.io/api/v1/quote`, {
            params: {
              symbol: normalizedSymbol,
              token: FINNHUB_API_KEY
            },
            timeout: 5000
          });

          if (quoteResponse.data && quoteResponse.data.c && quoteResponse.data.c > 0) {
            const quote = quoteResponse.data;
            marketData = {
              symbol: normalizedSymbol,
              price: quote.c, // current price
              open: quote.o,
              high: quote.h,
              low: quote.l,
              previousClose: quote.pc,
              change: quote.c - quote.pc,
              changePercent: ((quote.c - quote.pc) / quote.pc * 100).toFixed(2) + '%',
              timestamp: quote.t * 1000, // convert to milliseconds
              source: 'Finnhub'
            };
          }
        }
      } catch (finnhubError) {
        console.log('Finnhub error:', finnhubError.message);
      }
    }

    // Source 3: Yahoo Finance (fallback - using yfinance API)
    if (!marketData) {
      try {
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${normalizedSymbol}`, {
          params: {
            interval: '1d',
            range: '1d'
          },
          timeout: 5000
        });

        if (response.data && response.data.chart && response.data.chart.result) {
          const result = response.data.chart.result[0];
          const meta = result.meta;
          const quote = result.indicators.quote[0];
          
          marketData = {
            symbol: meta.symbol,
            price: meta.regularMarketPrice,
            open: meta.regularMarketOpen,
            high: meta.regularMarketDayHigh,
            low: meta.regularMarketDayLow,
            previousClose: meta.previousClose,
            volume: meta.regularMarketVolume,
            change: meta.regularMarketPrice - meta.previousClose,
            changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2) + '%',
            currency: meta.currency,
            exchange: meta.exchangeName,
            source: 'Yahoo Finance'
          };
        }
      } catch (yahooError) {
        console.log('Yahoo Finance error:', yahooError.message);
      }
    }

    // Source 3: Forex Factory Calendar (for forex pairs)
    if (!marketData && (normalizedSymbol.includes('USD') || normalizedSymbol.includes('EUR') || 
        normalizedSymbol.includes('GBP') || normalizedSymbol.includes('JPY') || 
        normalizedSymbol.includes('AUD') || normalizedSymbol.includes('CAD') || 
        normalizedSymbol.includes('CHF') || normalizedSymbol.includes('NZD'))) {
      try {
        // Forex Factory doesn't have a public API, but we can use other forex APIs
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${normalizedSymbol.substring(0, 3)}`, {
          timeout: 5000
        });

        if (response.data && response.data.rates) {
          const base = normalizedSymbol.substring(0, 3);
          const quote = normalizedSymbol.substring(3, 6);
          const rate = response.data.rates[quote];
          
          if (rate) {
            marketData = {
              symbol: normalizedSymbol,
              price: rate,
              base,
              quote,
              timestamp: response.data.date,
              source: 'ExchangeRate-API'
            };
          }
        }
      } catch (forexError) {
        console.log('Forex API error:', forexError.message);
      }
    }

    if (!marketData) {
      return res.status(404).json({ 
        success: false, 
        message: `Market data not found for symbol: ${normalizedSymbol}. Please check the symbol and try again.` 
      });
    }

    return res.status(200).json({
      success: true,
      data: marketData
    });

  } catch (error) {
    console.error('Error fetching market data:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch market data' 
    });
  }
};
