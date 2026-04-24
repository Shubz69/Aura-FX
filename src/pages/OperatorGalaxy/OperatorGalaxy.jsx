import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './OperatorGalaxy.css';
import OperatorGalaxyBG from '../../components/OperatorGalaxyBG';

/* ── SVG Icons ── */
const TraderLabIcon = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="4"  y="4"  width="12" height="12" rx="2" fill="#EAA960" opacity="0.9"/>
    <rect x="20" y="4"  width="12" height="12" rx="2" fill="#EAA960" opacity="0.7"/>
    <rect x="4"  y="20" width="12" height="12" rx="2" fill="#EAA960" opacity="0.7"/>
    <rect x="20" y="20" width="12" height="12" rx="2" fill="#EAA960" opacity="0.5"/>
  </svg>
);

const TradeValidatorIcon = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <path d="M18 3L33 10V18C33 26.28 26.58 33.93 18 36C9.42 33.93 3 26.28 3 18V10L18 3Z"
      fill="none" stroke="#EAA960" strokeWidth="1.5" opacity="0.8"/>
    <path d="M18 3L33 10V18C33 26.28 26.58 33.93 18 36C9.42 33.93 3 26.28 3 18V10L18 3Z"
      fill="#EAA960" opacity="0.12"/>
    <path d="M11 18L16 23L25 13" stroke="#EAA960" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TradePlaybookIcon = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="7" y="3" width="22" height="30" rx="3" fill="#EAA960" opacity="0.12" stroke="#EAA960" strokeWidth="1.5"/>
    <path d="M12 12H24" stroke="#EAA960" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 18H24" stroke="#EAA960" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 24H19" stroke="#EAA960" strokeWidth="2" strokeLinecap="round"/>
    <path d="M24 3V10L28 7L24 3Z" fill="#EAA960" opacity="0.7"/>
  </svg>
);

const PLANETS = [
  {
    id: 'traderlab',
    name: 'Trader Lab',
    description: 'Advanced trading laboratory with real-time analytics',
    Icon: TraderLabIcon,
    color: '#EAA960',
    glowColor: 'rgba(234,169,96,0.55)',
    angleOffset: 210,
    size: 110,
    path: '/trader-deck/trade-validator/trader-lab',
    features: ['Live Markets', 'AI Signals', 'Risk Analysis'],
  },
  {
    id: 'validator',
    name: 'Trade Validator',
    description: 'Validate and optimise your trading strategies',
    Icon: TradeValidatorIcon,
    color: '#C9A96E',
    glowColor: 'rgba(201,169,110,0.55)',
    angleOffset: 340,
    size: 110,
    path: '/trader-deck/trade-validator/overview',
    features: ['Strategy Test', 'Performance', 'Optimization'],
  },
  {
    id: 'playbook',
    name: 'Trade Playbook',
    description: 'Your personalised trading playbook and journal',
    Icon: TradePlaybookIcon,
    color: '#D48D44',
    glowColor: 'rgba(212,141,68,0.55)',
    angleOffset: 100,
    size: 120,
    path: '/trader-deck/trade-validator/trader-playbook',
    features: ['Plays', 'Notes', 'History'],
  },
];

const ORBIT_TILT = -8;   // degrees — matches the CSS rotate(-8deg) on the ring
const SPEED      = 18;   // degrees per second

function getOrbitDimensions() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  if (vw >= 1200) return { rx: 310, ry: 110, planetScale: 1.00, topOffset: 60 };
  if (vw >= 1024) return { rx: 270, ry:  96, planetScale: 0.92, topOffset: 50 };
  if (vw >=  768) return { rx: 235, ry:  83, planetScale: 0.85, topOffset: 40 };
  if (vw >=  480) return { rx: 190, ry:  67, planetScale: 0.75, topOffset: 30 };
  if (vw >=  380) return { rx: 155, ry:  55, planetScale: 0.65, topOffset: 20 };
  if (vw >=  320) return { rx: 130, ry:  46, planetScale: 0.55, topOffset: 15 };
  return                 { rx: 110, ry:  39, planetScale: 0.48, topOffset: 10 };
}

