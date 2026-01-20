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
    
    // Source 1: Alpha Vantage News (if API key available)
    try {
      const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
      if (ALPHA_VANTAGE_API_KEY) {
        const response = await axios.get(`https://www.alphavantage.co/query`, {
          params: {
            function: 'NEWS_SENTIMENT',
            tickers: symbol || 'FOREX',
            apikey: ALPHA_VANTAGE_API_KEY,
            limit: 50
          },
          timeout: 5000
        });
        
        if (response.data && response.data.feed) {
          news = response.data.feed.map(item => ({
            title: item.title,
            url: item.url,
            source: item.source,
            time: item.time_published,
            summary: item.summary,
            sentiment: item.overall_sentiment_label,
            relevance: item.relevance_score
          }));
        }
      }
    } catch (avError) {
      console.log('Alpha Vantage news error:', avError.message);
    }
    
    // Source 2: Finnhub News (if API key available)
    if (news.length === 0) {
      try {
        const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
        if (FINNHUB_API_KEY) {
          const response = await axios.get(`https://finnhub.io/api/v1/news`, {
            params: {
              category: 'general',
              token: FINNHUB_API_KEY
            },
            timeout: 5000
          });
          
          if (response.data && Array.isArray(response.data)) {
            news = response.data.slice(0, 20).map(item => ({
              title: item.headline,
              url: item.url,
              source: item.source,
              time: new Date(item.datetime * 1000).toISOString(),
              summary: item.summary || '',
              category: item.category
            }));
          }
        }
      } catch (fhError) {
        console.log('Finnhub news error:', fhError.message);
      }
    }
    
    // Source 3: NewsAPI (if API key available)
    if (news.length === 0) {
      try {
        const NEWS_API_KEY = process.env.NEWS_API_KEY;
        if (NEWS_API_KEY) {
          const response = await axios.get(`https://newsapi.org/v2/everything`, {
            params: {
              q: symbol ? `${symbol} OR forex OR trading` : 'forex trading markets',
              sortBy: 'publishedAt',
              language: 'en',
              pageSize: 20,
              apiKey: NEWS_API_KEY
            },
            timeout: 5000
          });
          
          if (response.data && response.data.articles) {
            news = response.data.articles.map(item => ({
              title: item.title,
              url: item.url,
              source: item.source.name,
              time: item.publishedAt,
              summary: item.description || ''
            }));
          }
        }
      } catch (newsApiError) {
        console.log('NewsAPI error:', newsApiError.message);
      }
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
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch market news' 
    });
  }
};
