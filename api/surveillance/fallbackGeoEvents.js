/**
 * Structured demo / fallback geospatial events when live ingest returns few or no
 * map-plottable rows (missing OpenSky credentials, DB empty, or filters).
 * Never impersonates live telemetry — each row is tagged is_demo + data_mode.
 */

const DEMO_SOURCE = 'fallback_demo';
const DEMO_PREFIX = 'svfb';

function isoNow() {
  return new Date().toISOString();
}

/** @param {number} lat @param {number} lng */
function validCoord(lat, lng) {
  if (lat == null || lng == null) return false;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  if (la === 0 && ln === 0) return false;
  return true;
}

function countGeoTagged(events) {
  if (!Array.isArray(events)) return 0;
  return events.filter((e) => e && validCoord(e.lat, e.lng)).length;
}

/**
 * Base shape aligned with store.rowToEvent + UI marker_kind / is_demo.
 */
function demoEvent(partial) {
  const now = isoNow();
  return {
    id: `${DEMO_PREFIX}-${partial.suffix}`,
    source: DEMO_SOURCE,
    source_type: 'demo_synthetic',
    title: partial.title,
    summary: partial.summary,
    body_snippet: partial.summary,
    url: `https://example.invalid/surveillance-demo/${partial.suffix}`,
    published_at: now,
    detected_at: now,
    event_type: partial.event_type,
    severity: partial.severity != null ? partial.severity : 2,
    confidence: 0.35,
    countries: partial.countries || [],
    lat: partial.lat,
    lng: partial.lng,
    region: partial.region || 'GLOBAL',
    tags: Array.isArray(partial.tags) ? partial.tags : [partial.marker_kind, 'demo', 'synthetic'],
    affected_assets: partial.affected_assets || [],
    impacted_markets: partial.impacted_markets || ['FX', 'Energy', 'Equities'],
    sentiment: 'neutral',
    verification_state: 'synthetic',
    image_url: null,
    dedupe_keys: [],
    updated_at: now,
    trust_score: 25,
    novelty_score: 40,
    severity_score: 45,
    market_impact_score: partial.market_impact_score != null ? partial.market_impact_score : 35,
    freshness_score: 95,
    rank_score: 20,
    story_id: null,
    corroboration_count: 0,
    risk_bias: partial.risk_bias || 'neutral',
    why_matters: partial.why_matters,
    why_it_matters: partial.why_matters,
    normalized_topic: null,
    story_signature: null,
    source_meta: {
      data_mode: 'demo',
      is_synthetic: true,
      marker_kind: partial.marker_kind,
      note: 'Illustrative marker only — not live ADS-B, AIS, or classified tracking.',
    },
    marker_kind: partial.marker_kind,
    is_demo: true,
    data_mode: 'demo',
  };
}

const FALLBACK_DEMO_EVENTS = [
  demoEvent({
    suffix: 'air-hormuz',
    title: '[Demo] Sample air traffic corridor — Strait of Hormuz',
    summary:
      'Synthetic aircraft marker for map readiness. Configure OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET for live ADS-B.',
    event_type: 'aviation',
    lat: 26.55,
    lng: 56.35,
    region: 'ME',
    countries: ['AE', 'OM', 'IR'],
    marker_kind: 'aircraft',
    severity: 2,
    why_matters: 'Demo only — shows aviation layer when live OpenSky ingest is unavailable.',
    tags: ['aviation', 'aircraft', 'chokepoint', 'demo'],
  }),
  demoEvent({
    suffix: 'ship-suez',
    title: '[Demo] Sample merchant shipping — Suez approaches',
    summary:
      'Synthetic vessel marker for map readiness. Live vessel positions are not used; official maritime and geopolitical feeds plus this labelled demo layer cover the grid when the map is sparse.',
    event_type: 'maritime',
    lat: 29.95,
    lng: 32.55,
    region: 'MENA',
    countries: ['EG'],
    marker_kind: 'naval',
    severity: 2,
    why_matters: 'Demo only — maritime layer placeholder; not live ship tracking.',
    tags: ['maritime', 'shipping', 'logistics', 'demo'],
  }),
  demoEvent({
    suffix: 'sub-norwegian',
    title: '[Demo] Sample undersea / naval activity — Norwegian Sea',
    summary:
      'Synthetic submarine-class marker for UI category coverage. Not derived from classified or commercial submarine tracks.',
    event_type: 'conflict',
    lat: 68.2,
    lng: 5.5,
    region: 'EU',
    countries: ['NO'],
    marker_kind: 'submarine',
    severity: 3,
    why_matters: 'Demo only — illustrates submarine-style marker styling; not live sonar or AIS.',
    tags: ['submarine', 'naval', 'exercise', 'demo'],
  }),
  demoEvent({
    suffix: 'base-guam',
    title: '[Demo] Military logistics hub — western Pacific reference',
    summary: 'Synthetic base marker for bases / installations category.',
    event_type: 'conflict',
    lat: 13.4443,
    lng: 144.7937,
    region: 'APAC',
    countries: ['US'],
    marker_kind: 'military_base',
    severity: 2,
    why_matters: 'Demo only — geographic anchor for base-type filters.',
    tags: ['military', 'base', 'pacific', 'demo'],
  }),
  demoEvent({
    suffix: 'conflict-donetsk',
    title: '[Demo] Conflict monitoring grid — eastern Europe reference',
    summary: 'Synthetic conflict-zone style marker.',
    event_type: 'conflict',
    lat: 48.0159,
    lng: 37.8028,
    region: 'EU',
    countries: ['UA'],
    marker_kind: 'conflict',
    severity: 4,
    why_matters: 'Demo only — conflict layer readiness when wire stories lack coordinates.',
    tags: ['conflict', 'land', 'demo'],
  }),
  demoEvent({
    suffix: 'port-rotterdam',
    title: '[Demo] Port / logistics node — ARA range',
    summary: 'Synthetic port marker for maritime logistics tab.',
    event_type: 'logistics',
    lat: 51.92,
    lng: 4.28,
    region: 'EU',
    countries: ['NL'],
    marker_kind: 'port',
    severity: 2,
    why_matters: 'Demo only — port congestion narrative anchor.',
    tags: ['port', 'logistics', 'demo'],
  }),
  demoEvent({
    suffix: 'energy-chokepoint',
    title: '[Demo] Energy chokepoint — Bab el-Mandeb reference',
    summary: 'Synthetic energy / strait risk marker.',
    event_type: 'energy',
    lat: 12.6,
    lng: 43.4,
    region: 'MENA',
    countries: ['YE', 'DJ'],
    marker_kind: 'energy',
    severity: 3,
    why_matters: 'Demo only — energy chokepoint visualization.',
    tags: ['energy', 'strait', 'chokepoint', 'demo'],
  }),
  demoEvent({
    suffix: 'trade-malacca',
    title: '[Demo] Trade route density — Malacca Strait reference',
    summary: 'Synthetic trade-route marker for globe + maritime tape.',
    event_type: 'logistics',
    lat: 1.42,
    lng: 104.5,
    region: 'APAC',
    countries: ['MY', 'SG', 'ID'],
    marker_kind: 'trade_route',
    severity: 2,
    why_matters: 'Demo only — trade flow map readiness.',
    tags: ['trade', 'route', 'container', 'demo'],
  }),
  demoEvent({
    suffix: 'macro-alert',
    title: '[Demo] Economic / geopolitical alert — sample headline',
    summary: 'Synthetic macro-geopolitical marker.',
    event_type: 'geopolitics',
    lat: 38.9072,
    lng: -77.0369,
    region: 'AMERICAS',
    countries: ['US'],
    marker_kind: 'economic',
    severity: 2,
    why_matters: 'Demo only — macro layer when official feeds have no lat/lng.',
    tags: ['macro', 'policy', 'demo'],
  }),
];

