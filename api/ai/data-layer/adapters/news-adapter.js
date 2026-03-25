/**
 * News Adapter
 * Fetches market news from multiple sources with caching
 */

let axios;
try {
  axios = require('axios');
} catch (_) {
  axios = require('axios/dist/node/axios.cjs');
}
const { DataAdapter, CONFIG } = require('../index');
const { getCached, setCached } = require('../../../cache');

class NewsAdapter extends DataAdapter {
  constructor() {
    super('MarketNews', { timeout: CONFIG.TIMEOUTS.ADAPTER_DEFAULT });
  }

  // Fetch from News API (primary - financial/macro headlines)
  async fetchNewsAPI(symbol, category = 'general') {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) return null;

    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000); // last 24h
    const q = symbol
      ? `(${symbol} OR forex OR "interest rate" OR "central bank" OR inflation OR GDP OR NFP)`
      : '(forex OR stocks OR "interest rate" OR "central bank" OR inflation OR markets)';

    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q,
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0],
          sortBy: 'publishedAt',
          pageSize: 10,
          language: 'en',
          apiKey
        },
        timeout: 5000
      });

      if (!response.data || response.data.status !== 'ok' || !Array.isArray(response.data.articles)) {
        return null;
      }

      return response.data.articles.filter(a => a.title).slice(0, 10).map(a => ({
        headline: a.title,
        summary: a.description || '',
        source: a.source?.name || 'News API',
        url: a.url,
        datetime: a.publishedAt || new Date().toISOString(),
        provider: 'News API'
      }));
    } catch (e) {
      console.warn('News API error:', e.message);
      return null;
    }
  }

  // Fetch from Finnhub news (fallback)
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

    // Primary: News API (financial/macro). Fallback: Finnhub (general then company)
    let news = await this.fetchNewsAPI(symbol, category);
    if (!news || news.length === 0) {
      if (symbol) news = await this.fetchCompanyNews(symbol);
      if (!news || news.length === 0) {
        news = await this.fetchFinnhubNews(symbol, category);
      }
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
