import React, { useEffect, useRef, useState, useCallback } from 'react';

const AUTO_MS = 3200;
const EXIT_MS = 780;

function BriefList({ title, items, onPick }) {
  if (!items || !items.length) return null;
  return (
    <section className="sv-intro-section">
      <h2 className="sv-intro-section-title">{title}</h2>
      <ul className="sv-intro-list">
        {items.map((e) => (
          <li key={e.id}>
            <button type="button" className="sv-intro-item" onClick={() => onPick?.(e.id)}>
              <span className="sv-intro-item-rank">{e.rank_score != null ? Math.round(e.rank_score) : '—'}</span>
              <span className="sv-intro-item-text">{e.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function IntroOverlay({ briefing, onDismiss, onComplete, onPickStory, reducedMotion }) {
  const [exiting, setExiting] = useState(false);
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
    }, AUTO_MS);
    return () => clearTimeout(t);
  }, [hasBrief, onComplete, runExit]);

  return (
    <div
      className={`sv-intro-overlay ${exiting ? 'sv-intro-overlay--exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Surveillance briefing"
    >
      <div className="sv-intro-backdrop" />
      <div className={`sv-intro-card ${hasBrief ? 'sv-intro-card--wide' : ''} ${exiting ? 'sv-intro-card--exiting' : ''}`}>
        <div className="sv-intro-scanline" aria-hidden />
        <p className="sv-intro-kicker">Elite terminal</p>
        <h1 className="sv-intro-title">{briefing?.headline || 'Surveillance'}</h1>
        {!hasBrief ? (
          <p className="sv-intro-copy">
            Live geopolitical and macro flow, normalized from official public channels. One globe. One tape.
          </p>
        ) : (
          <div className="sv-intro-briefing">
            <BriefList
              title="Top ranked"
              items={briefing.topStories}
              onPick={(id) => runExit(() => onPickStory?.(id))}
            />
            <BriefList
              title="Since last briefing"
              items={briefing.sinceLastVisit}
              onPick={(id) => runExit(() => onPickStory?.(id))}
            />
            {briefing.regionsUnderTension?.length ? (
              <section className="sv-intro-section">
                <h2 className="sv-intro-section-title">Regional tension</h2>
                <ul className="sv-intro-pills">
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
              <section className="sv-intro-section">
                <h2 className="sv-intro-section-title">Market watch</h2>
                <ul className="sv-intro-pills">
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
              <p className="sv-intro-freshness">
                Last ingest: {new Date(briefing.tapeFreshness).toLocaleString()}
              </p>
            ) : null}
          </div>
        )}
        <div className="sv-intro-actions">
          {hasBrief ? (
            <button type="button" className="sv-intro-primary" onClick={() => runExit(onComplete)}>
              Enter terminal
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
