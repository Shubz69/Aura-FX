import React, { useEffect, useState, useRef, useCallback } from 'react';

/* ─── Injected CSS (self-contained, no external file needed) ─── */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@200;300;400;500;600;700&display=swap');

.aet-shell {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Space Grotesk', sans-serif;
  overflow: hidden;
}

.aet-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* ── CSS glow layers ── */
.aet-glow {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  border-radius: 50%;
}
.aet-glow-3 {
  width: 900px; height: 900px;
  background: radial-gradient(ellipse at center,
    rgba(139,92,246,0.04) 0%, transparent 65%);
  animation: gp1 6s ease-in-out infinite reverse;
}
.aet-glow-2 {
  width: 580px; height: 580px;
  background: radial-gradient(ellipse at center,
    rgba(139,92,246,0.09) 0%, rgba(99,179,237,0.06) 40%, transparent 70%);
  animation: gp2 4s ease-in-out infinite;
}
.aet-glow-1 {
  width: 300px; height: 300px;
  background: radial-gradient(ellipse at center,
    rgba(139,92,246,0.22) 0%, rgba(99,179,237,0.12) 35%, transparent 70%);
  animation: gp1 3s ease-in-out infinite;
}
@keyframes gp1 {
  0%,100% { opacity:.65; transform: translate(-50%,-50%) scale(1); }
  50%      { opacity:1;   transform: translate(-50%,-50%) scale(1.1); }
}
@keyframes gp2 {
  0%,100% { opacity:.5; transform: translate(-50%,-50%) scale(1); }
  50%      { opacity:.9; transform: translate(-50%,-50%) scale(1.06); }
}

/* ── Singularity ── */
.aet-core {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.aet-core-hole {
  width: 62px; height: 62px;
  border-radius: 50%;
  background: radial-gradient(circle, #000 55%, rgba(20,0,50,0.85) 80%, transparent 100%);
  box-shadow:
    0 0 0 2px rgba(139,92,246,0.28),
    0 0 22px rgba(139,92,246,0.55),
    0 0 55px rgba(139,92,246,0.25),
    inset 0 0 22px #000;
  animation: coreBreath 2.2s ease-in-out infinite;
  position: relative; z-index: 5;
}
.aet-core-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid transparent;
  animation: rr linear infinite;
}
.aet-core-ring:nth-child(1) {
  width: 94px; height: 94px;
  border-top-color: rgba(139,92,246,0.65);
  border-right-color: rgba(139,92,246,0.18);
  animation-duration: 2.3s;
}
.aet-core-ring:nth-child(2) {
  width: 122px; height: 122px;
  border-bottom-color: rgba(99,179,237,0.55);
  border-left-color: rgba(99,179,237,0.12);
  animation-duration: 3.7s;
  animation-direction: reverse;
}
.aet-core-ring:nth-child(3) {
  width: 154px; height: 154px;
  border-top-color: rgba(167,139,250,0.38);
  border-right-color: rgba(167,139,250,0.07);
  animation-duration: 5.4s;
}
@keyframes coreBreath {
  0%,100% { box-shadow: 0 0 0 2px rgba(139,92,246,.28), 0 0 22px rgba(139,92,246,.55), 0 0 55px rgba(139,92,246,.25), inset 0 0 22px #000; }
  50%      { box-shadow: 0 0 0 3px rgba(139,92,246,.5),  0 0 36px rgba(139,92,246,.75), 0 0 90px rgba(139,92,246,.4),  inset 0 0 22px #000; }
}
@keyframes rr {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── HUD card ── */
.aet-hud {
  position: absolute;
  bottom: clamp(28px, 7vh, 72px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex; flex-direction: column;
  align-items: center; gap: .8rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 1.5rem 2.2rem;
  backdrop-filter: blur(20px);
  min-width: 230px;
  overflow: hidden;
  animation: hudIn .55s cubic-bezier(.22,1,.36,1) both;
  transition: opacity .3s ease;
}
.aet-hud.aet-hud-hide { opacity: 0; pointer-events: none; }
.aet-hud::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(139,92,246,.7), rgba(99,179,237,.5), transparent);
}
.aet-hud::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at top, rgba(139,92,246,.07) 0%, transparent 65%);
  pointer-events: none;
}
@keyframes hudIn {
  from { opacity:0; transform: translateX(-50%) translateY(12px); }
  to   { opacity:1; transform: translateX(-50%) translateY(0); }
}

.aet-hud-label {
  font-size: .66rem; font-weight: 300; letter-spacing: .36em;
  text-transform: uppercase; color: rgba(255,255,255,.5);
  margin: 0; position: relative; z-index: 1;
}
.aet-hud-track {
  width: 210px; height: 2px;
  background: rgba(255,255,255,.06);
  border-radius: 99px; overflow: hidden;
  position: relative; z-index: 1;
}
.aet-hud-fill {
  height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, rgba(139,92,246,.9), rgba(99,179,237,.8));
  box-shadow: 0 0 10px rgba(139,92,246,.6);
  position: relative;
  transition: width .1s cubic-bezier(.22,1,.36,1);
}
.aet-hud-fill::after {
  content: '';
  position: absolute; top: 0; left: -60%; width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
  animation: shimmer 2.1s ease-in-out infinite;
}
@keyframes shimmer { 0%{left:-60%;opacity:0;} 40%{opacity:1;} 100%{left:120%;opacity:0;} }

