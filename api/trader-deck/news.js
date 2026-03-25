/**
 * GET /api/trader-deck/news
 * Returns market news from Finnhub + FMP.
 * Cached 5 minutes server-side.
 */

require('../utils/suppress-warnings');

const { getConfig } = require('./config');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getCached, setCached } = require('../cache');

const CACHE_KEY = 'trader-deck:news:v2';
const CACHE_TTL_MS = Math.min(300, Math.max(60, parseInt(process.env.TRADER_DECK_NEWS_CACHE_SEC, 10) || 90)) * 1000;
const SOURCE_SUFFIX_RE = /\s*[-–—,]\s*(reuters|bloomberg|forex factory|financial times|wsj|cnbc|yahoo finance|marketwatch)\s*$/i;
const ATTRIBUTION_RE = /\b(according to|reported by|via)\b/gi;

function cleanInsightText(v) {
  return String(v || '')
    .replace(SOURCE_SUFFIX_RE, '')
    .replace(ATTRIBUTION_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalise(item, source) {
  return {
    headline: cleanInsightText(item.headline || item.title || ''),
    summary: cleanInsightText(item.summary || item.text || item.content || ''),
    url: item.url || '',
    source: null,
    publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : (item.publishedDate || item.date || null),
    category: item.category || 'market',
    related: Array.isArray(item.related) ? item.related : [],
    image: item.image || item.img || null,
  };
}

function parseIsoDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function withinDateWindow(article, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  const t = article?.publishedAt ? new Date(article.publishedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  const day = new Date(t).toISOString().slice(0, 10);
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
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

async function fromFMP(options = {}) {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return [];
  try {
    const fromDate = parseIsoDateOnly(options.from);
    const toDate = parseIsoDateOnly(options.to);
    const pageCap = fromDate || toDate ? 24 : 1;
    const out = [];
    for (let page = 0; page < pageCap; page += 1) {
      const url = `https://financialmodelingprep.com/api/v4/general_news?page=${page}&limit=50&apikey=${encodeURIComponent(fmpApiKey)}`;
      const res = await fetchWithTimeout(url, {}, 10000);
      if (!res.ok) break;
      const raw = await res.json();
      const list = (Array.isArray(raw) ? raw : []).map((n) => normalise(n, 'FMP'));
      if (list.length === 0) break;
      out.push(...list);
      if (fromDate) {
        const oldest = list
          .map((n) => (n.publishedAt ? new Date(n.publishedAt).getTime() : NaN))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b)[0];
        if (Number.isFinite(oldest)) {
          const oldestDay = new Date(oldest).toISOString().slice(0, 10);
          if (oldestDay < fromDate) break;
        }
      }
    }
    return out.filter((n) => withinDateWindow(n, fromDate, toDate));
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
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(text)) !== null) {
      const itemHtml = m[1] || '';
      const titleMatch =
        /<title><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(itemHtml) ||
        /<title>(.*?)<\/title>/i.exec(itemHtml);
      const linkMatch =
        /<link><!\[CDATA\[(.*?)\]\]><\/link>/i.exec(itemHtml) ||
        /<link>(.*?)<\/link>/i.exec(itemHtml);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(itemHtml);
      const headline = (titleMatch?.[1] || '').trim();
      const link = (linkMatch?.[1] || '').trim();
      const publishedAt = (pubDateMatch?.[1] || '').trim() || null;
      if (headline) {
        items.push(
          normalise(
            {
              headline,
              url: link,
              publishedDate: publishedAt,
              datetime: undefined,
            },
            'Yahoo Finance'
          )
        );
      }
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

  const fromDate = parseIsoDateOnly(req.query?.from);
  const toDate = parseIsoDateOnly(req.query?.to);
  const [general, fmp, forex, yahoo] = await Promise.allSettled([
    fromFinnhub(),
    fromFMP({ from: fromDate, to: toDate }),
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
    .filter((n) => withinDateWindow(n, fromDate, toDate))
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
    .slice(0, fromDate || toDate ? 500 : 40);

  const payload = {
    articles: merged,
    count: merged.length,
    updatedAt: new Date().toISOString(),
  };
  setCached(CACHE_KEY, payload, CACHE_TTL_MS);
  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json({ success: true, ...payload, cached: false });
};
