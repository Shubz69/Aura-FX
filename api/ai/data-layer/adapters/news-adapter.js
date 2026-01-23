/**
 * News Adapter
 * Fetches market news from multiple sources with caching
 */

const axios = require('axios');
const { DataAdapter, CONFIG } = require('../index');
const { getCached, setCached } = require('../../../cache');

class NewsAdapter extends DataAdapter {
  constructor() {
    super('MarketNews', { timeout: CONFIG.TIMEOUTS.ADAPTER_DEFAULT });
  }

  // Fetch from Finnhub news
  async fetchFinnhubNews(symbol, category = 'general') {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return null;

    try {
      const response = await axios.get('https://finnhub.io/api/v1/news', {
        params: { 
          category: category,
          token: apiKey 
        },
        timeout: 4000
      });

      if (response.data && Array.isArray(response.data)) {
        return response.data.slice(0, 10).map(item => ({
          headline: item.headline,
          summary: item.summary,
          source: item.source,
          url: item.url,
          datetime: new Date(item.datetime * 1000).toISOString(),
          category: item.category,
          related: item.related,
          provider: 'Finnhub'
        }));
      }
    } catch (e) {
      console.log('Finnhub news error:', e.message);
    }
    return null;
  }

  // Fetch company-specific news from Finnhub
  async fetchCompanyNews(symbol) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return null;

    try {
      const today = new Date();
      const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
      
      const response = await axios.get('https://finnhub.io/api/v1/company-news', {
        params: {
          symbol: symbol,
          from: weekAgo.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
          token: apiKey
        },
        timeout: 4000
      });

      if (response.data && Array.isArray(response.data)) {
        return response.data.slice(0, 10).map(item => ({
          headline: item.headline,
          summary: item.summary,
          source: item.source,
          url: item.url,
          datetime: new Date(item.datetime * 1000).toISOString(),
          related: item.related,
          provider: 'Finnhub'
        }));
      }
    } catch (e) {
      console.log('Finnhub company news error:', e.message);
    }
    return null;
  }

  // Generate fallback news structure
  generateFallbackNews(symbol) {
    return [{
      headline: `Market update for ${symbol || 'global markets'}`,
      summary: 'Real-time news feed is temporarily unavailable. Check financial news sites for latest updates.',
      source: 'System',
      datetime: new Date().toISOString(),
      provider: 'Fallback',
      note: 'Please verify news from official sources like Bloomberg, Reuters, or CNBC'
    }];
  }

  async fetch(params) {
    const { symbol, category = 'general', limit = 10 } = params;
    const cacheKey = `news:${symbol || 'general'}:${category}`;
    
    // Try cache first
    const cached = getCached(cacheKey, CONFIG.CACHE_TTL.NEWS);
    if (cached) {
      return { news: cached.slice(0, limit), cached: true, source: 'cache' };
    }

    // Try to fetch news
    let news = null;

    // If symbol provided, try company-specific news first
    if (symbol) {
      news = await this.fetchCompanyNews(symbol);
    }

    // Fallback to general news
    if (!news || news.length === 0) {
      news = await this.fetchFinnhubNews(symbol, category);
    }

    // Final fallback
    if (!news || news.length === 0) {
      news = this.generateFallbackNews(symbol);
    }

    // Cache and return
    if (news.length > 0 && news[0].provider !== 'Fallback') {
      setCached(cacheKey, news);
    }

    return {
      news: news.slice(0, limit),
      source: news[0]?.provider || 'Unknown',
      cached: false
    };
  }
}

module.exports = NewsAdapter;
