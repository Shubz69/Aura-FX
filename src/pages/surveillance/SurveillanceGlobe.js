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

const Globe = lazy(() => import('react-globe.gl').then((m) => ({ default: m.default })));

const GLOBE_BASE = 'https://unpkg.com/three-globe@2.45.2/example/img';
/** NASA Visible Earth 5400×2700 equirectangular (sharper zoom than bundled 2k JPG). CORS-friendly for canvas. */
const GLOBE_TEXTURE_HI =
  'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg';
/** Fallback if NASA CDN fails. */
const GLOBE_TEXTURE_LO = `${GLOBE_BASE}/earth-blue-marble.jpg`;

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

/** 0 = day-ish, 1 = night — local clock, understated for atmosphere only */
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
    label: b.count > 1 ? `${b.count} events · ${b.label.slice(0, 42)}…` : b.label,
  }));
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

export default function SurveillanceGlobe({
  events,
  selectedId,
  focusRegion,
  onSelectEvent,
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
  const [pulse, setPulse] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const [globeReveal, setGlobeReveal] = useState(false);
  const [globeTextureUrl, setGlobeTextureUrl] = useState(GLOBE_TEXTURE_LO);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setGlobeTextureUrl(GLOBE_TEXTURE_HI);
    img.onerror = () => {};
    img.src = GLOBE_TEXTURE_HI;
  }, []);
  const [polygonsData, setPolygonsData] = useState([]);
  const [loadedIsoCentroids, setLoadedIsoCentroids] = useState({});
  const [hoveredIso, setHoveredIso] = useState(null);

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
    () => hexLerpColor('#060714', '#02030a', nightFactor * 0.78),
    [nightFactor]
  );

  const atmosphereColor = useMemo(() => {
    const r = Math.round(38 + nightFactor * 6);
    const g = Math.round(52 + nightFactor * 8);
    const b = Math.round(78 + nightFactor * 12);
    return `rgb(${r}, ${g}, ${b})`;
  }, [nightFactor]);

  const atmosphereAltitude = useMemo(() => 0.078 + nightFactor * 0.032, [nightFactor]);

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
    mat.color = new THREE.Color(0x5a5f72);
    mat.shininess = 4;
    mat.specular = new THREE.Color(0x101014);
    mat.needsUpdate = true;
    return true;
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
    const chromePx = 20;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        const side = Math.floor(Math.min(cr.width, Math.max(cr.height - chromePx, 200)));
        setDims({ w: Math.max(side, 200), h: Math.max(side, 200) });
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

  useEffect(() => {
    if (reducedMotion) return undefined;
    let id;
    const loop = (t) => {
      setPulse(0.5 + 0.5 * Math.sin(t / 680));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  const handleZoom = useCallback((pov) => {
    if (pov && typeof pov.altitude === 'number' && Number.isFinite(pov.altitude)) {
      setPovAltitude(pov.altitude);
    }
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
    const count = reducedMotionRef.current ? 1100 : 2400;
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
    const starMat = new THREE.PointsMaterial({
      color: 0xf2f4fc,
      size: rm0 ? 0.048 : 0.068,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.name = 'svStarfield';
    stars.frustumCulled = false;
    stars.renderOrder = -500;

    const group = new THREE.Group();
    group.name = 'svSpaceBackdrop';
    group.renderOrder = -500;
    group.add(stars);
    scene.add(group);
    spaceBackdropRef.current = group;

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

  /* Hex bins must stay on during country lens: turning them off switched the globe to global
   * heatmap + arcs — CPU KDE and extra layers caused severe lag until lens cleared. */
  const useHex = !reducedMotion && events.length > 52;

  const rawPoints = useMemo(() => {
    return events
      .filter((e) => e.lat != null && e.lng != null)
      .map((e) => ({
        lat: e.lat,
        lng: e.lng,
        w: Math.max(0.15, ((e.rank_score != null ? Number(e.rank_score) : 50) + (e.severity || 1) * 6) / 130),
      }));
  }, [events]);

  const heatmapLayer = useMemo(() => {
    if (!rawPoints.length || useHex) return [];
    return [
      {
        points: rawPoints.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          weight: p.w,
        })),
      },
    ];
  }, [rawPoints, useHex]);

  const hexPoints = useMemo(() => rawPoints, [rawPoints]);

  const arcs = useMemo(() => (useHex ? [] : buildArcs(events)), [events, useHex]);

  /** Coarse pulse for marker styling only — avoids rebuilding point buffers every animation frame. */
  const pulseStep = Math.round(pulse * 14) / 14;

  const arcColor = useCallback((d) => {
    const s = d.sev != null ? Number(d.sev) : 1;
    if (s >= 5) return ['rgba(255, 140, 120, 0.16)', 'rgba(220, 72, 72, 0.38)'];
    if (s >= 4) return ['rgba(255, 170, 110, 0.14)', 'rgba(210, 110, 58, 0.32)'];
    if (s >= 3) return ['rgba(240, 210, 100, 0.12)', 'rgba(180, 150, 48, 0.26)'];
    return ['rgba(248, 195, 125, 0.18)', 'rgba(120, 140, 180, 0.22)'];
  }, []);

  const points = useMemo(() => {
    const idMap = new Map();
    for (const e of events) idMap.set(String(e.id), e);
    const list = clusterEvents(events, reducedMotion ? 0 : 1);
    return list.map((p) => {
      const hot = p.maxSev >= 4 || p.maxSevScore >= 72;
      const pulseBoost = !reducedMotion && hot ? pulseStep * 0.022 : 0;
      const isSel = String(p.eventId) === String(selectedId);
      const isHover = hoveredId != null && String(p.eventId) === String(hoveredId);
      const inFocus = clusterTouchesFocus(p, idMap, focusRegion);
      const lens = !!focusRegion;
      const muted = lens && !inFocus && !isSel;
      const liveCluster =
        p.eventIds?.some((evId) => {
          const ev = idMap.get(String(evId));
          if (!ev) return false;
          if (ev.source === 'opensky_live') return true;
          const tg = ev.tags;
          return Array.isArray(tg) && tg.some((t) => String(t).toLowerCase().includes('live_track'));
        }) ?? false;
      const color = isSel
        ? '#ffd9a8'
        : isHover
          ? '#fff0d4'
          : muted
            ? 'rgba(120, 120, 130, 0.28)'
            : liveCluster
              ? 'rgba(154, 214, 255, 0.92)'
              : p.maxSev >= 5
                ? '#e86868'
                : p.maxSev >= 4
                  ? '#e8945c'
                  : p.maxSev >= 3
                    ? '#d4b84a'
                    : lens && inFocus
                      ? 'rgba(255, 214, 160, 0.92)'
                      : 'rgba(234,169,96,0.52)';
      return {
        ...p,
        color,
        radius: Math.min(
          1.05,
          0.28 +
            p.count * 0.06 +
            p.maxSev * 0.05 +
            (liveCluster ? 0.07 : 0) +
            (hot ? pulseStep * 0.06 : 0) +
            (isSel ? 0.14 : 0) +
            (isHover ? 0.08 : 0) +
            (lens && inFocus ? 0.1 : 0)
        ),
        altitude:
          0.012 +
          Math.min(0.065, p.count * 0.004 + pulseBoost + (isSel ? 0.018 : 0) + (isHover ? 0.01 : 0)) +
          (liveCluster ? 0.014 : 0) +
          (lens && inFocus ? 0.02 : 0),
      };
    });
  }, [events, selectedId, hoveredId, reducedMotion, pulseStep, focusRegion]);

  const polygonCapColor = useCallback(
    (d) => {
      const iso = d.iso;
      if (focusIso) {
        if (iso === focusIso) return 'rgba(255, 214, 170, 0.42)';
        return 'rgba(6, 8, 14, 0.5)';
      }
      if (hoveredIso === iso) return 'rgba(248, 195, 125, 0.18)';
      return 'rgba(255, 255, 255, 0.04)';
    },
    [focusIso, hoveredIso]
  );

  const polygonSideColor = useCallback(
    (d) => {
      if (focusIso && d.iso !== focusIso) return 'rgba(3, 4, 8, 0.62)';
      if (hoveredIso === d.iso) return 'rgba(248, 195, 125, 0.14)';
      return 'rgba(255, 255, 255, 0.035)';
    },
    [focusIso, hoveredIso]
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
    <div
      className={`sv-globe-wrap ${globeReveal ? 'sv-globe-wrap--ready' : ''} ${polygonsData.length ? 'sv-globe-wrap--countries' : ''}`}
      ref={wrapRef}
      style={{
        width: dims.w,
        height: dims.h,
        maxWidth: '100%',
        maxHeight: '100%',
      }}
    >
      <div className="sv-globe-vignette" aria-hidden />
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
          rendererConfig={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            logarithmicDepthBuffer: true,
          }}
          showAtmosphere
          atmosphereColor={atmosphereColor}
          atmosphereAltitude={reducedMotion ? atmosphereAltitude * 0.82 : atmosphereAltitude}
          onGlobeClick={handleGlobeClick}
          onZoom={handleZoom}
          heatmapsData={heatmapLayer}
          heatmapPoints={(d) => d.points}
          heatmapPointLat="lat"
          heatmapPointLng="lng"
          heatmapPointWeight="weight"
          heatmapBandwidth={1.45}
          heatmapColorFn={() => 'rgba(234, 169, 96, 0.52)'}
          heatmapBaseAltitude={0.01}
          heatmapTopAltitude={0.04}
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
            reducedMotion ? 0 : focusIso ? 0 : focusRegion ? 120 : 220
          }
          polygonLabel={polygonLabel}
          onPolygonHover={(poly) => {
            setHoveredIso(poly && poly.iso ? poly.iso : null);
          }}
          onPolygonClick={(poly) => {
            markSurfacePick();
            if (poly && poly.iso && onCountryFocus) onCountryFocus(poly.iso);
          }}
          pointsData={useHex ? [] : points}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="radius"
          pointAltitude="altitude"
          pointLabel="label"
          pointsMerge={false}
          pointResolution={reducedMotion ? 10 : 20}
          onPointClick={(pt) => {
            markSurfacePick();
            if (pt && pt.eventId) onSelectEvent(pt.eventId);
          }}
          onPointHover={(pt) => {
            setHoveredId(pt && pt.eventId ? pt.eventId : null);
          }}
          objectsData={celestialObjectsData}
          objectLat="lat"
          objectLng="lng"
          objectAltitude="alt"
          objectThreeObject={objectThreeObject}
          objectsTransitionDuration={reducedMotion ? 0 : 400}
        />
      </Suspense>
    </div>
  );
}
