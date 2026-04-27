const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { isSuperAdminEmail } = require('../utils/entitlements');
const { ensureSurveillanceSchema } = require('./schema');
const { getSystemHealthSummary } = require('./adapterState');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

/** True when rewrite from GET /api/surveillance/debug (see vercel.json sv_route=debug). */
function isSurveillanceDebugRoute(req) {
  if (String(req.query?.sv_route || '') === 'debug') return true;
  const raw = String(req.url || req.path || '');
  return /\/api\/surveillance\/debug(\?|$|\/)/.test(raw);
}

function providerEnvFlags() {
  const id = String(process.env.OPENSKY_CLIENT_ID || process.env.OPENSKY_USERNAME || '').trim();
  const secret = String(process.env.OPENSKY_CLIENT_SECRET || process.env.OPENSKY_PASSWORD || '').trim();
  return {
    opensky_oauth_configured: !!(id && secret),
    opensky_adapter_disabled: /^1|true|yes$/i.test(String(process.env.OPENSKY_ADAPTER_DISABLED || '')),
    datalastic_configured: !!String(process.env.DATALASTIC_API_KEY || '').trim(),
    datalastic_adapter_disabled: /^1|true|yes$/i.test(String(process.env.DATALASTIC_AIS_ADAPTER_DISABLED || '')),
    news_api_configured: !!String(process.env.NEWS_API_KEY || '').trim(),
  };
}

async function adapterSnapshotForLiveGeo() {
  const ids = ['opensky_live', 'datalastic_ais_live'];
  try {
    const [rows] = await executeQuery(
      `SELECT adapter_id, last_success_at, last_error_at, last_error_code, last_items_in, last_items_out, consecutive_failures
       FROM surveillance_adapter_state WHERE adapter_id IN (?, ?)`,
      ids
    );
    const list = rows || [];
    return ids.map((adapter_id) => {
      const r = list.find((x) => String(x.adapter_id) === adapter_id) || {};
      return {
        adapter_id,
        last_success_at: r.last_success_at || null,
        last_error_at: r.last_error_at || null,
        last_error_code: r.last_error_code || null,
        last_items_in: r.last_items_in != null ? Number(r.last_items_in) : null,
        last_items_out: r.last_items_out != null ? Number(r.last_items_out) : null,
        consecutive_failures: r.consecutive_failures != null ? Number(r.consecutive_failures) : null,
      };
    });
  } catch {
    return ids.map((adapter_id) => ({ adapter_id, error: 'adapter_state_unavailable' }));
  }
}

async function geoTaggedEventCounts() {
  try {
    const [rows] = await executeQuery(
      `SELECT
         SUM(lat IS NOT NULL AND lng IS NOT NULL
             AND ABS(lat) <= 90 AND ABS(lng) <= 180 AND NOT (lat = 0 AND lng = 0)) AS geo_all_time,
         SUM(lat IS NOT NULL AND lng IS NOT NULL
             AND ABS(lat) <= 90 AND ABS(lng) <= 180 AND NOT (lat = 0 AND lng = 0)
             AND detected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)) AS geo_24h
       FROM surveillance_events`,
      []
    );
    const r = rows && rows[0];
    return {
      geoTaggedAllTime: Number(r?.geo_all_time) || 0,
      geoTagged24h: Number(r?.geo_24h) || 0,
    };
  } catch {
    return { geoTaggedAllTime: null, geoTagged24h: null, error: 'counts_unavailable' };
  }
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
    await ensureSurveillanceSchema();
    const [urows] = await executeQuery(`SELECT id, email, role FROM users WHERE id = ? LIMIT 1`, [userId]);
    const user = urows && urows[0];
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const role = (user.role || '').toLowerCase();
    const allowed = role === 'admin' || role === 'super_admin' || isSuperAdminEmail(user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const wantFull = /^1|true$/i.test(String(req.query?.full || ''));
    const debugRoute = isSurveillanceDebugRoute(req);

    if (debugRoute && !wantFull) {
      const [liveGeoAdapters, geoCounts] = await Promise.all([adapterSnapshotForLiveGeo(), geoTaggedEventCounts()]);
      return res.status(200).json({
        success: true,
        serverTime: new Date().toISOString(),
        providerEnv: providerEnvFlags(),
        liveGeoAdapters,
        geoTaggedEventCounts: geoCounts,
        hint: 'Compact debug. Use /api/surveillance/admin-diagnostics for full payload, or /api/surveillance/debug?full=true.',
      });
    }

    const limit = Math.min(80, Math.max(5, Math.floor(Number(req.query?.limit)) || 40));
    const [adapterRows] = await executeQuery(`SELECT * FROM surveillance_adapter_state ORDER BY adapter_id ASC`, []);
    const [runs] = await executeQuery(
      `SELECT id, adapter_id, started_at, finished_at, items_in, items_out, error_code, duration_ms
       FROM surveillance_ingest_runs
       ORDER BY id DESC
       LIMIT ${limit}`,
      []
    );
    const [storyCount] = await executeQuery(`SELECT COUNT(*) AS c FROM surveillance_stories`, []);
    const stories = storyCount && storyCount[0] ? Number(storyCount[0].c) : 0;
    const systemHealth = await getSystemHealthSummary();
    const geoCounts = await geoTaggedEventCounts();

    const diagnosticsBrief = {
      adapterCount: systemHealth.adapterCount,
      totalEvents: systemHealth.totalEvents,
      recencyBuckets: systemHealth.adapterRecencyBuckets,
      failureStreaks: systemHealth.failureStreakSummary,
      ingestQuality: systemHealth.ingestQualitySummary,
      weakFamilies: (systemHealth.underperformingFamilies || []).slice(0, 8),
      feedMix24h: systemHealth.feedMix24h,
      regionCoverage: systemHealth.regionCoverage,
      aviationMaritimeHealth: systemHealth.aviationMaritimeHealth,
      coverageHonesty: systemHealth.coverageHonesty,
      lastIngestSuccessAt: systemHealth.lastIngestSuccessAt,
      degraded: systemHealth.degraded,
    };

    return res.status(200).json({
      success: true,
      providerEnv: providerEnvFlags(),
      geoTaggedEventCounts: geoCounts,
      diagnosticsBrief,
      systemHealth,
      adapterState: adapterRows || [],
      storyTableRows: stories,
      recentIngestRuns: runs || [],
    });
  } catch (e) {
    console.error('[surveillance/admin-diagnostics]', e);
    return res.status(500).json({ success: false, message: 'Diagnostics failed' });
  }
};
