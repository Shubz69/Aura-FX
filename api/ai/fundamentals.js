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

    const { toCanonical, isCboeEuropeUkListedEquity, isCboeAustraliaListedEquity } = require('./utils/symbol-registry');
    const canon = toCanonical(symbol);
    if (isCboeEuropeUkListedEquity(canon)) {
      return res.status(200).json({
        success: true,
        symbol: canon,
        venue: 'cboe_europe_equities_uk',
        fundamentals: {
          symbol: canon,
          source: 'not_in_scope',
          note:
            'Fundamentals / analysis / regulatory bundles are not in scope for Cboe Europe Equities UK in this product pass (Twelve Data narrow reference + core only). Do not substitute LSE/AIM fundamentals for the same ticker on a different venue.',
        },
      });
    }

    let fundamentals = null;

    // Twelve Data (equities) — DB-first when ingest has populated datasets; else fetch once.
    const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
    if (TWELVE_DATA_API_KEY) {
      try {
        const { supportsEquityTwelveDataDatasets } = require('./utils/symbol-registry');
        const { getFundamentalsBundleForSymbol } = require('../market-data/equities/equityDataLayer');
        if (supportsEquityTwelveDataDatasets(toCanonical(symbol))) {
          const c = toCanonical(symbol);
          const cboeAuVenue = isCboeAustraliaListedEquity(c);
          let tdFund = await getFundamentalsBundleForSymbol(symbol, { allowNetwork: false });
          if (
            !cboeAuVenue &&
            (!tdFund || (!tdFund.name && !tdFund.marketCap))
          ) {
            tdFund = await getFundamentalsBundleForSymbol(symbol, { allowNetwork: true });
          }
          if (tdFund && (tdFund.name || tdFund.marketCap)) {
            fundamentals = tdFund;
          }
        }
      } catch (e) {
        console.error('Twelve Data fundamentals error:', e.message);
      }
    }

    // Try Alpha Vantage for fundamentals (if API key available)
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (ALPHA_VANTAGE_API_KEY && !fundamentals && !isCboeAustraliaListedEquity(canon)) {
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
    if (FINNHUB_API_KEY && !fundamentals && !isCboeAustraliaListedEquity(canon)) {
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
        if (isCboeAustraliaListedEquity(canon)) {
          fundamentals = {
            symbol: canon,
            source: 'twelvedata_db_pending',
            note:
              'Cboe Australia (.CXAC) fundamentals use Twelve Data plus scheduled ingest and DB-first reads only. Non-TD providers are not used here to avoid mixing with ASX venue data. Run /api/cron/cboe-au-twelvedata-ingest or request with an internal tool that sets allowNetwork on equity datasets.',
          };
        } else {
          fundamentals = {
            symbol: symbol,
            note: 'Fundamentals data not available from current sources. Consider adding Alpha Vantage or Finnhub API keys.',
            source: 'none'
          };
        }
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
