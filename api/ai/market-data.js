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

    // Normalize symbol (remove spaces, convert to uppercase, handle various formats)
    let normalizedSymbol = symbol.trim().toUpperCase().replace(/\s+/g, '');
    
    // Handle various instrument types and normalize symbols
    const symbolMappings = {
      // Gold/Commodities
      'GOLD': 'XAUUSD',
      'XAU': 'XAUUSD',
      'XAU/USD': 'XAUUSD',
      // Silver
      'SILVER': 'XAGUSD',
      'XAG': 'XAGUSD',
      'XAG/USD': 'XAGUSD',
      // Oil
      'OIL': 'CL=F',
      'CRUDE': 'CL=F',
      'WTI': 'CL=F',
      'BRENT': 'BZ=F',
      // Major Forex Pairs
      'EUR/USD': 'EURUSD',
      'GBP/USD': 'GBPUSD',
      'USD/JPY': 'USDJPY',
      'AUD/USD': 'AUDUSD',
      'USD/CAD': 'USDCAD',
      'NZD/USD': 'NZDUSD',
      'USD/CHF': 'USDCHF',
      // Crypto
      'BITCOIN': 'BTCUSD',
      'BTC': 'BTCUSD',
      'BTC/USD': 'BTCUSD',
      'ETHEREUM': 'ETHUSD',
      'ETH': 'ETHUSD',
      'ETH/USD': 'ETHUSD',
    };
    
    // Check if symbol needs mapping
    if (symbolMappings[normalizedSymbol]) {
      normalizedSymbol = symbolMappings[normalizedSymbol];
    }
    
    // Detect instrument type for better data source selection
    const isGold = normalizedSymbol === 'XAUUSD' || normalizedSymbol.includes('XAU');
    const isForex = normalizedSymbol.length === 6 && /^[A-Z]{6}$/.test(normalizedSymbol) && 
                    (normalizedSymbol.includes('USD') || normalizedSymbol.includes('EUR') || 
                     normalizedSymbol.includes('GBP') || normalizedSymbol.includes('JPY'));
    const isCrypto = normalizedSymbol.includes('BTC') || normalizedSymbol.includes('ETH') || 
                     normalizedSymbol.includes('USDT') || normalizedSymbol.includes('USDC');
    const isCommodity = normalizedSymbol.includes('XAU') || normalizedSymbol.includes('XAG') || 
                        normalizedSymbol.includes('CL') || normalizedSymbol.includes('GC');
    const isStock = /^[A-Z]{1,5}$/.test(normalizedSymbol) && normalizedSymbol.length <= 5 && 
                    !isForex && !isCrypto && !isCommodity;

    // Try multiple data sources - prioritize most accurate
    let marketData = null;
    let dataSources = [];

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

    // Source 2: Finnhub (excellent for stocks, forex, crypto, commodities)
    if (!marketData) {
      try {
        const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
        
        if (FINNHUB_API_KEY) {
          // Finnhub uses different symbol formats
          let finnhubSymbol = normalizedSymbol;
          
          // Map to Finnhub format
          if (isGold) {
            finnhubSymbol = 'OANDA:XAU_USD'; // Gold via OANDA
          } else if (isForex) {
            // Forex: EURUSD -> OANDA:EUR_USD
            const base = normalizedSymbol.substring(0, 3);
            const quote = normalizedSymbol.substring(3, 6);
            finnhubSymbol = `OANDA:${base}_${quote}`;
          } else if (isCrypto) {
            // Crypto: BTCUSD -> BINANCE:BTCUSDT
            if (normalizedSymbol.includes('BTC')) finnhubSymbol = 'BINANCE:BTCUSDT';
            else if (normalizedSymbol.includes('ETH')) finnhubSymbol = 'BINANCE:ETHUSDT';
          }
          // Stocks use symbol as-is
          
          const quoteResponse = await axios.get(`https://finnhub.io/api/v1/quote`, {
            params: {
              symbol: finnhubSymbol,
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
              instrumentType: isGold ? 'commodity' : isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : 'stock',
              source: 'Finnhub'
            };
            dataSources.push('Finnhub');
          }
        }
      } catch (finnhubError) {
        console.log('Finnhub error:', finnhubError.message);
      }
    }

    // Source 3: Yahoo Finance (works for stocks, forex, crypto, commodities, indices)
    if (!marketData) {
      try {
        // Map symbols to Yahoo Finance format
        let yahooSymbol = normalizedSymbol;
        if (isGold) {
          yahooSymbol = 'XAU=X'; // Gold spot
        } else if (normalizedSymbol === 'XAGUSD' || normalizedSymbol === 'SILVER') {
          yahooSymbol = 'XAG=X'; // Silver spot
        } else if (isForex && normalizedSymbol.length === 6) {
          // Forex pairs: EURUSD -> EURUSD=X
          yahooSymbol = `${normalizedSymbol}=X`;
        } else if (isCrypto) {
          // Crypto: BTCUSD -> BTC-USD, ETHUSD -> ETH-USD
          if (normalizedSymbol.includes('BTC')) yahooSymbol = 'BTC-USD';
          else if (normalizedSymbol.includes('ETH')) yahooSymbol = 'ETH-USD';
          else if (normalizedSymbol.length === 7 && normalizedSymbol.endsWith('USD')) {
            yahooSymbol = `${normalizedSymbol.substring(0, 3)}-USD`;
          }
        } else if (isCommodity) {
          // Commodities: Oil -> CL=F, Gold Futures -> GC=F
          if (normalizedSymbol.includes('CL') || normalizedSymbol === 'OIL' || normalizedSymbol === 'WTI') {
            yahooSymbol = 'CL=F';
          } else if (normalizedSymbol.includes('GC')) {
            yahooSymbol = 'GC=F';
          }
        }
        // For stocks and indices, use symbol as-is
        
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
          params: {
            interval: '1m',
            range: '1d'
          },
          timeout: 5000
        });

        if (response.data && response.data.chart && response.data.chart.result && response.data.chart.result.length > 0) {
          const result = response.data.chart.result[0];
          const meta = result.meta;
          
          if (meta && meta.regularMarketPrice) {
            // Determine original symbol format
            let displaySymbol = normalizedSymbol;
            if (isGold) displaySymbol = 'XAUUSD';
            else if (yahooSymbol === 'XAG=X') displaySymbol = 'XAGUSD';
            else if (isForex && yahooSymbol.endsWith('=X')) displaySymbol = yahooSymbol.replace('=X', '');
            else if (isCrypto && yahooSymbol.includes('-')) displaySymbol = yahooSymbol.replace('-', '');
            else displaySymbol = meta.symbol || normalizedSymbol;
            
            marketData = {
              symbol: displaySymbol,
              price: meta.regularMarketPrice,
              open: meta.regularMarketOpen || meta.previousClose,
              high: meta.regularMarketDayHigh || meta.regularMarketPrice,
              low: meta.regularMarketDayLow || meta.regularMarketPrice,
              previousClose: meta.previousClose,
              volume: meta.regularMarketVolume || 0,
              change: meta.regularMarketPrice - meta.previousClose,
              changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2) + '%',
              currency: meta.currency || 'USD',
              exchange: meta.exchangeName || (isForex ? 'FOREX' : isCrypto ? 'CRYPTO' : 'STOCK'),
              timestamp: meta.regularMarketTime * 1000,
              instrumentType: isGold ? 'commodity' : isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : 'stock',
              source: 'Yahoo Finance'
            };
            dataSources.push('Yahoo Finance');
          }
        }
      } catch (yahooError) {
        console.log('Yahoo Finance error:', yahooError.message);
      }
    }
    
    // Source 4: Metal API for gold/commodities (if available)
    if (!marketData && isGold) {
      try {
        const METAL_API_KEY = process.env.METAL_API_KEY;
        if (METAL_API_KEY) {
          const response = await axios.get(`https://api.metals.live/v1/spot/gold`, {
            headers: {
              'x-rapidapi-key': METAL_API_KEY
            },
            timeout: 5000
          });
          
          if (response.data && response.data.price) {
            marketData = {
              symbol: 'XAUUSD',
              price: parseFloat(response.data.price),
              timestamp: Date.now(),
              source: 'Metal API'
            };
            dataSources.push('Metal API');
          }
        }
      } catch (metalError) {
        console.log('Metal API error:', metalError.message);
      }
    }
    
    // Source 5: Twelve Data API for forex/commodities (if available)
    if (!marketData) {
      try {
        const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
        if (TWELVE_DATA_API_KEY) {
          const response = await axios.get(`https://api.twelvedata.com/price`, {
            params: {
              symbol: normalizedSymbol,
              apikey: TWELVE_DATA_API_KEY
            },
            timeout: 5000
          });
          
          if (response.data && response.data.price) {
            marketData = {
              symbol: normalizedSymbol,
              price: parseFloat(response.data.price),
              timestamp: Date.now(),
              source: 'Twelve Data'
            };
            dataSources.push('Twelve Data');
          }
        }
      } catch (twelveDataError) {
        console.log('Twelve Data error:', twelveDataError.message);
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

    // If still no data, try one more time with different symbol formats
    if (!marketData && isGold) {
      try {
        // Try GC=F (Gold Futures) on Yahoo Finance
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F`, {
          params: {
            interval: '1m',
            range: '1d'
          },
          timeout: 5000
        });

        if (response.data && response.data.chart && response.data.chart.result && response.data.chart.result.length > 0) {
          const result = response.data.chart.result[0];
          const meta = result.meta;
          
          if (meta && meta.regularMarketPrice) {
            marketData = {
              symbol: 'XAUUSD',
              price: meta.regularMarketPrice,
              open: meta.regularMarketOpen || meta.previousClose,
              high: meta.regularMarketDayHigh || meta.regularMarketPrice,
              low: meta.regularMarketDayLow || meta.regularMarketPrice,
              previousClose: meta.previousClose,
              volume: meta.regularMarketVolume || 0,
              change: meta.regularMarketPrice - meta.previousClose,
              changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2) + '%',
              currency: 'USD',
              exchange: 'COMEX',
              timestamp: meta.regularMarketTime * 1000,
              source: 'Yahoo Finance (GC=F)'
            };
            dataSources.push('Yahoo Finance GC=F');
          }
        }
      } catch (gcError) {
        console.log('GC=F error:', gcError.message);
      }
    }

    if (!marketData) {
      return res.status(404).json({ 
        success: false, 
        message: `Market data not found for symbol: ${normalizedSymbol}. Please check the symbol and try again.`,
        triedSources: dataSources
      });
    }

    // Add timestamp to ensure data freshness
    marketData.lastUpdated = new Date().toISOString();
    marketData.dataSources = dataSources;

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
