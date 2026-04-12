import React, { useMemo, useRef, useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { SURV_ISO_CENTROID, eventMatchesFocus, cameraTargetForFocus } from './surveillanceRegionUtils';

const Globe = lazy(() => import('react-globe.gl').then((m) => ({ default: m.default })));

const GLOBE_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';

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
  reducedMotion,
}) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const [dims, setDims] = useState({ w: 320, h: 320 });
  const [pulse, setPulse] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const [globeReveal, setGlobeReveal] = useState(false);

  const useHex = !reducedMotion && !focusRegion && events.length > 52;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        setDims({ w: Math.floor(cr.width), h: Math.floor(cr.height) });
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
    if (reducedMotion) return undefined;
    let id;
    const loop = (t) => {
      setPulse(0.5 + 0.5 * Math.sin(t / 680));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

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

  const moveCameraToSelection = useCallback(() => {
    const g = globeRef.current;
    if (!g || typeof g.pointOfView !== 'function') return;
    const sel = events.find((e) => String(e.id) === String(selectedId));
    if (sel && sel.lat != null && sel.lng != null) {
      g.pointOfView({ lat: sel.lat, lng: sel.lng, altitude: 1.42 }, reducedMotion ? 0 : 1100);
      return;
    }
    const tgt = cameraTargetForFocus(focusRegion, events);
    if (tgt) {
      g.pointOfView(tgt, reducedMotion ? 0 : 1200);
    }
  }, [events, selectedId, focusRegion, reducedMotion]);

  useEffect(() => {
    moveCameraToSelection();
  }, [moveCameraToSelection]);

  return (
    <div
      className={`sv-globe-wrap ${globeReveal ? 'sv-globe-wrap--ready' : ''}`}
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
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={GLOBE_TEXTURE}
          bumpImageUrl={null}
          showAtmosphere
          atmosphereColor="rgba(248, 195, 125, 0.14)"
          atmosphereAltitude={reducedMotion ? 0.1 : 0.16}
          heatmapsData={heatmapLayer}
          heatmapPoints={(d) => d.points}
          heatmapPointLat="lat"
          heatmapPointLng="lng"
          heatmapPointWeight="weight"
          heatmapBandwidth={2.2}
          heatmapColorFn={() => 'rgba(234, 169, 96, 0.65)'}
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
          pointsData={useHex ? [] : points}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="radius"
          pointAltitude="altitude"
          pointLabel="label"
          pointsMerge={false}
          pointResolution={reducedMotion ? 8 : 12}
          onPointClick={(pt) => {
            if (pt && pt.eventId) onSelectEvent(pt.eventId);
          }}
          onPointHover={(pt) => {
            setHoveredId(pt && pt.eventId ? pt.eventId : null);
          }}
        />
      </Suspense>
    </div>
  );
}
