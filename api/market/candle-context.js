'use strict';

const axios = require('axios');
const { normalizeInterval } = require('./chart-history');
const { analyze: analyzeSentiment } = require('../ai/engines/sentiment-engine');

const CONTEXT_TTL_MS = 10 * 60 * 1000;
const responseCache = new Map();
const inFlight = new Map();

function intervalSeconds(interval) {
  const i = normalizeInterval(interval);
  if (i === '1') return 60;
  if (i === '5') return 5 * 60;
  if (i === '15') return 15 * 60;
  if (i === '30') return 30 * 60;
  if (i === '45') return 45 * 60;
  if (i === '60') return 60 * 60;
  if (i === '240') return 4 * 60 * 60;
  if (i === '1D') return 24 * 60 * 60;
  if (i === '1W') return 7 * 24 * 60 * 60;
  if (i === '1M') return 30 * 24 * 60 * 60;
  if (i === '1Y') return 365 * 24 * 60 * 60;
  return 60 * 60;
}

function toIsoDate(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function sessionLabelForTs(tsSec) {
  const d = new Date(Number(tsSec) * 1000);
  const h = d.getUTCHours();
  if (h >= 0 && h < 7) return 'Asia session';
  if (h >= 7 && h < 13) return 'London session';
  if (h >= 13 && h < 22) return 'New York session';
  return 'After hours';
}

function validNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function signedPct(open, close) {
  if (!Number.isFinite(open) || !Number.isFinite(close) || Math.abs(open) < 1e-12) return null;
  return ((close - open) / open) * 100;
}

function cacheKey(params) {
  return JSON.stringify({
    symbol: String(params.symbol || '').toUpperCase(),
    interval: normalizeInterval(params.interval),
    candleTime: Number(params.candleTime || 0),
  });
}

function setCached(key, value, ttlMs = CONTEXT_TTL_MS) {
  responseCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

function getCached(key) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.value;
}

async function fetchCalendar(baseUrl, authHeader, fromDate, toDate) {
  try {
    const { data } = await axios.get(`${baseUrl}/api/trader-deck/economic-calendar`, {
      params: { from: fromDate, to: toDate },
      headers: authHeader ? { Authorization: authHeader } : {},
      timeout: 10000,
    });
    const rows = Array.isArray(data?.events) ? data.events : [];
    return rows.slice(0, 80);
  } catch (_) {
    return [];
  }
}

async function fetchNews(baseUrl, authHeader, fromDate, toDate) {
  try {
    const { data } = await axios.get(`${baseUrl}/api/trader-deck/news`, {
      params: { from: fromDate, to: toDate },
      headers: authHeader ? { Authorization: authHeader } : {},
      timeout: 10000,
    });
    const rows = Array.isArray(data?.articles) ? data.articles : [];
    return rows.slice(0, 120);
  } catch (_) {
    return [];
  }
}

function buildCatalyst(events, news) {
  if ((!events || events.length === 0) && (!news || news.length === 0)) {
    return 'No major catalyst found';
  }
  if (events.length > 0) {
    const top = events[0];
    const title = String(top?.event || top?.title || '').trim();
    const impact = String(top?.impact || '').trim().toLowerCase();
    if (title) return `${impact ? `${impact} impact ` : ''}calendar event: ${title}`;
  }
  const firstHeadline = String(news?.[0]?.headline || '').trim();
  if (firstHeadline) return `headline flow: ${firstHeadline}`;
  return 'No major catalyst found';
}

async function resolveContext(params, req) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  const interval = normalizeInterval(params.interval);
  const candleTime = validNum(params.candleTime);
  const open = validNum(params.open);
  const high = validNum(params.high);
  const low = validNum(params.low);
  const close = validNum(params.close);
  const volume = validNum(params.volume);

  if (!symbol) throw Object.assign(new Error('symbol is required'), { statusCode: 400 });
  if (!Number.isFinite(candleTime)) throw Object.assign(new Error('candleTime is required'), { statusCode: 400 });
  if (![open, high, low, close].every(Number.isFinite)) {
    throw Object.assign(new Error('open/high/low/close are required numeric values'), { statusCode: 400 });
  }

  const spanSec = intervalSeconds(interval);
  const startSec = Math.floor(candleTime);
  const endSec = startSec + spanSec;
  const contextFrom = startSec - Math.max(2 * 3600, spanSec);
  const contextTo = endSec + Math.max(2 * 3600, spanSec);
  const fromDate = toIsoDate(contextFrom);
  const toDate = toIsoDate(contextTo);

  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const baseUrl = `${proto}://${host}`;
  const auth = req.headers.authorization || '';

  const [eventsRaw, newsRaw] = await Promise.all([
    fetchCalendar(baseUrl, auth, fromDate, toDate),
    fetchNews(baseUrl, auth, fromDate, toDate),
  ]);

  const events = eventsRaw
    .filter((e) => {
      const ts = Number(e?.timestamp);
      return Number.isFinite(ts) && ts >= contextFrom * 1000 && ts <= contextTo * 1000;
    })
    .slice(0, 6)
    .map((e) => ({
      title: String(e?.event || e?.title || 'Economic event'),
      impact: String(e?.impact || 'low'),
      time: e?.timestamp ? new Date(Number(e.timestamp)).toISOString() : null,
      actual: e?.actual ?? null,
      forecast: e?.forecast ?? null,
    }));

  const news = newsRaw
    .filter((a) => {
      const ts = Date.parse(String(a?.publishedAt || ''));
      return Number.isFinite(ts) && ts >= contextFrom * 1000 && ts <= contextTo * 1000;
    })
    .slice(0, 8)
    .map((a) => ({
      headline: String(a?.headline || ''),
      summary: String(a?.summary || ''),
      source: String(a?.source || ''),
      publishedAt: a?.publishedAt || null,
      url: a?.url || '',
    }));

  const sentiment = analyzeSentiment({
    symbol,
    newsHeadlines: news.map((n) => `${n.headline} ${n.summary}`.trim()),
    macroEvents: events,
    ohlcv: [{ open, high, low, close, volume }],
  });

  const movePct = signedPct(open, close);
  const body = Math.abs(close - open);
  const range = Math.max(0, high - low);
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);

  return {
    symbol,
    interval,
    candleTime: new Date(startSec * 1000).toISOString(),
    sessionLabel: sessionLabelForTs(startSec),
    ohlc: { open, high, low, close, volume },
    movePct,
    body,
    range,
    upperWick,
    lowerWick,
    events,
    headlines: news,
    macroSentiment: {
      marketSentiment: sentiment.marketSentiment || 'Neutral',
      instrumentSentiment: sentiment.instrumentSentiment || 'Neutral',
      summary: sentiment.summary || 'No major catalyst found',
    },
    catalystSummary: buildCatalyst(events, news),
    diagnostics: {
      contextWindowStart: new Date(contextFrom * 1000).toISOString(),
      contextWindowEnd: new Date(contextTo * 1000).toISOString(),
      eventsFound: events.length,
      headlinesFound: news.length,
    },
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const key = cacheKey(req.query || {});
    const hit = getCached(key);
    if (hit) {
      return res.status(200).json({ success: true, ...hit, cacheHit: true });
    }
    if (inFlight.has(key)) {
      const joined = await inFlight.get(key);
      return res.status(200).json({ success: true, ...joined, cacheHit: true, inFlightDeduped: true });
    }

    const promise = resolveContext(req.query || {}, req);
    inFlight.set(key, promise);
    const payload = await promise;
    setCached(key, payload);
    return res.status(200).json({ success: true, ...payload, cacheHit: false, inFlightDeduped: false });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({
      success: false,
      message: error?.message || 'Failed to build candle context',
    });
  } finally {
    const key = cacheKey(req.query || {});
    inFlight.delete(key);
  }
};

module.exports._test = {
  intervalSeconds,
  sessionLabelForTs,
  cacheKey,
};
