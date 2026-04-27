/**
 * Live AIS merchant traffic via Datalastic vessel_inradius (paid API key required).
 * Global coverage is done by rotating queries across major shipping hubs each run;
 * one HTTP call can return up to 500 vessels (credits scale with results — see Datalastic pricing).
 *
 * Kill switch (no HTTP to api.datalastic.com when any is 1/true/yes):
 *   DATALASTIC_ADAPTER_DISABLED, DATALASTIC_AIS_ADAPTER_DISABLED, DATALASTIC_DISABLED
 *
 * Env:
 *   DATALASTIC_API_KEY (required to call Datalastic)
 *   DATALASTIC_AIS_CALLS_PER_RUN — hub queries this run (default 1 if unset)
 *   DATALASTIC_AIS_MAX_CALLS_PER_RUN — hard cap on hub queries (default 1 if unset; raise both to allow more)
 *   DATALASTIC_AIS_TYPE — optional vessel type filter (only sent if DATALASTIC_AIS_APPLY_TYPE_FILTER=1)
 *   DATALASTIC_AIS_FETCH_ATTEMPTS — HTTP retries per hub (default 1 to avoid duplicate billing)
 *
 * Note: Datalastic measures radius in nautical miles (NM), max 50 NM (~92.6 km). Larger radii are not supported.
 *
 * @see https://datalastic.com/api-reference/
 */

const { fetchWithRetry } = require('../httpFetch');

const ID = 'datalastic_ais_live';
const HOSTS = ['api.datalastic.com'];
/** Path must be /api/v0/vessel_inradius (Location Traffic Tracking API). */
const ENDPOINT = 'https://api.datalastic.com/api/v0/vessel_inradius';

/** High-traffic maritime zones (50 NM radius each, Datalastic max). Rotated by hubOffset each run. */
const HUBS = [
  { name: 'Singapore Strait', lat: 1.2, lon: 103.8 },
  { name: 'English Channel', lat: 50.9, lon: 1.4 },
  { name: 'Gulf of Mexico', lat: 27.5, lon: -90.0 },
  { name: 'Shanghai Port', lat: 31.2, lon: 121.5 },
  { name: 'Rotterdam', lat: 51.9, lon: 4.5 },
];

/** True → adapter returns immediately; zero requests to Datalastic. */
function datalasticGloballyDisabled() {
  const keys = ['DATALASTIC_ADAPTER_DISABLED', 'DATALASTIC_AIS_ADAPTER_DISABLED', 'DATALASTIC_DISABLED'];
  return keys.some((k) => /^(1|true|yes)$/i.test(String(process.env[k] || '').trim()));
}

function apiKey() {
  return String(process.env.DATALASTIC_API_KEY || '').trim();
}

/**
 * Planned HTTP hub queries this run. Defaults to 1 when env omitted (credit safety).
 * To poll more hubs: set DATALASTIC_AIS_CALLS_PER_RUN and raise DATALASTIC_AIS_MAX_CALLS_PER_RUN (both caps apply).
 */
function plannedHubCalls() {
  const rawCalls = process.env.DATALASTIC_AIS_CALLS_PER_RUN;
  const requested =
    rawCalls == null || String(rawCalls).trim() === ''
      ? 1
      : Math.min(24, Math.max(1, parseInt(String(rawCalls).trim(), 10) || 1));
  const rawMax = process.env.DATALASTIC_AIS_MAX_CALLS_PER_RUN;
  const maxCap =
    rawMax == null || String(rawMax).trim() === ''
      ? 1
      : Math.min(24, Math.max(1, parseInt(String(rawMax).trim(), 10) || 1));
  return Math.min(requested, maxCap);
}

