/**
 * GET /api/trader-deck/news
 * Returns market news from Finnhub + FMP.
 * Cached 5 minutes server-side.
 */

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getCached, setCached } = require('../cache');

const CACHE_KEY = 'trader-deck:news:v2';
const CACHE_TTL_MS = Math.min(300, Math.max(60, parseInt(process.env.TRADER_DECK_NEWS_CACHE_SEC, 10) || 90)) * 1000;

function normalise(item, source) {
  return {
    headline: item.headline || item.title || '',
    summary: item.summary || item.text || item.content || '',
    url: item.url || '',
    source: item.source || item.site || source,
    publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : (item.publishedDate || item.date || null),
    category: item.category || 'market',
    related: Array.isArray(item.related) ? item.related : [],
    image: item.image || item.img || null,
  };
}

async function fromFinnhub() {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) return [];
  try {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(finnhubApiKey)}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return [];
    const raw = await res.json();
    return (Array.isArray(raw) ? raw : []).slice(0, 20).map((n) => normalise(n, 'Finnhub'));
  } catch (e) {
    console.warn('[trader-deck/news] Finnhub error:', e.message);
    return [];
  }
}

async function fromFMP() {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return [];
  try {
    const url = `https://financialmodelingprep.com/api/v4/general_news?page=0&limit=20&apikey=${encodeURIComponent(fmpApiKey)}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return [];
    const raw = await res.json();
    return (Array.isArray(raw) ? raw : []).slice(0, 20).map((n) => normalise(n, 'FMP'));
  } catch (e) {
    console.warn('[trader-deck/news] FMP error:', e.message);
    return [];
  }
}

async function fromFinnhubForex() {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) return [];
  try {
    const url = `https://finnhub.io/api/v1/news?category=forex&token=${encodeURIComponent(finnhubApiKey)}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return [];
    const raw = await res.json();
    return (Array.isArray(raw) ? raw : []).slice(0, 15).map((n) => ({ ...normalise(n, 'Finnhub'), category: 'forex' }));
  } catch (e) {
    return [];
  }
}

/** Yahoo Finance RSS — no API key; keeps headlines fresh when Finnhub/FMP are rate-limited */
async function fromYahooRss() {
  try {
    const url =
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,GC=F,EURUSD=X&region=US&lang=en-US';
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return [];
    const text = await res.text();
    const items = [];
    const re = /<title><!\[CDATA\[(.*?)\]\]><\/title>/g;
    let m;
    let i = 0;
    while ((m = re.exec(text)) !== null) {
      if (i++ === 0) continue;
      const headline = (m[1] || '').trim();
      if (headline) items.push(normalise({ headline, datetime: Math.floor(Date.now() / 1000) }, 'Yahoo Finance'));
      if (items.length >= 12) break;
    }
    return items;
  } catch (e) {
    console.warn('[trader-deck/news] Yahoo RSS error:', e.message);
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const forceRefresh = req.query && (req.query.refresh === '1' || req.query.refresh === 'true');
  const cached = forceRefresh ? null : getCached(CACHE_KEY, CACHE_TTL_MS);
  if (cached) {
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ success: true, ...cached, cached: true });
  }

  const [general, fmp, forex, yahoo] = await Promise.allSettled([
    fromFinnhub(),
    fromFMP(),
    fromFinnhubForex(),
    fromYahooRss(),
  ]);

  const generalItems = general.status === 'fulfilled' ? general.value : [];
  const fmpItems = fmp.status === 'fulfilled' ? fmp.value : [];
  const forexItems = forex.status === 'fulfilled' ? forex.value : [];
  const yahooItems = yahoo.status === 'fulfilled' ? yahoo.value : [];

  // Merge, deduplicate by headline, sort by date
  const seen = new Set();
  const merged = [...generalItems, ...fmpItems, ...forexItems, ...yahooItems]
    .filter((n) => {
      if (!n.headline || seen.has(n.headline)) return false;
      seen.add(n.headline);
      return true;
    })
    .sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 40);

  const payload = {
    articles: merged,
    count: merged.length,
    updatedAt: new Date().toISOString(),
  };
  setCached(CACHE_KEY, payload, CACHE_TTL_MS);
  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json({ success: true, ...payload, cached: false });
};
