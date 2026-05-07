import React, { useMemo, useRef, useEffect, useLayoutEffect, useState, Suspense, lazy, useCallback } from 'react';
import * as THREE from 'three';
import {
  SURV_ISO_CENTROID,
  eventMatchesFocus,
  cameraTargetForFocus,
  surveillanceCountriesGeoJsonUrl,
  polygonsAndCentroidsFromCountriesGeoJSON,
  normalizeRegionKey,
} from './surveillanceRegionUtils';
import { markerIconForKind, markerKindFromEvent } from './surveillanceIntelligence';
import GlobeSearchBar from './GlobeSearchBar';

// ⭐ SOUND SYSTEM
const SOUNDS = {
  criticalAlert: null,
  newMarker: null,
  hover: null,
};

function initSounds() {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Critical alert - sharp ping
    SOUNDS.criticalAlert = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    };
    
    // New marker - subtle click
    SOUNDS.newMarker = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    };
    
    // Hover - soft tick
    SOUNDS.hover = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    };
  } catch (e) {
    // Audio not available - silent fallback
  }
}

// Initialize sounds
if (typeof window !== 'undefined') {
  initSounds();
}

const Globe = lazy(() => import('react-globe.gl').then((m) => ({ default: m.default })));

const NO_HEATMAPS = [];

const GLOBE_BASE = 'https://unpkg.com/three-globe@2.45.2/example/img';
const GLOBE_TEXTURE_NIGHT = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg';
const GLOBE_TEXTURE_LO = `${GLOBE_BASE}/earth-blue-marble.jpg`;

// ⭐ NEW: Enhanced visual presets
const ATMOSPHERE_PRESETS = {
  day: { color: 'rgb(30, 40, 60)', altitude: 0.035 },
  dusk: { color: 'rgb(40, 25, 50)', altitude: 0.045 },
  night: { color: 'rgb(12, 18, 32)', altitude: 0.055 },
};

const STAR_COLORS = ['#ffffff', '#ffe9c4', '#c4d5ff', '#ffc4c4', '#c4ffe9'];
const AURORA_COLORS = ['#00ff88', '#00ccff', '#ff00ff', '#ff6600'];

let neGeoJsonCache = null;
let neGeoJsonPromise = null;

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nightFactorFromLocalTime(d = new Date()) {
  const t = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  if (t >= 20.5 || t <= 4.5) return 1;
  if (t >= 9 && t <= 16.5) return 0;
  if (t > 16.5 && t < 20.5) return (t - 16.5) / 4;
  if (t > 4.5 && t < 9) return 1 - (t - 4.5) / 4.5;
  return 0.2;
}

function hexLerpColor(hexA, hexB, t) {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  const u = Math.max(0, Math.min(1, t));
  return `#${a.lerp(b, u).getHexString()}`;
}

function loadCountriesGeoJson() {
  if (neGeoJsonCache) return Promise.resolve(neGeoJsonCache);
  if (!neGeoJsonPromise) {
    neGeoJsonPromise = fetch(surveillanceCountriesGeoJsonUrl(), { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('geojson');
        return r.json();
      })
      .then((j) => {
        neGeoJsonCache = j;
        return j;
      })
      .catch(() => {
        neGeoJsonPromise = null;
        return null;
      });
  }
  return neGeoJsonPromise;
}

function clusterEvents(events, precision = 1) {
  const buckets = new Map();
  for (const ev of events) {
    if (ev.lat == null || ev.lng == null) continue;
    const key = `${Number(ev.lat).toFixed(precision)}_${Number(ev.lng).toFixed(precision)}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        lat: ev.lat,
        lng: ev.lng,
        count: 0,
        maxSev: 0,
        maxSevScore: 0,
        ids: [],
        label: '',
      });
    }
    const b = buckets.get(key);
    b.count += 1;
    b.maxSev = Math.max(b.maxSev, ev.severity || 1);
    b.maxSevScore = Math.max(b.maxSevScore, ev.severity_score != null ? Number(ev.severity_score) : 0);
    b.ids.push(ev.id);
    if (!b.label || (ev.title && ev.title.length < b.label.length)) {
      b.label = ev.title || '';
    }
  }
  return Array.from(buckets.values()).map((b) => ({
    lat: b.lat,
    lng: b.lng,
    eventId: b.ids[0],
    eventIds: b.ids,
    count: b.count,
    maxSev: b.maxSev,
    maxSevScore: b.maxSevScore,
    label: b.count > 1 
      ? `<b>${b.count} events</b><br/>${b.label.slice(0, 60)}`
      : `<b>${b.label}</b>`,
  }));
}

function parseEventSourceMeta(ev) {
  if (!ev || ev.source_meta == null) return null;
  if (typeof ev.source_meta === 'object') return ev.source_meta;
  try {
    const o = JSON.parse(String(ev.source_meta));
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function eventTrackKind(ev) {
  if (!ev) return 'intel';
  const meta = parseEventSourceMeta(ev);
  const hints = Array.isArray(meta?.aviation_hints) ? meta.aviation_hints.map((x) => String(x).toLowerCase()) : [];
  const milHint = hints.some((h) => h === 'military_air_candidate' || h === 'special_squawk');
  const cargoHint = hints.includes('cargo_air_candidate');

  const et = String(ev.event_type || '').toLowerCase();
  if (et === 'aviation') {
    if (milHint) return 'aviation_military';
    if (cargoHint) return 'aviation_cargo';
    return 'aviation';
  }
  const src = String(ev.source || '').toLowerCase();
  if (src.includes('opensky') || src.includes('adsb') || src.includes('flight')) {
    if (milHint) return 'aviation_military';
    if (cargoHint) return 'aviation_cargo';
    return 'aviation';
  }
  const tags = Array.isArray(ev.tags) ? ev.tags : [];
  for (const t of tags) {
    const s = String(t).toLowerCase();
    if (s.includes('military_air_candidate')) return 'aviation_military';
    if (s.includes('cargo_air_candidate')) return 'aviation_cargo';
    if (s.includes('flight') || s.includes('aircraft') || s.includes('live_track') || s.includes('ads-b')) {
      if (milHint) return 'aviation_military';
      if (cargoHint) return 'aviation_cargo';
      return 'aviation';
    }
    if (
      s.includes('military') ||
      s.includes('defence') ||
      s.includes('defense') ||
      s.includes('mod') ||
      s.includes('pentagon')
    ) {
      return 'military';
    }
  }
  if (et === 'conflict' || et === 'sanctions' || et === 'geopolitics') return 'military';
  const blob = `${ev.title || ''} ${ev.summary || ''}`.toLowerCase();
  if (/(nato|defence|defense|military|naval|troop|missile|strike|drone)/.test(blob)) return 'military';
  return 'intel';
}

function trackKindRank(kind) {
  const order = {
    intel: 0,
    military: 1,
    aviation: 2,
    aviation_cargo: 2.55,
    aviation_military: 2.95,
  };
  return order[kind] ?? 0;
}

function aircraftImportanceImpulse(ev) {
  const t = String(ev?.aircraft_importance || '').toLowerCase();
  if (t === 'critical') return 1;
  if (t === 'high') return 0.78;
  if (t === 'notable') return 0.48;
  return 0;
}

function normalizeEventCategory(eventType) {
  const et = String(eventType || '').toLowerCase();
  if (et === 'central_bank') return 'central_banks';
  if (et === 'logistics') return 'maritime';
  if (
    et === 'all' ||
    et === 'macro' ||
    et === 'geopolitics' ||
    et === 'conflict' ||
    et === 'aviation' ||
    et === 'maritime' ||
    et === 'energy' ||
    et === 'commodities' ||
    et === 'sanctions' ||
    et === 'central_banks' ||
    et === 'high_impact'
  ) {
    return et;
  }
  return 'geopolitics';
}

function eventUiCategory(ev) {
  if (!ev) return 'geopolitics';
  const et = normalizeEventCategory(ev.event_type);
  if (et && et !== 'geopolitics') return et;
  const text = `${ev.title || ''} ${ev.summary || ''}`.toLowerCase();
  if (/\b(sanction|ofac|asset freeze)\b/.test(text)) return 'sanctions';
  if (/\b(airspace|flight|aviation|airport|notam|ads-b)\b/.test(text)) return 'aviation';
  if (/\b(maritime|shipping|vessel|port|freight|logistics|strait)\b/.test(text)) return 'maritime';
  if (/\b(oil|opec|crude|gas|lng|energy)\b/.test(text)) return 'energy';
  if (/\b(wheat|corn|soy|copper|gold|commodity)\b/.test(text)) return 'commodities';
  if (/\b(central bank|fed|ecb|boj|boe|policy rate|interest rate)\b/.test(text)) return 'central_banks';
  if (/\b(conflict|military|war|missile|strike|troops)\b/.test(text)) return 'conflict';
  if (/\b(gdp|inflation|cpi|employment|jobs report|treasury)\b/.test(text)) return 'macro';
  return 'geopolitics';
}

function categoryColor(category) {
  const c = normalizeEventCategory(category);
  const palette = {
    macro: 'rgba(176, 214, 255, 0.9)',
    geopolitics: 'rgba(236, 172, 118, 0.92)',
    conflict: 'rgba(255, 130, 116, 0.94)',
    aviation: 'rgba(118, 228, 255, 0.96)',
    maritime: 'rgba(132, 204, 255, 0.9)',
    energy: 'rgba(255, 194, 106, 0.94)',
    commodities: 'rgba(212, 184, 118, 0.92)',
    sanctions: 'rgba(255, 160, 136, 0.94)',
    central_banks: 'rgba(190, 214, 255, 0.94)',
    high_impact: 'rgba(255, 146, 110, 0.95)',
  };
  return palette[c] || palette.geopolitics;
}

function clusterDominantTrackKind(idMap, pt) {
  let best = 'intel';
  let bestR = 0;
  for (const id of pt.eventIds || []) {
    const ev = idMap.get(String(id));
    const k = eventTrackKind(ev);
    const r = trackKindRank(k);
    if (r >= bestR) {
      bestR = r;
      best = k;
    }
  }
  return best;
}

function clusterDominantCategory(idMap, pt) {
  const counts = new Map();
  for (const id of pt.eventIds || []) {
    const ev = idMap.get(String(id));
    const cat = eventUiCategory(ev);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  let best = 'geopolitics';
  let max = 0;
  counts.forEach((v, k) => {
    if (v > max) {
      max = v;
      best = k;
    }
  });
  return best;
}

function buildArcs(events) {
  const out = [];
  for (const ev of events) {
    const cc = ev.countries || [];
    if (cc.length < 2) continue;
    const a = SURV_ISO_CENTROID[cc[0]];
    const b = SURV_ISO_CENTROID[cc[1]];
    if (!a || !b) continue;
    out.push({
      startLat: a[0],
      startLng: a[1],
      endLat: b[0],
      endLng: b[1],
      eventId: ev.id,
      sev: Number(ev.severity) || 1,
    });
    if (out.length >= 26) break;
  }
  return out;
}

function clusterTouchesFocus(pt, idMap, focusRegion) {
  if (!focusRegion || !pt.eventIds?.length) return false;
  for (const id of pt.eventIds) {
    const ev = idMap.get(String(id));
    if (ev && eventMatchesFocus(ev, focusRegion)) return true;
  }
  return false;
}

function pointLabelHTML(kind, impactLevel, isNew, isCritical) {
  const icons = {
    'aircraft': '✈',
    'aviation_military': '✈',
    'aviation_cargo': '✈',
    'aviation': '✈',
    'military': '◆',
    'naval': '◆',
    'submarine': '◆',
    'conflict': '◆',
    'energy': '●',
    'trade_route': '●',
    'default': '●'
  };
  
  const icon = icons[kind] || icons['default'];
  const color = kind.includes('aviation') ? '#ff9933' : 
                kind === 'military' ? '#ee5544' : 
                kind === 'naval' ? '#5599dd' : '#ccaa66';
  
  // ⭐ Pulse animation for critical/live markers
  const animation = isCritical 
    ? 'animation: criticalPulse 0.8s ease-in-out infinite;' 
    : isNew 
      ? 'animation: markerAppear 0.5s ease-out;'
      : 'animation: subtleFloat 3s ease-in-out infinite;';
  
  return `<div style="
    font-size: 16px;
    font-weight: bold;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 0 ${isCritical ? '8px' : '4px'} ${color});
    cursor: pointer;
    pointer-events: auto;
    font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
    ${animation}
  ">${icon}</div>`;
}

