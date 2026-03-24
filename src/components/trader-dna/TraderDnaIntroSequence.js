import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import TraderDnaHelixVisual from './TraderDnaHelixVisual';

const PHASES = [
  { label: 'Initialising DNA engine', sub: 'Secure channel · trader data vault', cmd: 'vault.mount --encrypt=AES256' },
  { label: 'Analysing behavioural patterns', sub: 'Rule load · impulse frequency · recovery sequences', cmd: 'behaviour.scan --window=90d' },
  { label: 'Mapping execution profile', sub: 'Stops · R-multiples · model adherence', cmd: 'execution.map --rr=true' },
  { label: 'Processing psychological signatures', sub: 'Journal mood dispersion · post-loss sizing', cmd: 'psych.tensor --dims=128' },
  { label: 'Calibrating trader identity', sub: 'Archetype fit · environment vectors', cmd: 'identity.fit --archetype=auto' },
  { label: 'Building Trader DNA', sub: 'Synthesis · confidence weighting · seal', cmd: 'synthesis.seal --commit' },
];

const TOTAL_MS = 30000;
const PHASE_MS = TOTAL_MS / PHASES.length;

const CHARS = '01アイウエオカキ0クケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

const LOG_BUILDERS = [
  () => `{ "feed": "validated_trades", "rows": ${4200 + Math.floor(Math.random() * 800)} }`,
  () => `>> checksum OK · shard_${Math.floor(Math.random() * 99)}`,
  () => `vector.merge([${(Math.random() * 0.4 + 0.5).toFixed(3)}, …])`,
  () => `telemetry.ingest — latency ${(8 + Math.random() * 40).toFixed(1)}ms`,
  () => `const σ = ${(0.02 + Math.random() * 0.08).toFixed(4)}; // dispersion`,
  () => `[AURA] uplink SECURE · epoch ${Date.now().toString(36).slice(-6)}`,
  () => `while (signal.noise < threshold) { refine(); }`,
  () => `{"journal": "indexed", "entropy": "${(0.12 + Math.random() * 0.2).toFixed(3)}"}`,
  () => `→ propagating gradients · layer ${2 + Math.floor(Math.random() * 5)}`,
  () => `MATCH (t:Trade)-[:FOLLOWS]->(p:Pattern) /* ${Math.floor(Math.random() * 999)} nodes */`,
];

function MatrixColumn({ delay, duration, left, colKey, tint }) {
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
      className={`tdna-matrix-col tdna-matrix-col--${tint}`}
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

function Starfield({ count = 72 }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        left: `${(i * 37 + (i % 7) * 13) % 100}%`,
        top: `${(i * 23 + (i % 5) * 17) % 100}%`,
        size: i % 4 === 0 ? 2 : 1,
        delay: `${(i % 10) * 0.4}s`,
        dur: `${3 + (i % 5)}s`,
      })),
    [count]
  );
  return (
    <div className="tdna-intro-stars" aria-hidden>
      {stars.map((s) => (
        <span
          key={s.key}
          className="tdna-intro-star"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.dur,
          }}
        />
      ))}
    </div>
  );
}

