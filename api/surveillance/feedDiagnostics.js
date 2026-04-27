/**
 * Safe server-side surveillance feed diagnostics (no secrets, no full URLs with tokens).
 */

const { executeQuery } = require('../db');
const { bucketAdapterRecency } = require('./adapterState');

/** Static hints for operators (paths match vercel.json crons). */
const SURVEILLANCE_CRON_HINT = {
  surveillance_ingest: {
    path: '/api/cron/surveillance-ingest',
    schedule_cron: '*/5 * * * *',
    scope: 'batched HTML/RSS + rotating adapters (see ingestOrchestrator)',
  },
  surveillance_tracks: {
    path: '/api/cron/surveillance-tracks',
    schedule_cron: '*/3 * * * *',
    scope: 'opensky_live only (ADS-B refresh)',
  },
};

function providerEnvFlags() {
  const basicUser = String(process.env.OPENSKY_USERNAME || '').trim();
  const basicPass = String(process.env.OPENSKY_PASSWORD || '').trim();
  const id = String(process.env.OPENSKY_CLIENT_ID || process.env.OPENSKY_USERNAME || '').trim();
  const secret = String(process.env.OPENSKY_CLIENT_SECRET || process.env.OPENSKY_PASSWORD || '').trim();
  return {
    opensky_basic_configured: !!(basicUser && basicPass),
    opensky_oauth_configured: !!(id && secret),
    opensky_adapter_disabled: /^1|true|yes$/i.test(String(process.env.OPENSKY_ADAPTER_DISABLED || '')),
    datalastic_configured: !!String(process.env.DATALASTIC_API_KEY || '').trim(),
    datalastic_adapter_disabled: /^1|true|yes$/i.test(String(process.env.DATALASTIC_AIS_ADAPTER_DISABLED || '')),
    news_api_configured: !!String(process.env.NEWS_API_KEY || '').trim(),
  };
}

function parseRunMeta(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

async function adapterSnapshotForLiveGeo() {
  const ids = ['opensky_live', 'datalastic_ais_live'];
  try {
    const [rows] = await executeQuery(
      `SELECT adapter_id, last_success_at, last_error_at, last_error_code, last_items_in, last_items_out, consecutive_failures
       FROM surveillance_adapter_state WHERE adapter_id IN (?, ?)`,
      ids
    );
    const [runRows] = await executeQuery(
      `SELECT r.adapter_id, r.items_in, r.items_out, r.error_code, r.meta, r.finished_at
       FROM surveillance_ingest_runs r
       INNER JOIN (
         SELECT adapter_id, MAX(id) AS max_id
         FROM surveillance_ingest_runs
         WHERE adapter_id IN (?, ?)
         GROUP BY adapter_id
       ) t ON t.max_id = r.id AND t.adapter_id = r.adapter_id`,
      ids
    );
    const [evRows] = await executeQuery(
      `SELECT source, COUNT(*) AS c
       FROM surveillance_events
       WHERE source IN (?, ?)
         AND detected_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
       GROUP BY source`,
      ids
    );

    const list = rows || [];
    const runMap = new Map((runRows || []).map((x) => [String(x.adapter_id), x]));
    const evMap = new Map((evRows || []).map((x) => [String(x.source), Number(x.c) || 0]));

    return ids.map((adapter_id) => {
      const r = list.find((x) => String(x.adapter_id) === adapter_id) || {};
      const run = runMap.get(adapter_id);
      const meta = parseRunMeta(run?.meta);
      const lastIso = r.last_success_at ? new Date(r.last_success_at).toISOString() : null;

      return {
        adapter_id,
        /** Recency of last *successful* ingest — independent of providerEnv. */
        recency_bucket: bucketAdapterRecency(lastIso),
        last_success_at: r.last_success_at || null,
        last_error_at: r.last_error_at || null,
        last_error_code: r.last_error_code || null,
        last_items_in: r.last_items_in != null ? Number(r.last_items_in) : null,
        last_items_out: r.last_items_out != null ? Number(r.last_items_out) : null,
        consecutive_failures: r.consecutive_failures != null ? Number(r.consecutive_failures) : null,
        /** Latest finished ingest run (may be failure). */
        last_ingest_run: run
          ? {
              finished_at: run.finished_at || null,
              /** Rows returned / prepared for upsert pipeline in that run (DB column). */
              fetched_count: run.items_in != null ? Number(run.items_in) : null,
              /** Rows upserted in that run (DB column). */
              upserted_count: run.items_out != null ? Number(run.items_out) : null,
              error_code: run.error_code || null,
              /** Adapter self-report from run meta when present (OpenSky/Datalastic). */
              normalized_candidates: meta.candidates != null ? Number(meta.candidates) : null,
              normalized_emitted: meta.emitted != null ? Number(meta.emitted) : null,
            }
          : null,
        /** Rows in DB from this source in last 24h (event_type is aviation/maritime from adapters). */
        events_written_24h: evMap.get(adapter_id) || 0,
        canonical_event_type: adapter_id === 'opensky_live' ? 'aviation' : 'maritime',
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
  SURVEILLANCE_CRON_HINT,
  providerEnvFlags,
  adapterSnapshotForLiveGeo,
  geoTaggedEventCounts,
  buildFeedDiagnostics,
  logFeedServe,
};
