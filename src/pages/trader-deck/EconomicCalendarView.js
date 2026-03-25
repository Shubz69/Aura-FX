/**
 * Trader Deck — Economic Calendar
 * Economic events (7-day view).
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Api from '../../services/Api';
import {
  hasActualValue,
  parseEventTimestamp,
  formatEventTimeLocal,
  getEventDateKeyLocal,
  getBrowserTimeZone,
  getReleaseCountdownMs,
  formatCountdownMs,
  isEventWaitingForActual,
  getCalendarDateKeyNow,
  getCalendarDateKeyOffsetFromNow,
  formatCalendarHeadingDate,
} from '../../utils/economicCalendarTime';
import '../../styles/trader-deck/EconomicCalendarView.css';

const IMPACT_LABELS = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const CURRENCIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNH'];
const SOON_WINDOW_MS = 5 * 60 * 1000;
const POLL_NORMAL_MS = 75 * 1000;
const POLL_FAST_MS = 15 * 1000;

function getDayLabel(dateStr, tz) {
  if (!dateStr) return '';
  if (dateStr === getCalendarDateKeyNow(tz)) return 'Today';
  if (dateStr === getCalendarDateKeyOffsetFromNow(tz, 1)) return 'Tomorrow';
  return formatCalendarHeadingDate(dateStr, tz);
}

export default function EconomicCalendarView() {
  const [displayTimeZone] = useState(() => getBrowserTimeZone());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [impactFilter, setImpactFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [days, setDays] = useState(7);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [clock, setClock] = useState(Date.now());
  const precTimersRef = useRef([]);

  const fetchCalendar = useCallback((silent = false, refresh = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const reqArg = (fromDate && toDate)
      ? { from: fromDate, to: toDate, refresh }
      : days;
    return Api.getTraderDeckEconomicCalendar(reqArg, refresh)
      .then((r) => {
        const list = Array.isArray(r.data?.events) ? r.data.events : [];
        setEvents(list);
        setUpdatedAt(r.data?.fetchedAt || r.data?.updatedAt || null);
        return list;
      })
      .catch(() => {
        if (!silent) setError('Could not load calendar. Check back soon.');
        return null;
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [days, fromDate, toDate]);

  const schedulePrecision = useCallback((evts) => {
    precTimersRef.current.forEach(clearTimeout);
    precTimersRef.current = [];
    const now = Date.now();
    evts.forEach((ev) => {
      const ts = parseEventTimestamp(ev);
      if (!ts || hasActualValue(ev.actual)) return;
      const msUntil = ts - now;
      if (msUntil <= 0 || msUntil > 12 * 60 * 60 * 1000) return;
      [0, 30000, 90000].forEach((offset) => {
        const delay = msUntil + offset;
        if (delay > 0) {
          precTimersRef.current.push(
            setTimeout(() => {
              fetchCalendar(true, true).then((fresh) => {
                if (fresh) schedulePrecision(fresh);
              });
            }, delay)
          );
        }
      });
    });
  }, [fetchCalendar]);

  useEffect(() => {
    fetchCalendar(false, false).then((evts) => {
      if (evts) schedulePrecision(evts);
    });
  }, [fetchCalendar, schedulePrecision]);

  const needsFastPoll = useMemo(() => {
    const now = clock;
    return events.some((ev) => {
      if (hasActualValue(ev.actual)) return false;
      const ts = parseEventTimestamp(ev);
      if (!ts) return false;
      if (Math.abs(ts - now) <= SOON_WINDOW_MS) return true;
      if (isEventWaitingForActual(ev, now)) return true;
      return false;
    });
  }, [events, clock]);

  useEffect(() => {
    let since = 0;
    const id = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const pollMs = needsFastPoll ? POLL_FAST_MS : POLL_NORMAL_MS;
      since += 1000;
      if (since < pollMs) return;
      since = 0;
      fetchCalendar(true, needsFastPoll).then((fresh) => {
        if (fresh) schedulePrecision(fresh);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [fetchCalendar, needsFastPoll, schedulePrecision]);

  useEffect(() => {
    return () => {
      precTimersRef.current.forEach(clearTimeout);
    };
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
      const key = getEventDateKeyLocal(e, displayTimeZone) || '';
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
  }, [filtered, displayTimeZone]);

  const sortedDates = Object.keys(grouped).filter(Boolean).sort();
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
            disabled={!!(fromDate && toDate)}
          >
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </select>
          <input
            type="date"
            className="ec-select ec-select--sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="Calendar from date"
          />
          <input
            type="date"
            className="ec-select ec-select--sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="Calendar to date"
          />
          {(fromDate || toDate) && (
            <button
              type="button"
              className="ec-filter-btn active"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              Clear Range
            </button>
          )}
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
        <section
          key={dateKey}
          className={`ec-day-section ${dateKey === getCalendarDateKeyNow(displayTimeZone) ? 'ec-day-section--today' : ''}`}
        >
          <div className="ec-day-header">
            <span className="ec-day-label">{getDayLabel(dateKey, displayTimeZone)}</span>
            <span className="ec-day-count">{grouped[dateKey].length} events</span>
          </div>
          <div className="ec-event-list">
            {grouped[dateKey].map((ev, i) => {
              const cdm = getReleaseCountdownMs(ev, clock);
              const eventTimeLabel = formatEventTimeLocal(ev, displayTimeZone);
              return (
              <div
                key={i}
                className={`ec-event ec-event--${ev.impact}`}
              >
                <div className="ec-event-time">
                  {eventTimeLabel}
                  {cdm != null && <span className="ec-countdown">{formatCountdownMs(cdm)}</span>}
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
                  {hasActualValue(ev.forecast) && (
                    <span className="ec-data-val ec-data-forecast" title="Forecast">F: {ev.forecast}</span>
                  )}
                  {hasActualValue(ev.previous) && (
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

      <p className="ec-source-note">Times shown in your device timezone ({displayTimeZone}).</p>
    </div>
  );
}
