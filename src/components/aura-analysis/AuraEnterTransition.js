import React, { useEffect, useState, useRef, useCallback } from 'react';

/* ─── Injected CSS (self-contained, no external file needed) ─── */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@200;300;400;500;600;700&display=swap');

.aet-shell {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: #010008;
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

/* ── CSS glow layers — updated with navy and gold ── */
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
    rgba(44, 62, 102, 0.04) 0%, transparent 65%);
  animation: gp1 6s ease-in-out infinite reverse;
}
.aet-glow-2 {
  width: 580px; height: 580px;
  background: radial-gradient(ellipse at center,
    rgba(44, 62, 102, 0.09) 0%, rgba(234, 169, 96, 0.06) 40%, transparent 70%);
  animation: gp2 4s ease-in-out infinite;
}
.aet-glow-1 {
  width: 300px; height: 300px;
  background: radial-gradient(ellipse at center,
    rgba(44, 62, 102, 0.22) 0%, rgba(234, 169, 96, 0.12) 35%, transparent 70%);
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

/* ── Singularity — updated with gold accents ── */
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
  background: radial-gradient(circle, #010008 55%, rgba(44, 62, 102, 0.85) 80%, transparent 100%);
  box-shadow:
    0 0 0 2px rgba(234, 169, 96, 0.28),
    0 0 22px rgba(234, 169, 96, 0.55),
    0 0 55px rgba(234, 169, 96, 0.25),
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
  border-top-color: rgba(234, 169, 96, 0.65);
  border-right-color: rgba(234, 169, 96, 0.18);
  animation-duration: 2.3s;
}
.aet-core-ring:nth-child(2) {
  width: 122px; height: 122px;
  border-bottom-color: rgba(44, 62, 102, 0.55);
  border-left-color: rgba(44, 62, 102, 0.12);
  animation-duration: 3.7s;
  animation-direction: reverse;
}
.aet-core-ring:nth-child(3) {
  width: 154px; height: 154px;
  border-top-color: rgba(234, 169, 96, 0.38);
  border-right-color: rgba(234, 169, 96, 0.07);
  animation-duration: 5.4s;
}
@keyframes coreBreath {
  0%,100% { 
    box-shadow: 0 0 0 2px rgba(234, 169, 96, 0.28), 
                0 0 22px rgba(234, 169, 96, 0.55), 
                0 0 55px rgba(234, 169, 96, 0.25), 
                inset 0 0 22px #000; 
  }
  50%      { 
    box-shadow: 0 0 0 3px rgba(234, 169, 96, 0.5),  
                0 0 36px rgba(234, 169, 96, 0.75), 
                0 0 90px rgba(234, 169, 96, 0.4),  
                inset 0 0 22px #000; 
  }
}
@keyframes rr {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── HUD card — matches journal glass panel ── */
.aet-hud {
  position: absolute;
  bottom: clamp(28px, 7vh, 72px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex; flex-direction: column;
  align-items: center; gap: .8rem;
  background: rgba(3, 2, 10, 0.85);
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 1.5rem 2.2rem;
  backdrop-filter: blur(20px);
  min-width: 230px;
  overflow: hidden;
  animation: hudIn .55s cubic-bezier(.22,1,.36,1) both;
  transition: opacity .3s ease;
  
  /* Journal glass panel styling */
  background-image: 
    linear-gradient(168deg, rgba(4, 5, 18, 0.92) 0%, rgba(5, 6, 20, 0.89) 100%) padding-box,
    linear-gradient(135deg,
      rgba(255, 255, 255, 1) 0%,
      rgba(255, 255, 255, 0.88) 11%,
      rgba(255, 255, 255, 0.48) 26%,
      rgba(185, 205, 255, 0.42) 44%,
      rgba(85, 115, 195, 0.58) 64%,
      rgba(38, 52, 105, 0.72) 84%,
      rgba(234, 169, 96, 0.18) 100%) border-box;
  background-origin: padding-box, border-box;
  background-clip: padding-box, border-box;
  
  box-shadow: 
    0 18px 52px rgba(0, 0, 0, 0.64),
    0 0 0 1px rgba(255, 255, 255, 0.20),
    0 0 40px -10px rgba(255, 255, 255, 0.12),
    0 0 52px -12px rgba(44, 62, 102, 0.28),
    0 8px 30px -12px rgba(12, 16, 40, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.26);
}
.aet-hud.aet-hud-hide { opacity: 0; pointer-events: none; }

/* Top rim gradient */
.aet-hud::before {
  content: '';
  position: absolute;
  top: 0; left: 4%; right: 14%;
  height: 1px;
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(255, 255, 255, 0.48) 32%,
    rgba(175, 200, 255, 0.42) 58%,
    rgba(234, 169, 96, 0.12) 88%,
    transparent 100%);
  pointer-events: none;
  z-index: 2;
}

/* Corner accent glow */
.aet-hud::after {
  content: '';
  position: absolute;
  top: -30px; right: -30px;
  width: 110px; height: 110px;
  background: radial-gradient(circle, 
    rgba(44, 62, 102, 0.12) 0%, 
    rgba(234, 169, 96, 0.04) 45%, 
    transparent 70%);
  pointer-events: none;
  border-radius: 50%;
  z-index: 0;
}

@keyframes hudIn {
  from { opacity:0; transform: translateX(-50%) translateY(12px); }
  to   { opacity:1; transform: translateX(-50%) translateY(0); }
}

.aet-hud-label {
  font-size: .66rem; font-weight: 600; letter-spacing: .36em;
  text-transform: uppercase; 
  background: linear-gradient(125deg,
    #ffffff 0%,
    rgba(252, 253, 255, 0.99) 28%,
    rgba(200, 215, 255, 0.96) 58%,
    rgba(120, 150, 220, 0.92) 82%,
    rgba(234, 169, 96, 0.48) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0; position: relative; z-index: 1;
  filter: drop-shadow(0 0 12px rgba(234, 169, 96, 0.2));
  animation: labelGoldPulse 3s ease-in-out infinite;
}

@keyframes labelGoldPulse {
  0%,100% { filter: drop-shadow(0 0 8px rgba(234, 169, 96, 0.2)); }
  50%      { filter: drop-shadow(0 0 18px rgba(234, 169, 96, 0.4)); }
}

.aet-hud-track {
  width: 210px; height: 2px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 99px; overflow: hidden;
  position: relative; z-index: 1;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.10);
}

.aet-hud-fill {
  height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, 
    #6b5a1c 0%, 
    #9a7b22 18%, 
    #d4af37 45%, 
    #dfc056 72%, 
    #e8c658 100%);
  box-shadow: 
    0 0 14px rgba(234, 169, 96, 0.55),
    0 0 26px rgba(234, 169, 96, 0.32);
  position: relative;
  transition: width .1s cubic-bezier(.22,1,.36,1);
}

.aet-hud-fill::after {
  content: '';
  position: absolute; top: 0; left: -60%; width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 248, 220, 0.42), transparent);
  animation: shimmer 2.1s ease-in-out infinite;
}

