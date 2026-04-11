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

    const events = await queryFeed({
      limit,
      sinceUpdated: since || null,
      eventType: eventType || null,
      severityMin: Number.isFinite(severityMin) ? severityMin : null,
      source: source || null,
      tab: tab === 'all' ? null : tab,
    });
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
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[surveillance/feed]', e);
    return res.status(500).json({ success: false, message: 'Failed to load feed' });
  }
};
