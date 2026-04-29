import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  buildCountryIntel,
  buildGlobalSummary,
  buildRenderableEvents,
  eventForMarkerSelection,
} from './surveillanceIntelligence';
import './SurveillancePage.css';
import './SurveillancePage.modern.css';
import CosmicBackground from '../../components/CosmicBackground';

const TABS = [
  { id: 'all' },
  { id: 'macro' },
  { id: 'geopolitics' },
  { id: 'conflict' },
  { id: 'aviation' },
  { id: 'maritime' },
  { id: 'energy' },
  { id: 'commodities' },
  { id: 'sanctions' },
  { id: 'central_banks' },
  { id: 'high_impact' },
];

function apiBase() {
  return (
    process.env.REACT_APP_API_URL ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
  );
}

export default function SurveillancePage() {
  const { t } = useTranslation();
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
  const [surveillanceDiag, setSurveillanceDiag] = useState(null);
  const [globeDiag, setGlobeDiag] = useState(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
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
      setSurveillanceDiag(json.surveillanceDiagnostics || null);
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
      if (json.surveillanceDiagnostics) setSurveillanceDiag(json.surveillanceDiagnostics);
    } catch {
      /* ignore poll errors */
    }
  }, [token, authHeaders, tab, severityMin, focusCountryIso]);

  loadFeedRef.current = loadFeed;

  const eventsById = useMemo(() => buildEventsById(events), [events]);
  const renderable = useMemo(() => buildRenderableEvents(events), [events]);
  const displayEvents = renderable.events;
  const displayEventsById = useMemo(() => buildEventsById(displayEvents), [displayEvents]);

  const filteredDigest = useMemo(
    () => filterDigestByFocus(intelDigest, focusRegion, displayEventsById),
    [intelDigest, focusRegion, displayEventsById]
  );

  const tapeEvents = useMemo(() => filterEventsByFocus(displayEvents, focusRegion), [displayEvents, focusRegion]);

  const focusSummary = useMemo(
    () => focusSummaryFromEvents(focusRegion, displayEvents),
    [focusRegion, displayEvents]
  );
  const countryIntel = useMemo(
    () =>
      buildCountryIntel({
        focusRegion,
        events: displayEvents,
        wireHeadlines: countryHeadlines,
        wireServiceAvailable: countryWireAvailable,
      }),
    [focusRegion, displayEvents, countryHeadlines, countryWireAvailable]
  );
  const globalSummary = useMemo(() => buildGlobalSummary(displayEvents), [displayEvents]);

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
      const local = eventForMarkerSelection(id, displayEventsById);
      if (local?.is_demo) {
        setDrawerEvent(local);
        setDrawerLoading(false);
        return;
      }
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
    [authHeaders, displayEventsById]
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
      const ev = displayEventsById.get(String(id));
      const key = primaryCountryFromEvent(ev) || (ev?.region ? normalizeRegionKey(ev.region) : null);
      if (key) setFocusRegion(key);
      openDrawer(id);
    },
    [displayEventsById, openDrawer]
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
          <h1 className="sv-page-error-title">{t('surveillance.accessRestricted')}</h1>
          <p className="sv-page-error-copy">
            Your account cannot open Surveillance (Elite terminal). If you believe this is a mistake, confirm your
            subscription is active or contact support.
          </p>
          <div className="sv-page-error-actions">
            <a className="sv-retry" href="/choose-plan">
              {t('surveillance.viewPlans')}
            </a>
            <a className="sv-page-error-secondary" href="/">
              {t('surveillance.home')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !events.length) {
    return (
      <div className="sv-page sv-page--loading sv-page--boot">
        <div className="sv-boot" aria-busy="true" aria-label={t('surveillance.loading')}>
          <div className="sv-boot-bg" aria-hidden />
          <div className="sv-boot-inner">
            <header className="sv-boot-masthead">
              <div className="sv-boot-masthead-top">
                <span className="sv-boot-session">Elite · secured channel</span>
                <span className="sv-boot-state">{t('surveillance.loading')}</span>
              </div>
              <div className="sv-boot-wordmark" aria-hidden>
                <span className="sv-boot-wordmark-aura">Aura</span>
                <span className="sv-boot-wordmark-divider" />
                <span className="sv-boot-wordmark-sv">Surveillance</span>
              </div>
              <p className="sv-boot-headline">{t('surveillance.establishingLiveTerminal')}</p>
              <p className="sv-boot-sub">{t('surveillance.bootSub')}</p>
              <div className="sv-boot-progress" aria-hidden>
                <span className="sv-boot-progress-track">
                  <span className="sv-boot-progress-fill" />
                </span>
              </div>
            </header>
            <div className="sv-boot-footer">
              <div className="sv-spinner sv-spinner--boot" aria-hidden />
              <span className="sv-boot-footer-copy">{t('surveillance.synchronizingGrid')}</span>
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
          <h1 className="sv-page-error-title">{t('surveillance.couldNotLoad')}</h1>
          <p className="sv-page-error-copy">
            The grid could not reach the server or your session may have expired. Check your connection and try again.
          </p>
          <div className="sv-page-error-actions">
            <button type="button" className="sv-retry" onClick={() => loadBootstrap()}>
              Retry
            </button>
            <a className="sv-page-error-secondary" href="/login">
              {t('surveillance.signInAgain')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const agg = aggregates || {};
  const tensionBand = gridTensionBand(agg.globalTensionScore);
  const chips = [
    { label: t('surveillance.liveNodes'), value: agg.liveCount ?? displayEvents.length, title: t('surveillance.eventsOnCurrentTape') },
    {
      label: t('surveillance.gridTension'),
      value: agg.globalTensionScore != null && Number.isFinite(Number(agg.globalTensionScore)) ? tensionBand.label : '—',
      title:
        agg.globalTensionScore != null && Number.isFinite(Number(agg.globalTensionScore))
          ? t('surveillance.blendedStressIndex', { score: Math.round(Number(agg.globalTensionScore)) })
          : undefined,
    },
    { label: t('surveillance.publisherFeeds'), value: sources.length || '—', title: t('surveillance.distinctIngestFeeds') },
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
                <p className="sv-masthead-eyebrow">{t('surveillance.eliteSecuredGrid')}</p>
                <h1 id="sv-terminal-heading" className="sv-terminal-title">
                  {t('surveillance.title')}
                </h1>
                <p className="sv-terminal-sub">
                  {t('surveillance.terminalSub')}
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
          {surveillanceDiag?.feed?.mergedDemoCount > 0 && !renderable.fallbackActive ? (
            <div className="sv-masthead-status sv-masthead-status--warm" role="status">
              <div className="sv-masthead-status-main">
                <span>
                  Server added {surveillanceDiag.feed.mergedDemoCount} synthetic map markers (tape and drawer show Demo).
                  Not live ADS-B or AIS — configure OpenSky and Datalastic keys for live tracks.
                </span>
              </div>
            </div>
          ) : null}
          {renderable.fallbackActive ? (
            <div className="sv-masthead-status sv-masthead-status--warm" role="status">
              <div className="sv-masthead-status-main">
                <span>{t('surveillance.liveFeedTemporarilyUnavailable')}</span>
                <span>{t('surveillance.usingSimulatedIntelligence')}</span>
                <span>{t('surveillance.liveDataConfidence', { level: renderable.liveDataConfidence || t('surveillance.low') })}</span>
              </div>
            </div>
          ) : null}
          {!renderable.fallbackActive ? (
            <div className="sv-masthead-status" role="status">
              <div className="sv-masthead-status-main">
                <span title="Quality of current feed coverage and freshness">
                  {t('surveillance.liveDataConfidence', { level: renderable.liveDataConfidence || t('surveillance.medium') })}
                </span>
              </div>
            </div>
          ) : null}
          {systemHealth ? (
            <div
              className={`sv-masthead-status ${systemHealth.degraded ? 'sv-masthead-status--degraded' : ''} ${
                systemHealth.warmingUp ? 'sv-masthead-status--warm' : ''
              }`}
              role="status"
            >
              <div className="sv-masthead-status-main">
                {systemHealth.warmingUp ? <span>{t('surveillance.warmingFirstIngest')}</span> : null}
                {systemHealth.degraded ? <span>{t('surveillance.degradedIngestSources')}</span> : null}
                {!systemHealth.warmingUp && !systemHealth.degraded ? (
                  <span title={t('surveillance.primaryIngestHealthy')}>{t('surveillance.sourcesNominal')}</span>
                ) : null}
                {systemHealth.lastIngestSuccessAt ? (
                  <span className="sv-masthead-status-time">
                    Last ingest · {new Date(systemHealth.lastIngestSuccessAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="sv-masthead-status-time">{t('surveillance.noIngestYet')}</span>
                )}
                {systemHealth.adapterRecencyBuckets?.stale > 0 ? (
                  <span className="sv-masthead-status-stale" title={t('surveillance.adaptersNoIngest24h')}>
                    {t('surveillance.staleAdaptersCount', { count: systemHealth.adapterRecencyBuckets.stale })}
                  </span>
                ) : null}
              </div>
              <span className="sv-masthead-feed-pill" data-live={sseOk ? 'on' : 'off'}>
                {sseOk ? t('surveillance.liveStream') : t('surveillance.polling')}
              </span>
            </div>
          ) : null}
        </header>

        {focusRegion && focusSummary ? (
          <div className="sv-hero-context" aria-live="polite">
            <span className="sv-hero-context-label">{t('surveillance.sectorLens')}</span>
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
              {t('surveillance.clearLens')}
            </button>
          </div>
        ) : null}

        <div className="sv-terminal-hero">
          <div className="sv-terminal-side" aria-label="Event categories">
            <span className="sv-side-eyebrow">{t('surveillance.categories')}</span>
            <div className="sv-pill-tabs sv-pill-tabs--stack" role="tablist" aria-label="Event categories">
              {TABS.map((tabRow) => (
                <button
                  key={tabRow.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === tabRow.id}
                  className={`sv-pill-tab ${tab === tabRow.id ? 'sv-pill-tab--active' : ''}`}
                  onClick={() => setTab(tabRow.id)}
                >
                  {t(`surveillance.tabs.${tabRow.id}`)}
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
                events={displayEvents}
                selectedId={selectedId}
                focusRegion={focusRegion}
                activeCategory={tab}
                onSelectEvent={onGlobeSelectEvent}
                onHoverEvent={setHoveredMarkerId}
                onDiagnostics={setGlobeDiag}
                onCountryFocus={onGlobeCountryFocus}
                onGlobeBackground={onGlobeBackground}
                reducedMotion={reducedMotion}
              />
            </div>
            <div className="sv-globe-chrome">
              <span className="sv-globe-chrome-tag">{t('surveillance.operatingPicture')}</span>
              <p className="sv-globe-chrome-hint">
                Hover previews a marker. Click pins the event in the side drawer. Tap a country for rolling wire
                headlines plus institutional tape (last 72h). Clear lens for full global grid.
              </p>
              <p className="sv-globe-chrome-legend">
                Legend: brighter poles = higher impact. Gold highlights = selected marker. Category filters keep
                markers visible when matches exist.
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
              eventsById={displayEventsById}
              topTapeSeverity={tapeEvents[0]?.severity}
              leadTapeUpdatedAt={eventFreshnessTimestamp(tapeEvents[0])}
              onClearFocus={clearFocusRegion}
              onSetFocusRegion={setFocusFromHeat}
              wireHeadlines={countryHeadlines}
              wireActive={!!focusCountryIso}
              wireServiceAvailable={countryWireAvailable}
              countryIntel={countryIntel}
              globalSummary={globalSummary}
              dataMode={renderable.dataMode}
              liveDataConfidence={renderable.liveDataConfidence}
              activeTabId={tab}
              activeTabLabel={activeTabLabel}
              onSelectAllCategories={() => setTab('all')}
            />
            <details className="sv-rail-accordion">
              <summary>{t('surveillance.typeMix')}</summary>
              <ul className="sv-type-list sv-type-list--compact">
                {Object.entries(agg.countsByType || {}).map(([k, v]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
                {!agg.countsByType || !Object.keys(agg.countsByType).length ? (
                  <li className="sv-muted">{t('surveillance.awaitingIngest')}</li>
                ) : null}
              </ul>
            </details>
          </aside>
        </div>

        <div className="sv-control-deck">
          <div className="sv-control-deck-inner sv-control-deck-inner--compact">
            <div className="sv-control-deck-label">
              <span className="sv-control-eyebrow">{t('surveillance.tape')}</span>
              <span className="sv-control-title">{t('surveillance.refineSeverity')}</span>
            </div>
            <details className="sv-metrics-legend">
              <summary>{t('surveillance.howToReadTape')}</summary>
              <dl className="sv-metrics-legend-grid">
                <div>
                  <dt>{t('surveillance.intensity')}</dt>
                  <dd>{intensityHint()}</dd>
                </div>
                <div>
                  <dt>{t('surveillance.severity')}</dt>
                  <dd>{t('surveillance.severityHelp')}</dd>
                </div>
                <div>
                  <dt>{t('surveillance.marketRisk')}</dt>
                  <dd>{t('surveillance.marketRiskHelp')}</dd>
                </div>
                <div>
                  <dt>{t('surveillance.corroboration')}</dt>
                  <dd>{t('surveillance.corroborationHelp')}</dd>
                </div>
                <div>
                  <dt>{t('surveillance.sourceQuality')}</dt>
                  <dd>
                    {t('surveillance.sourceQualityHelp')}
                  </dd>
                </div>
              </dl>
              <p className="sv-metrics-legend-note">
                {t('surveillance.intensityScoresNote')}
              </p>
            </details>
            <div className="sv-control-filters">
              <label className="sv-field">
                <span className="sv-field-label">{t('surveillance.minimumSeverity')}</span>
                <select
                  className="sv-field-select"
                  value={severityMin}
                  onChange={(e) => setSeverityMin(e.target.value)}
                  aria-label={t('surveillance.minimumSeverity')}
                >
                  <option value="">{t('surveillance.anyLevel')}</option>
                  <option value="1">{t('surveillance.severity1')}</option>
                  <option value="2">{t('surveillance.severity2')}</option>
                  <option value="3">{t('surveillance.severity3')}</option>
                  <option value="4">{t('surveillance.severity4')}</option>
                  <option value="5">{t('surveillance.severity5')}</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <section
          className={`sv-tape-deck ${tapeRefreshGlow ? 'sv-tape-deck--refresh' : ''} ${
            focusRegion ? 'sv-tape-deck--lensed' : ''
          }`}
          aria-label={t('surveillance.rankedEventTape')}
        >
          <header className="sv-tape-deck-head">
            <div className="sv-tape-deck-head-text">
              <p className="sv-tape-eyebrow">{t('surveillance.liveStream')}</p>
              <div className="sv-tape-heading-row">
                <h2 className="sv-tape-heading">{t('surveillance.tape')}</h2>
                <span className="sv-scoring-help">
                  <button
                    type="button"
                    className="sv-scoring-help-btn"
                    aria-label={t('surveillance.howIntensityScoringWorks')}
                  >
                    <span aria-hidden className="sv-scoring-help-icon" />
                  </button>
                  <span className="sv-scoring-help-pop" role="tooltip">
                    {intensityHowItWorksTooltip()}
                  </span>
                </span>
              </div>
              <p className="sv-tape-deck-hint">
                {t('surveillance.tapeHint')}
              </p>
              <p className="sv-tape-deck-legend">{intensityHint()}</p>
            </div>
            <div className="sv-tape-deck-meta">
              <span className="sv-stream-live sv-stream-live--tape" data-live={sseOk ? 'on' : 'off'}>
                {sseOk ? t('surveillance.live') : t('surveillance.poll')}
              </span>
              <span className="sv-tape-count">{t('surveillance.visibleCount', { count: tapeEvents.length })}</span>
              {focusRegion ? (
                <span className="sv-tape-lens-inline">
                  {t('surveillance.lens')} · <strong>{focusSummary?.label || focusRegion}</strong>
                  <button type="button" className="sv-tape-lens-clear" onClick={clearFocusRegion}>
                    {t('surveillance.clear')}
                  </button>
                </span>
              ) : (
                <span className="sv-tape-lens-inline sv-tape-lens-inline--muted">{t('surveillance.globalTape')}</span>
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
                    <span
                      className="sv-tape-cell sv-tape-cell--type"
                      title={`Market Impact Score: ${e.market_impact_level || 'Low'}${
                        e.market_impact_score_scaled != null ? ` (${Math.round(e.market_impact_score_scaled)})` : ''
                      }`}
                    >
                      Impact {e.market_impact_level || 'Low'}
                    </span>
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
                {focusRegion
                  ? 'No markers match this country lens + category/severity filters. Clear lens or widen categories.'
                  : 'No events match current category/severity filters yet. Try All categories or lower severity.'}
              </li>
            ) : null}
          </ul>
        </section>
        {process.env.NODE_ENV !== 'production' ? (
          <section className="sv-dev-diag" aria-label="Surveillance globe diagnostics">
            <strong>Globe diagnostics</strong>
            <span>markers in feed: {globeDiag?.markerCountInput ?? 0}</span>
            <span>markers rendered: {globeDiag?.markerCountRendered ?? 0}</span>
            <span>selected marker id: {globeDiag?.selectedMarkerId ?? selectedId ?? 'none'}</span>
            <span>hovered marker id: {globeDiag?.hoveredMarkerId ?? hoveredMarkerId ?? 'none'}</span>
          </section>
        ) : null}
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