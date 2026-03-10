/**
 * Finnhub API – market news, forex/quote context. Server-side only.
 */

const { getConfig } = require('../config');
const { fetchWithTimeout } = require('./fetchWithTimeout');

const BASE = 'https://finnhub.io/api/v1';
const TIMEOUT_MS = 10000;

function normalizeNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    headline: item.headline || item.title || '',
    summary: item.summary || '',
    source: item.source || '',
    url: item.url || '',
    time: item.datetime || item.time || null,
    category: item.category || 'general',
    related: item.related || [],
  };
}

async function getMarketNews() {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) return { ok: false, data: [], error: 'Finnhub key not configured' };

  const url = `${BASE}/news?category=general&token=${encodeURIComponent(finnhubApiKey)}`;
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, data: [], error: `Finnhub ${res.status}` };
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const data = list.slice(0, 30).map(normalizeNewsItem).filter(Boolean);
    return { ok: true, data };
  } catch (e) {
    console.warn('[trader-deck] Finnhub news error:', e.message || e);
    return { ok: false, data: [], error: e.message || 'Finnhub request failed' };
  }
}

async function getQuote(symbol) {
  const { finnhubApiKey } = getConfig();
  if (!finnhubApiKey) return { ok: false, data: null, error: 'Finnhub key not configured' };

  const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubApiKey)}`;
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, data: null, error: `Finnhub ${res.status}` };
    const data = await res.json();
    return {
      ok: true,
      data: data && typeof data === 'object' ? { c: data.c, d: data.d, dp: data.dp, o: data.o, h: data.h, l: data.l } : null,
    };
  } catch (e) {
    console.warn('[trader-deck] Finnhub quote error:', symbol, e.message || e);
    return { ok: false, data: null, error: e.message || 'Finnhub request failed' };
  }
}

async function getFinnhubData() {
  const [news, quoteUsdEur, quoteGold] = await Promise.all([
    getMarketNews(),
    getQuote('OANDA:EUR_USD'),
    getQuote('OANDA:XAU_USD'),
  ]);

  return {
    news: news.data || [],
    forex: { eurUsd: quoteUsdEur.data, gold: quoteGold.data },
    errors: [news.error, quoteUsdEur.error, quoteGold.error].filter(Boolean),
  };
}

module.exports = { getMarketNews, getQuote, getFinnhubData };