/** Type / type_specific / exclude / nav_status are opt-in only (strict filters cost credits and often return 0). */
function applyTypeFilter() {
  const v = String(process.env.DATALASTIC_AIS_APPLY_TYPE_FILTER || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function typeFilter() {
  const t = String(process.env.DATALASTIC_AIS_TYPE || '').trim();
  return t || null;
}

function hubOffset() {
  const slot = Math.floor(Date.now() / 120000);
  return slot % HUBS.length;
}

function scoreVesselArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return -1;
  let score = 0;
  const n = Math.min(4, arr.length);
  for (let i = 0; i < n; i += 1) {
    const o = arr[i];
    if (!o || typeof o !== 'object') continue;
    if (o.lat != null || o.latitude != null) score += 2;
    if (o.lon != null || o.longitude != null || o.lng != null) score += 2;
    if (o.mmsi != null || o.imo != null || o.uuid) score += 1;
  }
  return score;
}

/**
 * Datalastic returns { data: { point, total, vessels: [...] } }; tolerate nesting and alternate keys.
 */
function extractVessels(json) {
  if (!json || typeof json !== 'object') return [];

  const candidates = [];

  function consider(arr) {
    if (Array.isArray(arr) && arr.length) candidates.push(arr);
  }

  const d0 = json.data != null ? json.data : json;
  consider(d0);

  if (d0 && typeof d0 === 'object' && !Array.isArray(d0)) {
    for (const k of ['vessels', 'results', 'records', 'items', 'ships', 'vessel_list', 'list']) {
      consider(d0[k]);
    }
    for (const v of Object.values(d0)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k of ['vessels', 'results', 'ships']) {
          consider(v[k]);
        }
      }
    }
  }

  consider(json.vessels);
  consider(json.results);

  let best = [];
  let bestScore = -1;
  for (const arr of candidates) {
    const s = scoreVesselArray(arr);
    if (s > bestScore) {
      bestScore = s;
      best = arr;
    }
  }
  return bestScore > 0 ? best : [];
}

function pickNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeRequestUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.searchParams.has('api-key')) u.searchParams.set('api-key', '[REDACTED]');
    if (u.searchParams.has('api_key')) u.searchParams.set('api_key', '[REDACTED]');
    return u.toString();
  } catch {
    return '[invalid_url]';
  }
}

function vesselSanitizeSnippet(v) {
  if (!v || typeof v !== 'object') return {};
  const lat = v.lat ?? v.latitude;
  const lon = v.lon ?? v.longitude ?? v.lng;
  return {
    mmsi: v.mmsi != null ? String(v.mmsi).replace(/\D/g, '').slice(0, 12) : null,
    uuid: v.uuid != null ? `${String(v.uuid).slice(0, 10)}…` : null,
    lat: typeof lat === 'number' ? Math.round(lat * 1000) / 1000 : lat,
    lon: typeof lon === 'number' ? Math.round(lon * 1000) / 1000 : lon,
    type: v.type ? String(v.type).slice(0, 32) : null,
  };
}

