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
  formatRecencyLabel,
  normalizeRegionKey,
  primaryCountryFromEvent,
  severityUrgencySlug,
} from './surveillanceRegionUtils';
import {
  eventFreshnessTimestamp,
  gridTensionBand,
  intensityHint,
  intensityHowItWorksTooltip,
  intensityVisualBand,
  trustQualityPresentation,
} from './surveillancePresentation';
import './SurveillancePage.css';
import './SurveillancePage.modern.css';
import CosmicBackground from '../../components/CosmicBackground';

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
  const [pairHeat, setPairHeat] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [sseOk, setSseOk] = useState(false);
  const [pageEntered, setPageEntered] = useState(false);
  const [terminalHandoff, setTerminalHandoff] = useState(false);
  const [tapeRefreshGlow, setTapeRefreshGlow] = useState(false);
  const [focusRegion, setFocusRegion] = useState(null);
  const [countryHeadlines, setCountryHeadlines] = useState([]);
  const [countryWireAvailable, setCountryWireAvailable] = useState(true);
  const loadFeedRef = useRef(null);
  const prevIntroRef = useRef(showIntro);
  const tapeSigRef = useRef('');
  const tapeInitRef = useRef(true);

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const focusCountryIso = useMemo(() => {
    if (!focusRegion) return null;
    const f = normalizeRegionKey(focusRegion);
    return /^[A-Z]{2}$/.test(f) ? f : null;
  }, [focusRegion]);

  const loadBootstrap = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
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
      setPairHeat(Array.isArray(json.pairHeat) ? json.pairHeat : null);
      setSystemHealth(json.systemHealth || null);
      setCountryHeadlines([]);
      if (typeof json.countryWireAvailable === 'boolean') {
        setCountryWireAvailable(json.countryWireAvailable);
      }
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
      if (focusCountryIso) {
        params.set('country', focusCountryIso);
        params.set('maxAgeHours', '72');
      }
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
      if (Array.isArray(json.pairHeat)) setPairHeat(json.pairHeat);
      setCountryHeadlines(Array.isArray(json.countryHeadlines) ? json.countryHeadlines : []);
      if (typeof json.countryWireAvailable === 'boolean') {
        setCountryWireAvailable(json.countryWireAvailable);
      }
    } catch {
      /* ignore poll errors */
    }
  }, [token, authHeaders, tab, severityMin, focusCountryIso]);

  loadFeedRef.current = loadFeed;

  const eventsById = useMemo(() => buildEventsById(events), [events]);

  const filteredDigest = useMemo(
    () => filterDigestByFocus(intelDigest, focusRegion, eventsById),
    [intelDigest, focusRegion, eventsById]
  );

  const tapeEvents = useMemo(() => filterEventsByFocus(events, focusRegion), [events, focusRegion]);

  const focusSummary = useMemo(() => focusSummaryFromEvents(focusRegion, events), [focusRegion, events]);

  const activeTabLabel = useMemo(() => TABS.find((t) => t.id === tab)?.label || tab, [tab]);

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
    const pollMs = sseOk ? 48000 : 22000;
    const t = setInterval(() => loadFeed(), pollMs);
    return () => clearInterval(t);
  }, [token, loading, loadFeed, sseOk]);

  useEffect(() => {
    if (!introReady || loading) return;
    loadFeed();
  }, [tab, severityMin, introReady, loading, loadFeed, focusCountryIso]);

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
      <div className="sv-page sv-page--error" role="alert" aria-live="assertive">
        <div className="sv-page-error-panel">
          <h1 className="sv-page-error-title">Access restricted</h1>
          <p className="sv-page-error-copy">
            Your account cannot open Surveillance (Elite terminal). If you believe this is a mistake, confirm your
            subscription is active or contact support.
          </p>
          <div className="sv-page-error-actions">
            <a className="sv-retry" href="/choose-plan">
              View plans
            </a>
            <a className="sv-page-error-secondary" href="/">
              Home
            </a>
          </div>
        </div>
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
      <div className="sv-page sv-page--error" role="alert" aria-live="assertive">
        <div className="sv-page-error-panel">
          <h1 className="sv-page-error-title">Could not load Surveillance</h1>
          <p className="sv-page-error-copy">
            The grid could not reach the server or your session may have expired. Check your connection and try again.
          </p>
          <div className="sv-page-error-actions">
            <button type="button" className="sv-retry" onClick={() => loadBootstrap()}>
              Retry
            </button>
            <a className="sv-page-error-secondary" href="/login">
              Sign in again
            </a>
          </div>
        </div>
      </div>
    );
  }

  const agg = aggregates || {};
  const tensionBand = gridTensionBand(agg.globalTensionScore);
  const chips = [
    { label: 'Live nodes', value: agg.liveCount ?? events.length, title: 'Events on the current tape after filters' },
    {
      label: 'Grid tension',
      value: agg.globalTensionScore != null && Number.isFinite(Number(agg.globalTensionScore)) ? tensionBand.label : '—',
      title:
        agg.globalTensionScore != null && Number.isFinite(Number(agg.globalTensionScore))
          ? `Blended stress index (0–100 scale): ${Math.round(Number(agg.globalTensionScore))}`
          : undefined,
    },
    { label: 'Publisher feeds', value: sources.length || '—', title: 'Distinct ingest feeds represented on the tape' },
  ];

  return (
    <div
      className={`sv-page sv-page--terminal ${pageEntered ? 'sv-page--entered' : ''} ${
        terminalHandoff ? 'sv-page--handoff' : ''
      }`}
    >
      <CosmicBackground />
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
                <p className="sv-terminal-sub">
                  Official and institutional public channels — ranked by relevance and freshness, sector lens on the globe
                </p>
              </div>
            </div>
            <div className="sv-masthead-instruments" aria-label="Grid status">
              {chips.map((c) => (
                <div key={c.label} className="sv-instrument" title={c.title}>
                  <span className="sv-instrument-label">{c.label}</span>
                  <span className="sv-instrument-value">{c.value}</span>
                </div>
              ))}
            </div>
            <div className="sv-masthead-markets">
              <MarketWatchStrip
                variant="compact"
                pairHeat={pairHeat}
                narrative={marketWatchNarrative}
                items={agg.marketWatch || []}
              />
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
            {focusSummary.count > 0 ? (
              <span
                className={`sv-hero-context-urgency ${focusSummary.urgencyClass || ''}`}
                title="Highest severity in this sector lens"
              >
                {focusSummary.urgencyLabel}
                {focusSummary.maxSev
                  ? ` · Severity ${focusSummary.maxSev} (${focusSummary.urgencyLabel || 'level'})`
                  : ''}
              </span>
            ) : null}
            <button type="button" className="sv-hero-context-clear" onClick={clearFocusRegion}>
              Clear lens
            </button>
          </div>
        ) : null}

        <div className="sv-terminal-hero">
          <div className="sv-terminal-side" aria-label="Event categories">
            <span className="sv-side-eyebrow">Categories</span>
            <div className="sv-pill-tabs sv-pill-tabs--stack" role="tablist" aria-label="Event categories">
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
          </div>
          <div
            className={`sv-globe-stage ${focusRegion ? 'sv-globe-stage--lensed' : ''} ${
              terminalHandoff ? 'sv-globe-stage--handoff' : ''
            }`}
          >
            <div className={`sv-globe-panel ${terminalHandoff ? 'sv-globe-panel--handoff' : ''}`}>
              <SurveillanceGlobe
                events={events}
                selectedId={selectedId}
                focusRegion={focusRegion}
                activeCategory={tab}
                onSelectEvent={onGlobeSelectEvent}
                onCountryFocus={onGlobeCountryFocus}
                onGlobeBackground={onGlobeBackground}
                reducedMotion={reducedMotion}
              />
            </div>
            <div className="sv-globe-chrome">
              <span className="sv-globe-chrome-tag">Operating picture</span>
              <p className="sv-globe-chrome-hint">
                Zoom to frame the theatre. Tap a country for rolling wire headlines plus institutional tape
                (last 72h). Clear the lens to restore the full global grid.
              </p>
            </div>
          </div>
          <aside
            className={`sv-command-rail sv-intel-panel ${terminalHandoff ? 'sv-intel-panel--handoff' : ''}`}
            aria-label="Situation rail and digest"
          >
            <IntelSidePanel
              digest={filteredDigest}
              situationHeadline={situationHeadline}
              onOpenEvent={openDrawer}
              handoff={terminalHandoff}
              focusRegion={focusRegion}
              focusSummary={focusSummary}
              tapeCount={tapeEvents.length}
              eventsById={eventsById}
              topTapeSeverity={tapeEvents[0]?.severity}
              leadTapeUpdatedAt={eventFreshnessTimestamp(tapeEvents[0])}
              onClearFocus={clearFocusRegion}
              onSetFocusRegion={setFocusFromHeat}
              wireHeadlines={countryHeadlines}
              wireActive={!!focusCountryIso}
              wireServiceAvailable={countryWireAvailable}
              activeTabId={tab}
              activeTabLabel={activeTabLabel}
              onSelectAllCategories={() => setTab('all')}
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
          <div className="sv-control-deck-inner sv-control-deck-inner--compact">
            <div className="sv-control-deck-label">
              <span className="sv-control-eyebrow">Tape</span>
              <span className="sv-control-title">Refine severity</span>
            </div>
            <details className="sv-metrics-legend">
              <summary>How to read the tape</summary>
              <dl className="sv-metrics-legend-grid">
                <div>
                  <dt>Intensity</dt>
                  <dd>{intensityHint()}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>Editorial urgency 1–5. Accent colors mark watch, elevated, and critical tiers.</dd>
                </div>
                <div>
                  <dt>Market risk</dt>
                  <dd>Lean from the asset-impact scan (risk-on / risk-off / supply shock). Neutral when unclear.</dd>
                </div>
                <div>
                  <dt>Corroboration</dt>
                  <dd>Independent coverage overlap on the same storyline. Higher counts mean stronger cross-check.</dd>
                </div>
                <div>
                  <dt>Source quality</dt>
                  <dd>
                    Publisher tier (official, institutional, authority, corroborated, public). Open an item for the
                    original link — internal ingest labels are not shown on the tape.
                  </dd>
                </div>
              </dl>
              <p className="sv-metrics-legend-note">
                Close intensity scores usually mean comparable weighting, not identical risk. Use severity, source quality,
                and recency to judge urgency.
              </p>
            </details>
            <div className="sv-control-filters">
              <label className="sv-field">
                <span className="sv-field-label">Minimum severity</span>
                <select
                  className="sv-field-select"
                  value={severityMin}
                  onChange={(e) => setSeverityMin(e.target.value)}
                  aria-label="Minimum severity"
                >
                  <option value="">Any level</option>
                  <option value="1">1 — Routine+</option>
                  <option value="2">2 — Watch+</option>
                  <option value="3">3 — Elevated+</option>
                  <option value="4">4 — High+</option>
                  <option value="5">5 — Critical only</option>
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
              <div className="sv-tape-heading-row">
                <h2 className="sv-tape-heading">Tape</h2>
                <span className="sv-scoring-help">
                  <button
                    type="button"
                    className="sv-scoring-help-btn"
                    aria-label="How intensity scoring works"
                  >
                    <span aria-hidden className="sv-scoring-help-icon" />
                  </button>
                  <span className="sv-scoring-help-pop" role="tooltip">
                    {intensityHowItWorksTooltip()}
                  </span>
                </span>
              </div>
              <p className="sv-tape-deck-hint">
                Intensity and freshness drive order · open a row for verification detail and the original publisher link ·
                lens highlights in-sector nodes
              </p>
              <p className="sv-tape-deck-legend">{intensityHint()}</p>
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
              const urgSlug = severityUrgencySlug(e.severity);
              const intVis = intensityVisualBand(e.rank_score);
              const recencyIso = eventFreshnessTimestamp(e);
              const trustPr = trustQualityPresentation(e.trust_score);
              const metaBits = [
                recencyIso ? formatRecencyLabel(recencyIso) : null,
                trustPr.short !== '—' ? trustPr.label : null,
                e.risk_bias && e.risk_bias !== 'neutral'
                  ? `Risk: ${String(e.risk_bias).replace(/_/g, ' ')}`
                  : null,
                e.corroboration_count > 0 ? `Corroboration ×${e.corroboration_count}` : null,
                e.story_id ? 'Storyline' : null,
              ].filter(Boolean);
              const detailTitle = metaBits.length ? `${e.title} — ${metaBits.join(' · ')}` : e.title;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    data-urgency={urgSlug}
                    data-intensity-visual={intVis}
                    className={`sv-tape-row sv-tape-row--int-vis-${intVis} ${
                      String(selectedId) === String(e.id) ? 'sv-tape-row--active' : ''
                    } ${focusRegion && eventMatchesFocus(e, focusRegion) ? 'sv-tape-row--in-lens' : ''}`}
                    title={detailTitle}
                    onClick={() => openDrawer(e.id)}
                  >
                    <span className="sv-tape-cell sv-tape-cell--sev" title="Severity (1–5 editorial urgency)">
                      <span
                        className={`sv-sev ${urgSlug !== 'routine' ? `sv-sev--${urgSlug}` : ''}`}
                        data-sev={e.severity}
                      >
                        {e.severity}
                      </span>
                    </span>
                    <span className="sv-tape-cell sv-tape-cell--intensity" title={intensityHint()}>
                      <span className="sv-tape-int-label">INTENSITY</span>
                      <span className="sv-tape-int-value">
                        {e.rank_score != null ? Math.round(e.rank_score) : '—'}
                      </span>
                    </span>
                    {e.risk_bias && e.risk_bias !== 'neutral' ? (
                      <span
                        className={`sv-tape-cell sv-tape-cell--risk sv-ev-bias sv-ev-bias--${e.risk_bias}`}
                        title="Market risk lean from impacted assets"
                      >
                        {e.risk_bias.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="sv-tape-cell sv-tape-cell--risk sv-tape-cell--muted" title="No clear risk lean">
                        —
                      </span>
                    )}
                    <span className="sv-tape-cell sv-tape-cell--type" title="Event category">
                      {e.event_type}
                    </span>
                    <span className="sv-tape-cell sv-tape-cell--title">{e.title}</span>
                    <span
                      className="sv-tape-cell sv-tape-cell--signal"
                      title={`${trustPr.detail}${recencyIso ? ` · ${formatRecencyLabel(recencyIso)}` : ''}`}
                    >
                      <span className={`sv-tape-signal-trust sv-tape-signal-trust--${trustPr.tier}`}>
                        {trustPr.short}
                      </span>
                      {recencyIso ? (
                        <span className="sv-tape-signal-fresh">{formatRecencyLabel(recencyIso)}</span>
                      ) : (
                        <span className="sv-tape-signal-fresh sv-tape-signal-fresh--muted">—</span>
                      )}
                    </span>
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