function createTacticalGrid(globeRadius) {
  const group = new THREE.Group();
  const segments = 36;
  const material = new THREE.LineBasicMaterial({
    color: 0x334455,
    transparent: true,
    opacity: 0.12,
    depthTest: true,
  });

  // Latitude lines
  for (let lat = -75; lat <= 75; lat += 15) {
    const phi = (90 - lat) * (Math.PI / 180);
    const r = globeRadius * 1.002 * Math.cos(phi);
    const y = globeRadius * 1.002 * Math.sin(phi);
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));
  }

  // Longitude lines
  for (let lng = 0; lng < 360; lng += 15) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * Math.PI;
      const x = globeRadius * 1.002 * Math.sin(phi) * Math.cos(lng * (Math.PI / 180));
      const y = globeRadius * 1.002 * Math.cos(phi);
      const z = globeRadius * 1.002 * Math.sin(phi) * Math.sin(lng * (Math.PI / 180));
      points.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));
  }

  group.name = 'svTacticalGrid';
  group.renderOrder = -200;
  return group;
}

export default function SurveillanceGlobe({
  events,
  selectedId,
  focusRegion,
  activeCategory = 'all',
  onSelectEvent,
  onHoverEvent,
  onDiagnostics,
  onCountryFocus,
  onGlobeBackground,
  reducedMotion,
}) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const surfacePickAtRef = useRef(0);
  const povAltitudeRef = useRef(2.48);
  const nightFactorRef = useRef(nightFactorFromLocalTime());
  const reducedMotionRef = useRef(!!reducedMotion);
  const spaceAnimRef = useRef(0);
  const spaceBackdropRef = useRef(null);
  const [dims, setDims] = useState({ w: 320, h: 320 });
  const [povAltitude, setPovAltitude] = useState(2.48);
  const [nightFactor, setNightFactor] = useState(() => nightFactorFromLocalTime());
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredPreview, setHoveredPreview] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 }); 
  const [globeReveal, setGlobeReveal] = useState(false);
  const [globeTextureUrl, setGlobeTextureUrl] = useState(GLOBE_TEXTURE_NIGHT);
  const [polygonsData, setPolygonsData] = useState([]);
  const [loadedIsoCentroids, setLoadedIsoCentroids] = useState({});
  const [hoveredIso, setHoveredIso] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);

  // ⭐ Pause auto-rotation on user interaction
  const userInteracting = useRef(false);
  const interactionTimeout = useRef(null);
  
  const handleUserInteraction = useCallback(() => {
    setAutoRotate(false);
    userInteracting.current = true;
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => {
      setAutoRotate(true);
      userInteracting.current = false;
    }, 8000); // Resume auto-rotate after 8 seconds of inactivity
  }, []);

  // Zoom control state
  const [currentZoom, setCurrentZoom] = useState(2.48);
  const ZOOM_STEP = 0.3;
  const MIN_ZOOM = 0.8;
  const MAX_ZOOM = 4.5;

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    const g = globeRef.current;
    if (!g || typeof g.pointOfView !== 'function') return;
    
    handleUserInteraction();
    
    const newAltitude = Math.max(MIN_ZOOM, povAltitudeRef.current - ZOOM_STEP);
    const currentPov = g.pointOfView();
    
    g.pointOfView({
      lat: currentPov.lat,
      lng: currentPov.lng,
      altitude: newAltitude
    }, 400);
    
    setPovAltitude(newAltitude);
    setCurrentZoom(newAltitude);
  }, [handleUserInteraction]);

  const handleZoomOut = useCallback(() => {
    const g = globeRef.current;
    if (!g || typeof g.pointOfView !== 'function') return;
    
    handleUserInteraction();
    
    const newAltitude = Math.min(MAX_ZOOM, povAltitudeRef.current + ZOOM_STEP);
    const currentPov = g.pointOfView();
    
    g.pointOfView({
      lat: currentPov.lat,
      lng: currentPov.lng,
      altitude: newAltitude
    }, 400);
    
    setPovAltitude(newAltitude);
    setCurrentZoom(newAltitude);
  }, [handleUserInteraction]);

  const handleResetZoom = useCallback(() => {
    const g = globeRef.current;
    if (!g || typeof g.pointOfView !== 'function') return;
    
    handleUserInteraction();
    
    g.pointOfView({
      lat: 16,
      lng: -38,
      altitude: 2.48
    }, 600);
    
    setPovAltitude(2.48);
    setCurrentZoom(2.48);
  }, [handleUserInteraction]);

  // Update currentZoom when povAltitude changes from other sources
  useEffect(() => {
    setCurrentZoom(povAltitude);
  }, [povAltitude]);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const focusIso = useMemo(() => {
    if (!focusRegion) return null;
    const f = normalizeRegionKey(focusRegion);
    return /^[A-Z]{2}$/.test(f) ? f : null;
  }, [focusRegion]);

  const centroidLookup = useMemo(() => ({ ...SURV_ISO_CENTROID, ...loadedIsoCentroids }), [loadedIsoCentroids]);

  const moonGeometry = useMemo(() => new THREE.SphereGeometry(0.084, 24, 24), []);
  const moonMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: 0xe8eaf4,
        emissive: 0x121820,
        shininess: 28,
        specular: 0x6a7088,
      }),
    []
  );

  const rockyPlanetGeometry = useMemo(() => new THREE.SphereGeometry(0.026, 14, 14), []);
  const gasPlanetGeometry = useMemo(() => new THREE.SphereGeometry(0.034, 14, 14), []);
  const rockyPlanetMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: 0x5c4a42,
        emissive: 0x0a0806,
        shininess: 6,
        specular: 0x222018,
      }),
    []
  );
  const gasPlanetMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: 0x354050,
        emissive: 0x06080c,
        shininess: 22,
        specular: 0x303848,
        transparent: true,
        opacity: 0.82,
      }),
    []
  );

  const celestialObjectsData = useMemo(() => {
    if (povAltitude < 1.02) return [];
    const nf = nightFactor;
    const moonAlt =
      0.78 + Math.min(0.2, (povAltitude - 1.02) * 0.14) + nf * 0.1 + (povAltitude > 2 ? 0.04 : 0);
    const bodies = [{ id: 'moon', kind: 'moon', lat: 12, lng: -96, alt: Math.min(1.12, moonAlt) }];
    if (povAltitude > 1.38) {
      bodies.push(
        { id: 'rocky', kind: 'rocky', lat: -20, lng: 128, alt: 1.06 + (povAltitude - 1.38) * 0.07 },
        { id: 'gas', kind: 'gas', lat: 46, lng: -162, alt: 1.18 + (povAltitude - 1.38) * 0.06 }
      );
    }
    return bodies;
  }, [povAltitude, nightFactor]);

  const objectThreeObject = useCallback(
    (d) => {
      if (d.kind === 'rocky') {
        return new THREE.Mesh(rockyPlanetGeometry, rockyPlanetMaterial.clone());
      }
      if (d.kind === 'gas') {
        return new THREE.Mesh(gasPlanetGeometry, gasPlanetMaterial.clone());
      }
      return new THREE.Mesh(moonGeometry, moonMaterial);
    },
    [moonGeometry, moonMaterial, rockyPlanetGeometry, rockyPlanetMaterial, gasPlanetGeometry, gasPlanetMaterial]
  );

  const sceneBackground = useMemo(
    () => {
      return 'rgb(4, 8, 18)';  // Deep dark blue matching reference
    },
    []
  );

  const refineGlobeSurface = useCallback(() => {
    const g = globeRef.current;
    if (!g || typeof g.globeMaterial !== 'function' || typeof g.renderer !== 'function') return false;
    const mat = g.globeMaterial();
    const renderer = g.renderer();
    if (!mat || !mat.map || !renderer) return false;
    const cap = renderer.capabilities?.getMaxAnisotropy?.() ?? 8;
    mat.map.anisotropy = Math.min(16, Math.max(4, cap));
    mat.map.minFilter = THREE.LinearMipmapLinearFilter;
    mat.map.magFilter = THREE.LinearFilter;
    mat.map.generateMipmaps = true;
    mat.map.needsUpdate = true;
    
    // ⭐ Enhanced globe material
       mat.color = new THREE.Color(0x334466);
    mat.emissive = new THREE.Color(0x050b14);
    mat.emissiveIntensity = 0.04;
    mat.shininess = 0.15;
    mat.specular = new THREE.Color(0x1b2f4f);
    mat.roughness = 0.8;
    mat.needsUpdate = true;
    return true;
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setGlobeTextureUrl(GLOBE_TEXTURE_NIGHT);
    img.onerror = () => setGlobeTextureUrl(GLOBE_TEXTURE_LO);
    img.src = GLOBE_TEXTURE_NIGHT;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCountriesGeoJson().then((geojson) => {
      if (cancelled || !geojson) return;
      const { polygonsData: rows, isoCentroids } = polygonsAndCentroidsFromCountriesGeoJSON(geojson);
      setPolygonsData(rows);
      setLoadedIsoCentroids(isoCentroids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    const panel = el?.parentElement;
    const target = panel && panel.classList?.contains('sv-globe-panel') ? panel : el;
    if (!target || typeof ResizeObserver === 'undefined') return undefined;
    
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        const w = Math.floor(cr.width);
        const h = Math.floor(cr.height);
        setDims({ w, h });
      }
    });
    
    ro.observe(target);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dims.w < 200) return undefined;
    const t = setTimeout(() => setGlobeReveal(true), reducedMotion ? 0 : 70);
    return () => clearTimeout(t);
  }, [dims.w, dims.h, reducedMotion]);

  useEffect(() => {
    if (dims.w < 200) return undefined;
    let cancelled = false;
    let frames = 0;
    const syncRendererToDims = () => {
      if (cancelled) return;
      const g = globeRef.current;
      const renderer = g && typeof g.renderer === 'function' ? g.renderer() : null;
      if (renderer && typeof renderer.setPixelRatio === 'function') {
        const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const pr = reducedMotion ? Math.min(1.25, Math.max(1, raw)) : Math.min(2.25, Math.max(1, raw));
        renderer.setPixelRatio(pr);
        if (typeof renderer.setSize === 'function') {
          renderer.setSize(dims.w, dims.h, true);
        }
      }
      frames += 1;
      if (frames < 36 && (!renderer || typeof renderer.setPixelRatio !== 'function')) {
        requestAnimationFrame(syncRendererToDims);
      }
    };
    syncRendererToDims();
    return () => {
      cancelled = true;
    };
  }, [dims.w, dims.h, reducedMotion]);

  useEffect(() => {
    if (!globeReveal || dims.w < 200) return undefined;
    let cancelled = false;
    let n = 0;
    const tick = () => {
      if (cancelled) return;
      if (refineGlobeSurface() || n++ > 48) return;
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [globeReveal, dims.w, dims.h, refineGlobeSurface, globeTextureUrl]);

  const handleZoom = useCallback((pov) => {
    if (pov && typeof pov.altitude === 'number' && Number.isFinite(pov.altitude)) {
      setPovAltitude(pov.altitude);
    }
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        e.stopPropagation();
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: true, capture: true });
    return () => wrap.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  useEffect(() => {
    moonMaterial.emissive.lerpColors(
      new THREE.Color(0x101420),
      new THREE.Color(0x283040),
      nightFactor * 0.85
    );
    moonMaterial.needsUpdate = true;
  }, [nightFactor, moonMaterial]);

  useEffect(() => {
    const refresh = () => setNightFactor(nightFactorFromLocalTime());
    refresh();
    const id = window.setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, []);

  const teardownSpaceBackdrop = useCallback(() => {
    if (spaceAnimRef.current) {
      cancelAnimationFrame(spaceAnimRef.current);
      spaceAnimRef.current = 0;
    }
    const g = globeRef.current;
    if (g && typeof g.scene === 'function') {
      const scene = g.scene();
      const backdrop = scene.getObjectByName('svSpaceBackdrop');
      if (backdrop) {
        backdrop.traverse((ch) => {
          if (ch.geometry) ch.geometry.dispose?.();
          const m = ch.material;
          if (m) {
            if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
            else m.dispose?.();
          }
        });
        scene.remove(backdrop);
      }
    }
    spaceBackdropRef.current = null;
  }, []);

  const installSpaceBackdrop = useCallback(() => {
    teardownSpaceBackdrop();
    const g = globeRef.current;
    if (!g || typeof g.scene !== 'function') return;

    const scene = g.scene();
    const globeR = typeof g.getGlobeRadius === 'function' ? g.getGlobeRadius() : 100;
    const shellR = globeR * 4.65;
    const count = reducedMotionRef.current ? 800 : 1500;
    const positions = new Float32Array(count * 3);
    const rnd = mulberry32(0x5c3e91d2);
    for (let i = 0; i < count; i++) {
      const u = rnd();
      const v = rnd();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = shellR * (0.962 + 0.038 * rnd());
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rm0 = reducedMotionRef.current;
    
    // ⭐ Enhanced stars with color variety and twinkle
    const starColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const colorHex = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
      const color = new THREE.Color(colorHex);
      starColors[i * 3] = color.r;
      starColors[i * 3 + 1] = color.g;
      starColors[i * 3 + 2] = color.b;
    }
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    
    // Tactical starfield - subdued, realistic density
    const starMat = new THREE.PointsMaterial({
      size: rm0 ? 0.04 : 0.055,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.name = 'svStarfield';
    stars.frustumCulled = false;
    stars.renderOrder = -500;

    // ⭐ Deep layer - distant stars (moves slower)
    const deepCount = Math.floor(count * 0.4);
    const deepPositions = new Float32Array(deepCount * 3);
    for (let i = 0; i < deepCount; i++) {
      const u = rnd();
      const v = rnd();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = shellR * (1.08 + 0.04 * rnd());
      deepPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      deepPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      deepPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const deepStarGeo = new THREE.BufferGeometry();
    deepStarGeo.setAttribute('position', new THREE.BufferAttribute(deepPositions, 3));
    const deepStarMat = new THREE.PointsMaterial({
      size: 0.035,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      color: 0x8899cc,
    });
    const deepStars = new THREE.Points(deepStarGeo, deepStarMat);
    deepStars.name = 'svDeepStars';
    deepStars.frustumCulled = false;
    deepStars.renderOrder = -510;

    const group = new THREE.Group();
    group.name = 'svSpaceBackdrop';
    group.renderOrder = -500;
    group.add(stars);
    group.add(deepStars);
    scene.add(group);
    const grid = createTacticalGrid(globeR);
    scene.add(grid);
    spaceBackdropRef.current = group;
    // ⭐ City lights glow layer
    const cityGlowGeo = new THREE.SphereGeometry(globeR * 1.02, 64, 64);
    const cityGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlobeRadius: { value: globeR },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vUv = uv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uGlobeRadius;
        
        // Simple noise for city light pattern
        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        void main() {
          vec3 normal = normalize(vNormal);
          float facing = dot(normal, vec3(0.0, 0.0, 1.0));
          
          // City light clusters
          float cityLight = 0.0;
          vec2 uv = vUv * 8.0;
          vec2 iuv = floor(uv);
          vec2 fuv = fract(uv);
          
          float r = random(iuv);
          if (r > 0.7) {
            cityLight = smoothstep(0.4, 0.0, length(fuv - 0.5)) * (r - 0.7) * 3.0;
          }
          
          float glow = cityLight * max(0.0, facing) * 0.6;
          vec3 color = mix(vec3(0.0), vec3(1.0, 0.7, 0.3), glow);
          float alpha = glow * 0.5;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cityGlow = new THREE.Mesh(cityGlowGeo, cityGlowMat);
    cityGlow.name = 'svCityLights';
    cityGlow.renderOrder = -100;
    scene.add(cityGlow);
    const controls = typeof g.controls === 'function' ? g.controls() : null;

    const tick = () => {
      if (!spaceBackdropRef.current) return;
      const alt = povAltitudeRef.current;
      const nf = nightFactorRef.current;
      const rm = reducedMotionRef.current;
      const zoomReveal = Math.max(0.15, Math.min(1, (alt - 0.88) / 1.12));
      const dayDim = 0.72 + nf * 0.28;
      starMat.opacity = Math.min(0.98, (0.52 + nf * 0.32) * zoomReveal * dayDim + (rm ? 0.14 : 0.1));

      let drift = 0;
      if (!rm && alt > 1.18) {
        drift = performance.now() * 0.0000092;
      }
      let az = 0;
      let pol = Math.PI / 2;
      try {
        if (controls?.getAzimuthalAngle) az = controls.getAzimuthalAngle();
        if (controls?.getPolarAngle) pol = controls.getPolarAngle();
      } catch {
        /* ignore */
      }
      group.rotation.set((pol - Math.PI / 2) * 0.047, drift + az * 0.055, 0, 'YXZ');
      
      // ⭐ Parallax: deep stars rotate slower (0.3x speed) for depth effect
      if (deepStars) {
        deepStars.rotation.set(
          (pol - Math.PI / 2) * 0.014,
          drift * 0.3 + az * 0.016,
          0,
          'YXZ'
        );
      }
      
      spaceAnimRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [teardownSpaceBackdrop]);

  useEffect(() => () => teardownSpaceBackdrop(), [teardownSpaceBackdrop]);

  const onGlobeReady = useCallback(() => {
    const tryInstall = (attempt) => {
      const g = globeRef.current;
      if (g && typeof g.scene === 'function' && g.scene()) {
        installSpaceBackdrop();
        return;
      }
      if (attempt < 20) requestAnimationFrame(() => tryInstall(attempt + 1));
    };
    requestAnimationFrame(() => tryInstall(0));
  }, [installSpaceBackdrop]);

  useLayoutEffect(() => {
    povAltitudeRef.current = povAltitude;
    reducedMotionRef.current = !!reducedMotion;
    nightFactorRef.current = nightFactor;
  }, [povAltitude, reducedMotion, nightFactor]);

  const useHex = false;

  const rawPoints = useMemo(() => {
    const activeCat = normalizeEventCategory(activeCategory);
    return events
      .filter((e) => e.lat != null && e.lng != null)
      .map((e) => {
        const tk = eventTrackKind(e);
        const cat = eventUiCategory(e);
        const catBoost = activeCat !== 'all' && cat === activeCat ? 1.22 : 1;
        const boost =
          tk === 'aviation_military' || tk === 'aviation_cargo'
            ? 1.48
            : tk === 'aviation'
              ? 1.38
              : tk === 'military'
                ? 1.22
                : 1;
        return {
          lat: e.lat,
          lng: e.lng,
          w: Math.max(
            0.15,
            (((e.rank_score != null ? Number(e.rank_score) : 50) + (e.severity || 1) * 6) / 130) * boost * catBoost
          ),
        };
      });
  }, [events, activeCategory]);

  const hexPoints = useMemo(() => rawPoints, [rawPoints]);
  const arcs = useMemo(() => (useHex ? [] : buildArcs(events)), [events, useHex]);
  const pulseStep = 0.5;

  const arcColor = useCallback((d) => {
    const s = d.sev != null ? Number(d.sev) : 1;
    if (s >= 5) return ['rgba(255, 140, 120, 0.16)', 'rgba(220, 72, 72, 0.38)'];
    if (s >= 4) return ['rgba(255, 170, 110, 0.14)', 'rgba(210, 110, 58, 0.32)'];
    if (s >= 3) return ['rgba(240, 210, 100, 0.12)', 'rgba(180, 150, 48, 0.26)'];
    return ['rgba(248, 195, 125, 0.18)', 'rgba(120, 140, 180, 0.22)'];
  }, []);
    // ⭐ Flight paths and aircraft tracking data
  const flightData = useMemo(() => {
    const flights = [];
    
    // Find aviation events
    const aviationEvents = events.filter(e => {
      const et = String(e.event_type || '').toLowerCase();
      const tags = Array.isArray(e.tags) ? e.tags : [];
      const isAviation = et === 'aviation' || 
        tags.some(t => {
          const s = String(t).toLowerCase();
          return s.includes('flight') || s.includes('aircraft') || s.includes('ads-b');
        });
      return isAviation && e.lat != null && e.lng != null;
    });
    
    aviationEvents.forEach((ev, index) => {
      const countries = ev.countries || [];
      const originCountry = countries[0];
      const destCountry = countries[1];
      
      if (originCountry && destCountry) {
        const origin = SURV_ISO_CENTROID[originCountry];
        const dest = SURV_ISO_CENTROID[destCountry];
        
        if (origin && dest) {
          const aircraftCount = Math.min(3, 1 + Math.floor((ev.severity || 1) / 2));
          
          for (let i = 0; i < aircraftCount; i++) {
            const progress = (Date.now() * 0.00001 + i * 0.33) % 1;
            
            flights.push({
              id: `flight-${ev.id}-${i}`,
              eventId: ev.id,
              originLat: origin[0],
              originLng: origin[1],
              destLat: dest[0],
              destLng: dest[1],
              progress,
              speed: 0.0003 + Math.random() * 0.0002,
              altitude: 0.15 + i * 0.05,
              severity: ev.severity || 1,
              isMilitary: eventTrackKind(ev).includes('military'),
              callsign: `${originCountry}${destCountry}${String(index).padStart(3, '0')}`,
              originIso: originCountry,
              destIso: destCountry,
            });
          }
        }
      } else if (ev.lat && ev.lng) {
        const holdingLat = ev.lat;
        const holdingLng = ev.lng;
        const offsetLat = holdingLat + (Math.random() - 0.5) * 2;
        const offsetLng = holdingLng + (Math.random() - 0.5) * 2;
        
        flights.push({
          id: `flight-hold-${ev.id}`,
          eventId: ev.id,
          originLat: holdingLat,
          originLng: holdingLng,
          destLat: offsetLat,
          destLng: offsetLng,
          progress: Math.random(),
          speed: 0.0001 + Math.random() * 0.0001,
          altitude: 0.12,
          severity: ev.severity || 1,
          isMilitary: eventTrackKind(ev).includes('military'),
          callsign: `HOLD${String(index).padStart(3, '0')}`,
          originIso: 'HOLD',
          destIso: '???',
        });
      }
    });
    
    return flights.slice(0, 20);
  }, [events]);

   const points = useMemo(() => {
    const activeCat = normalizeEventCategory(activeCategory);
    const idMap = new Map();
    for (const e of events) idMap.set(String(e.id), e);
    const list = clusterEvents(events, reducedMotion ? 0 : 1);
    
    return list.map((p) => {
      const hot = p.maxSev >= 4 || p.maxSevScore >= 72;
      const isSel = String(p.eventId) === String(selectedId);
      const inFocus = clusterTouchesFocus(p, idMap, focusRegion);
      const lens = !!focusRegion;
      const muted = lens && !inFocus && !isSel;
      const dominantCategory = clusterDominantCategory(idMap, p);
      const categoryFocused = activeCat !== 'all' && dominantCategory === activeCat;
      
      const liveCluster = p.eventIds?.some((evId) => {
        const ev = idMap.get(String(evId));
        if (!ev) return false;
        if (ev.source === 'opensky_live') return true;
        const tg = ev.tags;
        return Array.isArray(tg) && tg.some((t) => String(t).toLowerCase().includes('live_track'));
      }) ?? false;
      
      const trackKind = clusterDominantTrackKind(idMap, p);
      const leadEvent = idMap.get(String(p.eventId));
      const isAviation = trackKind === 'aviation_military' || 
                         trackKind === 'aviation_cargo' || 
                         trackKind === 'aviation';
      
      const airImp = aircraftImportanceImpulse(leadEvent);
      const impactLevel = String(leadEvent?.market_impact_level || '').toLowerCase();
      const impactScore = Number(leadEvent?.market_impact_score_scaled) || 0;
      const recencyWeight = Number(leadEvent?.recency_weight) || 0.45;
      const highPriority = impactLevel === 'high' || impactLevel === 'critical';
      const isCritical = impactLevel === 'critical';
      const isNew = recencyWeight >= 0.88;
      
        // ⭐ Bloomberg Terminal Style - All gold beams
       // ⭐ Bloomberg Terminal Style - All gold beams
         // ⭐ Severity-based colors: Red (critical) → Orange (high) → Yellow (normal)
      const getBeamColor = () => {
        // Level 5 - Critical: Deep Red
        if (isCritical || p.maxSev >= 5) return '#ff2222';
        // Level 4 - High Impact: Bright Red-Orange
        if (impactLevel === 'high' || p.maxSev >= 4) return '#ff4411';
        // Level 3 - Elevated: Orange
        if (impactLevel === 'medium' || p.maxSev >= 3) return '#ff7722';
        // Level 2 - Watch: Orange-Yellow
        if (p.maxSev >= 2) return '#ff9933';
        // Selected beam: Golden (override)
        if (isSel) return '#ffaa00';
        // Focused/in-lens: Warm Orange
        if (lens && inFocus) return '#ff8833';
        // Live cluster: Orange
        if (liveCluster) return '#ff7722';
        // Aviation: Light Orange
        if (isAviation) return '#ff9944';
        // Default: Warm Yellow
        return '#ffaa22';
      };
      
      const beamColor = getBeamColor();
      
           // ⭐ Beam height - MASSIVE INCREASE for visibility
  const beamHeight = Math.min(
  28.0,   // was: 22.0
  5.0 +   // was: 3.5
  (p.maxSev * 2.2) +       // was: 1.8
  (impactScore / 45) +     // was: 50
  (isCritical ? 8.0 : 0) + // was: 6.0
  (highPriority ? 4.5 : 0) +
  (liveCluster ? 3.0 : 0) +
  (isAviation ? 3.5 : 0) +
  (isSel ? 5.0 : 0)
);

const beamRadius = Math.min(
  1.2,    // was: 2.0 — narrower max
  0.22 +  // was: 0.35 — slimmer base
  (p.count * 0.08) +       // was: 0.12
  (p.maxSev * 0.07) +      // was: 0.1
  (isCritical ? 0.45 : 0) + // was: 0.7
  (highPriority ? 0.3 : 0) +
  (isSel ? 0.35 : 0)
);
      
      return {
        ...p,
          markerIcon: markerIconForKind(
          isAviation ? 'aircraft' : markerKindFromEvent(leadEvent)
        ),
        label: p.label || 'Surveillance node',
        previewText: `${p.count > 1 ? `${p.count} clustered signals` : 'Signal'} · ${
          leadEvent?.market_impact_level || 'Low'
        } impact`,
        // ⭐ NEW: Use beam color directly (no rgba)
        color: beamColor,
        // ⭐ NEW: Beam-specific properties
        beamHeight,
        beamRadius,
        isCritical,
        isNew,
        dataAge: leadEvent?.updated_at 
          ? Math.round((Date.now() - new Date(leadEvent.updated_at).getTime()) / 60000)
          : null,
        // Keep radius small for the base glow dot
                radius: muted ? 0.04 : Math.max(0.08, beamRadius * 0.8),
        // Altitude is now the beam height
        altitude: 0.01 + beamHeight,
      };
    });
  }, [events, selectedId, reducedMotion, focusRegion, activeCategory]);
 // ⭐ Light beam pillars - Custom Three.js objects
  const beamObjects = useMemo(() => {
    if (useHex) return [];
    
    return points.map((pt, index) => {
      const height = pt.beamHeight || 0.3;
      const radius = pt.beamRadius || 0.04;
      const color = pt.color || '#ff8833';
      const isCritical = pt.isCritical;
      const isSelected = String(pt.eventId) === String(selectedId);
      
      // Create a unique ID for each beam
      const beamId = `beam-${pt.eventId || index}`;
      
      return {
        id: beamId,
        lat: pt.lat,
        lng: pt.lng,
         altitude: height * 0.5,
        height,
        radius,
        color,
        isCritical,
        isSelected,
        eventId: pt.eventId,
      };
    });
  }, [points, selectedId, useHex]);

  // ⭐ Create beam geometry (reusable cylinder)
  const beamGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); // Open-ended cylinder
  }, []);

  // ⭐ Create glow ring geometry
  const glowRingGeometry = useMemo(() => {
    return new THREE.TorusGeometry(1, 0.15, 8, 24);
  }, []);
  // ⭐ Create glow cap geometry
  const glowCapGeometry = useMemo(() => {
    return new THREE.SphereGeometry(1, 16, 16);
  }, []);

  
   
  // ⭐ Creates a billboard sprite with always-visible flight label
  const createFlightLabelSprite = useCallback((flight) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    const x = 8, y = 12, w = 384, h = 76, r = 12;
    
    ctx.clearRect(0, 0, 400, 100);
    ctx.fillStyle = flight.isMilitary
      ? 'rgba(20, 8, 8, 0.88)'
      : 'rgba(4, 10, 22, 0.88)';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = flight.isMilitary ? '#ff5533' : '#4488cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.stroke();
    
    ctx.fillStyle = flight.isMilitary ? '#ff4422' : '#3399dd';
    ctx.fillRect(x + 2, y + 8, 4, h - 16);
    
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = flight.isMilitary ? '#ff8866' : '#88ccff';
    ctx.fillText('✈', 24, 52);
    
    ctx.font = 'bold 20px "SF Mono", "Consolas", "Monaco", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(flight.callsign, 62, 40);
    
    ctx.font = '15px "SF Mono", "Consolas", "Monaco", monospace';
    ctx.fillStyle = flight.isMilitary ? '#ffaa88' : '#88bbee';
    const route = `${flight.originIso || '???'}  →  ${flight.destIso || '???'}`;
    ctx.fillText(route, 62, 64);
    
    ctx.font = 'bold 11px "SF Mono", monospace';
    ctx.fillStyle = flight.isMilitary ? '#ff6644' : '#6688aa';
    ctx.fillText(flight.isMilitary ? 'MIL' : 'CIV', 62, 82);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(14, 3.5, 1);
    sprite.name = 'flightLabel';
    return sprite;
  }, []);

  // ⭐ Clean airplane texture (nose points RIGHT for 0° heading)
  const createAircraftTexture = useCallback((isMilitary) => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, size, size);
    
    const color = isMilitary ? '#ff5533' : '#ffffff';
    const strokeColor = isMilitary ? '#ff7755' : '#dddddd';
    
    ctx.save();
    ctx.translate(64, 64);
    // Rotate so nose points RIGHT (0° heading = East)
    ctx.rotate(-Math.PI / 2);
    
    // Fuselage
    ctx.fillStyle = color;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(9, -25);
    ctx.lineTo(9, 20);
    ctx.lineTo(4, 35);
    ctx.lineTo(0, 42);
    ctx.lineTo(-4, 35);
    ctx.lineTo(-9, 20);
    ctx.lineTo(-9, -25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Right wing
    ctx.beginPath();
    ctx.moveTo(9, -5);
    ctx.lineTo(9, 3);
    ctx.lineTo(48, 12);
    ctx.lineTo(48, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Left wing
    ctx.beginPath();
    ctx.moveTo(-9, -5);
    ctx.lineTo(-9, 3);
    ctx.lineTo(-48, 12);
    ctx.lineTo(-48, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Tail fins
    ctx.beginPath();
    ctx.moveTo(4, 28);
    ctx.lineTo(4, 36);
    ctx.lineTo(20, 43);
    ctx.lineTo(20, 35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 28);
    ctx.lineTo(-4, 36);
    ctx.lineTo(-20, 43);
    ctx.lineTo(-20, 35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, []);

  // ⭐ Create sprite airplane with 3D rotation toward destination
  const createAircraftObject = useCallback((flight) => {
    const group = new THREE.Group();
    
    // Main airplane sprite
    const texture = createAircraftTexture(flight.isMilitary);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    const aircraftSprite = new THREE.Sprite(spriteMat);
    aircraftSprite.scale.set(8, 8, 1);
    aircraftSprite.renderOrder = 10;
    group.add(aircraftSprite);
    
    // Floating label
    const label = createFlightLabelSprite(flight);
    label.position.set(0, 9, 0);
    group.add(label);
    
    group.userData = { isAircraft: true, flightData: flight };
    return group;
  }, [createAircraftTexture, createFlightLabelSprite]);
  
  // ⭐ Flight arc line geometry
  const createFlightArcLine = useCallback((originLat, originLng, destLat, destLng, altitude) => {
    const points = [];
    const steps = 30;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat = originLat + (destLat - originLat) * t;
      const lng = originLng + (destLng - originLng) * t;
      
      // Add arc height (parabolic curve)
      const arcHeight = Math.sin(t * Math.PI) * altitude * 3;
      
      points.push({ lat, lng, alt: arcHeight });
    }
    
    return points;
  }, []);

  const beamThreeObject = useCallback((d) => {
  const group = new THREE.Group();
  const color = new THREE.Color(d.color); // Red/Orange/Yellow based on severity
  // Create brighter and lighter versions from the same base color
  const brightColor = color.clone().multiplyScalar(1.3); // Brighter variant
  const coreColor = new THREE.Color(0xFFFFFF); // Core stays white for intensity

 // === LAYER 1: OUTER GLOW (only bottom half, fades upward) ===
const outerGlowMat = new THREE.MeshBasicMaterial({
  color: color,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const outerGlow = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 2.5, 1, 16, 1, true), // tapers: thin top, wide bottom
  outerGlowMat
);
outerGlow.scale.set(d.radius * 2.2, d.height * 0.35, d.radius * 2.2); // only 35% height at bottom
outerGlow.position.y = -(d.height * 0.32); // push down toward base
outerGlow.renderOrder = 0;
group.add(outerGlow);

// Second softer glow layer — even wider, more transparent, at base only
const baseGlowMat = new THREE.MeshBasicMaterial({
  color: color,
  transparent: true,
  opacity: 0.07,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const baseGlow = new THREE.Mesh(
  new THREE.CylinderGeometry(0.1, 4.0, 1, 16, 1, true), // very wide at bottom
  baseGlowMat
);
baseGlow.scale.set(d.radius * 2.8, d.height * 0.2, d.radius * 2.8); // only 20% height
baseGlow.position.y = -(d.height * 0.4); // sit right above surface
baseGlow.renderOrder = 0;
group.add(baseGlow);

  // === LAYER 2: CORE LINE (thin bright beam — the spine) ===
  const coreMat = new THREE.MeshBasicMaterial({
    color: coreColor,
    transparent: true,
    opacity: d.isCritical ? 0.95 : 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 8, 1, true),
    coreMat
  );
 core.scale.set(d.radius * 0.08, d.height, d.radius * 0.08);  // was: 0.18
  core.renderOrder = 3;
  group.add(core);

  // === LAYER 2b: MID GLOW (medium glow wrapping the core) ===
  const midGlowMat = new THREE.MeshBasicMaterial({
    color: brightColor,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const midGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1.1, 1, 12, 1, true),
    midGlowMat
  );
 midGlow.scale.set(d.radius * 0.45, d.height, d.radius * 0.45);  // was: 0.9
  midGlow.renderOrder = 2;
  group.add(midGlow);

  // === LAYER 3: TOP FLARE (energy burst orb at the tip) ===
  // === LAYER 3: TOP TIP (clean sharp point, no bubble glow) ===
  // Tiny bright dot at the very tip
  const tipDotMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xFFFFFF),
    transparent: true,
    opacity: d.isCritical ? 0.9 : 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const tipDot = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 8),
    tipDotMat
  );
  tipDot.scale.setScalar(d.radius * 0.12);
  tipDot.position.y = d.height / 2;
  tipDot.name = 'flareCore';
  tipDot.renderOrder = 6;
  group.add(tipDot);

  // === LAYER 4: BASE GLOW (surface contact — concentric ripple rings) ===
  // Base warm pool under the beam
  const basePoolMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const basePool = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    basePoolMat
  );
 // === BASE POOL — increase scale multiplier ===
basePool.scale.setScalar(d.radius * 12);  // was: d.radius * 3
basePool.position.y = 0;

// === CONCENTRIC RINGS — bigger scales + stronger opacity ===
[2.5, 5.0, 8.5].forEach((scale, i) => {
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.55 - i * 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,  // important for flat rings
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1, 64),  // flat 2D ring — was TorusGeometry
    ringMat
  );
  ring.scale.setScalar(d.radius * scale * 3.5);
  ring.position.y = 0;
  ring.rotation.x = Math.PI / 2;  // lay flat on globe surface
  ring.name = `baseRing_${i}`;
  ring.renderOrder = 1;
  group.add(ring);
});

  // === FLOATING PARTICLES (tiny sparks around the beam) ===
  if (!d.radius < 0.1) { // Only for visible beams
  const particleCount = d.isCritical ? 12 : 6; 
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
  const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
const spread = d.radius * (1.5 + Math.random() * 2.5); 
  
  // CHANGE THIS LINE — was: (Math.random() - 0.2) * d.height * 0.8
  const heightPos = Math.random() * d.height * 0.85; // 0 = surface, up only
  
  positions[i * 3]     = Math.cos(angle) * spread;
  positions[i * 3 + 1] = heightPos;
  positions[i * 3 + 2] = Math.sin(angle) * spread;
}
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const particleMat = new THREE.PointsMaterial({
  color: brightColor,
  size: d.radius * 0.6,   // back to original
  transparent: true,
  opacity: 0.7,           // back to original
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});
    const particles = new THREE.Points(particleGeo, particleMat);
    particles.name = 'beamParticles';
    particles.renderOrder = 5;
    group.add(particles);
  }

  return group;
}, []);

   // ⭐ Add beams directly to Three.js scene + animate them
  useEffect(() => {
    if (!globeReveal || beamObjects.length === 0) return;
    
    const g = globeRef.current;
    if (!g || typeof g.scene !== 'function') return;
    
    const scene = g.scene();
    if (!scene) return;
    
    // Get globe radius
    const globeRadius = typeof g.getGlobeRadius === 'function' ? g.getGlobeRadius() : 100;
    
    // Remove old beam group
    const oldBeams = scene.getObjectByName('svBeamGroup');
    if (oldBeams) {
      oldBeams.traverse((child) => {
        if (child.geometry && 
            child.geometry !== beamGeometry && 
            child.geometry !== glowRingGeometry && 
            child.geometry !== glowCapGeometry) {
          child.geometry.dispose?.();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose?.());
          } else {
            child.material.dispose?.();
          }
        }
      });
      scene.remove(oldBeams);
    }
    
    // Create beam group
    const beamGroup = new THREE.Group();
    beamGroup.name = 'svBeamGroup';
    
    // Helper: lat/lng to 3D position on globe
    const toPosition = (lat, lng, alt) => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (180 - lng) * Math.PI / 180;
      const r = globeRadius * (1 + alt);
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    };
    
    // Create each beam
    beamObjects.forEach((beamData) => {
      const beamMesh = beamThreeObject(beamData);
      
      // Position on globe surface
      const pos = toPosition(beamData.lat, beamData.lng, 0.002);
      beamMesh.position.copy(pos);
      
      // Orient outward from globe center
      const direction = pos.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
      beamMesh.setRotationFromQuaternion(quat);
      
      // Store event data for raycasting
   beamMesh.userData = {
  eventId: beamData.eventId,
  isBeam: true,
  lat: beamData.lat,
  lng: beamData.lng,
  height: beamData.height,
  radius: beamData.radius,
};

// ADD THIS SINGLE LINE:
beamMesh.userData.height = beamData.height;

beamGroup.add(beamMesh);
});

scene.add(beamGroup);
    
    // Raycaster for click/hover detection on beams
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.5;
    raycaster.params.Line = { threshold: 0.5 };
    const mouse = new THREE.Vector2();
    
    const onMouseMove = (event) => {
      const canvas = g.renderer().domElement;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, g.camera());
      
      // Collect all beam meshes
      const beamMeshes = [];
      beamGroup.traverse((child) => {
        if (child.userData && child.userData.isBeam) {
          beamMeshes.push(child);
        }
      });
      
      const intersects = raycaster.intersectObjects(beamMeshes, true);
      
      if (intersects.length > 0) {
        // Find the beam object
        let beamObj = intersects[0].object;
        while (beamObj && !beamObj.userData?.isBeam) {
          beamObj = beamObj.parent;
        }
        
        if (beamObj && beamObj.userData?.eventId) {
          const eventId = beamObj.userData.eventId;
          setHoveredId(eventId);
          
          const ptData = points.find(p => String(p.eventId) === String(eventId));
          if (ptData) {
            setHoveredPreview({
              id: eventId,
              icon: ptData.markerIcon || '●',
              title: String(ptData.label || 'Event').replace(/<[^>]+>/g, ''),
              copy: ptData.dataAge != null 
                ? `${ptData.previewText || 'Event'} · ${ptData.dataAge}m ago`
                : ptData.previewText || 'Event',
              isCritical: ptData.isCritical,
            });
          }
          
          if (typeof onHoverEvent === 'function') onHoverEvent(eventId);
          
          // Change cursor
          canvas.style.cursor = 'pointer';
          return;
        }
      }
      
      // No intersection
      setHoveredId(null);
      setHoveredPreview(null);
      canvas.style.cursor = '';
      if (typeof onHoverEvent === 'function') onHoverEvent(null);
    };
    
    const onClick = (event) => {
      const canvas = g.renderer().domElement;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, g.camera());
      
      const beamMeshes = [];
      beamGroup.traverse((child) => {
        if (child.userData?.isBeam) beamMeshes.push(child);
      });
      
      const intersects = raycaster.intersectObjects(beamMeshes, true);
      
      if (intersects.length > 0) {
        let beamObj = intersects[0].object;
        while (beamObj && !beamObj.userData?.isBeam) {
          beamObj = beamObj.parent;
        }
        
        if (beamObj?.userData?.eventId) {
          markSurfacePick();
          onSelectEvent(beamObj.userData.eventId);
        }
      }
    };
    
    const canvas = g.renderer().domElement;
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    
    // Animation loop for pulse effects
    let animFrame;
    let running = true;
    
 const animate = () => {
  if (!running) return;
  
  const time = Date.now() * 0.001;

  beamGroup.traverse((child) => {
    // Pulse outer glow opacity
    if (child.name === 'outerGlow' && child.material) {
      child.material.opacity = 0.06 + Math.sin(time * 1.4) * 0.03;
    }

    // Rotate base ripple rings outward (sonar effect)
    if (child.name?.startsWith('baseRing_')) {
      const i = parseInt(child.name.split('_')[1]);
      const ringTime = (time * 0.6 + i * 0.55) % 1;
      child.scale.setScalar(
        child.userData.baseRingScale 
          ? child.userData.baseRingScale * (1 + ringTime * 0.6)
          : (1 + ringTime * 0.6)
      );
      child.material.opacity = (0.28 - i * 0.07) * (1 - ringTime);
    }

    // Drift particles upward slowly
 if (child.name === 'beamParticles' && child.geometry) {
  let root = child;
  while (root.parent && root.parent.userData?.isBeam === undefined) {
    root = root.parent;
  }
  const beamH = root?.userData?.height ?? 3;

  const pos = child.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i);
    y += 0.015;
    // CHANGE: reset to 0 (surface) instead of negative value
    if (y > beamH * 0.9) y = 0;
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
}
  });

  animFrame = requestAnimationFrame(animate);
};
    
    animate();
    
    return () => {
      running = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      
      // Remove beam group
      if (beamGroup.parent) {
        beamGroup.parent.remove(beamGroup);
      }
    };
  }, [globeReveal, beamObjects, beamThreeObject, beamGeometry, glowRingGeometry, glowCapGeometry, reducedMotion, points, onSelectEvent, onHoverEvent]);

    // ⭐ Animate aircraft on flight paths
  useEffect(() => {
    if (!globeReveal || flightData.length === 0) return;
    
    const g = globeRef.current;
    if (!g || typeof g.scene !== 'function') return;
    
    const scene = g.scene();
    if (!scene) return;
    
    const globeRadius = typeof g.getGlobeRadius === 'function' ? g.getGlobeRadius() : 100;
    
    // Remove old flight group
    const oldFlights = scene.getObjectByName('svFlightGroup');
    if (oldFlights) {
      oldFlights.traverse((child) => {
        if (child.geometry) child.geometry.dispose?.();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose?.());
          } else {
            child.material.dispose?.();
          }
        }
      });
      scene.remove(oldFlights);
    }
    
    // Create flight group
    const flightGroup = new THREE.Group();
    flightGroup.name = 'svFlightGroup';
    
    // Helper: lat/lng/alt to 3D position
    const toPosition = (lat, lng, alt) => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (180 - lng) * Math.PI / 180;
      const r = globeRadius * (1 + alt);
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    };
    
    // Store aircraft objects for animation
    const aircraftObjects = [];
    
    // Create flight path arcs and aircraft
    flightData.forEach((flight) => {
      // Create flight path arc line
      const arcPoints = createFlightArcLine(
        flight.originLat, flight.originLng,
        flight.destLat, flight.destLng,
        flight.altitude
      );
      
      // Create dashed arc line
      const linePoints = arcPoints.map(p => toPosition(p.lat, p.lng, p.alt));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
           const lineMat = new THREE.LineDashedMaterial({
        color: 0xffffff,  // White for all routes
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.NormalBlending,
        dashSize: 3,
        gapSize: 1.5,
      });
      const line = new THREE.Line(lineGeo, lineMat);
       line.computeLineDistances();
      line.renderOrder = 1;
      flightGroup.add(line);
      
      // Create origin and destination dots
      const dotGeo = new THREE.SphereGeometry(0.15, 8, 8);
          const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,  // White dots
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      
      const originDot = new THREE.Mesh(dotGeo, dotMat);
      const originPos = toPosition(flight.originLat, flight.originLng, 0.003);
      originDot.position.copy(originPos);
      flightGroup.add(originDot);
      
      const destDot = new THREE.Mesh(dotGeo, dotMat.clone());
      const destPos = toPosition(flight.destLat, flight.destLng, 0.003);
      destDot.position.copy(destPos);
      flightGroup.add(destDot);
      
      // Create aircraft object
      const aircraft = createAircraftObject(flight);
      flightGroup.add(aircraft);
      
      aircraftObjects.push({
        mesh: aircraft,
        flight: flight,
        arcPoints: arcPoints,
      });
    });
    
    scene.add(flightGroup);
    
    // Animation loop for aircraft movement
    let animFrame;
    let running = true;
    const startTime = Date.now();
    
    const animate = () => {
      if (!running || reducedMotion) {
        animFrame = requestAnimationFrame(animate);
        return;
      }
      
      const elapsed = (Date.now() - startTime) * 0.001;
      
      aircraftObjects.forEach(({ mesh, flight, arcPoints }) => {
        // Update progress based on speed
        const newProgress = (flight.progress + elapsed * flight.speed) % 1;
        
        // Interpolate position along arc
        const t = newProgress;
        const idx = Math.floor(t * (arcPoints.length - 1));
        const nextIdx = Math.min(idx + 1, arcPoints.length - 1);
        const frac = t * (arcPoints.length - 1) - idx;
        
        const p1 = arcPoints[idx];
        const p2 = arcPoints[nextIdx];
        
        const lat = p1.lat + (p2.lat - p1.lat) * frac;
        const lng = p1.lng + (p2.lng - p1.lng) * frac;
        const alt = p1.alt + (p2.alt - p1.alt) * frac;
        
          const pos = toPosition(lat, lng, alt);
        mesh.position.copy(pos);
        
              // ⭐ Calculate heading angle for sprite rotation (nose → destination)
        const tAhead = Math.min(1, newProgress + 0.005);
        const idxA = Math.floor(tAhead * (arcPoints.length - 1));
        const idxB = Math.min(idxA + 1, arcPoints.length - 1);
        const fracA = tAhead * (arcPoints.length - 1) - idxA;
        const aheadLat = arcPoints[idxA].lat + (arcPoints[idxB].lat - arcPoints[idxA].lat) * fracA;
        const aheadLng = arcPoints[idxA].lng + (arcPoints[idxB].lng - arcPoints[idxA].lng) * fracA;
        const aheadAlt = arcPoints[idxA].alt + (arcPoints[idxB].alt - arcPoints[idxA].alt) * fracA;
        const aheadPos = toPosition(aheadLat, aheadLng, aheadAlt);
        
        // Forward direction in 3D
        const forward = aheadPos.clone().sub(pos).normalize();
        
        // Project onto camera plane for 2D sprite heading
        const camera = g.camera();
        if (camera) {
          const cameraRight = new THREE.Vector3();
          const cameraUp = new THREE.Vector3();
          camera.matrixWorld.extractBasis(new THREE.Vector3(), cameraRight, cameraUp);
          
          const screenX = forward.dot(cameraRight);
          const screenY = forward.dot(cameraUp);
          const angle = Math.atan2(screenX, screenY);
          
          // Nose points RIGHT in canvas, so offset by -PI/2
          mesh.rotation.set(0, 0, angle - Math.PI / 2);
        }
      });
      
      animFrame = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      running = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      if (flightGroup.parent) {
        flightGroup.parent.remove(flightGroup);
      }
    };
  }, [globeReveal, flightData, createAircraftObject, createFlightArcLine, reducedMotion]);

  // ⭐ Sound effects on new/critical events
  const prevCriticalCount = useRef(0);
  useEffect(() => {
    const criticalCount = points.filter(p => p.isCritical).length;
    if (criticalCount > prevCriticalCount.current && SOUNDS.criticalAlert) {
      SOUNDS.criticalAlert();
    }
    prevCriticalCount.current = criticalCount;
  }, [points]);

  useEffect(() => {
    if (typeof onDiagnostics !== 'function') return;
    onDiagnostics({
      markerCountInput: events.filter((e) => e.lat != null && e.lng != null).length,
      markerCountRendered: points.length,
      selectedMarkerId: selectedId ?? null,
      hoveredMarkerId: hoveredId ?? null,
    });
  }, [events, points, selectedId, hoveredId, onDiagnostics]);

  const tensionByIso = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      const w = (Number(e.rank_score) || 50) * 0.014 + (Number(e.severity) || 1) * 5.5;
      for (const c of e.countries || []) {
        const k = normalizeRegionKey(c);
        if (!/^[A-Z]{2}$/.test(k)) continue;
        m.set(k, (m.get(k) || 0) + w);
      }
    }
    return m;
  }, [events]);

  const polygonCapColor = useCallback(
    (d) => {
      const iso = d.iso;
      const raw = tensionByIso.get(iso) || 0;
      const heat = Math.max(0, Math.min(1, Math.log1p(raw) / 7.2));
      const chill = 1 - heat;
      if (focusIso) {
        if (iso === focusIso) {
          const r = Math.round(210 - heat * 55);
          const g = Math.round(72 + heat * 70);
          const b = Math.round(58 + heat * 48);
          const a = 0.38 + heat * 0.42;
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return `rgba(4, 5, 10, ${0.48 + chill * 0.12})`;
      }
      if (hoveredIso === iso) {
        const r = Math.round(40 + heat * 200);
        const g = Math.round(36 + heat * 70);
        const b = Math.round(48 + heat * 40);
        return `rgba(${r}, ${g}, ${b}, ${0.22 + heat * 0.32})`;
      }
      const r = Math.round(14 + heat * 198);
      const g = Math.round(16 + heat * 52);
      const b = Math.round(22 + heat * 36);
      const a = 0.08 + heat * 0.46;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    },
    [focusIso, hoveredIso, tensionByIso]
  );

  const polygonSideColor = useCallback(
    (d) => {
      const iso = d.iso;
      const raw = tensionByIso.get(iso) || 0;
      const heat = Math.max(0, Math.min(1, Math.log1p(raw) / 7.2));
      if (focusIso && d.iso !== focusIso) return 'rgba(2, 3, 8, 0.72)';
      if (hoveredIso === d.iso) return 'rgba(248, 195, 125, 0.14)';
      const r = Math.round(6 + heat * 80);
      const g = Math.round(8 + heat * 28);
      const b = Math.round(14 + heat * 22);
      return `rgba(${r}, ${g}, ${b}, ${0.04 + heat * 0.28})`;
    },
    [focusIso, hoveredIso, tensionByIso]
  );

  const polygonStrokeColor = useCallback(
    (d) => {
      if (focusIso && d.iso === focusIso) return 'rgba(255, 224, 186, 0.88)';
      if (hoveredIso === d.iso) return 'rgba(248, 195, 125, 0.42)';
      return 'rgba(255, 255, 255, 0.055)';
    },
    [focusIso, hoveredIso]
  );

  const polygonAltitude = useCallback(
    (d) => {
      if (focusIso && d.iso === focusIso) return 0.018;
      if (hoveredIso === d.iso) return 0.01;
      return 0.0035;
    },
    [focusIso, hoveredIso]
  );

  const polygonLabel = useCallback((d) => {
    const nm = d.name || d.iso;
    return `<div style="font:12px system-ui;padding:4px 8px;background:rgba(0,0,0,.75);border:1px solid rgba(248,195,125,.35);border-radius:6px">${nm}</div>`;
  }, []);

  const moveCameraToSelection = useCallback(() => {
    const g = globeRef.current;
    if (!g || typeof g.pointOfView !== 'function') return;
    const evs = eventsRef.current || [];
    const sel = evs.find((e) => String(e.id) === String(selectedId));
    if (sel && sel.lat != null && sel.lng != null) {
      g.pointOfView({ lat: sel.lat, lng: sel.lng, altitude: 1.36 }, reducedMotion ? 0 : 1050);
      setPovAltitude(1.36);
      return;
    }
    const tgt = cameraTargetForFocus(focusRegion, evs, centroidLookup);
    if (tgt) {
      const alt = focusIso ? Math.min(tgt.altitude, 1.26) : tgt.altitude;
      g.pointOfView({ ...tgt, altitude: alt }, reducedMotion ? 0 : 1180);
      setPovAltitude(alt);
      return;
    }
    g.pointOfView({ lat: 16, lng: -38, altitude: 2.48 }, reducedMotion ? 0 : 720);
    setPovAltitude(2.48);
  }, [selectedId, focusRegion, focusIso, reducedMotion, centroidLookup]);

  useEffect(() => {
    moveCameraToSelection();
  }, [moveCameraToSelection]);

  const markSurfacePick = useCallback(() => {
    surfacePickAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, []);
   // ⭐ Country label points for globe labels - Professional version
  const countryLabelPoints = useMemo(() => {
    // Only show labels when reasonably zoomed in
    if (povAltitude > 2.2) return [];
    
    // Calculate minimum distance between labels to prevent overlap
    const getMinDistance = () => {
      if (povAltitude < 0.9) return 8;    // Very close - tight spacing
      if (povAltitude < 1.3) return 12;   // Close
      if (povAltitude < 1.8) return 18;   // Medium
      return 25;                           // Far
    };
    
    const minDistance = getMinDistance();
    
    // Define major countries that should always show (high priority)
    const majorCountries = new Set([
      'US', 'CN', 'RU', 'GB', 'FR', 'DE', 'JP', 'IN', 'BR', 'AU',
      'CA', 'IT', 'ES', 'KR', 'MX', 'ID', 'TR', 'SA', 'ZA', 'NG',
      'EG', 'IR', 'IQ', 'PK', 'BD', 'UA', 'PL', 'AR', 'CL', 'CO',
      'PE', 'VE', 'KE', 'ET', 'SD', 'LY', 'DZ', 'MA', 'KZ', 'UZ'
    ]);
    
    // Define minimum polygon area thresholds for showing labels
    const getMinArea = () => {
      if (povAltitude < 1.0) return 0;      // Show all when very close
      if (povAltitude < 1.5) return 500;    // Show medium+ countries
      return 2000;                           // Only large countries when far
    };
    
    const minArea = getMinArea();
    
    const labels = [];
    const shownIsos = new Set();
    
    // Calculate approximate bounding box area for each country polygon
    const getPolygonArea = (poly) => {
      if (!poly.geo || !poly.geo.coordinates) return 0;
      try {
        // Simplified area calculation based on coordinate bounds
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        
        const extractCoords = (coords) => {
          if (Array.isArray(coords[0])) {
            if (typeof coords[0][0] === 'number') {
              // Single polygon: [[lng, lat], ...]
              coords.forEach(([lng, lat]) => {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
              });
            } else {
              // Multi-polygon
              coords.forEach(extractCoords);
            }
          }
        };
        
        extractCoords(poly.geo.coordinates);
        
        const latSpan = maxLat - minLat;
        const lngSpan = maxLng - minLng;
        return Math.abs(latSpan * lngSpan) * 10000; // Scale to reasonable numbers
      } catch {
        return 0;
      }
    };
    
    // Sort countries by priority then by area
    const sortedPolygons = [...polygonsData].sort((a, b) => {
      const aMajor = majorCountries.has(a.iso) ? 1 : 0;
      const bMajor = majorCountries.has(b.iso) ? 1 : 0;
      
      if (aMajor !== bMajor) return bMajor - aMajor; // Major countries first
      
      const aArea = getPolygonArea(a);
      const bArea = getPolygonArea(b);
      return bArea - aArea; // Larger countries first
    });
    
    // Place labels with collision detection
    const placedLabels = [];
    
    for (const poly of sortedPolygons) {
      if (shownIsos.has(poly.iso)) continue;
      
      const centroid = centroidLookup[poly.iso];
      if (!centroid) continue;
      
      // Check minimum area threshold
      const area = getPolygonArea(poly);
      if (area < minArea && !majorCountries.has(poly.iso)) continue;
      
      // Check distance from all previously placed labels
      let tooClose = false;
      for (const placed of placedLabels) {
        const dLat = Math.abs(centroid[0] - placed.lat);
        const dLng = Math.abs(centroid[1] - placed.lng);
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);
        
        if (distance < minDistance) {
          tooClose = true;
          break;
        }
      }
      
      if (tooClose) continue;
      
      shownIsos.add(poly.iso);
      placedLabels.push({
        lat: centroid[0],
        lng: centroid[1],
        iso: poly.iso,
      });
      
      // Calculate opacity based on zoom level
      const labelOpacity = povAltitude > 1.8 
        ? Math.max(0, 1 - (povAltitude - 1.8) / 0.4) 
        : 1;
      
      // Calculate size based on zoom level and country importance
      let baseSize = 1.0;
      if (povAltitude < 0.9) baseSize = 1.7;
      else if (povAltitude < 1.2) baseSize = 1.4;
      else if (povAltitude < 1.6) baseSize = 1.2;
      else baseSize = 1.0;
      
      // Larger size for major countries
      if (majorCountries.has(poly.iso)) {
        baseSize *= 1.15;
      }
      
      // Get display name (use shorter names for better fit)
      let displayName = poly.name || poly.iso;
      
      // Abbreviate very long country names
      const nameMap = {
        'United States': 'USA',
        'United Kingdom': 'UK',
        'United Arab Emirates': 'UAE',
        'Saudi Arabia': 'S. Arabia',
        'South Africa': 'S. Africa',
        'South Korea': 'S. Korea',
        'North Korea': 'N. Korea',
        'New Zealand': 'N. Zealand',
        'Papua New Guinea': 'PNG',
        'Central African Republic': 'CAR',
        'Dominican Republic': 'Dom. Rep.',
        'Czech Republic': 'Czechia',
        'Bosnia and Herzegovina': 'Bosnia',
        'Trinidad and Tobago': 'Trinidad',
        'Antigua and Barbuda': 'Antigua',
        'Saint Vincent and the Grenadines': 'St. Vincent',
        'São Tomé and Príncipe': 'São Tomé',
      };
      
      displayName = nameMap[displayName] || displayName;
      
      labels.push({
        lat: centroid[0],
        lng: centroid[1],
        iso: poly.iso,
        name: displayName,
        opacity: labelOpacity,
        size: baseSize,
        isMajor: majorCountries.has(poly.iso),
      });
    }
    
    return labels;
  }, [polygonsData, povAltitude, centroidLookup]);



  const handleGlobeClick = useCallback(
    (_coords, event) => {
      if (!onGlobeBackground) return;
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (t - surfacePickAtRef.current < 420) return;
      if (event?.defaultPrevented) return;
      onGlobeBackground();
    },
    [onGlobeBackground]
  );

  return (
    <>
      <style>{`
        @keyframes criticalPulse {
          0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.4); }
        }
        @keyframes markerAppear {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          70% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes subtleFloat {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-3px); }
        }
        
        /* Zoom Controls Styles */
        .sv-globe-zoom-controls {
          position: absolute;
          bottom: 24px;
          right: 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          z-index: 20;
          pointer-events: auto;
        }
        
        .sv-globe-zoom-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(6, 10, 18, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(248, 195, 125, 0.18);
          border-radius: 10px;
          color: rgba(248, 195, 125, 0.85);
          font-size: 20px;
          font-weight: 300;
          line-height: 1;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.33, 1, 0.68, 1);
          font-family: 'SF Mono', 'Consolas', monospace;
          user-select: none;
          -webkit-user-select: none;
          outline: none;
          box-shadow: 
            0 4px 16px rgba(0, 0, 0, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        
        .sv-globe-zoom-btn:hover {
          background: rgba(10, 16, 26, 0.96);
          border-color: rgba(248, 195, 125, 0.45);
          color: rgba(255, 220, 170, 0.98);
          box-shadow: 
            0 6px 24px rgba(0, 0, 0, 0.45),
            0 0 20px rgba(248, 195, 125, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
          transform: translateY(-1px);
        }
        
        .sv-globe-zoom-btn:active {
          transform: translateY(0px) scale(0.94);
          background: rgba(6, 10, 18, 0.98);
          border-color: rgba(248, 195, 125, 0.55);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.02);
          transition: all 0.1s ease;
        }
        
        .sv-globe-zoom-btn--reset {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.04em;
        }
        
        .sv-globe-zoom-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          pointer-events: none;
          transform: none;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        
        .sv-globe-zoom-indicator {
          width: 40px;
          text-align: center;
          font-family: 'SF Mono', 'Consolas', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.06em;
          color: rgba(248, 195, 125, 0.55);
          background: rgba(6, 10, 18, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(248, 195, 125, 0.08);
          border-radius: 5px;
          padding: 3px 6px;
          pointer-events: none;
        }
        
        .sv-globe-hover-preview {
          position: absolute !important;
          bottom: 16px !important;
          left: 16px !important;
          display: inline-block !important;
          width: auto !important;
          max-width: 200px !important;
          min-width: unset !important;
          background: rgba(6, 10, 18, 0.94) !important;
          border: 1px solid rgba(248, 195, 125, 0.25) !important;
          border-left: 2px solid #ff9933 !important;
          font-family: 'SF Mono', 'Consolas', 'Monaco', monospace !important;
          padding: 6px 10px !important;
          font-size: 10px !important;
          text-align: left !important;
          pointer-events: none !important;
          z-index: 10 !important;
          border-radius: 2px !important;
          line-height: 1.3 !important;
          white-space: normal !important;
          word-wrap: break-word !important;
          box-sizing: border-box !important;
        }
        
        .sv-globe-hover-preview__title {
          display: block;
          color: #ccddff;
          font-size: 10px;
          font-weight: 500;
          margin: 0 0 2px 0;
          white-space: normal;
          word-wrap: break-word;
        }
        
        .sv-globe-hover-preview__copy {
          display: block;
          color: #8899aa;
          font-size: 9px;
          margin: 0;
          white-space: normal;
          word-wrap: break-word;
        }

        @media (max-width: 768px) {
          .sv-globe-zoom-controls {
            bottom: 16px;
            right: 16px;
            gap: 3px;
          }
          
          .sv-globe-zoom-btn {
            width: 36px;
            height: 36px;
            font-size: 18px;
            border-radius: 8px;
          }
          
          .sv-globe-zoom-indicator {
            width: 36px;
            font-size: 8px;
          }
        }
                       /* Country Label Styles - Professional Edition */
        .sv-country-label {
          font-family: 'Inter', -apple-system, system-ui, sans-serif;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 
            0 1px 3px rgba(0, 0, 0, 0.95),
            0 0 6px rgba(0, 0, 0, 0.8),
            0 2px 8px rgba(0, 0, 0, 0.6);
          pointer-events: none;
          white-space: nowrap;
          text-align: center;
          transform: translate(-50%, -50%);
          user-select: none;
          -webkit-user-select: none;
          z-index: 1;
          padding: 2px 6px;
          border-radius: 3px;
          background: rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          line-height: 1.2;
          transition: opacity 0.3s ease;
        }
        
        .sv-country-label--small {
          font-weight: 500;
          letter-spacing: 0.01em;
          text-shadow: 
            0 1px 2px rgba(0, 0, 0, 0.9),
            0 0 3px rgba(0, 0, 0, 0.7);
          background: rgba(0, 0, 0, 0.2);
          padding: 1px 4px;
        }
        
        .sv-country-label--major {
          font-weight: 700;
          letter-spacing: 0.03em;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 
            0 1px 4px rgba(0, 0, 0, 0.95),
            0 0 8px rgba(0, 0, 0, 0.8),
            0 2px 12px rgba(0, 0, 0, 0.5);
          background: rgba(0, 0, 0, 0.3);
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
                  /* Beam glow animations */
        @keyframes beamPulse {
          0%, 100% { 
            filter: brightness(1) drop-shadow(0 0 4px currentColor);
          }
          50% { 
            filter: brightness(1.3) drop-shadow(0 0 8px currentColor);
          }
        }
        
        @keyframes criticalBeamPulse {
          0%, 100% { 
            filter: brightness(1) drop-shadow(0 0 6px rgba(255, 68, 68, 0.8));
          }
          50% { 
            filter: brightness(1.5) drop-shadow(0 0 16px rgba(255, 68, 68, 1));
          }
        }
      `}</style>
      
      <div
        className={`sv-globe-wrap ${globeReveal ? 'sv-globe-wrap--ready' : ''} ${polygonsData.length ? 'sv-globe-wrap--countries' : ''}`}
        ref={wrapRef}
        style={{
          width: dims.w,
          height: dims.h,
          maxWidth: '100%',
          maxHeight: '100%',
          border: 'none',
          outline: 'none',
        }}
      >

        {/* ⭐ ADD SEARCH BAR HERE */}
        <GlobeSearchBar 
          onCountrySelect={(country) => {
            if (onCountryFocus) {
              onCountryFocus(country.iso);
            }
            const g = globeRef.current;
            if (g && typeof g.pointOfView === 'function') {
              handleUserInteraction();
              g.pointOfView({
                lat: country.lat,
                lng: country.lng,
                altitude: 0.9
              }, 800);
              setPovAltitude(0.9);
            }
          }}
          onSearchFocus={(focused) => {
            if (focused) {
              handleUserInteraction();
            }
          }}
          focusRegion={focusIso}
        />

        <Suspense
          fallback={
            <div className="sv-globe-fallback" aria-hidden>
              <div className="sv-globe-fallback-orbit" />
              <div className="sv-globe-fallback-ring" />
              <p className="sv-globe-fallback-label">Loading globe</p>
            </div>
          }
        >
          <Globe
            ref={globeRef}
            width={dims.w}
            height={dims.h}
            backgroundColor={sceneBackground}
            backgroundImageUrl={null}
            waitForGlobeReady
            onGlobeReady={onGlobeReady}
            globeImageUrl={globeTextureUrl}
            globeCurvatureResolution={reducedMotion ? 5 : 5.2}
            bumpImageUrl={null}
            globeAutoRotate={autoRotate && !reducedMotion}
            globeAutoRotateSpeed={0.3}
            rendererConfig={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
              logarithmicDepthBuffer: true,
            }}
                      showAtmosphere={true}
            atmosphereColor="rgb(30, 60, 120)"
            atmosphereAltitude={0.15}
            onGlobeClick={(coords, event) => {
              handleUserInteraction();
              handleGlobeClick(coords, event);
            }}
            onZoom={(pov) => {
              handleUserInteraction();
              handleZoom(pov);
            }}
            heatmapsData={NO_HEATMAPS}
            hexBinPointsData={useHex ? hexPoints : []}
            hexBinPointLat="lat"
            hexBinPointLng="lng"
            hexBinPointWeight="w"
            hexAltitude={() => 0.02}
            hexTopColor={() => 'rgba(234, 169, 96, 0.55)'}
            hexSideColor={() => 'rgba(234, 169, 96, 0.22)'}
            hexBinResolution={4}
            arcsData={arcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor={arcColor}
            arcAltitude={0.24}
            arcStroke={0.42}
            polygonsData={polygonsData}
            polygonGeoJsonGeometry="geo"
            polygonCapColor={polygonCapColor}
            polygonSideColor={polygonSideColor}
            polygonStrokeColor={polygonStrokeColor}
            polygonAltitude={polygonAltitude}
            polygonCapCurvatureResolution={reducedMotion ? 3 : 5}
            polygonsTransitionDuration={
              reducedMotion ? 0 : focusIso ? 0 : focusRegion ? 140 : 280
            }
            polygonLabel={polygonLabel}
            onPolygonHover={(poly) => {
              setHoveredIso(poly && poly.iso ? poly.iso : null);
            }}
            onPolygonClick={(poly) => {
              markSurfacePick();
              if (poly && poly.iso && onCountryFocus) onCountryFocus(poly.iso);
            }}
                    pointsData={[]}
            objectsData={celestialObjectsData}
            objectLat="lat"
            objectLng="lng"
            objectAltitude={(d) => d.alt || 1.0}
            objectThreeObject={objectThreeObject}
            objectsTransitionDuration={reducedMotion ? 0 : 400}

            htmlElementsData={countryLabelPoints}
            htmlElement={(d) => {
              const el = document.createElement('div');
              const sizeClass = d.size < 1.2 ? 'sv-country-label--small' : '';
              const majorClass = d.isMajor ? 'sv-country-label--major' : '';
              el.className = `sv-country-label ${sizeClass} ${majorClass}`.trim();
              el.textContent = d.name;
              el.style.opacity = d.opacity;
              el.style.fontSize = `${Math.round(d.size * 11)}px`;
              return el;
            }}
          />
        
        </Suspense>

        {/* Zoom Controls */}
        <div className="sv-globe-zoom-controls" role="group" aria-label="Globe zoom controls">
          <button
            type="button"
            className="sv-globe-zoom-btn"
            onClick={handleZoomIn}
            disabled={currentZoom <= MIN_ZOOM}
            aria-label="Zoom in"
            title="Zoom in (closer view)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          
          <span className="sv-globe-zoom-indicator" aria-hidden="true">
            {Math.round((MAX_ZOOM - currentZoom + MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM) * 100)}%
          </span>
          
          <button
            type="button"
            className="sv-globe-zoom-btn"
            onClick={handleZoomOut}
            disabled={currentZoom >= MAX_ZOOM}
            aria-label="Zoom out"
            title="Zoom out (wider view)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          
          <button
            type="button"
            className="sv-globe-zoom-btn sv-globe-zoom-btn--reset"
            onClick={handleResetZoom}
            aria-label="Reset zoom"
            title="Reset to default view"
          >
            ⊡
          </button>
        </div>

        {/* Hover Preview */}
        <div aria-live="polite" style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          background: 'rgba(6, 10, 18, 0.94)',
          border: '1px solid rgba(248, 195, 125, 0.25)',
          borderLeft: '2px solid #ff9933',
          fontFamily: "'SF Mono', 'Consolas', 'Monaco', monospace",
          padding: '5px 8px',
          fontSize: '10px',
          textAlign: 'left',
          pointerEvents: 'none',
          zIndex: 10,
          borderRadius: '2px',
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
          width: 'fit-content',
        }}>
          {hoveredPreview ? (
            <>
              <span style={{ color: '#ccddff', fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap', display: 'block' }}>{hoveredPreview.title}</span>
              <span style={{ color: '#8899aa', fontSize: '9px', whiteSpace: 'nowrap', display: 'block' }}>{hoveredPreview.copy}</span>
            </>
          ) : (
            <span style={{ color: '#8899aa', fontSize: '9px', whiteSpace: 'nowrap' }}>Hover markers to preview. Click to pin in side drawer.</span>
          )}
        </div>
      </div>
    </>
  );
}