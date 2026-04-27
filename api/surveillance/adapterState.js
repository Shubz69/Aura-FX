const { executeQuery } = require('../db');
const {
  adapterFamily,
  adapterRegion,
  regionAdapterRollup,
  feedMixFromSourceCounts,
  underCoveredRegions,
  aviationMaritimeHealthSummary,
  familyUnderperformance,
} = require('./adapterFamilies');

function jitterSeconds(base) {
  return Math.max(30, Math.round(base * (0.85 + Math.random() * 0.35)));
}

/**
 * Pure: bucket last success age for health UX and tests.
 */
function bucketAdapterRecency(lastSuccessAtIso) {
  if (!lastSuccessAtIso) return 'never';
  const t = new Date(lastSuccessAtIso).getTime();
  if (Number.isNaN(t)) return 'never';
  const h = (Date.now() - t) / 3600000;
  if (h < 1) return 'fresh';
  if (h < 6) return 'warm';
  if (h < 24) return 'cold';
  return 'stale';
}

async function ensureAdapterRows(adapters) {
  for (const a of adapters) {
    const tier = a.tier || 'standard';
    const interval = Number(a.defaultIntervalSeconds) || 900;
    await executeQuery(
      `INSERT IGNORE INTO surveillance_adapter_state (adapter_id, tier, interval_seconds, next_run_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP())`,
      [a.id, tier, interval]
    ).catch(() => {});
    await executeQuery(
      `UPDATE surveillance_adapter_state SET tier = ?, interval_seconds = ? WHERE adapter_id = ?`,
      [tier, interval, a.id]
    ).catch(() => {});
  }
}

/**
 * @returns {string[]} adapter_ids due to run
 */
async function pickDueAdapterIds(max = 10) {
  /** MySQL prepared statements reject `LIMIT ?` (ER_WRONG_ARGUMENTS) — use a clamped integer literal. */
  const lim = Math.max(1, Math.min(100, Math.floor(Number(max)) || 10));
  const [rows] = await executeQuery(
    `SELECT adapter_id FROM surveillance_adapter_state
     WHERE next_run_at IS NULL OR next_run_at <= UTC_TIMESTAMP()
     ORDER BY (next_run_at IS NULL) DESC, next_run_at ASC
     LIMIT ${lim}`,
    []
  );
  return (rows || []).map((r) => r.adapter_id);
}

