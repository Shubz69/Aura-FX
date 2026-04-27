/**
 * Safe server-side surveillance feed diagnostics (no secrets, no full URLs with tokens).
 */

const { executeQuery } = require('../db');

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

/**
 * @param {object} params
 */
function buildFeedDiagnostics(params) {
  const {
    liveEventCount,
    geoTaggedLive,
    mergedDemoCount,
    mergeReason,
    finalGeoCount,
    tab,
    countryIso2,
  } = params;
  return {
    liveEventCount,
    geoTaggedLive,
    mergedDemoCount,
    mergeReason,
    finalGeoCount,
    tab: tab || 'all',
    countryIso2: countryIso2 || null,
    demoLabel: mergedDemoCount > 0 ? 'synthetic_geo_markers' : null,
  };
}

function logFeedServe(tag, payload) {
  try {
    console.log(`[surveillance/${tag}]`, JSON.stringify({ ...payload, t: new Date().toISOString() }));
  } catch {
    console.log(`[surveillance/${tag}]`, payload);
  }
}

module.exports = {
  providerEnvFlags,
  adapterSnapshotForLiveGeo,
  geoTaggedEventCounts,
  buildFeedDiagnostics,
  logFeedServe,
};