function vesselToEvent(v, hubLabel) {
  const mmsi = v.mmsi != null ? String(v.mmsi).replace(/\D/g, '') : '';
  const imo = v.imo != null ? String(v.imo).replace(/\D/g, '') : '';
  const name = (v.name && String(v.name).trim()) || 'Unknown vessel';
  const nav = v.navigation && typeof v.navigation === 'object' ? v.navigation : null;
  const pos = v.position && typeof v.position === 'object' ? v.position : null;
  const lp = v.last_position && typeof v.last_position === 'object' ? v.last_position : null;
  const cp = v.current_position && typeof v.current_position === 'object' ? v.current_position : null;
  const lat = pickNumber(
    v.lat ??
      v.latitude ??
      v.lat_deg ??
      nav?.lat ??
      nav?.latitude ??
      pos?.lat ??
      pos?.latitude ??
      lp?.lat ??
      lp?.latitude ??
      cp?.lat ??
      cp?.latitude
  );
  const lon = pickNumber(
    v.lon ??
      v.longitude ??
      v.lng ??
      v.lon_deg ??
      nav?.lon ??
      nav?.longitude ??
      pos?.lon ??
      pos?.longitude ??
      lp?.lon ??
      lp?.longitude ??
      cp?.lon ??
      cp?.longitude
  );
  if (lat == null || lon == null) return null;

  const sog = pickNumber(v.speed ?? v.sog ?? nav?.speed);
  const cog = pickNumber(v.course ?? v.cog ?? nav?.course);
  const type = (v.type && String(v.type)) || '';
  const typeSpecific = (v.type_specific && String(v.type_specific)) || '';
  const flag = (v.country_iso && String(v.country_iso)) || (v.flag && String(v.flag)) || '';
  const dest = (v.destination && String(v.destination).trim().slice(0, 80)) || '';

  const idKey = mmsi || imo || v.uuid || `${lat},${lon}`;
  const url = mmsi
    ? `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`
    : `https://www.marinetraffic.com/en/ais/home/centerx:${lon}/centery:${lat}/zoom:10`;

  const sogStr = sog != null ? `${sog.toFixed(1)} kn` : '—';
  const cogStr = cog != null ? `${Math.round(cog)}°` : '—';
  const summary = [
    `Live AIS · ${type || 'vessel'}${typeSpecific ? ` (${typeSpecific})` : ''}`,
    flag && `flag ${flag}`,
    dest && `dest ${dest}`,
    `${sogStr} · COG ${cogStr}`,
    hubLabel && `hub ${hubLabel}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const title = `${name} · MMSI ${mmsi || '—'}`.slice(0, 500);

  const tags = ['live_track', 'ais', 'merchant_marine', 'datalastic'];
  if (/tanker|oil|chem|gas|lng|lpg/i.test(`${type} ${typeSpecific}`)) tags.push('oil_gas_shipping');
  if (/cargo|container|bulk|roro|vehicle/i.test(`${type} ${typeSpecific}`)) tags.push('cargo_shipping');

  return {
    source: ID,
    source_type: 'live_ais',
    title,
    summary: summary.slice(0, 1200),
    body_snippet: summary.slice(0, 450),
    url,
    published_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    event_type: 'maritime',
    lat,
    lng: lon,
    confidence: 0.78,
    verification_state: 'telemetry',
    tags,
    source_meta: {
      provider: 'datalastic',
      hub: hubLabel,
      mmsi: mmsi || null,
      imo: imo || null,
      vessel_name: name,
      type,
      type_specific: typeSpecific,
      country_iso: flag || null,
      destination: dest || null,
      speed_kn: sog,
      course_deg: cog,
      uuid: v.uuid || null,
    },
  };
}

function buildInradiusUrl(hub, keyParam, key, radius, typeOpt) {
  const u = new URL(ENDPOINT);
  u.searchParams.set(keyParam, key);
  u.searchParams.set('lat', String(hub.lat));
  u.searchParams.set('lon', String(hub.lon));
  u.searchParams.set('radius', String(radius));
  if (typeOpt) u.searchParams.set('type', typeOpt);
  return u;
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 300,
  allowHosts: HOSTS,
  datalasticGloballyDisabled,
  async run(ctx) {
    if (datalasticGloballyDisabled()) {
      ctx.log('info', 'Datalastic disabled: skipping fetch', {
        adapter_id: ID,
        datalastic_planned_calls: 0,
        datalastic_actual_calls: 0,
      });
      return {
        items: [],
        meta: {
          adapter_id: ID,
          skipped: true,
          reason: 'datalastic_kill_switch',
          datalastic_planned_calls: 0,
          datalastic_actual_calls: 0,
        },
      };
    }

    const key = apiKey();
    if (!key) {
      ctx.log('info', 'Datalastic disabled: skipping fetch', {
        adapter_id: ID,
        reason: 'DATALASTIC_API_KEY unset',
        datalastic_planned_calls: 0,
        datalastic_actual_calls: 0,
      });
      return {
        items: [],
        meta: {
          adapter_id: ID,
          skipped: true,
          reason: 'DATALASTIC_API_KEY unset — add key for live AIS (see .env.example)',
          datalastic_planned_calls: 0,
          datalastic_actual_calls: 0,
        },
      };
    }

    const RADIUS_NM = 50;
    const nCalls = plannedHubCalls();
    ctx.log('info', `Datalastic planned calls: ${nCalls}`, { adapter_id: ID });
    const useType = applyTypeFilter();
    const type = useType ? typeFilter() : null;
    const offset = hubOffset();
    const maxEmit = Math.min(80, Math.max(12, ctx.maxPerAdapter || 48));

    const timeoutMs = Math.min(55000, Math.max(12000, parseInt(process.env.DATALASTIC_AIS_TIMEOUT_MS || '22000', 10) || 22000));
    const maxAttempts = Math.min(3, Math.max(1, parseInt(process.env.DATALASTIC_AIS_FETCH_ATTEMPTS || '1', 10) || 1));

    const collected = [];
    let rawVesselRows = 0;
    let datalasticActualCalls = 0;

    async function fetchHubOnce(hub, keyParam) {
      const u = buildInradiusUrl(hub, keyParam, key, RADIUS_NM, type);
      const safeUrl = sanitizeRequestUrl(u.toString());
      let fr;
      try {
        fr = await fetchWithRetry(u.toString(), {
          allowHosts: HOSTS,
          timeoutMs,
          maxAttempts,
          headers: { Accept: 'application/json' },
        });
        datalasticActualCalls += 1;
      } catch (e) {
        ctx.log('warn', `${ID} http_error`, { hub: hub.name, url: safeUrl, err: String(e && e.message) });
        return {
          ok: false,
          reason: String(e && e.message),
          vessels: [],
          textLen: 0,
          safeUrl,
          status: null,
        };
      }

      const text = fr.text || '';
      const textLen = text.length;
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        ctx.log('warn', `${ID} invalid_json`, { hub: hub.name, url: safeUrl, response_length: textLen });
        return { ok: false, reason: 'invalid_json', vessels: [], textLen, safeUrl, status: fr.status };
      }

      if (json && json.meta && json.meta.success === false) {
        ctx.log('warn', `${ID} api_meta_false`, {
          hub: hub.name,
          url: safeUrl,
          response_length: textLen,
          message: json.meta.message || json.meta.error || null,
        });
        return {
          ok: false,
          reason: json.meta.message || json.meta.error || 'api_meta_false',
          vessels: [],
          textLen,
          safeUrl,
          status: fr.status,
        };
      }

      const vessels = extractVessels(json);
      const preview = vessels.slice(0, 2).map(vesselSanitizeSnippet);
      ctx.log('info', `${ID} hub_response`, {
        hub: hub.name,
        url: safeUrl,
        response_length: textLen,
        vessel_rows: vessels.length,
        sample_vessels: preview,
      });

      return { ok: true, vessels, textLen, safeUrl, status: fr.status };
    }

    for (let i = 0; i < nCalls; i += 1) {
      if (ctx.shouldStop()) break;
      const hub = HUBS[(offset + i) % HUBS.length];

      try {
        let res = await fetchHubOnce(hub, 'api-key');
        let vessels = res.ok && Array.isArray(res.vessels) ? res.vessels : [];

        if (
          nCalls > 1 &&
          !res.ok &&
          (res.reason === 'invalid_json' || /http_|fetch|abort/i.test(String(res.reason)))
        ) {
          const r2 = await fetchHubOnce(hub, 'api_key');
          if (r2.ok && Array.isArray(r2.vessels)) {
            vessels = r2.vessels;
            res = r2;
          }
        }

        if (!vessels.length && !res.ok) {
          ctx.log('warn', `${ID} ${hub.name}`, res.reason || 'fetch_failed');
          continue;
        }

        rawVesselRows += vessels.length;
        for (const v of vessels) {
          const ev = vesselToEvent(v, hub.name);
          if (ev) collected.push(ev);
        }
      } catch (e) {
        ctx.log('warn', `${ID} ${hub.name}`, String(e && e.message));
      }
      if (ctx.delayMs) await ctx.sleep(ctx.delayMs);
    }

    const byMmsi = new Map();
    for (const ev of collected) {
      const m = ev.source_meta && ev.source_meta.mmsi;
      const k = m ? String(m) : ev.url;
      if (!byMmsi.has(k)) byMmsi.set(k, ev);
    }
    const unique = [...byMmsi.values()];
    unique.sort((a, b) => {
      const sa = a.source_meta?.speed_kn != null ? a.source_meta.speed_kn : 0;
      const sb = b.source_meta?.speed_kn != null ? b.source_meta.speed_kn : 0;
      return sb - sa;
    });

    const items = unique.slice(0, maxEmit);

    const fetchedCount = rawVesselRows;
    const normalizedEmitted = items.length;

    const backoffEmpty = fetchedCount === 0 && normalizedEmitted === 0;
    const parseOnlyLoss = fetchedCount > 0 && normalizedEmitted === 0;

    const summarySamples = items.slice(0, 2).map((ev) => ({
      mmsi: ev.source_meta?.mmsi ?? null,
      lat: ev.lat != null ? Math.round(ev.lat * 1000) / 1000 : null,
      lng: ev.lng != null ? Math.round(ev.lng * 1000) / 1000 : null,
      name: (ev.source_meta?.vessel_name && String(ev.source_meta.vessel_name).slice(0, 32)) || null,
    }));

    const meta = {
      adapter_id: ID,
      hubs_polled: nCalls,
      hub_offset: offset,
      radius_nm: RADIUS_NM,
      type_filter: type,
      apply_type_filter: useType,
      candidates: unique.length,
      emitted: items.length,
      fetched_count: fetchedCount,
      normalized_emitted: normalizedEmitted,
      sample_vessels: summarySamples,
      backoff_empty: backoffEmpty,
      datalastic_planned_calls: nCalls,
      datalastic_actual_calls: datalasticActualCalls,
    };

    if (parseOnlyLoss) {
      meta.force_next_run_sec = 600;
    }

    ctx.log('info', `Datalastic actual calls made: ${datalasticActualCalls}`, { adapter_id: ID });

    ctx.log('info', `${ID} ingest_summary`, {
      fetched_count: fetchedCount,
      normalized_emitted: normalizedEmitted,
      sample_vessels: summarySamples,
      unique_vessels: unique.length,
      hubs_polled: nCalls,
      datalastic_planned_calls: nCalls,
      datalastic_actual_calls: datalasticActualCalls,
      radius_nm: RADIUS_NM,
      type_filter: type || null,
      backoff_empty: backoffEmpty,
    });

    return { items, meta };
  },
};