const DEMO_BY_ID = new Map(FALLBACK_DEMO_EVENTS.map((e) => [String(e.id), e]));

function getFallbackEventById(id) {
  if (id == null) return null;
  const s = String(id);
  if (!s.startsWith(`${DEMO_PREFIX}-`)) return null;
  return DEMO_BY_ID.get(s) || null;
}

/**
 * @param {object[]} events Live DB-backed events
 * @param {{ countryIso2?: string|null, minGeoMarkers?: number, tab?: string|null }} opts
 */
function mergeGeoFallback(events, opts = {}) {
  const live = Array.isArray(events) ? events.slice() : [];
  const countryIso2 = opts.countryIso2 ? String(opts.countryIso2).trim().toUpperCase() : null;
  if (countryIso2 && /^[A-Z]{2}$/.test(countryIso2)) {
    return {
      events: live,
      mergedDemoCount: 0,
      reason: 'country_filter_no_demo_merge',
      geoBefore: countGeoTagged(live),
      geoAfter: countGeoTagged(live),
    };
  }

  const tab = opts.tab ? String(opts.tab).toLowerCase() : null;
  const minGeo = Math.max(1, Math.min(12, Number(opts.minGeoMarkers) || 4));
  const geoBefore = countGeoTagged(live);

  const tabTypes = {
    macro: new Set(['macro', 'geopolitics']),
    geopolitics: new Set(['geopolitics']),
    conflict: new Set(['conflict']),
    aviation: new Set(['aviation']),
    maritime: new Set(['maritime', 'logistics']),
    energy: new Set(['energy']),
    commodities: new Set(['commodities']),
    sanctions: new Set(['sanctions']),
    central_banks: new Set(['central_bank']),
    high_impact: null,
    all: null,
  };

  function tabAllows(ev) {
    if (!tab || tab === 'all') return true;
    if (tab === 'high_impact') return (ev.severity || 0) >= 3;
    const set = tabTypes[tab];
    if (!set) return true;
    return set.has(String(ev.event_type || '').toLowerCase());
  }

  const used = new Set();
  for (const e of live) {
    if (e && validCoord(e.lat, e.lng)) {
      used.add(`${Number(e.lat).toFixed(2)}_${Number(e.lng).toFixed(2)}`);
    }
  }

  const out = live.slice();
  let merged = 0;
  let reason = 'sufficient_live_geo';

  if (live.length === 0) {
    reason = 'empty_feed';
  } else if (geoBefore < minGeo) {
    reason = 'sparse_geo';
  } else {
    return { events: out, mergedDemoCount: 0, reason, geoBefore, geoAfter: geoBefore };
  }

  for (const demo of FALLBACK_DEMO_EVENTS) {
    if (merged >= 12) break;
    if (!tabAllows(demo)) continue;
    const key = `${Number(demo.lat).toFixed(2)}_${Number(demo.lng).toFixed(2)}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push(demo);
    merged += 1;
  }

  const geoAfter = countGeoTagged(out);
  return { events: out, mergedDemoCount: merged, reason, geoBefore, geoAfter };
}

module.exports = {
  DEMO_SOURCE,
  DEMO_PREFIX,
  FALLBACK_DEMO_EVENTS,
  validCoord,
  countGeoTagged,
  mergeGeoFallback,
  getFallbackEventById,
};
