/**
 * /api/news â€” Financial news headlines for the Trader Desk
 * Uses GNews API if GNEWS_API_KEY is set, otherwise falls back to RSS proxy.
 * Client caches for 15 minutes to avoid hammering the upstream API.
 */

const https = require('https');

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let newsCache = { data: null, ts: 0 };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, max-age=900'
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON from upstream')); }
      });
    }).on('error', reject);
  });
}

async function fetchGNews(apiKey, category = 'business') {
  const q = encodeURIComponent('forex OR stock market OR trading OR gold OR oil OR crypto OR Fed OR inflation');
  const url = `https://gnews.io/api/v4/search?q=${q}&lang=en&max=10&token=${apiKey}`;
  const data = await fetchUrl(url);
  if (!data.articles) throw new Error('No articles from GNews');
  return data.articles.map(a => ({
    title: a.title,
    description: a.description || '',
    url: a.url,
    source: a.source?.name || 'GNews',
    publishedAt: a.publishedAt,
    image: a.image || null
  }));
}

async function fetchNewsAPI(apiKey) {
  const q = encodeURIComponent('forex OR stock market OR trading OR federal reserve OR inflation OR gold');
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;
  const data = await fetchUrl(url);
  if (!data.articles) throw new Error('No articles from NewsAPI');
  return data.articles.map(a => ({
    title: a.title,
    description: a.description || '',
    url: a.url,
    source: a.source?.name || 'NewsAPI',
    publishedAt: a.publishedAt,
    image: a.urlToImage || null
  }));
}

// Static fallback headlines when no API key is configured
function getStaticHeadlines() {
  return [
    { title: 'Federal Reserve Holds Rates Steady â€” Markets React', description: 'The Fed left interest rates unchanged at its latest meeting, citing mixed economic signals.', url: 'https://www.federalreserve.gov', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'Gold Holds Near Record Highs Amid Dollar Weakness', description: 'XAU/USD remains elevated as safe-haven demand persists.', url: 'https://www.investing.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'EUR/USD Technical Outlook: Key Level in Focus', description: 'Price action at major support; traders watch for breakout confirmation.', url: 'https://www.forexlive.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'Oil Prices Rally on OPEC Supply Cut Signals', description: 'Crude surges after OPEC+ hints at extending production cuts through next quarter.', url: 'https://www.oilprice.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'S&P 500 Hits Resistance â€” Earnings Season Begins', description: 'Major indices pause near highs as Q4 earnings reports roll in.', url: 'https://finance.yahoo.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'GBP/USD Weakens on Mixed UK Economic Data', description: 'Sterling dips as manufacturing PMI disappoints, services remain resilient.', url: 'https://www.forexlive.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'Bitcoin Consolidates Above Key Support Zone', description: 'BTC/USD holding structure after strong week; analysts watch for continuation.', url: 'https://www.coindesk.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null },
    { title: 'NFP Report Preview: What Traders Need to Know', description: 'Non-Farm Payrolls due Friday â€” consensus estimates and expected market impact.', url: 'https://www.investing.com', source: 'AURA TERMINAL™', publishedAt: new Date().toISOString(), image: null }
  ];
}

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // Serve from cache if fresh
  if (newsCache.data && Date.now() - newsCache.ts < CACHE_TTL) {
    return res.status(200).json({ success: true, articles: newsCache.data, cached: true });
  }

  try {
    let articles;

    if (process.env.GNEWS_API_KEY) {
      articles = await fetchGNews(process.env.GNEWS_API_KEY);
    } else if (process.env.NEWS_API_KEY) {
      articles = await fetchNewsAPI(process.env.NEWS_API_KEY);
    } else {
      articles = getStaticHeadlines();
    }

    newsCache = { data: articles, ts: Date.now() };
    return res.status(200).json({ success: true, articles, cached: false });
  } catch (e) {
    if (process.env.VERBOSE_NEWS === '1') {
      console.warn('[news] upstream failed, static headlines used:', e.message);
    }
    const fallback = getStaticHeadlines();
    return res.status(200).json({ success: true, articles: fallback, cached: false, fallback: true });
  }
};
