import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SurveillanceGlobe from './SurveillanceGlobe';
import EventDrawer from './EventDrawer';
import MarketWatchStrip from './MarketWatchStrip';
import IntelSidePanel from './IntelSidePanel';
import IntroOverlay from './IntroOverlay';
import {
  buildEventsById,
  eventMatchesFocus,
  filterDigestByFocus,
  filterEventsByFocus,
  focusSummaryFromEvents,
  normalizeRegionKey,
  primaryCountryFromEvent,
} from './surveillanceRegionUtils';
import './SurveillancePage.css';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'macro', label: 'Macro' },
  { id: 'geopolitics', label: 'Geopolitics' },
  { id: 'conflict', label: 'Conflict' },
  { id: 'aviation', label: 'Aviation' },
  { id: 'maritime', label: 'Maritime' },
  { id: 'energy', label: 'Energy' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'sanctions', label: 'Sanctions' },
  { id: 'central_banks', label: 'Central banks' },
  { id: 'high_impact', label: 'High impact' },
];

function apiBase() {
  return (
    process.env.REACT_APP_API_URL ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
  );
}

export default function SurveillancePage() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [aggregates, setAggregates] = useState(null);
  const [sources, setSources] = useState([]);
  const [tab, setTab] = useState('all');
  const [severityMin, setSeverityMin] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showIntro, setShowIntro] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [drawerEvent, setDrawerEvent] = useState(null);
  const [drawerRelated, setDrawerRelated] = useState([]);
  const [drawerStory, setDrawerStory] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [intelDigest, setIntelDigest] = useState(null);
  const [marketWatchNarrative, setMarketWatchNarrative] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [sseOk, setSseOk] = useState(false);
  const [pageEntered, setPageEntered] = useState(false);
  const [terminalHandoff, setTerminalHandoff] = useState(false);
  const [tapeRefreshGlow, setTapeRefreshGlow] = useState(false);
  const [focusRegion, setFocusRegion] = useState(null);
  const loadFeedRef = useRef(null);
  const prevIntroRef = useRef(showIntro);
  const tapeSigRef = useRef('');
  const tapeInitRef = useRef(true); /* skip glow on first populated tape */

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const loadBootstrap = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/surveillance/bootstrap`, {
        headers: authHeaders,
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          setError('access');
          return;
        }
        throw new Error('bootstrap failed');
      }
      const json = await res.json();
      if (!json.success) throw new Error('bootstrap failed');
      setEvents(json.events || []);
      setAggregates(json.aggregates || null);
      setSources(json.sources || []);
      setShowIntro(!!json.showIntro);
      setBriefing(json.briefing || null);
      setIntelDigest(json.intelDigest || null);
      setMarketWatchNarrative(json.marketWatchNarrative || null);
      setSystemHealth(json.systemHealth || null);
      setIntroReady(true);
    } catch {
      setError('load');
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (severityMin) params.set('severityMin', severityMin);
      if (sourceFilter) params.set('source', sourceFilter);
      const res = await fetch(`${apiBase()}/api/surveillance/feed?${params}`, {
        headers: authHeaders,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.events) return;
      setEvents(json.events);
      setAggregates(json.aggregates || null);
      setSources(json.sources || []);
      if (json.systemHealth) setSystemHealth(json.systemHealth);
      if (json.intelDigest) setIntelDigest(json.intelDigest);
      if (json.marketWatchNarrative) setMarketWatchNarrative(json.marketWatchNarrative);
    } catch {
      /* ignore poll errors */
    }
  }, [token, authHeaders, tab, severityMin, sourceFilter]);

  loadFeedRef.current = loadFeed;

  const eventsById = useMemo(() => buildEventsById(events), [events]);

  const filteredDigest = useMemo(
    () => filterDigestByFocus(intelDigest, focusRegion, eventsById),
    [intelDigest, focusRegion, eventsById]
  );

  const tapeEvents = useMemo(() => filterEventsByFocus(events, focusRegion), [events, focusRegion]);

  const focusSummary = useMemo(() => focusSummaryFromEvents(focusRegion, events), [focusRegion, events]);

  const situationHeadline = useMemo(() => {
    const d = filteredDigest;
    if (!d) return null;
    const lead = d.developingStories?.[0]?.headline;
    if (lead && String(lead).trim()) return String(lead).trim();
    if (d.summary) {
      const { tape_events: te, multi_source_stories: ms, corroborated_hits: ch } = d.summary;
      return `${te} live nodes · ${ms} multi-source narratives · ${ch} corroborated tracks on the grid.`;
    }
    return null;
  }, [filteredDigest]);

  const clearFocusRegion = useCallback(() => setFocusRegion(null), []);

  const setFocusFromHeat = useCallback((region) => {
    setFocusRegion(normalizeRegionKey(region));
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!token || loading) return undefined;
    const base = apiBase();
    if (!base || typeof EventSource === 'undefined') {
      setSseOk(false);
      return undefined;
    }
    const url = `${base}/api/surveillance/stream?token=${encodeURIComponent(token)}`;
    let es;
    try {
      es = new EventSource(url);
    } catch {
      setSseOk(false);
      return undefined;
    }
    es.onopen = () => setSseOk(true);
    es.onerror = () => setSseOk(false);
    const onTick = () => {
      try {
        loadFeedRef.current?.();
      } catch {
        /* ignore */
      }
    };
    es.addEventListener('tick', onTick);
    return () => {
      es.onopen = null;
      es.onerror = null;
      es.removeEventListener('tick', onTick);
      try {
        es.close();
      } catch {
        /* ignore */
      }
      setSseOk(false);
    };
  }, [token, loading]);

  useEffect(() => {
    if (!token || loading) return undefined;
    const pollMs = sseOk ? 90000 : 45000;
    const t = setInterval(() => loadFeed(), pollMs);
    return () => clearInterval(t);
  }, [token, loading, loadFeed, sseOk]);

  useEffect(() => {
    if (!introReady || loading) return;
    loadFeed();
  }, [tab, severityMin, sourceFilter, introReady, loading, loadFeed]);

  useEffect(() => {
    if (loading) return undefined;
    const id = requestAnimationFrame(() => setPageEntered(true));
    return () => cancelAnimationFrame(id);
  }, [loading]);

  useEffect(() => {
    if (!showIntro) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showIntro]);

  useEffect(() => {
    if (prevIntroRef.current && !showIntro) {
      setTerminalHandoff(true);
      const t = setTimeout(() => setTerminalHandoff(false), 1040);
      prevIntroRef.current = showIntro;
      return () => clearTimeout(t);
    }
    prevIntroRef.current = showIntro;
  }, [showIntro]);

  useEffect(() => {
    const sig = tapeEvents
      .slice(0, 6)
      .map((e) => `${e.id}:${e.rank_score ?? ''}`)
      .join('|');
    if (!sig) return undefined;
    if (tapeInitRef.current) {
      tapeInitRef.current = false;
      tapeSigRef.current = sig;
      return undefined;
    }
    if (tapeSigRef.current !== sig) {
      tapeSigRef.current = sig;
      setTapeRefreshGlow(true);
      const t = setTimeout(() => setTapeRefreshGlow(false), 480);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [tapeEvents]);

  const markIntroSeen = useCallback(async () => {
    setShowIntro(false);
    try {
      await fetch(`${apiBase()}/api/surveillance/intro-seen`, {
        method: 'POST',
        headers: authHeaders,
      });
    } catch {
      /* non-fatal */
    }
  }, [authHeaders]);

  const openDrawer = useCallback(
    async (id) => {
      setSelectedId(id);
      setDrawerLoading(true);
      setDrawerEvent(null);
      setDrawerRelated([]);
      setDrawerStory(null);
      try {
        const res = await fetch(`${apiBase()}/api/surveillance/event?id=${encodeURIComponent(id)}`, {
          headers: authHeaders,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.event) {
          setDrawerEvent(json.event);
          setDrawerRelated(json.related || []);
          setDrawerStory(json.story || null);
        }
      } catch {
        /* ignore */
      } finally {
        setDrawerLoading(false);
      }
    },
    [authHeaders]
  );

  const pickFromBriefing = useCallback(
    (id) => {
      setShowIntro(false);
      void markIntroSeen();
      openDrawer(id);
    },
    [markIntroSeen, openDrawer]
  );

  const onGlobeSelectEvent = useCallback(
    (id) => {
      const ev = eventsById.get(String(id));
      const key = primaryCountryFromEvent(ev) || (ev?.region ? normalizeRegionKey(ev.region) : null);
      if (key) setFocusRegion(key);
      openDrawer(id);
    },
    [eventsById, openDrawer]
  );

  const onGlobeCountryFocus = useCallback((iso2) => {
    setFocusRegion(normalizeRegionKey(iso2));
  }, []);

  const onGlobeBackground = useCallback(() => {
    clearFocusRegion();
  }, [clearFocusRegion]);

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDrawerEvent(null);
    setDrawerRelated([]);
    setDrawerStory(null);
  }, []);

  if (error === 'access') {
    return (
      <div className="sv-page sv-page--error">
        <p>Surveillance requires Elite access.</p>
      </div>
    );
  }

  if (loading && !events.length) {
    return (
      <div className="sv-page sv-page--loading sv-page--boot">
        <div className="sv-boot" aria-busy="true" aria-label="Loading surveillance">
          <div className="sv-boot-bg" aria-hidden />
          <div className="sv-boot-inner">
            <header className="sv-boot-masthead">
              <div className="sv-boot-masthead-top">
                <span className="sv-boot-session">Elite · secured channel</span>
                <span className="sv-boot-state">Loading</span>
              </div>
              <div className="sv-boot-wordmark" aria-hidden>
                <span className="sv-boot-wordmark-aura">Aura</span>
                <span className="sv-boot-wordmark-divider" />
                <span className="sv-boot-wordmark-sv">Surveillance</span>
              </div>
              <p className="sv-boot-headline">Establishing live terminal</p>
              <p className="sv-boot-sub">Authenticating and pulling the latest normalized feed from official public sources.</p>
              <div className="sv-boot-progress" aria-hidden>
                <span className="sv-boot-progress-track">
                  <span className="sv-boot-progress-fill" />
                </span>
              </div>
            </header>
            <div className="sv-boot-footer">
              <div className="sv-spinner sv-spinner--boot" aria-hidden />
              <span className="sv-boot-footer-copy">Synchronizing grid…</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'load' && !events.length) {
    return (
      <div className="sv-page sv-page--error">
        <p>Could not load surveillance data.</p>
        <button type="button" className="sv-retry" onClick={() => loadBootstrap()}>
          Retry
        </button>
      </div>
    );
  }

  const agg = aggregates || {};
  const chips = [
    { label: 'Live nodes', value: agg.liveCount ?? events.length },
    { label: 'Tension', value: agg.globalTensionScore ?? '—' },
    { label: 'Sources', value: sources.length || '—' },
  ];

  return (
    <div
      className={`sv-page sv-page--terminal ${pageEntered ? 'sv-page--entered' : ''} ${
        terminalHandoff ? 'sv-page--handoff' : ''
      }`}
    >
      {showIntro && (
        <IntroOverlay
          briefing={briefing}
          onDismiss={markIntroSeen}
          onComplete={markIntroSeen}
          onPickStory={pickFromBriefing}
          reducedMotion={reducedMotion}
        />
      )}

      <div className="sv-terminal-canvas">
        <header className="sv-terminal-masthead" aria-labelledby="sv-terminal-heading">
          <div className="sv-masthead-grid">
            <div className="sv-masthead-brand-block">
              <span className="sv-terminal-mark" aria-hidden />
              <div className="sv-masthead-titles">
                <p className="sv-masthead-eyebrow">Elite · secured grid</p>
                <h1 id="sv-terminal-heading" className="sv-terminal-title">
                  Surveillance
                </h1>
                <p className="sv-terminal-sub">Global OSINT terminal — live ingest, ranked tape, sector lens</p>
              </div>
            </div>
            <div className="sv-masthead-instruments" aria-label="Grid status">
              {chips.map((c) => (
                <div key={c.label} className="sv-instrument">
                  <span className="sv-instrument-label">{c.label}</span>
                  <span className="sv-instrument-value">{c.value}</span>
                </div>
              ))}
            </div>
            <div className="sv-masthead-markets">
              <MarketWatchStrip variant="compact" narrative={marketWatchNarrative} items={agg.marketWatch || []} />
            </div>
          </div>
          {systemHealth ? (
            <div
              className={`sv-masthead-status ${systemHealth.degraded ? 'sv-masthead-status--degraded' : ''} ${
                systemHealth.warmingUp ? 'sv-masthead-status--warm' : ''
              }`}
              role="status"
            >
              <div className="sv-masthead-status-main">
                {systemHealth.warmingUp ? <span>Warming — first ingest pass</span> : null}
                {systemHealth.degraded ? <span>Degraded ingest / sources</span> : null}
                {!systemHealth.warmingUp && !systemHealth.degraded ? <span>Sources nominal</span> : null}
                {systemHealth.lastIngestSuccessAt ? (
                  <span className="sv-masthead-status-time">
                    Last ingest · {new Date(systemHealth.lastIngestSuccessAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="sv-masthead-status-time">No ingest yet</span>
                )}
                {systemHealth.adapterRecencyBuckets?.stale > 0 ? (
                  <span className="sv-masthead-status-stale">{systemHealth.adapterRecencyBuckets.stale} stale adapters</span>
                ) : null}
              </div>
              <span className="sv-masthead-feed-pill" data-live={sseOk ? 'on' : 'off'}>
                {sseOk ? 'Live stream' : 'Polling'}
              </span>
            </div>
          ) : null}
        </header>

        {focusRegion && focusSummary ? (
          <div className="sv-hero-context" aria-live="polite">
            <span className="sv-hero-context-label">Sector lens</span>
            <span className="sv-hero-context-name">{focusSummary.label || focusRegion}</span>
            {focusSummary.isoHint ? (
              <span className="sv-hero-context-iso" title="Country code">
                {focusSummary.isoHint}
              </span>
            ) : null}
            <button type="button" className="sv-hero-context-clear" onClick={clearFocusRegion}>
              Clear lens
            </button>
          </div>
        ) : null}

        <div className="sv-terminal-hero">
          <div className={`sv-globe-stage ${terminalHandoff ? 'sv-globe-stage--handoff' : ''}`}>
            <div className={`sv-globe-panel ${terminalHandoff ? 'sv-globe-panel--handoff' : ''}`}>
              <SurveillanceGlobe
                events={events}
                selectedId={selectedId}
                focusRegion={focusRegion}
                onSelectEvent={onGlobeSelectEvent}
                onCountryFocus={onGlobeCountryFocus}
                onGlobeBackground={onGlobeBackground}
                reducedMotion={reducedMotion}
              />
            </div>
            <div className="sv-globe-chrome">
              <span className="sv-globe-chrome-tag">Operating picture</span>
              <p className="sv-globe-chrome-hint">
                Zoom to frame the theatre. Select a country for a sector lens; markers and tape stay linked to the same
                geography.
              </p>
            </div>
          </div>
          <aside
            className={`sv-command-rail sv-intel-panel ${terminalHandoff ? 'sv-intel-panel--handoff' : ''}`}
            aria-label="Intelligence command rail"
          >
            <IntelSidePanel
              digest={filteredDigest}
              situationHeadline={situationHeadline}
              onOpenEvent={openDrawer}
              handoff={terminalHandoff}
              focusRegion={focusRegion}
              focusSummary={focusSummary}
              tapeCount={tapeEvents.length}
              onClearFocus={clearFocusRegion}
              onSetFocusRegion={setFocusFromHeat}
            />
            <details className="sv-rail-accordion">
              <summary>Type mix</summary>
              <ul className="sv-type-list sv-type-list--compact">
                {Object.entries(agg.countsByType || {}).map(([k, v]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
                {!agg.countsByType || !Object.keys(agg.countsByType).length ? (
                  <li className="sv-muted">Awaiting ingest</li>
                ) : null}
              </ul>
            </details>
          </aside>
        </div>

        <div className="sv-control-deck">
          <div className="sv-control-deck-inner">
            <div className="sv-control-deck-label">
              <span className="sv-control-eyebrow">Filters</span>
              <span className="sv-control-title">Category and tape constraints</span>
            </div>
            <div className="sv-pill-tabs" role="tablist" aria-label="Event categories">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`sv-pill-tab ${tab === t.id ? 'sv-pill-tab--active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="sv-control-filters">
              <label className="sv-field">
                <span className="sv-field-label">Severity floor</span>
                <select
                  className="sv-field-select"
                  value={severityMin}
                  onChange={(e) => setSeverityMin(e.target.value)}
                  aria-label="Minimum severity"
                >
                  <option value="">Any</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                  <option value="5">5</option>
                </select>
              </label>
              <label className="sv-field">
                <span className="sv-field-label">Source</span>
                <select
                  className="sv-field-select"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  aria-label="Filter by source"
                >
                  <option value="">All sources</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <section
          className={`sv-tape-deck ${tapeRefreshGlow ? 'sv-tape-deck--refresh' : ''} ${
            focusRegion ? 'sv-tape-deck--lensed' : ''
          }`}
          aria-label="Ranked event tape"
        >
          <header className="sv-tape-deck-head">
            <div className="sv-tape-deck-head-text">
              <p className="sv-tape-eyebrow">Live stream</p>
              <h2 className="sv-tape-heading">Tape</h2>
              <p className="sv-tape-deck-hint">Ranked rows · select to open dossier · lens highlights in-sector nodes</p>
            </div>
            <div className="sv-tape-deck-meta">
              <span className="sv-stream-live sv-stream-live--tape" data-live={sseOk ? 'on' : 'off'}>
                {sseOk ? 'Live' : 'Poll'}
              </span>
              <span className="sv-tape-count">{tapeEvents.length} visible</span>
              {focusRegion ? (
                <span className="sv-tape-lens-inline">
                  Lens · <strong>{focusSummary?.label || focusRegion}</strong>
                  <button type="button" className="sv-tape-lens-clear" onClick={clearFocusRegion}>
                    Clear
                  </button>
                </span>
              ) : (
                <span className="sv-tape-lens-inline sv-tape-lens-inline--muted">Global tape</span>
              )}
            </div>
          </header>
          <ul className="sv-tape-list">
            {tapeEvents.map((e) => {
              const metaBits = [
                e.risk_bias && e.risk_bias !== 'neutral' ? e.risk_bias.replace('_', ' ') : null,
                e.corroboration_count > 0 ? `${e.corroboration_count}× corroboration` : null,
                e.story_id ? 'Storyline' : null,
                e.trust_score != null ? `Trust ${Math.round(e.trust_score)}` : null,
              ].filter(Boolean);
              const detailTitle = metaBits.length ? `${e.title} — ${metaBits.join(' · ')}` : e.title;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`sv-tape-row ${String(selectedId) === String(e.id) ? 'sv-tape-row--active' : ''} ${
                      focusRegion && eventMatchesFocus(e, focusRegion) ? 'sv-tape-row--in-lens' : ''
                    }`}
                    title={detailTitle}
                    onClick={() => openDrawer(e.id)}
                  >
                    <span className="sv-tape-cell sv-tape-cell--sev">
                      <span className="sv-sev" data-sev={e.severity}>
                        {e.severity}
                      </span>
                    </span>
                    <span className="sv-tape-cell sv-tape-cell--rank" title="Rank score">
                      <span className="sv-tape-rank-label">R</span>
                      {e.rank_score != null ? Math.round(e.rank_score) : '—'}
                    </span>
                    {e.risk_bias && e.risk_bias !== 'neutral' ? (
                      <span className={`sv-tape-cell sv-tape-cell--risk sv-ev-bias sv-ev-bias--${e.risk_bias}`}>
                        {e.risk_bias.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="sv-tape-cell sv-tape-cell--risk sv-tape-cell--muted">—</span>
                    )}
                    <span className="sv-tape-cell sv-tape-cell--type" title="Event type">
                      {e.event_type}
                    </span>
                    <span className="sv-tape-cell sv-tape-cell--title">{e.title}</span>
                    <span className="sv-tape-cell sv-tape-cell--src">{e.source}</span>
                  </button>
                </li>
              );
            })}
            {!tapeEvents.length ? (
              <li className="sv-muted sv-tape-empty">
                {focusRegion ? 'No tape nodes in this sector for the current filters.' : 'No events ingested yet.'}
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <EventDrawer
        event={drawerEvent}
        story={drawerStory}
        related={drawerRelated}
        loading={drawerLoading}
        onClose={closeDrawer}
        onOpenRelatedId={openDrawer}
      />
    </div>
  );
}
