// Fundamentals Data Endpoint
// Fetches earnings, financials, and fundamental data for stocks

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

  try {
    const { symbol } = req.body || req.query || {};

    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol is required' });
    }

    let fundamentals = null;

    // Try Alpha Vantage for fundamentals (if API key available)
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (ALPHA_VANTAGE_API_KEY) {
      try {
        // Get company overview (financials, earnings, etc.)
        const overviewResponse = await axios.get('https://www.alphavantage.co/query', {
          params: {
            function: 'OVERVIEW',
            symbol: symbol,
            apikey: ALPHA_VANTAGE_API_KEY
          },
          timeout: 8000
        });

        if (overviewResponse.data && overviewResponse.data.Symbol) {
          const data = overviewResponse.data;
          fundamentals = {
            symbol: data.Symbol,
            name: data.Name,
            description: data.Description,
            sector: data.Sector,
            industry: data.Industry,
            marketCap: data.MarketCapitalization,
            peRatio: data.PERatio,
            eps: data.EPS,
            dividendYield: data.DividendYield,
            beta: data.Beta,
            fiftyTwoWeekHigh: data['52WeekHigh'],
            fiftyTwoWeekLow: data['52WeekLow'],
            revenue: data.RevenueTTM,
            profitMargin: data.ProfitMargin,
            operatingMargin: data.OperatingMarginTTM,
            returnOnAssets: data.ReturnOnAssetsTTM,
            returnOnEquity: data.ReturnOnEquityTTM,
            revenuePerShare: data.RevenuePerShareTTM,
            quarterlyEarningsGrowth: data.QuarterlyEarningsGrowthYOY,
            quarterlyRevenueGrowth: data.QuarterlyRevenueGrowthYOY,
            analystTargetPrice: data.AnalystTargetPrice,
            source: 'Alpha Vantage'
          };
        }
      } catch (error) {
        console.error('Alpha Vantage fundamentals error:', error.message);
      }
    }

    // Try Finnhub for earnings (if API key available)
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (FINNHUB_API_KEY && !fundamentals) {
      try {
        const earningsResponse = await axios.get('https://finnhub.io/api/v1/stock/earnings', {
          params: {
            symbol: symbol,
            token: FINNHUB_API_KEY
          },
          timeout: 8000
        });

        if (earningsResponse.data && earningsResponse.data.length > 0) {
          const latestEarnings = earningsResponse.data[0];
          fundamentals = {
            symbol: symbol,
            earnings: earningsResponse.data.slice(0, 4).map(e => ({
              period: e.period,
              actual: e.actual,
              estimate: e.estimate,
              surprise: e.surprise,
              surprisePercent: e.surprisePercent
            })),
            source: 'Finnhub'
          };
        }
      } catch (error) {
        console.error('Finnhub earnings error:', error.message);
      }
    }

    // Fallback: Try Yahoo Finance (no API key needed)
    if (!fundamentals) {
      try {
        // Yahoo Finance doesn't have a direct fundamentals API
        // Would need web scraping or use a different approach
        // For now, return basic structure
        fundamentals = {
          symbol: symbol,
          note: 'Fundamentals data not available from current sources. Consider adding Alpha Vantage or Finnhub API keys.',
          source: 'none'
        };
      } catch (error) {
        console.error('Yahoo Finance fundamentals error:', error.message);
      }
    }

    return res.status(200).json({
      success: true,
      symbol,
      fundamentals: fundamentals || {
        symbol,
        note: 'Fundamentals data not available. Add ALPHA_VANTAGE_API_KEY or FINNHUB_API_KEY for access.',
        source: 'none'
      }
    });

  } catch (error) {
    console.error('Fundamentals endpoint error:', error);
    return res.status(200).json({
      success: true,
      symbol: req.body?.symbol || req.query?.symbol,
      fundamentals: {
        note: 'Fundamentals data temporarily unavailable',
        source: 'none'
      }
    });
  }
};