/** Pixel offset from orbit-centre for a planet at `angleDeg` on the tilted ellipse */
function orbitXY(angleDeg, rx, ry) {
  const rad  = (angleDeg * Math.PI) / 180;
  const tilt = (ORBIT_TILT * Math.PI) / 180;
  const ex   = Math.cos(rad) * rx;
  const ey   = Math.sin(rad) * ry;
  return {
    x: ex * Math.cos(tilt) - ey * Math.sin(tilt),
    y: ex * Math.sin(tilt) + ey * Math.cos(tilt),
    z: Math.sin(rad),  // −1 = far side, +1 = near side
  };
}

export default function OperatorGalaxy() {
  const navigate = useNavigate();

  const [dims,     setDims]     = useState(getOrbitDimensions);
  const [hovered,  setHovered]  = useState(null);
  const [selected, setSelected] = useState(null);

  /*
   * anglesRef   — current angle per planet (mutated in rAF, never causes re-render)
   * nodeRefs    — map of planet id → wrapper DOM element
   * sphereRefs  — map of planet id → sphere DOM element (for boxShadow updates)
   * dimsRef     — live dims without triggering re-renders inside rAF
   * rafRef      — animation frame handle
   * lastRef     — previous timestamp
   */
  const anglesRef  = useRef(Object.fromEntries(PLANETS.map(p => [p.id, p.angleOffset])));
  const nodeRefs   = useRef({});
  const sphereRefs = useRef({});
  const dimsRef    = useRef(dims);
  const rafRef     = useRef(null);
  const lastRef    = useRef(null);

  useEffect(() => { dimsRef.current = dims; }, [dims]);

  /* Resize */
  const handleResize = useCallback(() => setDims(getOrbitDimensions()), []);
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [handleResize]);

  /* Hide app footer */
  useEffect(() => {
    document.querySelector('.app-container')?.classList.add('operator-galaxy-page');
    return () => document.querySelector('.app-container')?.classList.remove('operator-galaxy-page');
  }, []);

  /*
   * ANIMATION LOOP — writes directly to DOM nodes via refs.
   * Zero React re-renders per frame → buttery smooth.
   * The transform string is:
   *   translate(calc(-50% + Xpx), calc(-50% + Ypx)) scale(S)
   *
   * The `calc(-50% + Xpx)` part:
   *   • -50%  centres the element on the stage anchor (0,0)
   *   • + Xpx shifts it to the correct orbit position
   * This is a single CSS transform — nothing conflicts.
   */
  useEffect(() => {
    lastRef.current = performance.now();

    const tick = (now) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;

      const { rx, ry, planetScale } = dimsRef.current;

      PLANETS.forEach(planet => {
        // Advance angle
        anglesRef.current[planet.id] =
          (anglesRef.current[planet.id] + SPEED * dt) % 360;

        const el = nodeRefs.current[planet.id];
        if (!el) return;

        const { x, y, z } = orbitXY(anglesRef.current[planet.id], rx, ry);
        const perspScale   = 0.72 + (z + 1) * 0.14;
        const finalScale   = perspScale * planetScale;
        const sz           = planet.size * finalScale;

        // Position + scale — ONE transform string, no conflict
        el.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${finalScale})`;
        el.style.zIndex    = String(Math.round((z + 1) * 50) + 10);
        el.style.setProperty('--sz', `${sz}px`);

        // Also resize the sphere element directly
        const sphere = sphereRefs.current[planet.id];
        if (sphere) {
          sphere.style.width  = `${sz}px`;
          sphere.style.height = `${sz}px`;
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleClick = (planet) => {
    if (selected) return;
    setSelected(planet.id);
    setTimeout(() => navigate(planet.path), 800);
  };

  const { rx, ry, topOffset, planetScale } = dims;

  return (
    <div className="operator-galaxy">
      <OperatorGalaxyBG />

      {/* ── Orbit ring ── */}
      <div
        className="orbit-ellipse-wrap"
        style={{ top: `calc(50% + ${topOffset}px)` }}
      >
        <div
          className="orbit-ellipse"
          style={{ width: `${rx * 2}px`, height: `${ry * 2}px` }}
        />

        {/* Sparkle dots pinned to the ring at 0°/90°/180°/270° */}
        {[0, 90, 180, 270].map(deg => {
          const { x, y } = orbitXY(deg, rx, ry);
          return (
            <div
              key={deg}
              className="orbit-sparkle"
              style={{
                '--tx': `${x}px`,
                '--ty': `${y}px`,
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
            />
          );
        })}
      </div>

      {/* ── Header ── */}
      <motion.div
        className="galaxy-header"
        initial={{ opacity: 0, y: -28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      >
        <p className="galaxy-brand-mark">THE</p>
        <h1 className="galaxy-title">OPERATOR</h1>
        <div className="galaxy-ornament">
          <span className="ornament-line" />
          <span className="ornament-diamond">◆</span>
          <span className="ornament-line" />
        </div>
        <p className="galaxy-subtitle">TRADERS GALAXY</p>
        <p className="galaxy-subnote">Navigate your trading universe</p>
      </motion.div>

      {/* ── Planets stage ──
          A zero-size div positioned at the orbit centre.
          Each planet-node is absolutely placed from this point using
          a combined translate+scale transform so there is no CSS/JS conflict.
      ── */}
      <div
        className="planets-stage"
        style={{ top: `calc(50% + ${topOffset}px)` }}
      >
        {PLANETS.map((planet) => {
          const isHovered  = hovered  === planet.id;
          const isSelected = selected === planet.id;

          // Snapshot initial position to avoid a one-frame flash at 0,0
          const { x: ix, y: iy, z: iz } = orbitXY(anglesRef.current[planet.id], rx, ry);
          const initScale = (0.72 + (iz + 1) * 0.14) * planetScale;
          const initSz    = planet.size * initScale;

          return (
            <div
              key={planet.id}
              ref={el => { nodeRefs.current[planet.id] = el; }}
              className={`planet-node${isHovered ? ' is-hovered' : ''}${isSelected ? ' is-selected' : ''}`}
              style={{
                '--glow': planet.glowColor,
                '--sz':   `${initSz}px`,
                // Initial transform — rAF will overwrite every frame
                transform: `translate(calc(-50% + ${ix}px), calc(-50% + ${iy}px)) scale(${initScale})`,
                zIndex:     Math.round((iz + 1) * 50) + 10,
              }}
              onMouseEnter={() => setHovered(planet.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleClick(planet)}
            >
              {/* Glow ring */}
              <div className="planet-glow-ring" />

              {/* Sphere */}
              <div
                ref={el => { sphereRefs.current[planet.id] = el; }}
                className="planet-sphere"
                style={{
                  width:  initSz,
                  height: initSz,
                  boxShadow: isHovered
                    ? `0 0 0 2px rgba(234,169,96,0.9),
                       0 0 24px ${planet.glowColor},
                       0 0 60px ${planet.glowColor.replace('0.55', '0.35')},
                       inset 0 0 30px rgba(234,169,96,0.12)`
                    : `0 0 0 1.5px rgba(234,169,96,0.45),
                       0 0 20px rgba(234,169,96,0.2),
                       inset 0 0 20px rgba(234,169,96,0.06)`,
                }}
              >
                <div className="planet-rim" />
                <div className="planet-icon-wrap">
                  <planet.Icon />
                </div>
              </div>

              {/* Label */}
              <div className="planet-label-wrap">
                <span className="planet-label">{planet.name}</span>
              </div>

              {/* Selection burst */}
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
      </div>

      {/* ── Hover tooltip ── */}
      <AnimatePresence>
        {hovered && !selected && (
          <motion.div
            className="planet-tooltip"
            key={hovered}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
          >
            {(() => {
              const p = PLANETS.find(pl => pl.id === hovered);
              if (!p) return null;
              return (
                <div className="tooltip-inner">
                  <div className="tooltip-top-line" />
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <div className="tooltip-tags">
                    {p.features.map((f, i) => (
                      <span key={i} className="tooltip-tag">{f}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
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