@keyframes shimmer { 
  0%{left:-60%;opacity:0;} 
  40%{opacity:1;} 
  100%{left:120%;opacity:0;} 
}

.aet-hud-pct {
  font-size: .68rem; font-weight: 600; letter-spacing: .2em; margin: 0;
  background: linear-gradient(125deg, 
    #ffffff 30%, 
    #e8c658 70%, 
    #d4af37 100%);
  -webkit-background-clip: text; 
  -webkit-text-fill-color: transparent; 
  background-clip: text;
  filter: drop-shadow(0 0 8px rgba(234, 169, 96, 0.3));
  position: relative; z-index: 1;
}

/* ── Exit: simple opacity fade ── */
.aet-shell.aet-exit {
  opacity: 0;
  pointer-events: none;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .aet-core-ring, .aet-glow-1, .aet-glow-2, .aet-glow-3,
  .aet-core-hole, .aet-hud-label { animation: none !important; }
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

@media (max-width: 374px) {
  .aet-hud { padding:0.9rem 1.2rem; min-width:165px; }
  .aet-hud-track { width:140px; }
  .aet-hud-label { font-size: .58rem; letter-spacing: .28em; }
  .aet-hud-pct { font-size: .6rem; }
}
`;

/* ─── Canvas particle/galaxy renderer — updated with navy/gold colors ─── */
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
    this.stars = Array.from({ length: 250 }, () => ({
      x: Math.random() * this.W,
      y: Math.random() * this.H,
      r: Math.random() * 1.3,
      a: 0.1 + Math.random() * 0.85,
      tw: Math.random() * Math.PI * 2,
    }));
  }

  _buildParticles() {
    const N = window.innerWidth < 480 ? 350 : 550;
    const COLS = [
      'rgba(44, 62, 102,',      // navy core
      'rgba(74, 106, 159,',     // navy bright
      'rgba(234, 169, 96,',     // gold
      'rgba(248, 195, 125,',    // gold bright
      'rgba(255, 255, 255,',    // white
      'rgba(212, 175, 55,'      // gold classic
    ];
    this.pts = Array.from({ length: N }, (_, i) => {
      const arm = i % 3;
      const t = Math.random();
      const base = (arm / 3) * Math.PI * 2 + t * Math.PI * 3.8;
      const ang = base + (Math.random() - 0.5) * 0.3;
      const dist = 36 + t * (this.maxR - 36) + (Math.random() - 0.5) * 26;
      const ci = Math.random() < 0.15 ? (Math.random() < 0.5 ? 2 : 3) : Math.floor(Math.random() * 2);
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

    // Accretion arcs — gold and navy
    for (let i = 0; i < 3; i++) {
      const sweep = (time * 0.24 + (i / 3) * Math.PI * 2) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, 58 + i * 6, sweep, sweep + 0.5);
      ctx.strokeStyle = i % 2 === 0
        ? `rgba(234, 169, 96, ${0.16 + suck * 0.14})`
        : `rgba(44, 62, 102, ${0.13 + suck * 0.11})`;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Vortex streaks (appear on suck) — gold tinted
    if (suck > 0.2) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * 1.6;
        const len = 55 + 50 * suck;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.42);
        ctx.strokeStyle = `rgba(234, 169, 96, ${(suck * 0.1).toFixed(2)})`;
        ctx.lineWidth = 1.5;
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

  // Progress ramp: 0→100 in 1.5s (ease-out-cubic)
  useEffect(() => {
    const start = performance.now();
    const dur = 1500;
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
          // After suck, fade out smoothly
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