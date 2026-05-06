import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './OperatorGalaxy.css';
import OperatorGalaxyBG from '../../components/OperatorGalaxyBG';

/* ── SVG Icons ── */
const TraderLabIcon = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="4" y="4" width="12" height="12" rx="2" fill="#EAA960" opacity="0.9" />
    <rect x="20" y="4" width="12" height="12" rx="2" fill="#EAA960" opacity="0.7" />
    <rect x="4" y="20" width="12" height="12" rx="2" fill="#EAA960" opacity="0.7" />
    <rect x="20" y="20" width="12" height="12" rx="2" fill="#EAA960" opacity="0.5" />
  </svg>
);

const TradeValidatorIcon = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <path
      d="M18 3L33 10V18C33 26.28 26.58 33.93 18 36C9.42 33.93 3 26.28 3 18V10L18 3Z"
      fill="none"
      stroke="#EAA960"
      strokeWidth="1.5"
      opacity="0.8"
    />
    <path
      d="M18 3L33 10V18C33 26.28 26.58 33.93 18 36C9.42 33.93 3 26.28 3 18V10L18 3Z"
      fill="#EAA960"
      opacity="0.12"
    />
    <path
      d="M11 18L16 23L25 13"
      stroke="#EAA960"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TradePlaybookIcon = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="7" y="3" width="22" height="30" rx="3" fill="#EAA960" opacity="0.12" stroke="#EAA960" strokeWidth="1.5" />
    <path d="M12 12H24" stroke="#EAA960" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 18H24" stroke="#EAA960" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 24H19" stroke="#EAA960" strokeWidth="2" strokeLinecap="round" />
    <path d="M24 3V10L28 7L24 3Z" fill="#EAA960" opacity="0.7" />
  </svg>
);

/*
 * ── Planet definitions ──
 * Positions match the diagram EXACTLY:
 *   Trade Validator  → left: 50%, top: 58%  (center, below midpoint)
 *   Trader Lab       → left: 20%, top: 50%  (left, true vertical center)
 *   Trade Playbook   → left: 80%, top: 50%  (right, true vertical center)
 *
 * These are % of the full viewport (.operator-galaxy is fixed inset:0).
 * translate(-50%,-50%) centers each planet on its anchor point.
 */
const PLANETS = [
  {
    id: 'validator',
    name: 'Trade Validator',
    Icon: TradeValidatorIcon,
    color: '#EAA960',
    glowColor: 'rgba(234,169,96,0.65)',
    // OUTER ORBIT — front/bottom center
    leftPct: 50,
    topPct: 92,          // sits on outer orbit bottom arc
    baseSize: 160,
    zIndex: 30,          // highest — in front of everything
    depthScale: 1.08,    // larger = closer to user
    depthOpacity: 1,
    depthBlur: 0,
    path: '/trader-deck/trade-validator/overview',
    features: ['Strategy Test', 'Performance', 'Optimization'],
  },
  {
    id: 'traderlab',
    name: 'Trader Lab',
    Icon: TraderLabIcon,
    color: '#D48D44',
    glowColor: 'rgba(212,141,68,0.45)',
    // INNER ORBIT — left, receding behind
    leftPct: 33,
    topPct: 46,          // inner orbit left node
    baseSize: 140,
    zIndex: 10,          // behind validator
    depthScale: 0.87,    // smaller = further away
    depthOpacity: 0.72,
    depthBlur: 0.6,      // px blur for depth haze
    path: '/trader-deck/trade-validator/trader-lab',
    features: ['Live Markets', 'Risk Analysis'],
  },
  {
    id: 'playbook',
    name: 'Trade Playbook',
    Icon: TradePlaybookIcon,
    color: '#C9A96E',
    glowColor: 'rgba(201,169,110,0.45)',
    // INNER ORBIT — right, receding behind
    leftPct: 67,
    topPct: 46,          // inner orbit right node
    baseSize: 140,
    zIndex: 10,          // behind validator
    depthScale: 0.87,
    depthOpacity: 0.72,
    depthBlur: 0.6,
    path: '/trader-deck/trade-validator/trader-playbook',
    features: ['Plays', 'Notes', 'History'],
  },
];

