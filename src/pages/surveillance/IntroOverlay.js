import React, { useEffect, useRef, useState, useCallback } from 'react';

const AUTO_MS_NO_BRIEF = 2200;
const EXIT_MS = 720;

function BriefList({ title, items, onPick }) {
  if (!items || !items.length) return null;
  return (
    <section className="sv-intro-deck-block">
      <h2 className="sv-intro-deck-block-title">{title}</h2>
      <ul className="sv-intro-deck-list">
        {items.map((e) => (
          <li key={e.id}>
            <button type="button" className="sv-intro-deck-item" onClick={() => onPick?.(e.id)}>
              <span className="sv-intro-deck-rank">{e.rank_score != null ? Math.round(e.rank_score) : '—'}</span>
              <span className="sv-intro-deck-text">{e.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function IntroOverlay({ briefing, onDismiss, onComplete, onPickStory, reducedMotion }) {
  const [exiting, setExiting] = useState(false);
  const [revealed, setRevealed] = useState(reducedMotion);
  const exitTimer = useRef(null);

  const runExit = useCallback(
    (fn) => {
      if (reducedMotion) {
        fn();
        return;
      }
      setExiting(true);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => {
        fn();
        exitTimer.current = null;
      }, EXIT_MS);
    },
    [reducedMotion]
  );

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    []
  );

  useEffect(() => {
    if (reducedMotion) return undefined;
    const id = requestAnimationFrame(() => {
      setTimeout(() => setRevealed(true), 40);
    });
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  const hasBrief =
    briefing &&
    (briefing.topStories?.length ||
      briefing.sinceLastVisit?.length ||
      briefing.regionsUnderTension?.length ||
      briefing.marketWatch?.length);

  useEffect(() => {
    if (hasBrief) return undefined;
    const t = setTimeout(() => {
      runExit(onComplete);
    }, AUTO_MS_NO_BRIEF);
    return () => clearTimeout(t);
  }, [hasBrief, onComplete, runExit]);

  return (
    <div
      className={`sv-intro-shell ${exiting ? 'sv-intro-shell--exiting' : ''} ${revealed ? 'sv-intro-shell--revealed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Surveillance briefing"
    >
      <div className="sv-intro-backdrop" />
      <div className="sv-intro-vignette" aria-hidden />
      <div className="sv-intro-gridlines" aria-hidden />
      <div className="sv-intro-glow-orb" aria-hidden />

      <div className={`sv-intro-stage ${hasBrief ? 'sv-intro-stage--wide' : ''}`}>
        <div className="sv-intro-orbit" aria-hidden />
        <div className="sv-intro-brand">
          <span className="sv-intro-mark" aria-hidden />
          <div>
            <p className="sv-intro-eyebrow">Elite intelligence terminal</p>
            <h1 className="sv-intro-display">{briefing?.headline || 'Surveillance'}</h1>
          </div>
        </div>

        {!hasBrief ? (
          <p className="sv-intro-lede">
            Live global OSINT grid — normalized from official public channels. One operating picture. One command surface.
          </p>
        ) : (
          <div className="sv-intro-deck">
            <BriefList title="Top ranked" items={briefing.topStories} onPick={(id) => runExit(() => onPickStory?.(id))} />
            <BriefList
              title="Since last briefing"
              items={briefing.sinceLastVisit}
              onPick={(id) => runExit(() => onPickStory?.(id))}
            />
            {briefing.regionsUnderTension?.length ? (
              <section className="sv-intro-deck-block">
                <h2 className="sv-intro-deck-block-title">Regional pressure</h2>
                <ul className="sv-intro-deck-pills">
                  {briefing.regionsUnderTension.map((r) => (
                    <li key={r.region}>
                      <span className="sv-intro-pill">{r.region}</span>
                      <span className="sv-intro-pill-score">{r.score}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {briefing.marketWatch?.length ? (
              <section className="sv-intro-deck-block">
                <h2 className="sv-intro-deck-block-title">Market watch</h2>
                <ul className="sv-intro-deck-pills">
                  {briefing.marketWatch.map((m) => (
                    <li key={m.symbol}>
                      <span className="sv-intro-pill">{m.symbol}</span>
                      <span className="sv-intro-pill-score">{m.flowScore}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {briefing.tapeFreshness ? (
              <p className="sv-intro-deck-foot">Last ingest · {new Date(briefing.tapeFreshness).toLocaleString()}</p>
            ) : null}
          </div>
        )}

        <div className="sv-intro-actions">
          {hasBrief ? (
            <button type="button" className="sv-intro-primary" onClick={() => runExit(onComplete)}>
              Enter live terminal
            </button>
          ) : null}
          <button type="button" className="sv-intro-skip" onClick={() => runExit(onDismiss)}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
