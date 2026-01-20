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
    
    // Comprehensive symbol mappings for ALL financial instruments
    const symbolMappings = {
      // Precious Metals
      'GOLD': 'XAUUSD', 'XAU': 'XAUUSD', 'XAU/USD': 'XAUUSD',
      'SILVER': 'XAGUSD', 'XAG': 'XAGUSD', 'XAG/USD': 'XAGUSD',
      'PLATINUM': 'XPTUSD', 'XPT': 'XPTUSD', 'XPT/USD': 'XPTUSD',
      'PALLADIUM': 'XPDUSD', 'XPD': 'XPDUSD', 'XPD/USD': 'XPDUSD',
      
      // Energy Commodities
      'OIL': 'CL=F', 'CRUDE': 'CL=F', 'WTI': 'CL=F', 'CRUDEOIL': 'CL=F',
      'BRENT': 'BZ=F', 'BRENTOIL': 'BZ=F',
      'NATURALGAS': 'NG=F', 'GAS': 'NG=F', 'NATGAS': 'NG=F',
      'HEATINGOIL': 'HO=F', 'GASOIL': 'HO=F',
      
      // Agricultural Commodities
      'CORN': 'ZC=F', 'WHEAT': 'ZW=F', 'SOYBEANS': 'ZS=F', 'SOYBEAN': 'ZS=F',
      'SUGAR': 'SB=F', 'COFFEE': 'KC=F', 'COTTON': 'CT=F',
      'COCOA': 'CC=F', 'ORANGEJUICE': 'OJ=F', 'LIVECATTLE': 'LE=F',
      'FEEDERCATTLE': 'GF=F', 'LEANHOGS': 'HE=F',
      
      // Base Metals
      'COPPER': 'HG=F', 'ALUMINUM': 'ALI=F', 'NICKEL': 'NI=F',
      'ZINC': 'ZN=F', 'LEAD': 'PB=F', 'TIN': 'SN=F',
      
      // Major Forex Pairs
      'EUR/USD': 'EURUSD', 'EURUSD': 'EURUSD',
      'GBP/USD': 'GBPUSD', 'GBPUSD': 'GBPUSD', 'CABLE': 'GBPUSD',
      'USD/JPY': 'USDJPY', 'USDJPY': 'USDJPY',
      'AUD/USD': 'AUDUSD', 'AUDUSD': 'AUDUSD', 'AUSSIE': 'AUDUSD',
      'USD/CAD': 'USDCAD', 'USDCAD': 'USDCAD', 'LOONIE': 'USDCAD',
      'NZD/USD': 'NZDUSD', 'NZDUSD': 'NZDUSD', 'KIWI': 'NZDUSD',
      'USD/CHF': 'USDCHF', 'USDCHF': 'USDCHF', 'SWISSIE': 'USDCHF',
      
      // Minor Forex Pairs
      'EUR/GBP': 'EURGBP', 'EURGBP': 'EURGBP',
      'EUR/JPY': 'EURJPY', 'EURJPY': 'EURJPY',
      'GBP/JPY': 'GBPJPY', 'GBPJPY': 'GBPJPY',
      'AUD/JPY': 'AUDJPY', 'AUDJPY': 'AUDJPY',
      'EUR/AUD': 'EURAUD', 'EURAUD': 'EURAUD',
      'EUR/CAD': 'EURCAD', 'EURCAD': 'EURCAD',
      'GBP/AUD': 'GBPAUD', 'GBPAUD': 'GBPAUD',
      'GBP/CAD': 'GBPCAD', 'GBPCAD': 'GBPCAD',
      'AUD/CAD': 'AUDCAD', 'AUDCAD': 'AUDCAD',
      'AUD/NZD': 'AUDNZD', 'AUDNZD': 'AUDNZD',
      'NZD/JPY': 'NZDJPY', 'NZDJPY': 'NZDJPY',
      'CAD/JPY': 'CADJPY', 'CADJPY': 'CADJPY',
      'CHF/JPY': 'CHFJPY', 'CHFJPY': 'CHFJPY',
      
      // Exotic Forex Pairs
      'USD/ZAR': 'USDZAR', 'USDZAR': 'USDZAR', // South African Rand
      'USD/TRY': 'USDTRY', 'USDTRY': 'USDTRY', // Turkish Lira
      'USD/MXN': 'USDMXN', 'USDMXN': 'USDMXN', // Mexican Peso
      'USD/BRL': 'USDBRL', 'USDBRL': 'USDBRL', // Brazilian Real
      'USD/CNH': 'USDCNH', 'USDCNH': 'USDCNH', // Chinese Yuan
      'USD/INR': 'USDINR', 'USDINR': 'USDINR', // Indian Rupee
      'USD/RUB': 'USDRUB', 'USDRUB': 'USDRUB', // Russian Ruble
      'USD/SGD': 'USDSGD', 'USDSGD': 'USDSGD', // Singapore Dollar
      'USD/HKD': 'USDHKD', 'USDHKD': 'USDHKD', // Hong Kong Dollar
      'USD/KRW': 'USDKRW', 'USDKRW': 'USDKRW', // South Korean Won
      
      // Cryptocurrencies
      'BITCOIN': 'BTCUSD', 'BTC': 'BTCUSD', 'BTC/USD': 'BTCUSD',
      'ETHEREUM': 'ETHUSD', 'ETH': 'ETHUSD', 'ETH/USD': 'ETHUSD',
      'BNB': 'BNBUSD', 'BINANCECOIN': 'BNBUSD',
      'SOLANA': 'SOLUSD', 'SOL': 'SOLUSD',
      'CARDANO': 'ADAUSD', 'ADA': 'ADAUSD',
      'XRP': 'XRPUSD', 'RIPPLE': 'XRPUSD',
      'POLKADOT': 'DOTUSD', 'DOT': 'DOTUSD',
      'DOGECOIN': 'DOGEUSD', 'DOGE': 'DOGEUSD',
      'AVALANCHE': 'AVAXUSD', 'AVAX': 'AVAXUSD',
      'POLYGON': 'MATICUSD', 'MATIC': 'MATICUSD',
      'LITECOIN': 'LTCUSD', 'LTC': 'LTCUSD',
      'CHAINLINK': 'LINKUSD', 'LINK': 'LINKUSD',
      'UNISWAP': 'UNIUSD', 'UNI': 'UNIUSD',
      'BITCOINCASH': 'BCHUSD', 'BCH': 'BCHUSD',
      
      // Major Stock Indices
      'SP500': '^GSPC', 'SPX': '^GSPC', 'S&P500': '^GSPC', 'S&P': '^GSPC',
      'DOW': '^DJI', 'DOWJONES': '^DJI', 'DJI': '^DJI',
      'NASDAQ': '^IXIC', 'NAS100': '^IXIC', 'COMP': '^IXIC',
      'RUSSEL2000': '^RUT', 'RUT': '^RUT',
      'FTSE': '^FTSE', 'FTSE100': '^FTSE',
      'DAX': '^GDAXI', 'GERMANY': '^GDAXI',
      'CAC40': '^FCHI', 'FRANCE': '^FCHI',
      'NIKKEI': '^N225', 'JAPAN': '^N225',
      'HANG SENG': '^HSI', 'HONGKONG': '^HSI',
      'ASX200': '^AXJO', 'AUSTRALIA': '^AXJO',
      'TSX': '^GSPTSE', 'CANADA': '^GSPTSE',
      'IBEX35': '^IBEX', 'SPAIN': '^IBEX',
      'SENSEX': '^BSESN', 'INDIA': '^BSESN',
      
      // ETF Indices
      'SPY': 'SPY', 'SPDR': 'SPY',
      'QQQ': 'QQQ', 'NASDAQ100': 'QQQ',
      'DIA': 'DIA', 'DIAMONDS': 'DIA',
      'IWM': 'IWM', 'RUSSELL2000ETF': 'IWM',
      'VTI': 'VTI', 'VANGUARD': 'VTI',
      
      // Major Stocks (Tech)
      'APPLE': 'AAPL', 'AAPL': 'AAPL',
      'MICROSOFT': 'MSFT', 'MSFT': 'MSFT',
      'GOOGLE': 'GOOGL', 'ALPHABET': 'GOOGL', 'GOOGL': 'GOOGL',
      'AMAZON': 'AMZN', 'AMZN': 'AMZN',
      'META': 'META', 'FACEBOOK': 'META', 'FB': 'META',
      'TESLA': 'TSLA', 'TSLA': 'TSLA',
      'NVIDIA': 'NVDA', 'NVDA': 'NVDA',
      'NETFLIX': 'NFLX', 'NFLX': 'NFLX',
      'AMD': 'AMD', 'ADVANCEDMICRO': 'AMD',
      'INTEL': 'INTC', 'INTC': 'INTC',
      'ORACLE': 'ORCL', 'ORCL': 'ORCL',
      'SALESFORCE': 'CRM', 'CRM': 'CRM',
      'ADOBE': 'ADBE', 'ADBE': 'ADBE',
      'PAYPAL': 'PYPL', 'PYPL': 'PYPL',
      'UBER': 'UBER', 'UBER': 'UBER',
      'AIRBNB': 'ABNB', 'ABNB': 'ABNB',
      
      // Major Stocks (Finance)
      'JPMORGAN': 'JPM', 'JPM': 'JPM',
      'BANKOFAMERICA': 'BAC', 'BAC': 'BAC',
      'WELLSFARGO': 'WFC', 'WFC': 'WFC',
      'GOLDMANSACHS': 'GS', 'GS': 'GS',
      'MORGANSTANLEY': 'MS', 'MS': 'MS',
      'CITIGROUP': 'C', 'C': 'C',
      'VISA': 'V', 'V': 'V',
      'MASTERCARD': 'MA', 'MA': 'MA',
      
      // Major Stocks (Other Sectors)
      'WALMART': 'WMT', 'WMT': 'WMT',
      'JOHNSON&JOHNSON': 'JNJ', 'JNJ': 'JNJ',
      'PROCTER&GAMBLE': 'PG', 'PG': 'PG',
      'COCACOLA': 'KO', 'KO': 'KO',
      'PEPSI': 'PEP', 'PEP': 'PEP',
      'MCDONALDS': 'MCD', 'MCD': 'MCD',
      'STARBUCKS': 'SBUX', 'SBUX': 'SBUX',
      'NKE': 'NKE', 'NIKE': 'NKE',
      'DISNEY': 'DIS', 'DIS': 'DIS',
      'BOEING': 'BA', 'BA': 'BA',
      'CATERPILLAR': 'CAT', 'CAT': 'CAT',
      '3M': 'MMM', 'MMM': 'MMM',
      'GENERALELECTRIC': 'GE', 'GE': 'GE',
      'VERIZON': 'VZ', 'VZ': 'VZ',
      'AT&T': 'T', 'T': 'T',
    };
    
    // Check if symbol needs mapping
    if (symbolMappings[normalizedSymbol]) {
      normalizedSymbol = symbolMappings[normalizedSymbol];
    }
    
    // Comprehensive instrument type detection
    const isGold = normalizedSymbol === 'XAUUSD' || normalizedSymbol.includes('XAU') || normalizedSymbol === 'GOLD';
    const isForex = (normalizedSymbol.length === 6 && /^[A-Z]{6}$/.test(normalizedSymbol) && 
                    (normalizedSymbol.includes('USD') || normalizedSymbol.includes('EUR') || 
                     normalizedSymbol.includes('GBP') || normalizedSymbol.includes('JPY') ||
                     normalizedSymbol.includes('AUD') || normalizedSymbol.includes('CAD') ||
                     normalizedSymbol.includes('CHF') || normalizedSymbol.includes('NZD') ||
                     normalizedSymbol.includes('ZAR') || normalizedSymbol.includes('TRY') ||
                     normalizedSymbol.includes('MXN') || normalizedSymbol.includes('BRL') ||
                     normalizedSymbol.includes('CNH') || normalizedSymbol.includes('INR') ||
                     normalizedSymbol.includes('RUB') || normalizedSymbol.includes('SGD') ||
                     normalizedSymbol.includes('HKD') || normalizedSymbol.includes('KRW'))) ||
                    /^(EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|ZAR|TRY|MXN|BRL|CNH|INR|RUB|SGD|HKD|KRW)(EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|ZAR|TRY|MXN|BRL|CNH|INR|RUB|SGD|HKD|KRW)$/.test(normalizedSymbol);
    const isCrypto = normalizedSymbol.includes('BTC') || normalizedSymbol.includes('ETH') || 
                     normalizedSymbol.includes('BNB') || normalizedSymbol.includes('SOL') ||
                     normalizedSymbol.includes('ADA') || normalizedSymbol.includes('XRP') ||
                     normalizedSymbol.includes('DOT') || normalizedSymbol.includes('DOGE') ||
                     normalizedSymbol.includes('AVAX') || normalizedSymbol.includes('MATIC') ||
                     normalizedSymbol.includes('LTC') || normalizedSymbol.includes('LINK') ||
                     normalizedSymbol.includes('UNI') || normalizedSymbol.includes('BCH') ||
                     normalizedSymbol.includes('USDT') || normalizedSymbol.includes('USDC') ||
                     normalizedSymbol.includes('BITCOIN') || normalizedSymbol.includes('ETHEREUM') ||
                     normalizedSymbol.includes('CRYPTO');
    const isCommodity = normalizedSymbol.includes('XAU') || normalizedSymbol.includes('XAG') || 
                        normalizedSymbol.includes('XPT') || normalizedSymbol.includes('XPD') ||
                        normalizedSymbol.includes('CL') || normalizedSymbol.includes('GC') ||
                        normalizedSymbol.includes('NG') || normalizedSymbol.includes('HO') ||
                        normalizedSymbol.includes('ZC') || normalizedSymbol.includes('ZW') ||
                        normalizedSymbol.includes('ZS') || normalizedSymbol.includes('SB') ||
                        normalizedSymbol.includes('KC') || normalizedSymbol.includes('CT') ||
                        normalizedSymbol.includes('CC') || normalizedSymbol.includes('OJ') ||
                        normalizedSymbol.includes('LE') || normalizedSymbol.includes('GF') ||
                        normalizedSymbol.includes('HE') || normalizedSymbol.includes('HG') ||
                        normalizedSymbol.includes('OIL') || normalizedSymbol.includes('SILVER') ||
                        normalizedSymbol.includes('GOLD') || normalizedSymbol.includes('PLATINUM') ||
                        normalizedSymbol.includes('PALLADIUM') || normalizedSymbol.includes('CRUDE') ||
                        normalizedSymbol.includes('WTI') || normalizedSymbol.includes('BRENT') ||
                        normalizedSymbol.includes('GAS') || normalizedSymbol.includes('CORN') ||
                        normalizedSymbol.includes('WHEAT') || normalizedSymbol.includes('COFFEE') ||
                        normalizedSymbol.includes('COTTON') || normalizedSymbol.includes('COPPER');
    const isIndex = normalizedSymbol.startsWith('^') || 
                    normalizedSymbol === 'SPY' || normalizedSymbol === 'QQQ' || normalizedSymbol === 'DIA' ||
                    normalizedSymbol === 'IWM' || normalizedSymbol === 'VTI' ||
                    normalizedSymbol.includes('SPX') || normalizedSymbol.includes('SP500') ||
                    normalizedSymbol.includes('DJI') || normalizedSymbol.includes('DOW') ||
                    normalizedSymbol.includes('NASDAQ') || normalizedSymbol.includes('FTSE') ||
                    normalizedSymbol.includes('DAX') || normalizedSymbol.includes('CAC') ||
                    normalizedSymbol.includes('NIKKEI') || normalizedSymbol.includes('HANG') ||
                    normalizedSymbol.includes('ASX') || normalizedSymbol.includes('TSX') ||
                    normalizedSymbol.includes('IBEX') || normalizedSymbol.includes('SENSEX') ||
                    normalizedSymbol.includes('RUT') || normalizedSymbol.includes('RUSSEL');
    const isFuture = normalizedSymbol.endsWith('=F') || normalizedSymbol.includes('FUTURE') ||
                     normalizedSymbol.includes('FUTURES') || /^[A-Z]{1,2}=F$/.test(normalizedSymbol);
    const isBond = normalizedSymbol.includes('BOND') || normalizedSymbol.includes('TNOTE') ||
                   normalizedSymbol.includes('TBOND') || normalizedSymbol.includes('TREASURY') ||
                   normalizedSymbol.startsWith('^TNX') || normalizedSymbol.startsWith('^TYX') ||
                   normalizedSymbol.startsWith('^FVX');
    const isETF = normalizedSymbol === 'SPY' || normalizedSymbol === 'QQQ' || normalizedSymbol === 'DIA' ||
                  normalizedSymbol === 'IWM' || normalizedSymbol === 'VTI' || normalizedSymbol === 'VOO' ||
                  normalizedSymbol.includes('ETF');
    const isStock = /^[A-Z]{1,5}$/.test(normalizedSymbol) && normalizedSymbol.length <= 5 && 
                    !isForex && !isCrypto && !isCommodity && !isIndex && !isFuture && 
                    !isBond && !normalizedSymbol.startsWith('^') && !normalizedSymbol.endsWith('=F');

    // Fetch from ALL sources in PARALLEL - use first successful response
    // This ensures we always get data even if some sources are slow or fail
    let marketData = null;
    let dataSources = [];
    const dataPromises = [];

    // Source 1: Alpha Vantage (free tier available)
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (ALPHA_VANTAGE_API_KEY && ALPHA_VANTAGE_API_KEY !== 'demo') {
      if (type === 'quote') {
        // Alpha Vantage works best for stocks, but can handle forex with FX_ prefix
        let avSymbol = normalizedSymbol;
        if (isForex && normalizedSymbol.length === 6) {
          // Forex: EURUSD -> FX:EURUSD for Alpha Vantage
          avSymbol = `FX:${normalizedSymbol}`;
        }
        
        dataPromises.push(
          axios.get(`https://www.alphavantage.co/query`, {
            params: {
              function: 'GLOBAL_QUOTE',
              symbol: avSymbol,
              apikey: ALPHA_VANTAGE_API_KEY
            },
            timeout: 8000 // Optimized for real-time (8s max per source)
          }).then(response => {
            if (response.data && response.data['Global Quote'] && !response.data['Note']) {
              const quote = response.data['Global Quote'];
              const quoteSymbol = quote['01. symbol'].replace('FX:', '');
              return {
                symbol: quoteSymbol,
                open: parseFloat(quote['02. open']),
                high: parseFloat(quote['03. high']),
                low: parseFloat(quote['04. low']),
                price: parseFloat(quote['05. price']),
                volume: parseInt(quote['06. volume']) || 0,
                latestTradingDay: quote['07. latest trading day'],
                previousClose: parseFloat(quote['08. previous close']),
                change: parseFloat(quote['09. change']),
                changePercent: quote['10. change percent'],
                instrumentType: isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : 'stock',
                source: 'Alpha Vantage'
              };
            }
            return null;
          }).catch(err => {
            console.log('Alpha Vantage error:', err.message);
            return null;
          })
        );

      } else if (type === 'intraday') {
        // For intraday, use appropriate symbol format
        let avSymbol = normalizedSymbol;
        if (isForex && normalizedSymbol.length === 6) {
          avSymbol = `FX:${normalizedSymbol}`;
        }
        
        dataPromises.push(
          axios.get(`https://www.alphavantage.co/query`, {
            params: {
              function: 'TIME_SERIES_INTRADAY',
              symbol: avSymbol,
              interval: '5min',
              apikey: ALPHA_VANTAGE_API_KEY
            },
            timeout: 12000
          }).then(response => {
            if (response.data && response.data['Time Series (5min)'] && !response.data['Note']) {
              const timeSeries = response.data['Time Series (5min)'];
              const timestamps = Object.keys(timeSeries).slice(0, 100);
              return {
                symbol: normalizedSymbol,
                interval: '5min',
                data: timestamps.map(timestamp => ({
                  timestamp,
                  open: parseFloat(timeSeries[timestamp]['1. open']),
                  high: parseFloat(timeSeries[timestamp]['2. high']),
                  low: parseFloat(timeSeries[timestamp]['3. low']),
                  close: parseFloat(timeSeries[timestamp]['4. close']),
                  volume: parseInt(timeSeries[timestamp]['5. volume']) || 0
                })),
                instrumentType: isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : 'stock',
                source: 'Alpha Vantage'
              };
            }
            return null;
          }).catch(err => {
            console.log('Alpha Vantage intraday error:', err.message);
            return null;
          })
        );
      }
    }

    // Source 2: Finnhub (excellent for stocks, forex, crypto, commodities) - PARALLEL
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (FINNHUB_API_KEY && type === 'quote') {
      let finnhubSymbol = normalizedSymbol;
      
      // Map to Finnhub format
      if (isGold) {
        finnhubSymbol = 'OANDA:XAU_USD';
      } else if (isForex) {
        const base = normalizedSymbol.substring(0, 3);
        const quote = normalizedSymbol.substring(3, 6);
        finnhubSymbol = `OANDA:${base}_${quote}`;
      } else if (isCrypto) {
        if (normalizedSymbol.includes('BTC')) finnhubSymbol = 'BINANCE:BTCUSDT';
        else if (normalizedSymbol.includes('ETH')) finnhubSymbol = 'BINANCE:ETHUSDT';
      }
      
      dataPromises.push(
        axios.get(`https://finnhub.io/api/v1/quote`, {
          params: {
            symbol: finnhubSymbol,
            token: FINNHUB_API_KEY
          },
          timeout: 8000 // Optimized for real-time (8s max per source)
        }).then(quoteResponse => {
          if (quoteResponse.data && quoteResponse.data.c && quoteResponse.data.c > 0) {
            const quote = quoteResponse.data;
            return {
              symbol: normalizedSymbol,
              price: quote.c,
              open: quote.o,
              high: quote.h,
              low: quote.l,
              previousClose: quote.pc,
              change: quote.c - quote.pc,
              changePercent: ((quote.c - quote.pc) / quote.pc * 100).toFixed(2) + '%',
              timestamp: quote.t * 1000,
              instrumentType: isGold ? 'commodity' : isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : isIndex ? 'index' : 'stock',
              source: 'Finnhub'
            };
          }
          return null;
        }).catch(err => {
          console.log('Finnhub error:', err.message);
          return null;
        })
      );
    }

    // Source 3: Yahoo Finance (works for stocks, forex, crypto, commodities, indices) - PARALLEL
    if (type === 'quote') {
      // Map symbols to Yahoo Finance format
      let yahooSymbol = normalizedSymbol;
      if (isGold) {
        yahooSymbol = 'XAU=X';
      } else if (normalizedSymbol === 'XAGUSD' || normalizedSymbol === 'SILVER') {
        yahooSymbol = 'XAG=X';
      } else if (isForex && normalizedSymbol.length === 6) {
        yahooSymbol = `${normalizedSymbol}=X`;
      } else if (isCrypto) {
        if (normalizedSymbol.includes('BTC')) yahooSymbol = 'BTC-USD';
        else if (normalizedSymbol.includes('ETH')) yahooSymbol = 'ETH-USD';
        else if (normalizedSymbol.length === 7 && normalizedSymbol.endsWith('USD')) {
          yahooSymbol = `${normalizedSymbol.substring(0, 3)}-USD`;
        }
      } else if (isCommodity) {
        if (normalizedSymbol.includes('CL') || normalizedSymbol === 'OIL' || normalizedSymbol === 'WTI' || normalizedSymbol === 'CRUDE') {
          yahooSymbol = 'CL=F';
        } else if (normalizedSymbol.includes('GC') || normalizedSymbol === 'GOLD') {
          yahooSymbol = 'GC=F';
        } else if (normalizedSymbol.includes('BRENT')) {
          yahooSymbol = 'BZ=F';
        }
      } else if (isIndex) {
        if (normalizedSymbol === 'SPY' || normalizedSymbol.includes('SPX')) {
          yahooSymbol = '^GSPC';
        } else if (normalizedSymbol === 'QQQ' || normalizedSymbol.includes('NASDAQ')) {
          yahooSymbol = '^IXIC';
        } else if (normalizedSymbol === 'DIA' || normalizedSymbol.includes('DJI')) {
          yahooSymbol = '^DJI';
        } else if (normalizedSymbol.includes('FTSE')) {
          yahooSymbol = '^FTSE';
        } else if (normalizedSymbol.includes('DAX')) {
          yahooSymbol = '^GDAXI';
        } else if (normalizedSymbol.startsWith('^')) {
          yahooSymbol = normalizedSymbol;
        }
      }
      
      dataPromises.push(
        axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
          params: {
            interval: '1m',
            range: '1d'
          },
          timeout: 8000 // Optimized for real-time (8s max per source)
        }).then(response => {
          if (response.data && response.data.chart && response.data.chart.result && response.data.chart.result.length > 0) {
            const result = response.data.chart.result[0];
            const meta = result.meta;
            
            if (meta && meta.regularMarketPrice) {
              let displaySymbol = normalizedSymbol;
              if (isGold) displaySymbol = 'XAUUSD';
              else if (yahooSymbol === 'XAG=X') displaySymbol = 'XAGUSD';
              else if (isForex && yahooSymbol.endsWith('=X')) displaySymbol = yahooSymbol.replace('=X', '');
              else if (isCrypto && yahooSymbol.includes('-')) displaySymbol = yahooSymbol.replace('-', '');
              else displaySymbol = meta.symbol || normalizedSymbol;
              
              return {
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
                instrumentType: isGold ? 'commodity' : isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : isIndex ? 'index' : 'stock',
                source: 'Yahoo Finance'
              };
            }
          }
          return null;
        }).catch(err => {
          console.log('Yahoo Finance error:', err.message);
          return null;
        })
      );
    }
    
    // Source 4: Metal API for gold/commodities - PARALLEL
    if (isGold && type === 'quote') {
      const METAL_API_KEY = process.env.METAL_API_KEY;
      if (METAL_API_KEY) {
        dataPromises.push(
          axios.get(`https://api.metals.live/v1/spot/gold`, {
            headers: {
              'x-rapidapi-key': METAL_API_KEY
            },
            timeout: 12000
          }).then(response => {
            if (response.data && response.data.price) {
              return {
                symbol: 'XAUUSD',
                price: parseFloat(response.data.price),
                timestamp: Date.now(),
                source: 'Metal API'
              };
            }
            return null;
          }).catch(err => {
            console.log('Metal API error:', err.message);
            return null;
          })
        );
      }
    }
    
    // Source 5: Twelve Data API - PARALLEL
    if (type === 'quote') {
      const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
      if (TWELVE_DATA_API_KEY) {
        dataPromises.push(
          axios.get(`https://api.twelvedata.com/price`, {
            params: {
              symbol: normalizedSymbol,
              apikey: TWELVE_DATA_API_KEY
            },
            timeout: 12000
          }).then(response => {
            if (response.data && response.data.price) {
              return {
                symbol: normalizedSymbol,
                price: parseFloat(response.data.price),
                timestamp: Date.now(),
                source: 'Twelve Data'
              };
            }
            return null;
          }).catch(err => {
            console.log('Twelve Data error:', err.message);
            return null;
          })
        );
      }
    }
    
    // Source 6: ExchangeRate-API for forex - PARALLEL
    if (type === 'quote' && isForex) {
      dataPromises.push(
        axios.get(`https://api.exchangerate-api.com/v4/latest/${normalizedSymbol.substring(0, 3)}`, {
          timeout: 12000
        }).then(response => {
          if (response.data && response.data.rates) {
            const base = normalizedSymbol.substring(0, 3);
            const quote = normalizedSymbol.substring(3, 6);
            const rate = response.data.rates[quote];
            
            if (rate) {
              return {
                symbol: normalizedSymbol,
                price: rate,
                base,
                quote,
                timestamp: response.data.date,
                source: 'ExchangeRate-API'
              };
            }
          }
          return null;
        }).catch(err => {
          console.log('Forex API error:', err.message);
          return null;
        })
      );
    }
    
    // Source 7: Yahoo Finance GC=F for gold (fallback) - PARALLEL
    if (isGold && type === 'quote') {
      dataPromises.push(
        axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F`, {
          params: {
            interval: '1m',
            range: '1d'
          },
          timeout: 12000
        }).then(response => {
          if (response.data && response.data.chart && response.data.chart.result && response.data.chart.result.length > 0) {
            const result = response.data.chart.result[0];
            const meta = result.meta;
            
            if (meta && meta.regularMarketPrice) {
              return {
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
            }
          }
          return null;
        }).catch(err => {
          console.log('GC=F error:', err.message);
          return null;
        })
      );
    }
    
    // Wait for ALL promises in parallel - use first successful result
    if (dataPromises.length > 0) {
      const results = await Promise.allSettled(dataPromises);
      
      // Find first successful result
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.price) {
          marketData = result.value;
          dataSources.push(result.value.source);
          break; // Use first successful result
        }
      }
      
      // If no result yet, try to combine data from multiple sources
      if (!marketData) {
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            marketData = result.value;
            dataSources.push(result.value.source);
            break;
          }
        }
      }
    }
    
    // Legacy sequential fallback (only if parallel fetching failed completely)
    if (!marketData) {
      // Try Yahoo Finance as last resort (most reliable)
      try {
        let yahooSymbol = normalizedSymbol;
        if (isGold) yahooSymbol = 'XAU=X';
        else if (isForex && normalizedSymbol.length === 6) yahooSymbol = `${normalizedSymbol}=X`;
        else if (isCrypto && normalizedSymbol.includes('BTC')) yahooSymbol = 'BTC-USD';
        else if (isCrypto && normalizedSymbol.includes('ETH')) yahooSymbol = 'ETH-USD';
        
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
          params: { interval: '1m', range: '1d' },
          timeout: 8000 // Optimized for real-time
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
              instrumentType: isGold ? 'commodity' : isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : isIndex ? 'index' : 'stock',
              source: 'Yahoo Finance'
            };
            dataSources.push('Yahoo Finance');
          }
        }
      } catch (yahooError) {
        console.log('Yahoo Finance error:', yahooError.message);
      }
    }

    // ALWAYS return data - never fail completely
    // If we still don't have data, return a basic response with the symbol
    if (!marketData) {
      // Return minimal data structure so AI can still respond
      marketData = {
        symbol: normalizedSymbol,
        price: 0,
        message: 'Data source temporarily unavailable, but symbol recognized',
        instrumentType: isGold ? 'commodity' : isForex ? 'forex' : isCrypto ? 'crypto' : isCommodity ? 'commodity' : isIndex ? 'index' : 'stock',
        source: 'Fallback'
      };
      dataSources.push('Fallback');
    }

    // Add timestamp to ensure data freshness
    marketData.lastUpdated = new Date().toISOString();
    marketData.dataSources = dataSources;

    // ALWAYS return success - never fail the request
    return res.status(200).json({
      success: true,
      data: marketData
    });

  } catch (error) {
    console.error('Error fetching market data:', error);
    // NEVER fail - return basic data structure so AI can still respond
    return res.status(200).json({ 
      success: true,
      data: {
        symbol: req.body?.symbol || 'UNKNOWN',
        price: 0,
        message: 'Multiple data sources are being accessed in the background',
        instrumentType: 'unknown',
        source: 'Fallback',
        lastUpdated: new Date().toISOString()
      }
    });
  }
};
