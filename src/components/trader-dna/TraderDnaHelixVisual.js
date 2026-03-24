import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

const VIEW_W = 240;
const VIEW_H = 440;
const TURNS = 4;
const STEPS = 128;
const MARGIN = 22;
const R = 44;

function sampleHelix(phaseRad) {
  const pts = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = (i / STEPS) * TURNS * 2 * Math.PI + phaseRad;
    const y = MARGIN + (i / STEPS) * (VIEW_H - 2 * MARGIN);
    const x = VIEW_W / 2 + R * Math.cos(t);
    pts.push({ x, y });
  }
  return pts;
}

/** Smooth Catmull-Rom–style cubic through sampled points (no sharp facets). */
function pointsToBezierPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildRungs(ptsA, ptsB, every = 5) {
  const rungs = [];
  for (let i = 0; i <= STEPS; i += every) {
    rungs.push({
      key: i,
      x1: ptsA[i].x,
      y: ptsA[i].y,
      x2: ptsB[i].x,
      depth: Math.sin((i / STEPS) * TURNS * 2 * Math.PI),
    });
  }
  return rungs;
}

/**
 * Decorative double helix: draws in from nothing as `progress` goes 0→100; outer wrapper handles rotation (CSS).
 */
export default function TraderDnaHelixVisual({ progress = 0 }) {
  const uid = useId().replace(/:/g, '');
  const pathARef = useRef(null);
  const pathBRef = useRef(null);
  const [lenA, setLenA] = useState(0);
  const [lenB, setLenB] = useState(0);

  const { dA, dB, rungs } = useMemo(() => {
    const ptsA = sampleHelix(0);
    const ptsB = sampleHelix(Math.PI);
    return {
      dA: pointsToBezierPath(ptsA),
      dB: pointsToBezierPath(ptsB),
      rungs: buildRungs(ptsA, ptsB, 5),
    };
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const a = pathARef.current?.getTotalLength?.() ?? 0;
      const b = pathBRef.current?.getTotalLength?.() ?? 0;
      if (a > 0) setLenA(a);
      if (b > 0) setLenB(b);
    };
    measure();
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [dA, dB]);

  const p = Math.min(100, Math.max(0, progress)) / 100;
  const stagger = 0.08;
  const revealA = Math.min(1, p / (1 - stagger));
  const revealB = Math.min(1, Math.max(0, (p - stagger) / (1 - stagger)));

  const offA = lenA > 0 ? lenA * (1 - revealA) : 0;
  const offB = lenB > 0 ? lenB * (1 - revealB) : 0;

  const rungBaseOpacity = Math.min(1, Math.max(0, (p - 0.18) / 0.58));

  const ga = `tdna-helix-ga-${uid}`;
  const gb = `tdna-helix-gb-${uid}`;
  const gAmbient = `tdna-helix-amb-${uid}`;
  const gRung = `tdna-helix-rung-${uid}`;
  const gNucA = `tdna-helix-nuca-${uid}`;
  const gNucB = `tdna-helix-nucb-${uid}`;
  const fStrand = `tdna-helix-strand-${uid}`;
  const fBloom = `tdna-helix-bloom-${uid}`;

  return (
    <svg
      className="tdna-helix-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id={gAmbient} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#5b7cff" stopOpacity="0.14" />
          <stop offset="55%" stopColor="#1a1030" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#040818" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ga} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--tdna-intro-accent-soft, #63b3ed)" stopOpacity="0.98" />
          <stop offset="42%" stopColor="var(--tdna-intro-accent, #8b7bff)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--tdna-intro-accent-2, #5b7cff)" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={gb} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--tdna-intro-accent-2, #5b7cff)" stopOpacity="0.94" />
          <stop offset="48%" stopColor="var(--tdna-intro-accent-soft, #63b3ed)" stopOpacity="0.93" />
          <stop offset="100%" stopColor="var(--tdna-intro-accent, #a78bfa)" stopOpacity="0.88" />
        </linearGradient>
        <linearGradient id={gRung} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="rgba(125, 211, 252, 0.55)" />
          <stop offset="50%" stopColor="rgba(167, 139, 250, 0.65)" />
          <stop offset="100%" stopColor="rgba(129, 140, 248, 0.5)" />
        </linearGradient>
        <radialGradient id={gNucA} cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.75" />
        </radialGradient>
        <radialGradient id={gNucB} cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ede9fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.75" />
        </radialGradient>
        <filter id={fBloom} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0"
            result="soft"
          />
          <feMerge>
            <feMergeNode in="soft" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={fStrand} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse
        className="tdna-helix-ambient"
        cx={VIEW_W / 2}
        cy={VIEW_H * 0.46}
        rx={VIEW_W * 0.48}
        ry={VIEW_H * 0.42}
        fill={`url(#${gAmbient})`}
      />

      <g className="tdna-helix-rungs" style={{ opacity: rungBaseOpacity }}>
        {rungs.map(({ key, x1, y, x2, depth }) => {
          const t = key / STEPS;
          const local = Math.min(1, Math.max(0, (p - t * 0.82) / 0.22));
          const depthFade = 0.45 + Math.abs(depth) * 0.55;
          const op = local * depthFade;
          const r = 2.2 + Math.abs(depth) * 0.6;
          return (
            <g key={key} className="tdna-helix-basepair" style={{ opacity: op }}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={`url(#${gRung})`}
                strokeWidth={1.25}
                strokeLinecap="round"
              />
              <circle cx={x1} cy={y} r={r} fill={`url(#${gNucA})`} className="tdna-helix-nuc" />
              <circle cx={x2} cy={y} r={r} fill={`url(#${gNucB})`} className="tdna-helix-nuc" />
            </g>
          );
        })}
      </g>

      <path
        className="tdna-helix-strand tdna-helix-strand--b"
        ref={pathBRef}
        d={dB}
        fill="none"
        stroke={`url(#${gb})`}
        strokeWidth={2.85}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${fBloom})`}
        strokeDasharray={lenB > 0 ? lenB : undefined}
        strokeDashoffset={lenB > 0 ? offB : undefined}
        style={{ opacity: lenB > 0 ? 0.92 : 0 }}
      />
      <path
        className="tdna-helix-strand tdna-helix-strand--a"
        ref={pathARef}
        d={dA}
        fill="none"
        stroke={`url(#${ga})`}
        strokeWidth={2.95}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${fStrand})`}
        strokeDasharray={lenA > 0 ? lenA : undefined}
        strokeDashoffset={lenA > 0 ? offA : undefined}
        style={{ opacity: lenA > 0 ? 1 : 0 }}
      />
    </svg>
  );
}
