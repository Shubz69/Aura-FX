// Real-time Market News API
// Fetches breaking news from Bloomberg, Reuters, and other sources

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
    const { symbol, timeframe = '1h' } = req.body || req.query || {};
    
    let news = [];
    
    // Fetch from ALL sources in PARALLEL - use first successful response
    // This ensures we always get data even if some sources are slow or fail
    const newsPromises = [];
    
    // Source 1: Alpha Vantage News (if API key available)
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (ALPHA_VANTAGE_API_KEY) {
      newsPromises.push(
        axios.get(`https://www.alphavantage.co/query`, {
          params: {
            function: 'NEWS_SENTIMENT',
            tickers: symbol || 'FOREX',
            apikey: ALPHA_VANTAGE_API_KEY,
            limit: 50
          },
          timeout: 12000 // Increased timeout
        }).then(response => {
          if (response.data && response.data.feed) {
            return response.data.feed.map(item => ({
              title: item.title,
              url: item.url,
              source: item.source,
              time: item.time_published,
              summary: item.summary,
              sentiment: item.overall_sentiment_label,
              relevance: item.relevance_score
            }));
          }
          return [];
        }).catch(err => {
          console.log('Alpha Vantage news error:', err.message);
          return [];
        })
      );
    }
    
    // Source 2: Finnhub News (if API key available)
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (FINNHUB_API_KEY) {
      newsPromises.push(
        axios.get(`https://finnhub.io/api/v1/news`, {
          params: {
            category: 'general',
            token: FINNHUB_API_KEY
          },
          timeout: 12000 // Increased timeout
        }).then(response => {
          if (response.data && Array.isArray(response.data)) {
            return response.data.slice(0, 20).map(item => ({
              title: item.headline,
              url: item.url,
              source: item.source,
              time: new Date(item.datetime * 1000).toISOString(),
              summary: item.summary || '',
              category: item.category
            }));
          }
          return [];
        }).catch(err => {
          console.log('Finnhub news error:', err.message);
          return [];
        })
      );
    }
    
    // Source 3: NewsAPI (if API key available)
    const NEWS_API_KEY = process.env.NEWS_API_KEY;
    if (NEWS_API_KEY) {
      newsPromises.push(
        axios.get(`https://newsapi.org/v2/everything`, {
          params: {
            q: symbol ? `${symbol} OR forex OR trading` : 'forex trading markets',
            sortBy: 'publishedAt',
            language: 'en',
            pageSize: 20,
            apiKey: NEWS_API_KEY
          },
          timeout: 12000 // Increased timeout
        }).then(response => {
          if (response.data && response.data.articles) {
            return response.data.articles.map(item => ({
              title: item.title,
              url: item.url,
              source: item.source.name,
              time: item.publishedAt,
              summary: item.description || ''
            }));
          }
          return [];
        }).catch(err => {
          console.log('NewsAPI error:', err.message);
          return [];
        })
      );
    }
    
    // Wait for ALL promises - use first successful result, combine all results
    if (newsPromises.length > 0) {
      const results = await Promise.allSettled(newsPromises);
      // Combine all successful results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
          news = news.concat(result.value);
        }
      }
      // Remove duplicates based on title
      const seen = new Set();
      news = news.filter(item => {
        const key = item.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    
    // Filter recent news based on timeframe
    const now = Date.now();
    const timeframeMs = timeframe === '1h' ? 3600000 : 
                        timeframe === '24h' ? 86400000 : 
                        timeframe === '7d' ? 604800000 : 3600000;
    
    const recentNews = news.filter(item => {
      const itemTime = new Date(item.time).getTime();
      return (now - itemTime) < timeframeMs;
    });
    
    // ALWAYS return success - even if no news, return empty array (don't fail)
    return res.status(200).json({
      success: true,
      data: {
        news: recentNews.length > 0 ? recentNews : news.slice(0, 10),
        count: recentNews.length > 0 ? recentNews.length : news.length,
        timeframe,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching market news:', error);
    // NEVER fail - return empty news array so AI can still respond
    return res.status(200).json({ 
      success: true,
      data: {
        news: [],
        count: 0,
        timeframe: req.body?.timeframe || '1h',
        timestamp: new Date().toISOString(),
        note: 'News sources temporarily unavailable'
      }
    });
  }
};
