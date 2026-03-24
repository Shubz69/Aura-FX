/**
 * Trader Deck — Economic Calendar
 * Economic events (7-day view).
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Api from '../../services/Api';
import {
  hasActualValue,
  parseEventTimestamp,
  formatEventTimeLocal,
  getEventDateKeyLocal,
} from '../../utils/economicCalendarTime';
import '../../styles/trader-deck/EconomicCalendarView.css';

const IMPACT_LABELS = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const CURRENCIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNH'];
const SOON_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 75 * 1000;

function countdownMs(ev, nowMs) {
  if (hasActualValue(ev.actual)) return null;
  const ts = parseEventTimestamp(ev);
  if (!ts) return null;
  const diff = ts - nowMs;
  if (diff <= 0 || diff > SOON_WINDOW_MS) return null;
  return diff;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T00:00:00').toDateString() === new Date().toDateString();
}

function isTomorrow(dateStr) {
  if (!dateStr) return false;
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return new Date(dateStr + 'T00:00:00').toDateString() === t.toDateString();
}

function getDayLabel(dateStr) {
  if (isToday(dateStr)) return 'Today';
  if (isTomorrow(dateStr)) return 'Tomorrow';
  return formatDate(dateStr);
}

export default function EconomicCalendarView() {
  const [viewerTimeZone, setViewerTimeZone] = useState('UTC');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [impactFilter, setImpactFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [days, setDays] = useState(7);
  const [clock, setClock] = useState(Date.now());

  const fetchCalendar = useCallback((silent = false, refresh = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    Api.getTraderDeckEconomicCalendar(days, refresh)
      .then((r) => {
        setEvents(Array.isArray(r.data?.events) ? r.data.events : []);
        setViewerTimeZone(r.data?.viewerTimeZone || 'UTC');
        setUpdatedAt(r.data?.fetchedAt || r.data?.updatedAt || null);
      })
      .catch(() => {
        if (!silent) setError('Could not load calendar. Check back soon.');
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [days]);

  useEffect(() => {
    fetchCalendar(false, false);
  }, [fetchCalendar]);

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const nowMs = Date.now();
      const nearRelease = events.some((ev) => {
        if (hasActualValue(ev.actual)) return false;
        const ts = parseEventTimestamp(ev);
        return ts && Math.abs(ts - nowMs) <= SOON_WINDOW_MS;
      });
      fetchCalendar(true, nearRelease);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchCalendar, events]);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (impactFilter !== 'all' && e.impact !== impactFilter) return false;
      if (currencyFilter !== 'ALL' && e.currency !== currencyFilter) return false;
      return true;
    });
  }, [events, impactFilter, currencyFilter]);

  const grouped = useMemo(() => {
    const out = {};
    filtered.forEach((e) => {
      const key = getEventDateKeyLocal(e, viewerTimeZone) || '';
      if (!out[key]) out[key] = [];
      out[key].push(e);
    });
    Object.keys(out).forEach((key) => {
      out[key].sort((a, b) => {
        const ta = parseEventTimestamp(a);
        const tb = parseEventTimestamp(b);
        if (ta != null && tb != null) return ta - tb;
        if (ta != null) return -1;
        if (tb != null) return 1;
        return String(a.time || '').localeCompare(String(b.time || ''));
      });
    });
    return out;
  }, [filtered, viewerTimeZone]);

  const sortedDates = Object.keys(grouped).sort();
  const highCount = events.filter((e) => e.impact === 'high').length;

  return (
    <div className="ec-page">
      <div className="ec-header">
        <div className="ec-header-left">
          <h2 className="ec-title">Economic Calendar</h2>
          <p className="ec-sub">
            Impact-tagged event risk across key regions
            {updatedAt && (
              <span className="ec-updated"> · Updated {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
        <div className="ec-header-right">
          {highCount > 0 && <span className="ec-high-badge">{highCount} High Impact Events Ahead</span>}
          <select
            className="ec-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Days range"
          >
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </select>
        </div>
      </div>

      <div className="ec-filters">
        <div className="ec-filter-group">
          <span className="ec-filter-label">Impact</span>
          {['all', 'high', 'medium', 'low'].map((v) => (
            <button
              key={v}
              type="button"
              className={`ec-filter-btn ec-filter-btn--${v} ${impactFilter === v ? 'active' : ''}`}
              onClick={() => setImpactFilter(v)}
            >
              {v === 'all' ? 'All' : IMPACT_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="ec-filter-group">
          <span className="ec-filter-label">Currency</span>
          <select
            className="ec-select ec-select--sm"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            aria-label="Currency filter"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="ec-source-note">Clustered events can trigger volatility spikes across FX, indices, commodities and crypto.</p>

      {loading && (
        <div className="ec-loading">
          <div className="ec-loading-spinner" />
          <span>Loading calendar…</span>
        </div>
      )}

      {!loading && error && (
        <div className="ec-error">{error}</div>
      )}

      {!loading && !error && sortedDates.length === 0 && (
        <div className="ec-empty">No events match your filters for the selected period.</div>
      )}

      {!loading && !error && sortedDates.map((dateKey) => (
        <section key={dateKey} className={`ec-day-section ${isToday(dateKey) ? 'ec-day-section--today' : ''}`}>
          <div className="ec-day-header">
            <span className="ec-day-label">{getDayLabel(dateKey)}</span>
            <span className="ec-day-count">{grouped[dateKey].length} events</span>
          </div>
          <div className="ec-event-list">
            {grouped[dateKey].map((ev, i) => {
              const cdm = countdownMs(ev, clock);
              const eventTimeLabel = formatEventTimeLocal(ev, viewerTimeZone);
              return (
              <div
                key={i}
                className={`ec-event ec-event--${ev.impact}`}
              >
                <div className="ec-event-time">
                  {eventTimeLabel}
                  {cdm != null && <span className="ec-countdown">{formatCountdown(cdm)}</span>}
                </div>
                <div className={`ec-event-impact ec-event-impact--${ev.impact}`}>
                  <span className="ec-impact-dot" />
                  <span className="ec-impact-label">{IMPACT_LABELS[ev.impact] || ev.impact?.toUpperCase()}</span>
                </div>
                <div className="ec-event-currency">{ev.currency}</div>
                <div className="ec-event-name">{ev.event}</div>
                <div className="ec-event-data">
                  {hasActualValue(ev.actual) && (
                    <span className="ec-data-val ec-data-actual" title="Actual">A: {ev.actual}</span>
                  )}
                  {ev.forecast != null && (
                    <span className="ec-data-val ec-data-forecast" title="Forecast">F: {ev.forecast}</span>
                  )}
                  {ev.previous != null && (
                    <span className="ec-data-val ec-data-previous" title="Previous">P: {ev.previous}</span>
                  )}
                  {!hasActualValue(ev.actual) && (
                    <span className="ec-data-val ec-data-live">--</span>
                  )}
                </div>
              </div>
            );})}
          </div>
        </section>
      ))}

      <p className="ec-source-note">Times shown in your regional timezone ({viewerTimeZone}).</p>
    </div>
  );
}