export default function TraderDnaIntroSequence({ onComplete }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [logLines, setLogLines] = useState(() => [LOG_BUILDERS[0]()]);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  const sessionRef = useRef(
    `0x${Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
  );

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

  useEffect(() => {
    const id = setInterval(() => {
      setLogLines((prev) => {
        const next = [...prev, LOG_BUILDERS[Math.floor(Math.random() * LOG_BUILDERS.length)]()];
        return next.slice(-14);
      });
    }, 680);
    return () => clearInterval(id);
  }, []);

  const progress = Math.min(100, (elapsed / TOTAL_MS) * 100);
  const phaseProgress = Math.min(100, ((elapsed % PHASE_MS) / PHASE_MS) * 100);

  const columns = useRef(
    Array.from({ length: 32 }, (_, i) => ({
      left: (i * 100) / 32 + Math.random() * 1.5,
      duration: 12 + Math.random() * 12,
      delay: Math.random() * 5,
      key: i,
      tint: i % 3 === 0 ? 'gold' : i % 3 === 1 ? 'cyan' : 'emerald',
    }))
  ).current;

  const phase = PHASES[phaseIdx];

  /* Portal: .journal-glass-panel uses backdrop-filter, which creates a containing block —
     fixed inset was binding to the narrow panel instead of the viewport. */
  return createPortal(
    <div className="tdna-intro-root" role="presentation">
      <div className="tdna-intro-nebula tdna-intro-nebula--a" aria-hidden />
      <div className="tdna-intro-nebula tdna-intro-nebula--b" aria-hidden />
      <div className="tdna-intro-nebula tdna-intro-nebula--c" aria-hidden />
      <Starfield />

      <div className="tdna-intro-grid" aria-hidden />
      <div className="tdna-intro-scan" aria-hidden />
      <div className="tdna-intro-glow" aria-hidden />
      <div className="tdna-intro-horizon" aria-hidden />

      <div className="tdna-matrix-layer" aria-hidden>
        {columns.map((c) => (
          <MatrixColumn key={c.key} colKey={c.key} left={c.left} duration={c.duration} delay={c.delay} tint={c.tint} />
        ))}
      </div>

      <div className="tdna-intro-orbit" aria-hidden>
        <div className="tdna-intro-orbit-ring" />
        <div className="tdna-intro-orbit-ring tdna-intro-orbit-ring--slow" />
      </div>

      <div className="tdna-intro-helix-wrap" aria-hidden>
        <div className="tdna-intro-helix-spin">
          <TraderDnaHelixVisual progress={progress} />
        </div>
      </div>

      <aside className="tdna-intro-stream" aria-hidden>
        <div className="tdna-intro-stream-head">// ingest_stream · tail -f</div>
        <ul className="tdna-intro-stream-list">
          {logLines.map((line, i) => (
            <li key={`${i}-${line.slice(0, 12)}`} className="tdna-intro-stream-line">
              {line}
            </li>
          ))}
        </ul>
      </aside>

      <div className="tdna-intro-panel-wrap">
        <div className="tdna-intro-frame">
          <div className="tdna-intro-chrome">
            <span className="tdna-intro-dots" aria-hidden>
              <i /> <i /> <i />
            </span>
            <span className="tdna-intro-chrome-title">aura-synthesis — zsh — 120×32</span>
            <span className="tdna-intro-chrome-meta">LIVE</span>
          </div>

          <div className="tdna-intro-panel">
            <div className="tdna-intro-brand">
              <span className="tdna-intro-brand-bracket">[</span>
              <span className="tdna-intro-brand-mark">AURA</span>
              <span className="tdna-intro-brand-bracket">]</span>
              <span className="tdna-intro-brand-sub">TRADER_DNA · SYNTHESIS_CHAMBER</span>
              <span className="tdna-intro-brand-session">session · {sessionRef.current}</span>
            </div>

            <div className="tdna-intro-phase">
              <div className="tdna-intro-phase-hud">
                <span className="tdna-intro-prompt">⟩</span>
                <span className="tdna-intro-phase-index">
                  phase_{String(phaseIdx + 1).padStart(2, '0')} / {String(PHASES.length).padStart(2, '0')}
                </span>
                <span className="tdna-intro-cmd">{phase.cmd}</span>
              </div>
              <h2 className="tdna-intro-phase-title">{phase.label}</h2>
              <p className="tdna-intro-phase-sub">
                <span className="tdna-intro-phase-sub-prefix">// </span>
                {phase.sub}
              </p>
            </div>

            <div className="tdna-intro-bars">
              <div className="tdna-intro-bar-labels">
                <span>global_synthesis</span>
                <span>{progress.toFixed(1)}%</span>
              </div>
              <div className="tdna-intro-bar tdna-intro-bar--global">
                <div className="tdna-intro-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="tdna-intro-bar-labels tdna-intro-bar-labels--sub">
                <span>current_phase_buffer</span>
                <span>{phaseProgress.toFixed(0)}%</span>
              </div>
              <div className="tdna-intro-bar tdna-intro-bar--phase">
                <div className="tdna-intro-bar-fill tdna-intro-bar-fill--phase" style={{ width: `${phaseProgress}%` }} />
              </div>
            </div>

            <p className="tdna-intro-foot">
              <span className="tdna-intro-foot-glyph">◇</span>
              aggregating validated execution telemetry into a single identity manifold
              <span className="tdna-intro-foot-glyph">◇</span>
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
