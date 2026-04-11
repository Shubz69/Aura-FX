import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SurveillanceGlobe from './SurveillanceGlobe';
import EventDrawer from './EventDrawer';
import MarketWatchStrip from './MarketWatchStrip';
import IntelSidePanel from './IntelSidePanel';
import IntroOverlay from './IntroOverlay';
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
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPageEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [loading]);

  useEffect(() => {
    if (prevIntroRef.current && !showIntro) {
      setTerminalHandoff(true);
      const t = setTimeout(() => setTerminalHandoff(false), 1300);
      prevIntroRef.current = showIntro;
      return () => clearTimeout(t);
    }
    prevIntroRef.current = showIntro;
  }, [showIntro]);

  useEffect(() => {
    const sig = events
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
      const t = setTimeout(() => setTapeRefreshGlow(false), 720);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [events]);

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
          <div className="sv-boot-brand">
            <span className="sv-boot-mark" />
            <div>
              <p className="sv-boot-kicker">Elite · Surveillance</p>
              <p className="sv-boot-title">Initializing grid</p>
            </div>
          </div>
          <div className="sv-boot-grid">
            <div className="sv-boot-shimmer sv-boot-shimmer--hero" />
            <div className="sv-boot-shimmer sv-boot-shimmer--rail" />
            <div className="sv-boot-shimmer sv-boot-shimmer--tape" />
          </div>
          <div className="sv-boot-footer">
            <div className="sv-spinner sv-spinner--boot" aria-hidden />
            <span>Syncing official sources…</span>
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
      className={`sv-page ${pageEntered ? 'sv-page--entered' : ''} ${terminalHandoff ? 'sv-page--handoff' : ''}`}
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

      {systemHealth && (
        <div
          className={`sv-health-strip ${systemHealth.degraded ? 'sv-health-strip--degraded' : ''} ${
            systemHealth.warmingUp ? 'sv-health-strip--warm' : ''
          }`}
          role="status"
        >
          {systemHealth.warmingUp ? (
            <span>Warming up — first ingest pass is filling the grid.</span>
          ) : null}
          {systemHealth.degraded ? (
            <span>Degraded — several sources are failing or ingest is stale.</span>
          ) : null}
          {!systemHealth.warmingUp && !systemHealth.degraded ? (
            <span>Sources nominal</span>
          ) : null}
          {systemHealth.lastIngestSuccessAt ? (
            <span className="sv-health-time">
              Last ingest {new Date(systemHealth.lastIngestSuccessAt).toLocaleString()}
            </span>
          ) : (
            <span className="sv-health-time">No successful ingest yet</span>
          )}
          {systemHealth.adapterRecencyBuckets?.stale > 0 ? (
            <span className="sv-health-stale">{systemHealth.adapterRecencyBuckets.stale} adapters stale</span>
          ) : null}
          {sseOk ? <span className="sv-health-sse">Live stream</span> : <span className="sv-health-sse">Polling</span>}
        </div>
      )}

      <header className="sv-header">
        <div>
          <h1 className="sv-title">Surveillance</h1>
          <p className="sv-sub">Institutional OSINT grid · Elite</p>
        </div>
        <div className="sv-chips">
          {chips.map((c) => (
            <div key={c.label} className="sv-chip">
              <span className="sv-chip-label">{c.label}</span>
              <span className="sv-chip-value">{c.value}</span>
            </div>
          ))}
        </div>
      </header>

      <MarketWatchStrip narrative={marketWatchNarrative} items={agg.marketWatch || []} />

      <div className="sv-toolbar">
        <div className="sv-tabs" role="tablist" aria-label="Event categories">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`sv-tab ${tab === t.id ? 'sv-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="sv-filters">
          <label className="sv-filter">
            <span>Severity ≥</span>
            <select
              value={severityMin}
              onChange={(e) => setSeverityMin(e.target.value)}
              aria-label="Minimum severity"
            >
              <option value="">Any</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
          <label className="sv-filter">
            <span>Source</span>
            <select
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

      <div className="sv-main">
        <div className={`sv-globe-panel ${terminalHandoff ? 'sv-globe-panel--handoff' : ''}`}>
          <SurveillanceGlobe
            events={events}
            selectedId={selectedId}
            onSelectEvent={openDrawer}
            reducedMotion={reducedMotion}
          />
          <p className="sv-globe-hint">Tap markers for intelligence detail</p>
        </div>
        <aside
          className={`sv-intel-panel ${terminalHandoff ? 'sv-intel-panel--handoff' : ''}`}
          aria-label="Live intelligence"
        >
          <IntelSidePanel digest={intelDigest} onOpenEvent={openDrawer} handoff={terminalHandoff} />
          <h2 className="sv-panel-title sv-panel-title--sub">Type mix</h2>
          <ul className="sv-type-list sv-type-list--compact">
            {Object.entries(agg.countsByType || {}).map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </li>
            ))}
            {!agg.countsByType || !Object.keys(agg.countsByType).length ? (
              <li className="sv-muted">Run ingestion to populate the tape</li>
            ) : null}
          </ul>
        </aside>
      </div>

      <section
        className={`sv-stream ${tapeRefreshGlow ? 'sv-stream--refresh' : ''}`}
        aria-label="Event stream"
      >
        <div className="sv-stream-head">
          <h2 className="sv-stream-title">Tape</h2>
          <span className="sv-stream-live" data-live={sseOk ? 'on' : 'off'}>
            {sseOk ? 'Live' : 'Polling'}
          </span>
        </div>
        <ul className="sv-event-list">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`sv-event-row ${String(selectedId) === String(e.id) ? 'sv-event-row--active' : ''}`}
                onClick={() => openDrawer(e.id)}
              >
                <span className="sv-sev" data-sev={e.severity}>
                  {e.severity}
                </span>
                <span className="sv-ev-rank" title="Rank score">
                  {e.rank_score != null ? Math.round(e.rank_score) : '—'}
                </span>
                <span className="sv-ev-trust" title="Trust score">
                  T{e.trust_score != null ? Math.round(e.trust_score) : '—'}
                </span>
                {e.risk_bias && e.risk_bias !== 'neutral' ? (
                  <span className={`sv-ev-bias sv-ev-bias--${e.risk_bias}`}>{e.risk_bias.replace('_', ' ')}</span>
                ) : (
                  <span className="sv-ev-bias sv-ev-bias--neutral">neutral</span>
                )}
                <span className="sv-ev-corr" title="Corroboration">
                  {e.corroboration_count > 0 ? `✓${e.corroboration_count}` : '·'}
                </span>
                {e.story_id ? (
                  <span className="sv-ev-story" title="Part of a storyline">
                    ⧉
                  </span>
                ) : (
                  <span className="sv-ev-story sv-ev-story--empty" aria-hidden>
                    ·
                  </span>
                )}
                <span className="sv-ev-type">{e.event_type}</span>
                <span className="sv-ev-title">{e.title}</span>
                <span className="sv-ev-src">{e.source}</span>
              </button>
            </li>
          ))}
          {!events.length ? <li className="sv-muted sv-stream-empty">No events ingested yet.</li> : null}
        </ul>
      </section>

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