.aet-hud-pct {
  font-size: .68rem; font-weight: 300; letter-spacing: .2em; margin: 0;
  background: linear-gradient(125deg, #fff 30%, #c4b5fd 70%, #93c5fd 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  filter: drop-shadow(0 0 8px rgba(139,92,246,.4));
  position: relative; z-index: 1;
}

/* ── Exit: simple opacity fade (handled via inline style) ── */
.aet-shell.aet-exit {
  opacity: 0;
  pointer-events: none;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .aet-core-ring, .aet-glow-1, .aet-glow-2, .aet-glow-3,
  .aet-core-hole { animation: none !important; }
}

/* Responsive */
@media (max-width: 480px) {
  .aet-core-hole { width:46px; height:46px; }
  .aet-core-ring:nth-child(1){ width:68px;  height:68px; }
  .aet-core-ring:nth-child(2){ width:90px;  height:90px; }
  .aet-core-ring:nth-child(3){ width:114px; height:114px; }
  .aet-glow-1{ width:220px; height:220px; }
  .aet-glow-2{ width:400px; height:400px; }
  .aet-glow-3{ width:580px; height:580px; }
  .aet-hud { padding:1.1rem 1.5rem; min-width:195px; }
  .aet-hud-track { width:170px; }
}
`;

/* ─── Canvas particle/galaxy renderer ─────────────────────────────────────── */
class Galaxy {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize(canvas.width, canvas.height);
  }

  resize(w, h) {
    this.W = w; this.H = h;
    this.cx = w / 2; this.cy = h / 2;
    this.maxR = Math.min(w, h) * 0.46;
    this._buildStars();
    this._buildParticles();
    this.time = 0;
    this.suck = 0;
  }

  _buildStars() {
    this.stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * this.W,
      y: Math.random() * this.H,
      r: Math.random() * 1.3,
      a: 0.1 + Math.random() * 0.85,
      tw: Math.random() * Math.PI * 2,
    }));
  }

  _buildParticles() {
    const N = window.innerWidth < 480 ? 300 : 500;
    const COLS = ['rgba(139,92,246,', 'rgba(99,179,237,', 'rgba(167,139,250,', 'rgba(196,181,253,', 'rgba(255,255,255,', 'rgba(52,211,153,'];
    this.pts = Array.from({ length: N }, (_, i) => {
      const arm = i % 3;
      const t = Math.random();
      const base = (arm / 3) * Math.PI * 2 + t * Math.PI * 3.8;
      const ang = base + (Math.random() - 0.5) * 0.3;
      const dist = 36 + t * (this.maxR - 36) + (Math.random() - 0.5) * 26;
      const ci = Math.random() < 0.05 ? 5 : Math.floor(Math.random() * 5);
      return {
        ang, dist,
        spd: (0.0005 + Math.random() * 0.0009) * (Math.random() < 0.5 ? 1 : -0.55),
        col: COLS[ci],
        a: 0.22 + Math.random() * 0.65,
        r: 0.55 + Math.random() * 1.45,
      };
    });
  }

  update(dt, suck) {
    this.time += dt;
    this.suck = suck;
    const { pts, maxR } = this;

    for (const p of pts) {
      p.ang += p.spd * (1 + suck * 2.2);
      if (suck > 0) {
        const pull = suck * suck * 0.025 + 0.0008;
        p.dist = Math.max(0, p.dist - pull * (p.dist * 0.045 + 0.9));
      }
      // Respawn at outer edge
      if (p.dist < 2 || (suck < 0.1 && p.dist > maxR * 1.05)) {
        p.dist = maxR * (0.82 + Math.random() * 0.18);
      }
    }

    // Star drift toward core during suck
    if (suck > 0.05) {
      for (const s of this.stars) {
        const dx = this.cx - s.x, dy = this.cy - s.y;
        s.x += dx * suck * 0.005;
        s.y += dy * suck * 0.005;
      }
    }
  }

  draw() {
    const { ctx, W, H, cx, cy, time, suck, pts, stars } = this;
    ctx.clearRect(0, 0, W, H);

    // Stars
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(s.tw + time * 0.9);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(s.a * tw * (1 - suck * 0.55)).toFixed(2)})`;
      ctx.fill();
    }

    // Galaxy disk particles
    for (const p of pts) {
      const x = cx + Math.cos(p.ang) * p.dist;
      const y = cy + Math.sin(p.ang) * p.dist * 0.40; // flattened disk
      const nearFade = Math.max(0, 1 - p.dist / 30);
      const a = p.a * (1 - nearFade * 0.92);
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `${p.col}${a.toFixed(2)})`;
      ctx.fill();
    }

    // Accretion arcs
    for (let i = 0; i < 3; i++) {
      const sweep = (time * 0.24 + (i / 3) * Math.PI * 2) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, 58 + i * 6, sweep, sweep + 0.5);
      ctx.strokeStyle = i % 2 === 0
        ? `rgba(139,92,246,${0.16 + suck * 0.14})`
        : `rgba(99,179,237,${0.13 + suck * 0.11})`;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Vortex streaks (appear on suck)
    if (suck > 0.2) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * 1.6;
        const len = 55 + 50 * suck;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.42);
        ctx.strokeStyle = `rgba(167,139,250,${(suck * 0.1).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

/* ─── RAF hook ──────────────────────────────────────────────────────────── */
function useRAF(cb) {
  const ref = useRef(cb);
  useEffect(() => { ref.current = cb; }, [cb]);
  useEffect(() => {
    let id, last;
    const loop = (ts) => {
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      last = ts;
      ref.current(dt);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function AuraEnterTransition({ onComplete, label }) {
  const canvasRef = useRef(null);
  const galaxyRef = useRef(null);
  const suckRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('loading'); // loading | sucking | flash | exiting
  const phaseRef = useRef('loading');

  // Inject CSS once
  useEffect(() => {
    const id = 'aet-css';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id; el.textContent = STYLES;
      document.head.appendChild(el);
    }
  }, []);

  // Canvas init + resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (galaxyRef.current) galaxyRef.current.resize(canvas.width, canvas.height);
      else galaxyRef.current = new Galaxy(canvas);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Progress ramp: 0→100 in 4s (ease-out-cubic), then suck + fade
  useEffect(() => {
    const start = performance.now();
    const dur = 4000;
    let rafId;
    const tick = (now) => {
      const raw = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      const val = Math.round(eased * 100);
      setProgress(val);
      if (val < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          phaseRef.current = 'sucking';
          setPhase('sucking');
          // After suck, fade out smoothly — onComplete fires mid-fade so next screen is already visible
          setTimeout(() => {
            phaseRef.current = 'exiting';
            setPhase('exiting');
            setTimeout(() => onComplete?.(), 600);
          }, 1150);
        }, 180);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  // RAF: update suck ramp + draw
  useRAF(useCallback((dt) => {
    const g = galaxyRef.current;
    if (!g) return;
    if (phaseRef.current === 'sucking' || phaseRef.current === 'exiting') {
      suckRef.current = Math.min(suckRef.current + dt * 0.85, 1);
    }
    g.update(dt, suckRef.current);
    g.draw();
  }, []));

  const hudHide = phase !== 'loading';

  return (
    <div
      className="aet-shell"
      style={{
        transition: 'opacity 0.6s cubic-bezier(0.4,0,0.2,1)',
        opacity: phase === 'exiting' ? 0 : 1,
        pointerEvents: phase === 'exiting' ? 'none' : 'auto',
      }}
    >
      <canvas ref={canvasRef} className="aet-canvas" />

      <div className="aet-glow aet-glow-3" />
      <div className="aet-glow aet-glow-2" />
      <div className="aet-glow aet-glow-1" />

      <div className="aet-core">
        <div className="aet-core-ring" />
        <div className="aet-core-ring" />
        <div className="aet-core-ring" />
        <div className="aet-core-hole" />
      </div>

      <div className={`aet-hud${hudHide ? ' aet-hud-hide' : ''}`}>
        <p className="aet-hud-label">{typeof label === 'string' ? label : 'Initializing Aura Analysis'}</p>
        <div className="aet-hud-track">
          <div className="aet-hud-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="aet-hud-pct">{progress}%</p>
      </div>
    </div>
  );
}