/**
 * Aviation importance scoring for OpenSky / ADS-B style events (heuristic, not classification).
 */

/** @typedef {'routine'|'notable'|'high'|'critical'} AircraftImportance */

const HOTBOXES = [
  { id: 'ukraine_russia', latMin: 43, latMax: 55, lngMin: 22, lngMax: 42, reason: 'near_hotspot' },
  { id: 'middle_east', latMin: 12, latMax: 42, lngMin: 25, lngMax: 65.5, reason: 'market_sensitive_region' },
  { id: 'taiwan_strait', latMin: 20, latMax: 28, lngMin: 116, lngMax: 126, reason: 'near_hotspot' },
  { id: 'red_sea_suez', latMin: 10, latMax: 33, lngMin: 30, lngMax: 45, reason: 'near_hotspot' },
  { id: 'hormuz_mouth', latMin: 23, latMax: 28.5, lngMin: 55, lngMax: 61, reason: 'near_hotspot' },
];

function inHotbox(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return [];
  const reasons = [];
  for (const b of HOTBOXES) {
    if (la >= b.latMin && la <= b.latMax && ln >= b.lngMin && ln <= b.lngMax) {
      reasons.push(b.reason);
    }
  }
  return [...new Set(reasons)];
}

/**
 * @param {object} p
 * @param {number|null|undefined} p.lat
 * @param {number|null|undefined} p.lng
 * @param {string[]} p.hints
 * @param {string|null|undefined} p.squawk
 * @param {number|null|undefined} p.velocity
 * @param {number|null|undefined} p.baroAltitude
 * @param {number} [p.localClusterCount] aircraft in same ~0.5° cell in this batch
 */
function computeAircraftImportance(p) {
  const hints = Array.isArray(p.hints) ? p.hints.map((x) => String(x)) : [];
  const sq = String(p.squawk || '').replace(/\s+/g, '');
  const hotspotReasons = inHotbox(p.lat, p.lng);
  const reasons = new Set();

  if (sq === '7500' || sq === '7600' || sq === '7700') {
    reasons.add('special_squawk');
  }
  if (hints.includes('military_air_candidate')) reasons.add('military_state_candidate');
  if (hints.includes('high_energy_track')) reasons.add('unusual_route_altitude_speed');
  if (hints.includes('special_squawk')) reasons.add('special_squawk');
  for (const hr of hotspotReasons) reasons.add(hr);
  const clusterN = Math.max(0, Math.floor(Number(p.localClusterCount) || 0));
  if (clusterN >= 4) reasons.add('dense_activity_cluster');

  const hasMil = hints.includes('military_air_candidate');
  const hasHot = hotspotReasons.length > 0;
  const unusualSpeed = p.velocity != null && Number(p.velocity) > 265;
  const unusualAlt = p.baroAltitude != null && (Number(p.baroAltitude) < 1800 || Number(p.baroAltitude) > 12500);
  const unusualKin = hints.includes('high_energy_track') || unusualSpeed || unusualAlt;

  /** @type {AircraftImportance} */
  let level = 'routine';
  if (reasons.has('special_squawk') || sq === '7500' || sq === '7600' || sq === '7700') {
    level = 'critical';
  } else if (hasMil && hasHot) {
    level = 'high';
  } else if (hasMil || (hasHot && unusualKin)) {
    level = 'high';
  } else if (hasHot || hasMil || unusualKin) {
    level = 'notable';
  } else if (clusterN >= 4) {
    level = 'notable';
  }

  const reasonList = [...reasons];
  if (unusualKin && !reasonList.includes('unusual_route_altitude_speed')) {
    reasonList.push('unusual_route_altitude_speed');
  }

  const primary =
    reasonList.find((r) => r === 'special_squawk') ||
    reasonList.find((r) => r === 'military_state_candidate') ||
    reasonList.find((r) => r === 'near_hotspot' || r === 'market_sensitive_region') ||
    reasonList.find((r) => r === 'unusual_route_altitude_speed') ||
    reasonList.find((r) => r === 'dense_activity_cluster') ||
    'routine_traffic';

  return {
    aircraft_importance: level,
    aircraft_importance_reason: primary,
    aircraft_importance_reasons: reasonList.length ? reasonList : ['routine_traffic'],
  };
}

/**
 * Attach importance to source_meta object (mutates copy-safe if caller merges).
 */
function importanceFieldsForSourceMeta(payload) {
  const imp = computeAircraftImportance(payload);
  return {
    ...imp,
    aircraft_importance_computed_at: 'ingest_v1',
  };
}

/**
 * Backfill top-level fields on a feed row from source_meta + coordinates.
 * @param {object} ev
 */
function enrichAviationEvent(ev) {
  if (!ev || String(ev.event_type || '').toLowerCase() !== 'aviation') return ev;
  if (ev.aircraft_importance && ev.aircraft_importance_reason) return ev;
  let sm = ev.source_meta;
  if (sm == null) return ev;
  if (typeof sm === 'string') {
    try {
      sm = JSON.parse(sm);
    } catch {
      return ev;
    }
  }
  if (!sm || typeof sm !== 'object') return ev;
  if (sm.aircraft_importance && sm.aircraft_importance_reason) {
    return {
      ...ev,
      aircraft_importance: sm.aircraft_importance,
      aircraft_importance_reason: sm.aircraft_importance_reason,
      aircraft_importance_reasons: sm.aircraft_importance_reasons || [],
    };
  }
  const hints = Array.isArray(sm.aviation_hints) ? sm.aviation_hints : [];
  const imp = computeAircraftImportance({
    lat: ev.lat,
    lng: ev.lng,
    hints,
    squawk: sm.squawk,
    velocity: sm.velocity_m_s,
    baroAltitude: sm.baro_altitude_m,
    localClusterCount: sm.local_cluster_count,
  });
  return {
    ...ev,
    ...imp,
    source_meta: { ...sm, ...imp },
  };
}

module.exports = {
  computeAircraftImportance,
  importanceFieldsForSourceMeta,
  enrichAviationEvent,
  inHotbox,
};
