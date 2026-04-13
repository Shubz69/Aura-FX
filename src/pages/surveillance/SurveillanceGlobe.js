import React, { useMemo, useRef, useEffect, useState, Suspense, lazy, useCallback } from 'react';
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
const GLOBE_TEXTURE = `${GLOBE_BASE}/earth-night.jpg`;
const NIGHT_SKY_BG = `${GLOBE_BASE}/night-sky.png`;

let neGeoJsonCache = null;
let neGeoJsonPromise = null;

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
    });
    if (out.length >= 26) break;
  }
  return out;
}

function clusterTouchesFocus(pt, events, focusRegion) {
  if (!focusRegion || !pt.eventIds?.length) return false;
  for (const id of pt.eventIds) {
    const ev = events.find((e) => String(e.id) === String(id));
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
  const [dims, setDims] = useState({ w: 320, h: 320 });
  const [povAltitude, setPovAltitude] = useState(2.48);
  const [pulse, setPulse] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const [globeReveal, setGlobeReveal] = useState(false);
  const [polygonsData, setPolygonsData] = useState([]);
  const [loadedIsoCentroids, setLoadedIsoCentroids] = useState({});
  const [hoveredIso, setHoveredIso] = useState(null);

  const focusIso = useMemo(() => {
    if (!focusRegion) return null;
    const f = normalizeRegionKey(focusRegion);
    return /^[A-Z]{2}$/.test(f) ? f : null;
  }, [focusRegion]);

  const centroidLookup = useMemo(() => ({ ...SURV_ISO_CENTROID, ...loadedIsoCentroids }), [loadedIsoCentroids]);

  const moonGeometry = useMemo(() => new THREE.SphereGeometry(0.052, 22, 22), []);
  const moonMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: 0xd4d6e8,
        emissive: 0x080810,
        shininess: 18,
        specular: 0x444458,
      }),
    []
  );

  const moonObjectsData = useMemo(() => {
    if (reducedMotion) return [];
    if (povAltitude < 1.62) return [];
    return [{ id: 'moon', lat: 9, lng: -98, alt: 0.88 }];
  }, [povAltitude, reducedMotion]);

  const objectThreeObject = useCallback(
    () => new THREE.Mesh(moonGeometry, moonMaterial),
    [moonGeometry, moonMaterial]
  );

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
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        const side = Math.floor(Math.min(cr.width, cr.height));
        setDims({ w: Math.max(side, 200), h: Math.max(side, 200) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dims.w < 200) return undefined;
    const t = setTimeout(() => setGlobeReveal(true), reducedMotion ? 0 : 70);
    return () => clearTimeout(t);
  }, [dims.w, dims.h, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || dims.w < 200) return undefined;
    let cancelled = false;
    let frames = 0;
    const applySharpRenderer = () => {
      if (cancelled) return;
      const g = globeRef.current;
      const renderer = g && typeof g.renderer === 'function' ? g.renderer() : null;
      if (renderer && typeof renderer.setPixelRatio === 'function') {
        const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const pr = Math.min(2.5, Math.max(1, raw));
        renderer.setPixelRatio(pr);
      }
      frames += 1;
      if (frames < 28 && (!renderer || typeof renderer.setPixelRatio !== 'function')) {
        requestAnimationFrame(applySharpRenderer);
      }
    };
    applySharpRenderer();
    return () => {
      cancelled = true;
    };
  }, [dims.w, dims.h, reducedMotion]);

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

  const useHex = !reducedMotion && !focusRegion && events.length > 52;

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

  const points = useMemo(() => {
    const list = clusterEvents(events, reducedMotion ? 0 : 1);
    return list.map((p) => {
      const hot = p.maxSev >= 4 || p.maxSevScore >= 72;
      const pulseBoost = !reducedMotion && hot ? pulse * 0.022 : 0;
      const isSel = String(p.eventId) === String(selectedId);
      const isHover = hoveredId != null && String(p.eventId) === String(hoveredId);
      const inFocus = clusterTouchesFocus(p, events, focusRegion);
      const lens = !!focusRegion;
      const muted = lens && !inFocus && !isSel;
      const color = isSel
        ? '#ffd9a8'
        : isHover
          ? '#fff0d4'
          : muted
            ? 'rgba(120, 120, 130, 0.28)'
            : p.maxSev >= 4
              ? '#ff8585'
              : p.maxSev >= 3
                ? '#f0b870'
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
            (hot ? pulse * 0.06 : 0) +
            (isSel ? 0.14 : 0) +
            (isHover ? 0.08 : 0) +
            (lens && inFocus ? 0.1 : 0)
        ),
        altitude:
          0.012 +
          Math.min(0.065, p.count * 0.004 + pulseBoost + (isSel ? 0.018 : 0) + (isHover ? 0.01 : 0)) +
          (lens && inFocus ? 0.02 : 0),
      };
    });
  }, [events, selectedId, hoveredId, reducedMotion, pulse, focusRegion]);

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
    const sel = events.find((e) => String(e.id) === String(selectedId));
    if (sel && sel.lat != null && sel.lng != null) {
      g.pointOfView({ lat: sel.lat, lng: sel.lng, altitude: 1.36 }, reducedMotion ? 0 : 1050);
      setPovAltitude(1.36);
      return;
    }
    const tgt = cameraTargetForFocus(focusRegion, events, centroidLookup);
    if (tgt) {
      const alt = focusIso ? Math.min(tgt.altitude, 1.14) : tgt.altitude;
      g.pointOfView({ ...tgt, altitude: alt }, reducedMotion ? 0 : 1380);
      setPovAltitude(alt);
      return;
    }
    g.pointOfView({ lat: 16, lng: -38, altitude: 2.48 }, reducedMotion ? 0 : 720);
    setPovAltitude(2.48);
  }, [events, selectedId, focusRegion, focusIso, reducedMotion, centroidLookup]);

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
          backgroundColor="#03030f"
          backgroundImageUrl={NIGHT_SKY_BG}
          waitForGlobeReady
          globeImageUrl={GLOBE_TEXTURE}
          bumpImageUrl={null}
          rendererConfig={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          showAtmosphere
          atmosphereColor="rgba(160, 195, 255, 0.14)"
          atmosphereAltitude={reducedMotion ? 0.09 : 0.13}
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
          arcColor={() => ['rgba(248, 195, 125, 0.22)', 'rgba(255, 120, 120, 0.38)']}
          arcAltitude={0.24}
          arcStroke={0.42}
          polygonsData={polygonsData}
          polygonGeoJsonGeometry="geo"
          polygonCapColor={polygonCapColor}
          polygonSideColor={polygonSideColor}
          polygonStrokeColor={polygonStrokeColor}
          polygonAltitude={polygonAltitude}
          polygonCapCurvatureResolution={3}
          polygonsTransitionDuration={reducedMotion ? 0 : 220}
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
          pointResolution={reducedMotion ? 10 : 16}
          onPointClick={(pt) => {
            markSurfacePick();
            if (pt && pt.eventId) onSelectEvent(pt.eventId);
          }}
          onPointHover={(pt) => {
            setHoveredId(pt && pt.eventId ? pt.eventId : null);
          }}
          objectsData={moonObjectsData}
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
