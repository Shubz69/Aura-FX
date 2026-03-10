/**
 * Financial Modeling Prep – economic calendar, news, treasury/commodity support. Server-side only.
 */

const { getConfig } = require('../config');
const { fetchWithTimeout } = require('./fetchWithTimeout');

const BASE = 'https://financialmodelingprep.com';
const TIMEOUT_MS = 12000;

function buildUrl(path, extraParams = {}) {
  const { fmpApiKey } = getConfig();
  const params = new URLSearchParams({ apikey: fmpApiKey || '', ...extraParams });
  return `${BASE}${path}?${params.toString()}`;
}

function normalizeCalendarItem(item) {
  if (!item || typeof item !== 'object') return null;
  const name = item.name || item.event || item.title || '';
  const date = item.date || item.releaseDate || item.time || '';
  const country = item.country || item.currency || '';
  return { name, date, country, importance: item.importance || item.impact || null, full: item };
}

function normalizeNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    title: item.title || item.headline || '',
    text: item.text || item.content || item.summary || '',
    url: item.url || '',
    publishedDate: item.publishedDate || item.date || item.published || '',
    site: item.site || item.source || '',
    tickers: Array.isArray(item.tickers) ? item.tickers : [].concat(item.symbol || []).filter(Boolean),
  };
}

async function getEconomicCalendar() {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return { ok: false, data: [], error: 'FMP key not configured' };

  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 14);
  const url = buildUrl('/stable/economic-calendar', {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, data: [], error: `FMP calendar ${res.status}` };
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const data = list.slice(0, 50).map(normalizeCalendarItem).filter(Boolean);
    return { ok: true, data };
  } catch (e) {
    console.warn('[trader-deck] FMP calendar error:', e.message || e);
    return { ok: false, data: [], error: e.message || 'FMP request failed' };
  }
}

async function getMarketNews() {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return { ok: false, data: [], error: 'FMP key not configured' };

  const url = buildUrl('/api/v4/general_news', { page: '0', limit: '25' });
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, data: [], error: `FMP news ${res.status}` };
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const data = list.slice(0, 25).map(normalizeNewsItem).filter(Boolean);
    return { ok: true, data };
  } catch (e) {
    console.warn('[trader-deck] FMP news error:', e.message || e);
    return { ok: false, data: [], error: e.message || 'FMP request failed' };
  }
}

async function getTreasuryRates() {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return { ok: false, data: null, error: 'FMP key not configured' };

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  const url = buildUrl('/stable/treasury-rates', {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, data: null, error: `FMP treasury ${res.status}` };
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const latest = list[0];
    return { ok: true, data: latest && typeof latest === 'object' ? latest : null };
  } catch (e) {
    console.warn('[trader-deck] FMP treasury error:', e.message || e);
    return { ok: false, data: null, error: e.message || 'FMP request failed' };
  }
}

async function getFmpData() {
  const [calendar, news, treasury] = await Promise.all([
    getEconomicCalendar(),
    getMarketNews(),
    getTreasuryRates(),
  ]);

  return {
    economicCalendar: calendar.data || [],
    news: news.data || [],
    treasury: treasury.data || null,
    errors: [calendar.error, news.error, treasury.error].filter(Boolean),
  };
}

module.exports = { getEconomicCalendar, getMarketNews, getTreasuryRates, getFmpData };