/*
 * ── Responsive planet sizes ──
 * Exactly matches the "Responsive Scaling Recommendation" table in the diagram.
 */
function getPlanetSize(baseSize, vw) {
  const isCenter = baseSize === 160;
  if (vw >= 1400) return isCenter ? 160 : 140;
  if (vw >= 1024) return isCenter ? 148 : 128;
  if (vw >= 768)  return isCenter ? 128 : 110;
  if (vw >= 480)  return isCenter ? 108 :  92;
  return isCenter ? 88 : 74;
}

/*
 * ── Responsive planet positions ──
 * Matches diagram's responsive position table.
 * Center: top always 58% (60% at 480-767, 62% at ≤479)
 * Sides: left 20%/80% (18%/82% at 480-767, 15%/85% at ≤479)
 */
function getResponsivePos(planet, vw) {
if (planet.id === 'validator') {
    if (vw >= 480) return { leftPct: 50, topPct: 75 };
    if (vw >= 380) return { leftPct: 50, topPct: 78 };
    return { leftPct: 50, topPct: 82 };
}
if (planet.id === 'traderlab') {
    if (vw >= 480) return { leftPct: 29, topPct: 50 };
    if (vw >= 380) return { leftPct: 27, topPct: 50 };
    return { leftPct: 24, topPct: 50 };
}
  // playbook
if (vw >= 480) return { leftPct: 71, topPct: 50 };
if (vw >= 380) return { leftPct: 73, topPct: 50 };
return { leftPct: 76, topPct: 50 };
}

/*
 * ── Orbit ellipse dimensions ──
 * The ellipse is centered at (50%, 50%) of the viewport.
 * rx/ry sized so the ellipse passes through (or near) all 3 planet anchor points.
 * At 1400px+: planets at 20%/80% horizontally → horizontal distance from center = 30vw = ~420px → rx≈420
 * Vertical: center planet at top=58%, sides at top=50% → ry should match that offset visually.
 */
/*
 * Returns dimensions for both orbital rings.
 * INNER orbit: passes through Trader Lab (left) & Trade Playbook (right)
 *   — planets at leftPct 24/76, topPct 46  → horiz offset ≈ 26% of vw from center
 * OUTER orbit: passes through Trade Validator bottom arc
 *   — planet at leftPct 50, topPct 75     → vert offset ≈ 25% of vh from center
 * We keep orbit centers at 50%/50% viewport.
 */
function getOrbitDimensions(vw) {
  // Inner orbit rx = horizontal distance from center to side planets (26% of vw)
  // Outer orbit rx is wider; ry is taller so validator sits on bottom arc
if (vw >= 1400) return {
    inner: { rx: 260, ry: 110 },
    outer: { rx: 480, ry: 265 },
};
if (vw >= 1200) return {
    inner: { rx: 225, ry:  96 },
    outer: { rx: 420, ry: 235 },
};
if (vw >= 1024) return {
    inner: { rx: 195, ry:  82 },
    outer: { rx: 360, ry: 200 },
};
if (vw >= 768) return {
    inner: { rx: 160, ry:  66 },
    outer: { rx: 295, ry: 162 },
};
if (vw >= 480) return {
    inner: { rx: 125, ry:  50 },
    outer: { rx: 225, ry: 125 },
};
if (vw >= 380) return {
    inner: { rx: 105, ry:  41 },
    outer: { rx: 185, ry: 104 },
};
return {
    inner: { rx:  90, ry:  34 },
    outer: { rx: 155, ry:  88 },
};
}

