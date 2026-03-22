import React, { useState, useEffect, useCallback, useRef } from 'react';
import Api from '../../services/Api';

const ALL_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNH'];
const ALL_IMPACTS    = ['high', 'medium', 'low'];

const IMPACT_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const IMPACT_COLOR = { high: '#7a6e62', medium: '#c9a05c', low: '#f8c37d' };

const POLL_NORMAL_MS = 2 * 60 * 1000;   // 2 min baseline
const POLL_FAST_MS   = 20 * 1000;        // 20 s when an event is within ±5 min
const SOON_WINDOW_MS = 5 * 60 * 1000;   // ±5 min = "near" window
const TICK_MS        = 15 * 1000;        // evaluation tick

function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function getEventStatus(ev) {
  if (ev.actual) return 'released';
  if (!ev.timestamp) return 'upcoming';
  const diff = ev.timestamp - Date.now();
  if (diff < 0)                  return 'overdue';   // past, no actual yet
  if (diff < 2 * 60 * 1000)     return 'imminent';  // within 2 min
  return 'upcoming';
}

export default function ForexFactoryNews({ date, onlyToday = true }) {
  const [events, setEvents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick]               = useState(0);   // drives SOON badge re-renders
  const [showFilter, setShowFilter]   = useState(false);
  const [filterCurrencies, setFCurr] = useState(() => loadPref('td_ff_currencies', ALL_CURRENCIES));
  const [filterImpact, setFImpact]   = useState(() => loadPref('td_ff_impact', ALL_IMPACTS));

  const eventsRef      = useRef([]);
  const precTimersRef  = useRef([]);  // precision setTimeout IDs
  const sinceLastFetch = useRef(0);   // ms since last baseline fetch

  const todayStr = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Core fetch — refresh=true bypasses server cache for precision fetches
  const fetchEvents = useCallback(async (refresh = false) => {
    try {
      const res  = await Api.getTraderDeckEconomicCalendar(1, refresh);
      const list = res.data?.events || [];
      setEvents(list);
      eventsRef.current = list;
      setLastUpdated(new Date());
      return list;
    } catch (_) {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Schedule a cache-bypassing fetch at each upcoming event's exact release time
  // (+0s, +30s, +90s to catch delayed actuals)
  const schedulePrecision = useCallback((evts) => {
    precTimersRef.current.forEach(clearTimeout);
    precTimersRef.current = [];
    const now = Date.now();
    evts.forEach(ev => {
      if (!ev.timestamp || ev.actual) return;             // skip released
      const msUntil = ev.timestamp - now;
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
    // Initial load + precision schedule
    fetchEvents(false).then(evts => { if (evts) schedulePrecision(evts); });

    // Adaptive baseline tick: 2 min normal, 20 s when an event is within ±5 min
    const tickId = setInterval(() => {
      setTick(t => t + 1); // re-render for SOON badges
      sinceLastFetch.current += TICK_MS;

      const now = Date.now();
      const isNear = eventsRef.current.some(ev => {
        if (!ev.timestamp || ev.actual) return false;
        return Math.abs(ev.timestamp - now) < SOON_WINDOW_MS;
      });
      const pollMs = isNear ? POLL_FAST_MS : POLL_NORMAL_MS;

      if (sinceLastFetch.current >= pollMs) {
        sinceLastFetch.current = 0;
        fetchEvents(false).then(fresh => { if (fresh) schedulePrecision(fresh); });
      }
    }, TICK_MS);

    return () => {
      clearInterval(tickId);
      precTimersRef.current.forEach(clearTimeout);
    };
  }, [fetchEvents, schedulePrecision]);

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
    .filter(e => !onlyToday || e.date === todayStr)
    .filter(e => filterCurrencies.includes(e.currency))
    .filter(e => filterImpact.includes(e.impact))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const highCount = filtered.filter(e => e.impact === 'high').length;

  return (
    <div className="td-ff-wrap">
      {/* Header */}
      <div className="td-ff-header">
        <div className="td-ff-title-row">
          <h3 className="td-ff-title">Economic Calendar</h3>
          <div className="td-ff-live-badge">
            <span className="td-ff-live-dot" />
            LIVE
          </div>
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
          <span>Fetching live calendar…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="td-ff-empty">
          <span className="td-ff-empty-icon">📭</span>
          <span>No events match your filter for today.</span>
        </div>
      ) : (
        <div className="td-ff-table-wrap">
          <table className="td-ff-table">
            <thead>
              <tr>
                <th className="td-ff-th td-ff-th--time">Time</th>
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
                return (
                  <tr
                    key={i}
                    className={`td-ff-row td-ff-row--${ev.impact} td-ff-row--${status}`}
                  >
                    <td className="td-ff-td td-ff-time">
                      {ev.time || '—'}
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
                    <td className={`td-ff-td td-ff-num td-ff-actual${ev.actual ? ' td-ff-actual--live' : ''}`}>
                      {status === 'imminent' ? <span className="td-ff-releasing">releasing…</span> : (ev.actual ?? '—')}
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
