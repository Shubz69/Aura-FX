import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
} from '../../utils/economicCalendarTime';

const ALL_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNH'];
const ALL_IMPACTS    = ['high', 'medium', 'low'];

const IMPACT_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const IMPACT_COLOR = { high: '#7a6e62', medium: '#c9a05c', low: '#f8c37d' };

const POLL_NORMAL_MS = 2 * 60 * 1000;   // 2 min baseline
const POLL_FAST_MS   = 20 * 1000;       // 20 s when an event is within ±5 min
const SOON_WINDOW_MS = 5 * 60 * 1000;   // ±5 min = "near" window
const TICK_MS        = 1000;            // 1s tick for countdown display

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayInTimeZone(ianaTz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: ianaTz });
}

function shiftIsoDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function getEventStatus(ev) {
  if (hasActualValue(ev.actual)) return 'released';
  const ts = parseEventTimestamp(ev);
  if (!ts) return 'upcoming';
  const diff = ts - Date.now();
  if (diff < 0)                  return 'overdue';   // past, no actual yet
  if (diff < 2 * 60 * 1000)     return 'imminent';  // within 2 min
  return 'upcoming';
}

export default function ForexFactoryNews({ date, onlyToday: _onlyToday = true }) {
  const [displayTimeZone] = useState(() => getBrowserTimeZone());
  const [viewDate, setViewDate] = useState(() => {
    if (date && ISO_DATE_RE.test(String(date))) return String(date).slice(0, 10);
    return todayInTimeZone(getBrowserTimeZone());
  });
  const [events, setEvents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [, setTick]               = useState(0);   // drives re-renders for countdowns while LIVE
  const [showFilter, setShowFilter]   = useState(false);
  const [filterCurrencies, setFCurr] = useState(() => loadPref('td_ff_currencies', ALL_CURRENCIES));
  const [filterImpact, setFImpact]   = useState(() => loadPref('td_ff_impact', ALL_IMPACTS));

  const eventsRef      = useRef([]);
  const precTimersRef  = useRef([]);  // precision setTimeout IDs
  const sinceLastFetch = useRef(0);   // ms since last baseline fetch
  const fetchInFlightRef = useRef(false);
  const viewDateRef = useRef(viewDate);
  viewDateRef.current = viewDate;

  useEffect(() => {
    if (date && ISO_DATE_RE.test(String(date))) {
      setViewDate(String(date).slice(0, 10));
    }
  }, [date]);

  const isViewingToday = useMemo(
    () => viewDate === todayInTimeZone(displayTimeZone),
    [viewDate, displayTimeZone]
  );

  // Core fetch — refresh=true bypasses server cache for precision fetches; historical uses ?date=
  const fetchEvents = useCallback(async (refresh = false) => {
    if (fetchInFlightRef.current) return null;
    fetchInFlightRef.current = true;
    try {
      const todayLocal = todayInTimeZone(displayTimeZone);
      const isToday = viewDate === todayLocal;
      const res = isToday
        ? await Api.getTraderDeckEconomicCalendar(1, refresh)
        : await Api.getTraderDeckEconomicCalendar({ from: viewDate, to: viewDate, refresh });
      const list = res.data?.events || [];
      setEvents(list);
      eventsRef.current = list;
      setLastUpdated(new Date());
      return list;
    } catch (_) {
      return null;
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [viewDate, displayTimeZone]);

  // Schedule a cache-bypassing fetch at each upcoming event's exact release time
  // (+0s, +30s, +90s to catch delayed actuals)
  const schedulePrecision = useCallback((evts) => {
    precTimersRef.current.forEach(clearTimeout);
    precTimersRef.current = [];
    const now = Date.now();
    evts.forEach(ev => {
      const ts = parseEventTimestamp(ev);
      if (!ts || hasActualValue(ev.actual)) return;       // skip released / invalid
      const msUntil = ts - now;
      if (msUntil <= 0 || msUntil > 12 * 60 * 60 * 1000) return; // only next 12h
      [0, 30000, 90000].forEach(offset => {
        const delay = msUntil + offset;
        if (delay > 0) {
          precTimersRef.current.push(
            setTimeout(() => {
              fetchEvents(true).then(fresh => {
                if (fresh) schedulePrecision(fresh);
              });
            }, delay)
          );
        }
      });
    });
  }, [fetchEvents]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEvents(false).then((evts) => {
      if (cancelled || !evts) return;
      if (viewDateRef.current === todayInTimeZone(displayTimeZone)) {
        schedulePrecision(evts);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [viewDate, fetchEvents, schedulePrecision, displayTimeZone]);

  // Adaptive polling only while browsing today's events in the viewer's timezone
  useEffect(() => {
    if (!isViewingToday) {
      precTimersRef.current.forEach(clearTimeout);
      precTimersRef.current = [];
      return undefined;
    }
    sinceLastFetch.current = 0;
    const tickId = setInterval(() => {
      setTick((t) => t + 1);
      const todayLocal = todayInTimeZone(displayTimeZone);
      if (viewDateRef.current !== todayLocal) return;

      sinceLastFetch.current += TICK_MS;
      const now = Date.now();
      const isNear = eventsRef.current.some((ev) => {
        const ts = parseEventTimestamp(ev);
        if (!ts || hasActualValue(ev.actual)) return false;
        if (Math.abs(ts - now) < SOON_WINDOW_MS) return true;
        return isEventWaitingForActual(ev, now);
      });
      const pollMs = isNear ? POLL_FAST_MS : POLL_NORMAL_MS;

      if (sinceLastFetch.current >= pollMs) {
        sinceLastFetch.current = 0;
        if (viewDateRef.current !== todayLocal) return;
        fetchEvents(isNear).then((fresh) => {
          if (fresh && viewDateRef.current === todayInTimeZone(displayTimeZone)) {
            schedulePrecision(fresh);
          }
        });
      }
    }, TICK_MS);

    return () => {
      clearInterval(tickId);
      precTimersRef.current.forEach(clearTimeout);
    };
  }, [isViewingToday, displayTimeZone, fetchEvents, schedulePrecision]);

  const toggleCurrency = (c) => {
    const next = filterCurrencies.includes(c)
      ? filterCurrencies.filter(x => x !== c)
      : [...filterCurrencies, c];
    setFCurr(next);
    localStorage.setItem('td_ff_currencies', JSON.stringify(next));
  };

  const toggleImpact = (i) => {
    const next = filterImpact.includes(i)
      ? filterImpact.filter(x => x !== i)
      : [...filterImpact, i];
    setFImpact(next);
    localStorage.setItem('td_ff_impact', JSON.stringify(next));
  };

  const filtered = events
    .filter((e) => getEventDateKeyLocal(e, displayTimeZone) === viewDate)
    .filter(e => filterCurrencies.includes(e.currency))
    .filter(e => filterImpact.includes(e.impact))
    .sort((a, b) => {
      const ta = parseEventTimestamp(a) || 0;
      const tb = parseEventTimestamp(b) || 0;
      return ta - tb;
    });

  const highCount = filtered.filter(e => e.impact === 'high').length;

  return (
    <div className="td-ff-wrap">
      {/* Header */}
      <div className="td-ff-header">
        <div className="td-ff-title-row">
          <h3 className="td-ff-title">Economic Calendar</h3>
          {isViewingToday ? (
            <div className="td-ff-live-badge">
              <span className="td-ff-live-dot" />
              LIVE
            </div>
          ) : (
            <div className="td-ff-historical-badge" title="Showing archived calendar for the selected date">
              Historical
            </div>
          )}
          {highCount > 0 && (
            <span className="td-ff-high-badge">
              {highCount} High Impact
            </span>
          )}
        </div>
        <div className="td-ff-header-right">
          {lastUpdated && (
            <span className="td-ff-updated">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            className={`td-ff-filter-btn${showFilter ? ' td-ff-filter-btn--active' : ''}`}
            onClick={() => setShowFilter(f => !f)}
            aria-label="Toggle news filter"
          >
            ⚙ Filter
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="td-ff-filter-panel">
          <div className="td-ff-filter-section td-ff-filter-section--date">
            <span className="td-ff-filter-label">Browse date</span>
            <div className="td-ff-date-row">
              <button
                type="button"
                className="td-ff-date-nav"
                onClick={() => setViewDate((d) => shiftIsoDate(d, -1))}
                aria-label="Previous day"
              >
                ‹
              </button>
              <input
                type="date"
                className="td-ff-date-input"
                value={viewDate}
                max={shiftIsoDate(todayInTimeZone(displayTimeZone), 14)}
                min={shiftIsoDate(todayInTimeZone(displayTimeZone), -365)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && ISO_DATE_RE.test(v)) setViewDate(v);
                }}
                aria-label="Calendar date"
              />
              <button
                type="button"
                className="td-ff-date-nav"
                onClick={() => setViewDate((d) => shiftIsoDate(d, 1))}
                aria-label="Next day"
              >
                ›
              </button>
              <button
                type="button"
                className="td-ff-date-today"
                onClick={() => setViewDate(todayInTimeZone(displayTimeZone))}
              >
                Today
              </button>
              {!isViewingToday && (
                <button
                  type="button"
                  className="td-ff-date-refresh"
                  onClick={() => fetchEvents(true)}
                >
                  Refresh
                </button>
              )}
            </div>
            <p className="td-ff-date-hint">Prev / Fcst / Actual from Forex Factory and data partners for this day.</p>
          </div>
          <div className="td-ff-filter-section">
            <span className="td-ff-filter-label">Currencies</span>
            <div className="td-ff-filter-chips">
              {ALL_CURRENCIES.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`td-ff-chip${filterCurrencies.includes(c) ? ' td-ff-chip--on' : ''}`}
                  onClick={() => toggleCurrency(c)}
                >
                  {c}
                </button>
              ))}
              <button type="button" className="td-ff-chip-all" onClick={() => {
                const all = filterCurrencies.length === ALL_CURRENCIES.length ? [] : [...ALL_CURRENCIES];
                setFCurr(all);
                localStorage.setItem('td_ff_currencies', JSON.stringify(all));
              }}>
                {filterCurrencies.length === ALL_CURRENCIES.length ? 'None' : 'All'}
              </button>
            </div>
          </div>
          <div className="td-ff-filter-section">
            <span className="td-ff-filter-label">Impact</span>
            <div className="td-ff-filter-chips">
              {ALL_IMPACTS.map(i => (
                <button
                  key={i}
                  type="button"
                  className={`td-ff-chip td-ff-chip--impact${filterImpact.includes(i) ? ' td-ff-chip--on' : ''}`}
                  onClick={() => toggleImpact(i)}
                  style={{ '--impact-color': IMPACT_COLOR[i] }}
                >
                  <span className="td-ff-dot" style={{ background: IMPACT_COLOR[i] }} />
                  {IMPACT_LABEL[i]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="td-ff-loading">
          <div className="td-ff-spinner" />
          <span>{isViewingToday ? 'Fetching live calendar…' : 'Loading calendar for selected date…'}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="td-ff-empty">
          <span className="td-ff-empty-icon">📭</span>
          <span>
            {events.length === 0
              ? 'No calendar data for this date.'
              : 'No events match your filters for this date.'}
          </span>
        </div>
      ) : (
        <div className="td-ff-table-wrap">
          <table className="td-ff-table">
            <thead>
              <tr>
                <th className="td-ff-th td-ff-th--time">Time</th>
                <th className="td-ff-th td-ff-th--countdown">Countdown</th>
                <th className="td-ff-th td-ff-th--ccy">Ccy</th>
                <th className="td-ff-th td-ff-th--impact"></th>
                <th className="td-ff-th td-ff-th--event">Event</th>
                <th className="td-ff-th td-ff-th--num">Prev</th>
                <th className="td-ff-th td-ff-th--num">Fcst</th>
                <th className="td-ff-th td-ff-th--actual">Actual</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev, i) => {
                const status = getEventStatus(ev);
                const countdownMs = getReleaseCountdownMs(ev);
                return (
                  <tr
                    key={i}
                    className={`td-ff-row td-ff-row--${ev.impact} td-ff-row--${status}`}
                  >
                    <td className="td-ff-td td-ff-time">
                      {formatEventTimeLocal(ev, displayTimeZone)}
                     {countdownMs != null && (
  <span className="td-ff-countdown">{formatCountdownMs(countdownMs)}</span>
)}
                      {status === 'imminent' && (
                        <span className="td-ff-soon-badge">SOON</span>
                      )}
                    </td>
                    <td className="td-ff-td td-ff-ccy">
                      <span className="td-ff-ccy-pill">{ev.currency}</span>
                    </td>
                    <td className="td-ff-td td-ff-impact-cell">
                      <span
                        className="td-ff-impact-dot"
                        style={{ background: IMPACT_COLOR[ev.impact] }}
                        title={IMPACT_LABEL[ev.impact] + ' Impact'}
                      />
                      {ev.impact === 'high' && (
                        <span className="td-ff-impact-dot td-ff-impact-dot--2" style={{ background: IMPACT_COLOR[ev.impact] }} />
                      )}
                      {ev.impact === 'high' && (
                        <span className="td-ff-impact-dot td-ff-impact-dot--3" style={{ background: IMPACT_COLOR[ev.impact] }} />
                      )}
                    </td>
                    <td className="td-ff-td td-ff-event-cell">{ev.event}</td>
                    <td className="td-ff-td td-ff-num td-ff-prev">{ev.previous ?? '—'}</td>
                    <td className="td-ff-td td-ff-num td-ff-forecast">{ev.forecast ?? '—'}</td>
                    <td className={`td-ff-td td-ff-num td-ff-actual${hasActualValue(ev.actual) ? ' td-ff-actual--live' : ''}`}>
                      {hasActualValue(ev.actual) ? (
                        ev.actual
                      ) : status === 'overdue' ? (
                        <span className="td-ff-releasing">Pending</span>
                      ) : (
                        '--'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