function parseJsonMeta(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

async function markSuccess(adapterId, itemsIn, itemsOut, durationMs, ingestMeta = null) {
  const [rows] = await executeQuery(
    `SELECT interval_seconds, consecutive_failures, meta FROM surveillance_adapter_state WHERE adapter_id = ? LIMIT 1`,
    [adapterId]
  );
  const row = rows && rows[0];
  const interval = row?.interval_seconds || 900;
  const prev = parseJsonMeta(row?.meta);
  const prevStreak = Number(prev.last_ingest?.empty_yield_streak) || 0;
  const emptyRun = (Number(itemsIn) || 0) === 0 && (Number(itemsOut) || 0) === 0;
  const streak =
    emptyRun && ingestMeta && ingestMeta.backoff_empty === true ? prevStreak + 1 : 0;

  let nextSec = jitterSeconds(interval);
  const forceDelay = ingestMeta && Number(ingestMeta.force_next_run_sec);
  if (Number.isFinite(forceDelay) && forceDelay >= 60) {
    nextSec = jitterSeconds(Math.min(86400, forceDelay));
  } else if (emptyRun && ingestMeta && ingestMeta.backoff_empty === true) {
    const base = Math.max(300, Number(interval) || 300);
    const sec = Math.min(7200, base * Math.pow(2, Math.min(Math.max(streak - 1, 0), 6)));
    nextSec = jitterSeconds(Math.max(900, sec));
  }

  let metaJson = null;
  if (ingestMeta && typeof ingestMeta === 'object') {
    const merged = {
      ...prev,
      last_ingest: {
        ...ingestMeta,
        empty_yield_streak: streak,
        recorded_at: new Date().toISOString(),
      },
    };
    metaJson = JSON.stringify(merged);
  }
  await executeQuery(
    `UPDATE surveillance_adapter_state SET
       last_run_started_at = UTC_TIMESTAMP(),
       last_success_at = UTC_TIMESTAMP(),
       last_error_at = NULL,
       last_error_code = NULL,
       consecutive_failures = 0,
       last_items_in = ?,
       last_items_out = ?,
       last_duration_ms = ?,
       next_run_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
       meta = COALESCE(?, meta)
     WHERE adapter_id = ?`,
    [itemsIn, itemsOut, durationMs, nextSec, metaJson, adapterId]
  ).catch(() => {});
}

async function markFailure(adapterId, errorCode, durationMs) {
  const [rows] = await executeQuery(
    `SELECT interval_seconds, consecutive_failures FROM surveillance_adapter_state WHERE adapter_id = ? LIMIT 1`,
    [adapterId]
  );
  const row = rows && rows[0];
  const interval = row?.interval_seconds || 900;
  const fails = (row?.consecutive_failures || 0) + 1;
  const backoff = Math.min(3600, interval * Math.pow(2, Math.min(fails, 5)));
  const nextSec = jitterSeconds(backoff);
  await executeQuery(
    `UPDATE surveillance_adapter_state SET
       last_run_started_at = UTC_TIMESTAMP(),
       last_error_at = UTC_TIMESTAMP(),
       last_error_code = ?,
       consecutive_failures = ?,
       last_duration_ms = ?,
       next_run_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
     WHERE adapter_id = ?`,
    [String(errorCode || 'error').slice(0, 64), fails, durationMs, nextSec, adapterId]
  ).catch(() => {});
}

async function getSystemHealthSummary() {
  const [states] = await executeQuery(`SELECT * FROM surveillance_adapter_state ORDER BY adapter_id ASC`, []);
  const [lastGlobal] = await executeQuery(
    `SELECT MAX(finished_at) AS t FROM surveillance_ingest_runs WHERE error_code IS NULL`,
    []
  );
  const [eventCount] = await executeQuery(`SELECT COUNT(*) AS c FROM surveillance_events`, []);
  const [throughputRows] = await executeQuery(
    `SELECT adapter_id,
       SUM(CASE WHEN error_code IS NULL THEN 1 ELSE 0 END) AS runs_ok,
       SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS runs_err,
       COALESCE(SUM(items_out), 0) AS items_out
     FROM surveillance_ingest_runs
     WHERE started_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
     GROUP BY adapter_id`,
    []
  );
  const s = states || [];
  const [feed24hRows] = await executeQuery(
    `SELECT source, COUNT(*) AS c
     FROM surveillance_events
     WHERE COALESCE(detected_at, published_at, updated_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
     GROUP BY source`,
    []
  );
  const countsBySource24h = {};
  let totalEvents24h = 0;
  for (const fr of feed24hRows || []) {
    const n = Number(fr.c) || 0;
    countsBySource24h[fr.source] = n;
    totalEvents24h += n;
  }
  const feedMix24h = feedMixFromSourceCounts(countsBySource24h, totalEvents24h);
  const regionRollup = regionAdapterRollup(
    s.map((r) => ({
      adapter_id: r.adapter_id,
      last_success_at: r.last_success_at,
      consecutive_failures: r.consecutive_failures,
    }))
  );
  const regionGaps = underCoveredRegions(regionRollup, feedMix24h.byRegion);
  const aviationMaritimeHealth = aviationMaritimeHealthSummary(s);

  const total = eventCount && eventCount[0] ? Number(eventCount[0].c) : 0;
  const lastIngestOk = lastGlobal && lastGlobal[0]?.t ? new Date(lastGlobal[0].t).toISOString() : null;
  const ageMs = lastIngestOk ? Date.now() - new Date(lastIngestOk).getTime() : Infinity;
  const stale = ageMs > 2 * 3600000;
  const failMajor =
    s.length > 0 && s.filter((x) => (x.consecutive_failures || 0) > 2).length >= Math.ceil(s.length * 0.5);
  const warmingUp = total === 0;
  const degraded = !warmingUp && (stale || failMajor);

  const adapterRecencyBuckets = { fresh: 0, warm: 0, cold: 0, stale: 0, never: 0 };
  const recencyStaleAdapterIds = [];
  const recencyNeverAdapterIds = [];
  for (const r of s) {
    const iso = r.last_success_at ? new Date(r.last_success_at).toISOString() : null;
    const b = bucketAdapterRecency(iso);
    adapterRecencyBuckets[b] = (adapterRecencyBuckets[b] || 0) + 1;
    if (b === 'stale') recencyStaleAdapterIds.push(r.adapter_id);
    if (b === 'never') recencyNeverAdapterIds.push(r.adapter_id);
  }

  let failGe1 = 0;
  let failGe3 = 0;
  for (const r of s) {
    const f = r.consecutive_failures || 0;
    if (f >= 1) failGe1 += 1;
    if (f >= 3) failGe3 += 1;
  }

  const throughput24h = (throughputRows || []).map((row) => ({
    adapterId: row.adapter_id,
    runsOk: Number(row.runs_ok) || 0,
    runsErr: Number(row.runs_err) || 0,
    itemsOut: Number(row.items_out) || 0,
    family: adapterFamily(row.adapter_id),
    region: adapterRegion(row.adapter_id),
  }));

  const underperformingFamilies = familyUnderperformance(s).map((w) => ({
    ...w,
    events24h: feedMix24h.byFamily[w.family]?.count || 0,
    pctOfFeed24h: feedMix24h.byFamily[w.family]?.pctOfWindow || 0,
  }));

  const [lastRuns] = await executeQuery(
    `SELECT r.adapter_id, r.meta
     FROM surveillance_ingest_runs r
     INNER JOIN (
       SELECT adapter_id, MAX(id) AS max_id FROM surveillance_ingest_runs GROUP BY adapter_id
     ) t ON t.max_id = r.id AND t.adapter_id = r.adapter_id`,
    []
  );
  const lastRunByAdapter = new Map();
  for (const lr of lastRuns || []) {
    lastRunByAdapter.set(lr.adapter_id, parseJsonMeta(lr.meta));
  }

  let staleMarkupSignals = 0;
  let linkFallbackHeavy = 0;
  for (const lr of lastRuns || []) {
    const m = parseJsonMeta(lr.meta);
    if (m.stale_markup_risk) staleMarkupSignals += 1;
    if (m.used_link_filter_fallback && (m.links_found || 0) > 0) linkFallbackHeavy += 1;
  }

  return {
    adapterCount: s.length,
    adapters: s.map((r) => {
      const stateMeta = parseJsonMeta(r.meta);
      const runMeta = lastRunByAdapter.get(r.adapter_id) || {};
      const li = stateMeta.last_ingest || {};
      return {
        id: r.adapter_id,
        tier: r.tier,
        family: adapterFamily(r.adapter_id),
        lastSuccessAt: r.last_success_at ? new Date(r.last_success_at).toISOString() : null,
        recencyBucket: bucketAdapterRecency(r.last_success_at ? new Date(r.last_success_at).toISOString() : null),
        lastErrorAt: r.last_error_at ? new Date(r.last_error_at).toISOString() : null,
        lastErrorCode: r.last_error_code || null,
        failures: r.consecutive_failures,
        nextRunAt: r.next_run_at ? new Date(r.next_run_at).toISOString() : null,
        lastItemsIn: r.last_items_in != null ? Number(r.last_items_in) : null,
        lastItemsOut: r.last_items_out != null ? Number(r.last_items_out) : null,
        ingestSignals: {
          listingFingerprint: li.listing_fingerprint || runMeta.listing_fingerprint || null,
          linksFound: li.links_found ?? runMeta.links_found ?? null,
          usedLinkFilterFallback: !!(li.used_link_filter_fallback ?? runMeta.used_link_filter_fallback),
          parseFallbackCount: li.parse_fallback_count ?? runMeta.parse_fallback_count ?? 0,
          staleMarkupRisk: !!(li.stale_markup_risk ?? runMeta.stale_markup_risk),
        },
      };
    }),
    adapterRecencyBuckets,
    /** Adapters with last_success_at older than 24h — unrelated to providerEnv (env keys vs clock). */
    recencyStaleAdapterIds,
    recencyNeverAdapterIds,
    recencyExplainer:
      'Stale = no successful ingest in 24h for that adapter row. ProviderEnv only means API keys exist, not that every HTML/RSS adapter ran recently.',
    failureStreakSummary: { adaptersWithFailuresGte1: failGe1, adaptersWithFailuresGte3: failGe3 },
    throughput24h,
    feedMix24h,
    regionCoverage: {
      rollup: regionRollup,
      gaps: regionGaps,
    },
    aviationMaritimeHealth,
    coverageHonesty: {
      note:
        'Figures reflect configured public HTML adapters and recent ingest only — not exhaustive real-world coverage.',
      observability: {
        aviation: 'authority_press_only',
        maritime: 'authority_press_only',
      },
    },
    underperformingFamilies,
    ingestQualitySummary: {
      adaptersWithStaleMarkupSignal: staleMarkupSignals,
      adaptersUsingLinkFallback: linkFallbackHeavy,
    },
    lastIngestSuccessAt: lastIngestOk,
    degraded,
    warmingUp,
    totalEvents: total,
  };
}

module.exports = {
  ensureAdapterRows,
  pickDueAdapterIds,
  markSuccess,
  markFailure,
  getSystemHealthSummary,
  bucketAdapterRecency,
};