export default function OperatorGalaxy() {
  const navigate = useNavigate();
  const [vw, setVw] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1400
  );
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleResize = useCallback(() => setVw(window.innerWidth), []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [handleResize]);

  useEffect(() => {
    document.querySelector('.app-container')?.classList.add('operator-galaxy-page');
    return () =>
      document.querySelector('.app-container')?.classList.remove('operator-galaxy-page');
  }, []);

  const handleClick = (planet) => {
    if (selected) return;
    setSelected(planet.id);
    setTimeout(() => navigate(planet.path), 800);
  };

  const { rx, ry } = getOrbitDimensions(vw);

  /*
   * Orbit rings — same visual layering as original but now the
   * main ring (index 2) is sized to rx/ry so it passes through the planets.
   */
  const rings = [
    { rx: rx * 1.30, ry: ry * 1.30, opacity: 0.14, width: 1   },
    { rx: rx * 1.10, ry: ry * 1.10, opacity: 0.24, width: 1   },
    { rx,            ry,            opacity: 0.52, width: 1.5 }, // ← main orbit
    { rx: rx * 0.72, ry: ry * 0.72, opacity: 0.28, width: 1   },
    { rx: rx * 0.44, ry: ry * 0.44, opacity: 0.18, width: 1   },
  ];

  return (
    <div className="operator-galaxy">
      <OperatorGalaxyBG />
{/* ── Orbital rings — centered at 50% / 50% ── */}
<div className="orbit-rings-container">
  {rings.map((ring, i) => (
    <div
      key={i}
      className="orbit-ring"
      style={{
        width:       ring.rx * 2,
        height:      ring.ry * 2,
        opacity:     ring.opacity,
        borderWidth: ring.width,
      }}
    />
  ))}
  {/* Central sun glow */}
  <div className="orbit-sun">
    <div className="orbit-sun-core" />
    <div className="orbit-sun-halo1" />
    <div className="orbit-sun-halo2" />
    <div className="orbit-sun-halo3" />
  </div>
  
{/* Central sun glow */}
<div className="orbit-sun">
  <div className="orbit-sun-core" />
  <div className="orbit-sun-halo1" />
  <div className="orbit-sun-halo2" />
  <div className="orbit-sun-halo3" />
</div>

{/* ── Static orbital dots ── */}
<div className="orbit-dot orbit-dot-1" />



{/* ── Static orbital dots - OUTSIDE container, all same as Dot 1 style ── */}
<div className="orbit-dot orbit-dot-1" />
<div className="orbit-dot orbit-dot-2" />
<div className="orbit-dot orbit-dot-3" />
<div className="orbit-dot orbit-dot-4" />
<div className="orbit-dot orbit-dot-5" />
<div className="orbit-dot orbit-dot-6" />
</div>

      {/* ── Header ── */}
      <motion.div
        className="galaxy-header"
        initial={{ opacity: 0, y: -28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="galaxy-header-left">
          <p className="galaxy-brand-mark">OPERATOR</p>
          <p className="galaxy-brand-sub">TRADING INTELLIGENCE SYSTEM</p>
        </div>
        <div className="galaxy-header-right">
          <p className="galaxy-status-label">SYSTEM STATUS</p>
          <div className="galaxy-status-value">
            <span className="galaxy-status-dot" />
            OPTIMAL
          </div>
        </div>
      </motion.div>

      {/* ── Title block ── */}
      <motion.div
        className="galaxy-title-block"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
        <h1 className="galaxy-title">TRADERS GALAXY</h1>
        <p className="galaxy-subtitle">NAVIGATE YOUR TRADING UNIVERSE</p>
      </motion.div>

      {/* ── Planets ── */}
      {PLANETS.map((planet) => {
        const isHovered  = hovered  === planet.id;
        const isSelected = selected === planet.id;
        const sz         = getPlanetSize(planet.baseSize, vw);
        const pos        = getResponsivePos(planet, vw);

        return (
          <div
            key={planet.id}
           className={`planet-node${isHovered ? ' is-hovered' : ''}${isSelected ? ' is-selected' : ''}${planet.id === 'validator' ? ' is-center' : ''}${planet.id === 'traderlab' ? ' is-lab' : ''}${planet.id === 'playbook' ? ' is-playbook' : ''}`}
            style={{
              '--glow' : planet.glowColor,
              '--sz'   : `${sz}px`,
              position : 'fixed',          // fixed so % is of viewport, same as operator-galaxy
              left     : `${pos.leftPct}%`,
              top      : `${pos.topPct}%`,
              transform: 'translate(-50%, -50%)',
              zIndex   : planet.zIndex,
            }}
            onMouseEnter={() => setHovered(planet.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleClick(planet)}
          >
   
            
            <div
              className="planet-sphere"
              style={{
                width  : sz,
                height : sz,
             boxShadow: isHovered
  ? `0 0 0 2px  rgba(255,235,150,0.95),
     0 0 0 5px  rgba(234,169, 96,0.45),
     0 0 0 10px rgba(234,169, 96,0.18),
     0 0 50px 14px rgba(234,169,96,0.50),
     0 0 90px 24px rgba(234,169,96,0.22),
     0 20px 55px rgba(0,0,0,0.72),
     inset -10px 12px 28px rgba(0,0,0,0.85),
     inset   7px -7px 20px rgba(234,169,96,0.18),
     inset   3px -3px  8px rgba(255,240,200,0.12)`
  : planet.id === 'validator'
    ? `0 0 0 1.5px rgba(234,169,96,0.65),
       0 0 0 4px   rgba(234,169,96,0.22),
       0 0 35px 8px rgba(234,169,96,0.32),
       0 0 70px 16px rgba(234,169,96,0.13),
       0 20px 52px rgba(0,0,0,0.65),
       inset -8px 10px 24px rgba(0,0,0,0.80),
       inset  6px -6px 18px rgba(234,169,96,0.14),
       inset  3px -3px  8px rgba(255,240,200,0.09)`
    : `0 0 0 1px   rgba(234,169,96,0.35),
       0 0 0 3px   rgba(234,169,96,0.12),
       0 0 20px 4px rgba(234,169,96,0.16),
       0 0 42px 8px rgba(234,169,96,0.07),
       0 12px 32px rgba(0,0,0,0.60),
       inset -6px  8px 18px rgba(0,0,0,0.78),
       inset  4px -4px 14px rgba(234,169,96,0.10),
       inset  2px -2px  6px rgba(255,240,200,0.06)`,
              }}
            >
                       <div className="planet-atmosphere" />
<div className="planet-gold-crescent" />
            <div className="planet-glow-ring" />
              <div className="planet-bubble-shell" />
              <div className="planet-bubble-shell" />
              <div className="planet-rim" />
              <div className="planet-icon-wrap">
                <planet.Icon />
              </div>
            </div>

            <div className="planet-label-wrap">
              <span className="planet-label">{planet.name}</span>
            </div>

            {isSelected && (
              <motion.div
                className="planet-select-flash"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.8, 2.8] }}
                transition={{ duration: 0.75, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
          </div>
        );
      })}

      {/* ── Hover tooltip ── */}
      <AnimatePresence>
        {hovered && !selected && (() => {
          const p = PLANETS.find((pl) => pl.id === hovered);
          if (!p) return null;
          return (
            <motion.div
              className="planet-tooltip"
              key={hovered}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
            >
              <div className="tooltip-inner">
                <div className="tooltip-top-line" />
                <h3>{p.name}</h3>
                <div className="tooltip-tags">
                  {p.features.map((f, i) => (
                    <span key={i} className="tooltip-tag">{f}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Bottom cue ── */}
      <motion.div
        className="galaxy-cue"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
      >
        <span className="cue-text">Select a planet to explore</span>
        <span className="cue-icon">⌘</span>
      </motion.div>
    </div>
  );
}