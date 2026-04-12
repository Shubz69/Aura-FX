/** Client-side region / country helpers for Surveillance UI (no API contract changes). */

/** ISO2 → centroid for camera arcs / focus (approximate). */
export const SURV_ISO_CENTROID = {
  US: [39.8283, -98.5795],
  CN: [35.8617, 104.1954],
  RU: [61.524, 105.3188],
  UA: [48.3794, 31.1656],
  EU: [50.1109, 8.6821],
  DE: [51.1657, 10.4515],
  FR: [46.2276, 2.2137],
  GB: [55.3781, -3.436],
  JP: [36.2048, 138.2529],
  IR: [32.4279, 53.688],
  IL: [31.0461, 34.8516],
  IN: [20.5937, 78.9629],
  BR: [-14.235, -51.9253],
  CA: [56.1304, -106.3468],
  MX: [23.6345, -102.5528],
  SA: [23.8859, 45.0792],
  VE: [6.4238, -66.5897],
  KR: [35.9078, 127.7669],
  KP: [40.3399, 127.5101],
  TW: [23.6978, 120.9605],
  AU: [-25.2744, 133.7751],
  TR: [38.9637, 35.2433],
  PL: [51.9194, 19.1451],
  IT: [41.8719, 12.5674],
  ES: [40.4637, -3.7492],
  NL: [52.1326, 5.2913],
  SE: [60.1282, 18.6435],
  NO: [60.472, 8.4689],
  EG: [26.8206, 30.8025],
  ZA: [-30.5595, 22.9375],
  NG: [9.082, 8.6753],
  KE: [-0.0236, 37.9062],
  AE: [23.4241, 53.8478],
};

export function normalizeRegionKey(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

export function primaryCountryFromEvent(e) {
  const cc = e?.countries;
  if (Array.isArray(cc) && cc.length) return normalizeRegionKey(cc[0]);
  return null;
}

/** True if event belongs to focus key (ISO2 country code or region label). */
export function eventMatchesFocus(e, focusKey) {
  if (!focusKey) return true;
  const f = normalizeRegionKey(focusKey);
  if (!f) return true;
  const countries = e?.countries;
  if (Array.isArray(countries) && countries.some((c) => normalizeRegionKey(c) === f)) return true;
  if (e?.region && normalizeRegionKey(e.region) === f) return true;
  return false;
}

export function filterEventsByFocus(events, focusKey) {
  if (!focusKey) return events;
  return events.filter((e) => eventMatchesFocus(e, focusKey));
}

export function buildEventsById(events) {
  const m = new Map();
  for (const e of events || []) {
    if (e && e.id != null) m.set(String(e.id), e);
  }
  return m;
}

export function storyMatchesFocus(story, focusKey, eventsById) {
  if (!focusKey) return true;
  const top = eventsById.get(String(story.top_event_id));
  if (top && eventMatchesFocus(top, focusKey)) return true;
  const f = normalizeRegionKey(focusKey);
  if (story.regions?.some((r) => normalizeRegionKey(r) === f)) return true;
  return false;
}

export function filterDigestByFocus(digest, focusKey, eventsById) {
  if (!digest || !focusKey) return digest;
  const filt = (rows, idKey = 'id') => {
    if (!Array.isArray(rows)) return rows;
    return rows.filter((row) => {
      const id = row[idKey];
      const ev = eventsById.get(String(id));
      return ev && eventMatchesFocus(ev, focusKey);
    });
  };
  return {
    ...digest,
    developingStories: digest.developingStories?.filter((s) => storyMatchesFocus(s, focusKey, eventsById)) ?? [],
    highMarketImpact: filt(digest.highMarketImpact, 'id'),
    aviationAlerts: filt(digest.aviationAlerts, 'id'),
    maritimeLogistics: filt(digest.maritimeLogistics, 'id'),
    corroboratedAlerts: filt(digest.corroboratedAlerts, 'id'),
  };
}

export function cameraTargetForFocus(focusKey, events, isoCentroidMap = SURV_ISO_CENTROID) {
  if (!focusKey) return null;
  const f = normalizeRegionKey(focusKey);
  if (isoCentroidMap && isoCentroidMap[f]) {
    const [lat, lng] = isoCentroidMap[f];
    return { lat, lng, altitude: 1.55 };
  }
  const hits = (events || []).filter((e) => eventMatchesFocus(e, focusKey) && e.lat != null && e.lng != null);
  if (!hits.length) return null;
  let slat = 0;
  let slng = 0;
  for (const e of hits) {
    slat += Number(e.lat);
    slng += Number(e.lng);
  }
  const lat = slat / hits.length;
  const lng = slng / hits.length;
  return { lat, lng, altitude: 1.52 };
}

export function focusSummaryFromEvents(focusKey, events) {
  if (!focusKey) return null;
  const f = normalizeRegionKey(focusKey);
  const matched = (events || []).filter((e) => eventMatchesFocus(e, f));
  if (!matched.length) {
    return {
      key: f,
      label: f.replace(/_/g, ' '),
      isoHint: /^[A-Z]{2}$/.test(f) ? f : null,
      count: 0,
      maxRank: 0,
      maxSev: 0,
    };
  }
  const iso = /^[A-Z]{2}$/.test(f) ? f : primaryCountryFromEvent(matched[0]) || null;
  const label = iso && iso === f ? f : matched[0]?.region || f;
  const maxRank = matched.reduce((m, e) => Math.max(m, Number(e.rank_score) || 0), 0);
  const maxSev = matched.reduce((m, e) => Math.max(m, Number(e.severity) || 0), 0);
  return {
    key: f,
    label: label || f,
    isoHint: iso,
    count: matched.length,
    maxRank,
    maxSev,
  };
}
