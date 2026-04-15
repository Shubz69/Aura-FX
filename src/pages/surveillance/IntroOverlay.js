import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

const AUTO_MS_NO_BRIEF = 2800;
const EXIT_MS = 880;
const PREVIEW_TOP = 4;
const PREVIEW_SINCE = 2;
const PREVIEW_REGIONS = 5;
const PREVIEW_MARKETS = 4;

function BriefList({ title, hint, items, onPick, rankCaption }) {
  if (!items || !items.length) return null;
  return (
    <section className="sv-intro-brief-block">
      <div className="sv-intro-brief-block-head">
        <h2 className="sv-intro-brief-block-title">{title}</h2>
        {hint ? <p className="sv-intro-brief-hint">{hint}</p> : null}
      </div>
      <ul className="sv-intro-brief-list">
        {items.map((e) => (
          <li key={e.id}>
            <button type="button" className="sv-intro-brief-item" onClick={() => onPick?.(e.id)}>
              <div className="sv-intro-brief-rank-col" aria-hidden>
                <span className="sv-intro-brief-rank-label">{rankCaption}</span>
                <span className="sv-intro-brief-rank">{e.rank_score != null ? Math.round(e.rank_score) : '—'}</span>
              </div>
              <span className="sv-intro-brief-text">{e.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function buildPreview(briefing) {
  if (!briefing) return { top: [], since: [], regions: [], markets: [], moreTop: 0, moreSince: 0 };
  const topAll = briefing.topStories || [];
  const top = topAll.slice(0, PREVIEW_TOP);
  const topIds = new Set(top.map((e) => String(e.id)));
  const sinceAll = briefing.sinceLastVisit || [];
  const sinceFiltered = sinceAll.filter((e) => !topIds.has(String(e.id)));
  const since = sinceFiltered.slice(0, PREVIEW_SINCE);
  const regions = (briefing.regionsUnderTension || []).slice(0, PREVIEW_REGIONS);
  const markets = (briefing.marketWatch || []).slice(0, PREVIEW_MARKETS);
  return {
    top,
    since,
    regions,
    markets,
    moreTop: Math.max(0, topAll.length - top.length),
    moreSince: Math.max(0, sinceFiltered.length - since.length),
  };
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

  const preview = useMemo(() => buildPreview(briefing), [briefing]);

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

          {hasBrief ? (
            <div className="sv-intro-actions sv-intro-actions--top">
              <button type="button" className="sv-intro-primary" onClick={() => runExit(onComplete)}>
                Enter live terminal
              </button>
              <button type="button" className="sv-intro-skip" onClick={() => runExit(onDismiss)}>
                Skip
              </button>
            </div>
          ) : null}

          {!hasBrief ? (
            <p className="sv-intro-lede">
              You are entering the live terminal. Use the tape and rail to prioritize; use the globe to establish geographic
              context.
            </p>
          ) : (
            <div className="sv-intro-brief">
              <p className="sv-intro-brief-lede">
                Snapshot only — the full digest, tape, and globe load inside the terminal. Salience scores show how the
                grid prioritizes items right now (not prices).
              </p>
              <BriefList
                title="Highest priority on tape"
                hint="Salience (0–100): how strongly the terminal surfaces each row — blends severity, corroboration, source quality, and freshness. Higher appears first."
                rankCaption="Salience"
                items={preview.top}
                onPick={(id) => runExit(() => onPickStory?.(id))}
              />
              {preview.since.length ? (
                <BriefList
                  title="New since your last session"
                  hint="Same salience scale — refreshed items since your last visit that are not in the top list above."
                  rankCaption="Salience"
                  items={preview.since}
                  onPick={(id) => runExit(() => onPickStory?.(id))}
                />
              ) : null}
              {(preview.moreTop > 0 || preview.moreSince > 0) && (
                <p className="sv-intro-brief-more">
                  {[
                    preview.moreTop > 0 ? `${preview.moreTop} more on the live tape` : null,
                    preview.moreSince > 0 ? `${preview.moreSince} more since last visit` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  in terminal
                </p>
              )}
              {preview.regions.length ? (
                <section className="sv-intro-brief-block">
                  <div className="sv-intro-brief-block-head">
                    <h2 className="sv-intro-brief-block-title">Regional pressure</h2>
                    <p className="sv-intro-brief-hint">Heat index vs global baseline — higher = more clustered tape nodes.</p>
                  </div>
                  <ul className="sv-intro-brief-pills">
                    {preview.regions.map((r) => (
                      <li key={r.region}>
                        <span className="sv-intro-pill">{r.region}</span>
                        <span className="sv-intro-pill-score" title="Regional pressure index">
                          {r.score}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {preview.markets.length ? (
                <section className="sv-intro-brief-block">
                  <div className="sv-intro-brief-block-head">
                    <h2 className="sv-intro-brief-block-title">Market watch</h2>
                    <p className="sv-intro-brief-hint">Flow score from tape + narrative — higher = more cross-cutting headlines.</p>
                  </div>
                  <ul className="sv-intro-brief-pills">
                    {preview.markets.map((m) => (
                      <li key={m.symbol}>
                        <span className="sv-intro-pill">{m.symbol}</span>
                        <span className="sv-intro-pill-score" title="Flow score">
                          {m.flowScore}
                        </span>
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

          {!hasBrief ? (
            <div className="sv-intro-actions">
              <button type="button" className="sv-intro-skip" onClick={() => runExit(onDismiss)}>
                Skip
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`sv-intro-handoff ${exiting ? 'sv-intro-handoff--on' : ''}`} aria-hidden />
    </div>
  );
}
