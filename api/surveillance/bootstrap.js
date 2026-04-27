const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { assertSurveillanceEntitlement } = require('./assertEntitlement');
const { ensureSurveillanceSchema } = require('./schema');
const { ensureUsersSchema } = require('../utils/ensure-users-schema');
const {
  queryFeed,
  queryTopForBriefing,
  queryDeltaSince,
  computeAggregates,
  listSources,
} = require('./store');
const { getSystemHealthSummary } = require('./adapterState');
const { buildIntelDigest } = require('./intelDigest');
const { buildMarketWatchNarrative } = require('./marketWatchNarrative');
const { buildPairHeatFromEvents } = require('./pairHeat');
const { mergeGeoFallback, countGeoTagged } = require('./fallbackGeoEvents');
const {
  SURVEILLANCE_CRON_HINT,
  providerEnvFlags,
  adapterSnapshotForLiveGeo,
  geoTaggedEventCounts,
  buildFeedDiagnostics,
  logFeedServe,
} = require('./feedDiagnostics');

/** Temporary deploy probe: if missing in Network, production is not this API build. */
const SURVEILLANCE_API_VERSION = 'diagnostics-d6354e6e-stale-detail';

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function utcDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** MySQL DATETIME comparison (UTC). */
function toMysqlUtc(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 19).replace('T', ' ');
}

function briefingEventSummary(e) {
  return {
    id: e.id,
    title: e.title,
    source: e.source,
    event_type: e.event_type,
    rank_score: e.rank_score,
    region: e.region,
    risk_bias: e.risk_bias,
    why_matters: e.why_matters,
  };
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);

  try {
    await ensureUsersSchema();
    await ensureSurveillanceSchema();
    const entitled = await assertSurveillanceEntitlement(userId, res);
    if (!entitled) return;

    const [urows] = await executeQuery(
      `SELECT surveillance_intro_seen_utc_date, surveillance_last_briefing_at FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const urow = urows && urows[0];
    const seen = urow?.surveillance_intro_seen_utc_date;
    const today = utcDateString();
    const seenStr = seen
      ? seen instanceof Date
        ? seen.toISOString().slice(0, 10)
        : String(seen).slice(0, 10)
      : null;
    const showIntro = !seenStr || seenStr < today;

    const [eventsRaw, liveGeoAdapters, geoCounts] = await Promise.all([
      queryFeed({ limit: 260, tab: null }),
      adapterSnapshotForLiveGeo(),
      geoTaggedEventCounts(),
    ]);
    const liveCount = eventsRaw.length;
    const geoTaggedLive = countGeoTagged(eventsRaw);
    const mergeResult = mergeGeoFallback(eventsRaw, { countryIso2: null, minGeoMarkers: 4, tab: null });
    const events = mergeResult.events;
    const feedDiag = buildFeedDiagnostics({
      liveEventCount: liveCount,
      geoTaggedLive,
      mergedDemoCount: mergeResult.mergedDemoCount,
      mergeReason: mergeResult.reason,
      finalGeoCount: mergeResult.geoAfter,
      tab: 'all',
      countryIso2: null,
    });
    logFeedServe('bootstrap', {
      ...feedDiag,
      providerEnv: providerEnvFlags(),
      liveGeoAdapters,
    });
    const aggregates = await computeAggregates(events);
    const intelDigest = buildIntelDigest(events, {
      limitStories: 7,
      limitImpact: 7,
      limitCorr: 8,
      limitRegions: 7,
    });
    const marketWatchNarrative = buildMarketWatchNarrative(events, aggregates, intelDigest);
    const pairHeat = buildPairHeatFromEvents(events, { limit: 6 });
    const sources = await listSources();
    const systemHealth = await getSystemHealthSummary();

    let briefing = null;
    if (showIntro) {
      const top = await queryTopForBriefing(8);
      const deltaSince = urow?.surveillance_last_briefing_at
        ? toMysqlUtc(urow.surveillance_last_briefing_at)
        : toMysqlUtc(new Date(Date.now() - 36 * 3600000));
      const delta = await queryDeltaSince(deltaSince, 18);
      const regionEntries = Object.entries(aggregates.regionHeat || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([region, score]) => ({ region, score: Math.round(score) }));
      briefing = {
        headline: 'Daily surveillance briefing',
        topStories: top.map(briefingEventSummary),
        sinceLastVisit: delta.map(briefingEventSummary),
        regionsUnderTension: regionEntries,
        marketWatch: aggregates.marketWatch || [],
        tapeFreshness: systemHealth.lastIngestSuccessAt,
      };
    }

    return res.status(200).json({
      success: true,
      showIntro,
      events,
      aggregates,
      intelDigest,
      marketWatchNarrative,
      pairHeat,
      sources,
      systemHealth,
      briefing,
      countryWireAvailable: !!process.env.NEWS_API_KEY,
      serverTime: new Date().toISOString(),
      surveillanceApiVersion: SURVEILLANCE_API_VERSION,
      surveillanceDiagnostics: {
        providerEnv: providerEnvFlags(),
        geoTaggedEventCounts: geoCounts,
        liveGeoAdapters,
        fallbackInjected: mergeResult.mergedDemoCount > 0,
        finalEventCount: events.length,
        feed: feedDiag,
        cron: SURVEILLANCE_CRON_HINT,
        ingestionObservability: {
          recencyStaleAdapterIds: systemHealth.recencyStaleAdapterIds || [],
          recencyNeverAdapterIds: systemHealth.recencyNeverAdapterIds || [],
          recencyExplainer: systemHealth.recencyExplainer,
        },
      },
    });
  } catch (e) {
    console.error('[surveillance/bootstrap]', e);
    return res.status(500).json({ success: false, message: 'Failed to load surveillance' });
  }
};
