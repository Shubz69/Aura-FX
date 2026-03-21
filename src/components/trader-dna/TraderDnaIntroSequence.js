import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

const PHASES = [
  { label: 'Initialising DNA engine', sub: 'Secure channel · trader data vault' },
  { label: 'Analysing behavioural patterns', sub: 'Rule load · impulse frequency · recovery sequences' },
  { label: 'Mapping execution profile', sub: 'Stops · R-multiples · model adherence' },
  { label: 'Processing psychological signatures', sub: 'Journal mood dispersion · post-loss sizing' },
  { label: 'Calibrating trader identity', sub: 'Archetype fit · environment vectors' },
  { label: 'Building Trader DNA', sub: 'Synthesis · confidence weighting · seal' },
];

const TOTAL_MS = 30000;
const PHASE_MS = TOTAL_MS / PHASES.length;

const CHARS = '01アイウエオカキ0クケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

function MatrixColumn({ delay, duration, left, colKey }) {
  const content = useMemo(() => {
    let s = '';
    const len = 24 + Math.floor(Math.random() * 18);
    for (let i = 0; i < len; i++) {
      s += `${CHARS[Math.floor(Math.random() * CHARS.length)]}\n`;
    }
    return s;
  }, [colKey]);
  return (
    <div
      className="tdna-matrix-col"
      style={{
        left: `${left}%`,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
      }}
    >
      <pre className="tdna-matrix-col-inner">{content}</pre>
    </div>
  );
}

export default function TraderDnaIntroSequence({ onComplete }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);

  const tick = useCallback(
    (ts) => {
      if (!startRef.current) startRef.current = ts;
      const e = ts - startRef.current;
      setElapsed(Math.min(e, TOTAL_MS));
      const idx = Math.min(PHASES.length - 1, Math.floor(e / PHASE_MS));
      setPhaseIdx(idx);
      if (e >= TOTAL_MS) {
        if (!doneRef.current) {
          doneRef.current = true;
          onComplete?.();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [onComplete]
  );

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  const progress = Math.min(100, (elapsed / TOTAL_MS) * 100);
  const phaseProgress = Math.min(100, ((elapsed % PHASE_MS) / PHASE_MS) * 100);

  const columns = useRef(
    Array.from({ length: 28 }, (_, i) => ({
      left: (i * 100) / 28 + Math.random() * 2,
      duration: 14 + Math.random() * 10,
      delay: Math.random() * 4,
      key: i,
    }))
  ).current;

  return (
    <div className="tdna-intro-root" role="presentation">
      <div className="tdna-intro-grid" aria-hidden />
      <div className="tdna-intro-scan" aria-hidden />
      <div className="tdna-intro-glow" aria-hidden />

      <div className="tdna-matrix-layer" aria-hidden>
        {columns.map((c) => (
          <MatrixColumn key={c.key} colKey={c.key} left={c.left} duration={c.duration} delay={c.delay} />
        ))}
      </div>

      <div className="tdna-intro-panel">
        <div className="tdna-intro-brand">
          <span className="tdna-intro-brand-mark">AURA</span>
          <span className="tdna-intro-brand-sub">TRADER DNA · SYNTHESIS CHAMBER</span>
        </div>

        <div className="tdna-intro-phase">
          <span className="tdna-intro-phase-index">
            {String(phaseIdx + 1).padStart(2, '0')} / {String(PHASES.length).padStart(2, '0')}
          </span>
          <h2 className="tdna-intro-phase-title">{PHASES[phaseIdx].label}</h2>
          <p className="tdna-intro-phase-sub">{PHASES[phaseIdx].sub}</p>
        </div>

        <div className="tdna-intro-bars">
          <div className="tdna-intro-bar tdna-intro-bar--global">
            <div className="tdna-intro-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="tdna-intro-bar tdna-intro-bar--phase">
            <div className="tdna-intro-bar-fill tdna-intro-bar-fill--phase" style={{ width: `${phaseProgress}%` }} />
          </div>
        </div>

        <p className="tdna-intro-foot">Constructing identity from validated execution telemetry</p>
      </div>
    </div>
  );
}
