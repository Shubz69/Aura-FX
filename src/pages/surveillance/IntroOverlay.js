import React, { useEffect, useRef, useState, useCallback } from 'react';

const AUTO_MS_NO_BRIEF = 2800;
const EXIT_MS = 880;

function BriefList({ title, items, onPick }) {
  if (!items || !items.length) return null;
  return (
    <section className="sv-intro-brief-block">
      <h2 className="sv-intro-brief-block-title">{title}</h2>
      <ul className="sv-intro-brief-list">
        {items.map((e) => (
          <li key={e.id}>
            <button type="button" className="sv-intro-brief-item" onClick={() => onPick?.(e.id)}>
              <span className="sv-intro-brief-rank">{e.rank_score != null ? Math.round(e.rank_score) : '—'}</span>
              <span className="sv-intro-brief-text">{e.title}</span>
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
      setTimeout(() => setRevealed(true), 48);
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

  const headline = briefing?.headline || 'Live operating picture';

  return (
    <div
      className={`sv-intro-shell ${exiting ? 'sv-intro-shell--exiting' : ''} ${revealed ? 'sv-intro-shell--revealed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Surveillance briefing"
    >
      <div className="sv-intro-bg" aria-hidden />
      <div className="sv-intro-grain" aria-hidden />
      <div className="sv-intro-vignette" aria-hidden />

      <div className="sv-intro-layout">
        <div className={`sv-intro-main ${hasBrief ? 'sv-intro-main--brief' : ''}`}>
          <header className="sv-intro-masthead">
            <div className="sv-intro-masthead-top">
              <span className="sv-intro-session">Elite · secured session</span>
              <span className="sv-intro-live">{hasBrief ? 'Briefing' : 'Standby'}</span>
            </div>
            <div className="sv-intro-wordmark" aria-hidden>
              <span className="sv-intro-wordmark-aura">Aura</span>
              <span className="sv-intro-wordmark-divider" />
              <span className="sv-intro-wordmark-sv">Surveillance</span>
            </div>
            <h1 className="sv-intro-headline">{headline}</h1>
            <p className="sv-intro-sub">
              Normalized OSINT from official public channels. One globe. One command rail. Continuously refreshed.
            </p>
            <div className="sv-intro-progress" aria-hidden>
              <span className="sv-intro-progress-track">
                <span className="sv-intro-progress-fill" />
              </span>
            </div>
          </header>

          {!hasBrief ? (
            <p className="sv-intro-lede">
              You are entering the live terminal. Use the tape and rail to prioritize; use the globe to establish geographic
              context.
            </p>
          ) : (
            <div className="sv-intro-brief">
              <BriefList title="Top ranked" items={briefing.topStories} onPick={(id) => runExit(() => onPickStory?.(id))} />
              <BriefList
                title="Since last briefing"
                items={briefing.sinceLastVisit}
                onPick={(id) => runExit(() => onPickStory?.(id))}
              />
              {briefing.regionsUnderTension?.length ? (
                <section className="sv-intro-brief-block">
                  <h2 className="sv-intro-brief-block-title">Regional pressure</h2>
                  <ul className="sv-intro-brief-pills">
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
                <section className="sv-intro-brief-block">
                  <h2 className="sv-intro-brief-block-title">Market watch</h2>
                  <ul className="sv-intro-brief-pills">
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
                <p className="sv-intro-brief-foot">Last ingest · {new Date(briefing.tapeFreshness).toLocaleString()}</p>
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

        {!reducedMotion ? (
          <aside className="sv-intro-signal" aria-hidden>
            <div className="sv-intro-signal-line" />
            <ul className="sv-intro-signal-ticks">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="sv-intro-signal-tick" style={{ animationDelay: `${120 + i * 70}ms` }} />
              ))}
            </ul>
            <p className="sv-intro-signal-caption">Signal integrity nominal</p>
          </aside>
        ) : null}
      </div>

      <div className={`sv-intro-handoff ${exiting ? 'sv-intro-handoff--on' : ''}`} aria-hidden />
    </div>
  );
}
