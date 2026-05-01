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
    scope: 'batched HTML/RSS + rotating adapters (no paid vessel telemetry — maritime from public feeds + demo/fallback markers)',
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
    opensky_configured: !!(basicUser && basicPass) || !!(id && secret),
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
  const ids = ['opensky_live'];
  try {
    const [rows] = await executeQuery(
      `SELECT adapter_id, last_success_at, last_error_at, last_error_code, last_items_in, last_items_out, consecutive_failures
       FROM surveillance_adapter_state WHERE adapter_id = ?`,
      ids
    );
    const [runRows] = await executeQuery(
      `SELECT r.adapter_id, r.items_in, r.items_out, r.error_code, r.meta, r.finished_at
       FROM surveillance_ingest_runs r
       INNER JOIN (
         SELECT adapter_id, MAX(id) AS max_id
         FROM surveillance_ingest_runs
         WHERE adapter_id = ?
         GROUP BY adapter_id
       ) t ON t.max_id = r.id AND t.adapter_id = r.adapter_id`,
      ids
    );
    const [evRows] = await executeQuery(
      `SELECT source, COUNT(*) AS c
       FROM surveillance_events
       WHERE source = ?
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
              fetched_count: run.items_in != null ? Number(run.items_in) : null,
              upserted_count: run.items_out != null ? Number(run.items_out) : null,
              error_code: run.error_code || null,
              normalized_candidates: meta.candidates != null ? Number(meta.candidates) : null,
              normalized_emitted: meta.emitted != null ? Number(meta.emitted) : null,
              opensky_fetched_count: meta.fetched_count != null ? Number(meta.fetched_count) : null,
              opensky_normalized_emitted: meta.normalized_emitted != null ? Number(meta.normalized_emitted) : null,
            }
          : null,
        events_written_24h: evMap.get(adapter_id) || 0,
        canonical_event_type: 'aviation',
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
 * Compact, safe hints for /surveillance UI (no secrets).
 * @param {object[]} liveGeoAdapters adapterSnapshotForLiveGeo()
 * @param {object} envFlags providerEnvFlags()
 */
function buildLiveGeoClientHints(liveGeoAdapters, envFlags) {
  const os = (liveGeoAdapters || []).find((x) => x.adapter_id === 'opensky_live') || {};
  const osRun = os.last_ingest_run || {};
  return {
    opensky: {
      configured: !!envFlags.opensky_configured,
      adapter_disabled: !!envFlags.opensky_adapter_disabled,
      last_success_at: os.last_success_at || null,
      fetched_count: osRun.opensky_fetched_count ?? osRun.fetched_count ?? null,
      normalized_emitted: osRun.opensky_normalized_emitted ?? osRun.normalized_emitted ?? null,
      events_written_24h: os.events_written_24h ?? 0,
    },
    maritime_context: {
      live_vessel_tracking_enabled: false,
      note: 'Maritime map context uses public/official ingest (e.g. trade press, regulators) and clearly labelled demo markers when the feed is sparse — not live AIS positions.',
    },
    messages: [
      'Live vessel tracking not enabled. Maritime risk is based on public reports and fallback context.',
    ],
  };
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
  buildLiveGeoClientHints,
  buildFeedDiagnostics,
  logFeedServe,
};
