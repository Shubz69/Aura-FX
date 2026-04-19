const { verifyToken } = require('../utils/auth');
const { assertSurveillanceEntitlement } = require('./assertEntitlement');
const { ensureSurveillanceSchema } = require('./schema');
const {
  queryFeed,
  computeAggregates,
  listSources,
} = require('./store');
const { getSystemHealthSummary } = require('./adapterState');
const { buildIntelDigest } = require('./intelDigest');
const { buildMarketWatchNarrative } = require('./marketWatchNarrative');

/** NewsAPI top-headlines (optional; requires NEWS_API_KEY). Lowercase ISO2 country code. */
async function fetchCountryWireHeadlines(iso2) {
  const key = process.env.NEWS_API_KEY;
  if (!key || !iso2 || iso2.length !== 2) return [];
  const cc = String(iso2).toLowerCase();
  const wireQueryByIso = {
    ps: '(palestine OR gaza OR "west bank")',
    ir: '(iran OR tehran)',
    il: '(israel OR tel aviv OR jerusalem)',
    lb: '(lebanon OR beirut)',
    sy: '(syria OR damascus)',
    iq: '(iraq OR baghdad)',
    ye: '(yemen OR houthis)',
  };
  const topHeadlinesUrl = `https://newsapi.org/v2/top-headlines?country=${encodeURIComponent(cc)}&pageSize=12&apiKey=${encodeURIComponent(key)}`;
  const fallbackQ = wireQueryByIso[cc] || null;
  const everythingUrl = fallbackQ
    ? `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        fallbackQ
      )}&language=en&sortBy=publishedAt&pageSize=12&apiKey=${encodeURIComponent(key)}`
    : null;

  async function fetchRows(url) {
    if (!url) return [];
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4800);
    try {
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.articles) ? json.articles : [];
    } catch {
      clearTimeout(t);
      return [];
    }
  }

  const topRows = await fetchRows(topHeadlinesUrl);
  const rows = topRows.length ? topRows : await fetchRows(everythingUrl);
  if (!rows.length) return [];
  return rows
    .filter((a) => a?.title && a?.url)
    .slice(0, 10)
    .map((a) => ({
      title: a.title || '',
      url: a.url || '',
      source: (a.source && a.source.name) || '',
      publishedAt: a.publishedAt || null,
    }));
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    await ensureSurveillanceSchema();
    const entitled = await assertSurveillanceEntitlement(Number(decoded.id), res);
    if (!entitled) return;

    const q = req.query || {};
    const since = q.since ? String(q.since) : null;
    const tab = q.tab ? String(q.tab).toLowerCase() : 'all';
    const limit = q.limit ? Number(q.limit) : 180;
    const severityMin = q.severityMin != null ? Number(q.severityMin) : null;
    const source = q.source ? String(q.source) : null;
    const eventType = q.eventType ? String(q.eventType) : null;
    const countryRaw = q.country ? String(q.country).trim().toUpperCase() : '';
    const countryIso2 = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;
    let maxAgeHours = q.maxAgeHours != null ? Number(q.maxAgeHours) : null;
    if (countryIso2 && (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0)) {
      maxAgeHours = 72;
    }
    if (!countryIso2) maxAgeHours = null;
    if (Number.isFinite(maxAgeHours) && maxAgeHours > 168) maxAgeHours = 168;

    const [events, countryHeadlines] = await Promise.all([
      queryFeed({
        limit,
        sinceUpdated: since || null,
        eventType: eventType || null,
        severityMin: Number.isFinite(severityMin) ? severityMin : null,
        source: source || null,
        tab: tab === 'all' ? null : tab,
        countryIso2,
        maxAgeHours: Number.isFinite(maxAgeHours) ? maxAgeHours : null,
      }),
      countryIso2 ? fetchCountryWireHeadlines(countryIso2) : Promise.resolve([]),
    ]);
    const aggregates = await computeAggregates(events);
    const intelDigest = buildIntelDigest(events, {
      limitStories: 7,
      limitImpact: 7,
      limitCorr: 8,
      limitRegions: 7,
    });
    const marketWatchNarrative = buildMarketWatchNarrative(events, aggregates, intelDigest);
    const sources = await listSources();
    const systemHealth = await getSystemHealthSummary();

    return res.status(200).json({
      success: true,
      events,
      aggregates,
      intelDigest,
      marketWatchNarrative,
      sources,
      systemHealth,
      countryIso2,
      maxAgeHours: countryIso2 ? maxAgeHours : null,
      countryHeadlines,
      /** UI only: whether headline wire can be served (no secrets exposed). Always sent for client copy. */
      countryWireAvailable: !!process.env.NEWS_API_KEY,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[surveillance/feed]', e);
    return res.status(500).json({ success: false, message: 'Failed to load feed' });
  }
};
