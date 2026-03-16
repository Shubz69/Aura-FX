/**
 * Trader Deck — Economic Calendar
 * Forex Factory-sourced economic events (7-day view).
 */
import React, { useState, useEffect, useMemo } from 'react';
import Api from '../../services/Api';
import '../../styles/trader-deck/EconomicCalendarView.css';

const IMPACT_LABELS = { high: 'HIGH', medium: 'MED', low: 'LOW' };
const CURRENCIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNH'];

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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [impactFilter, setImpactFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Api.getTraderDeckEconomicCalendar(days)
      .then((r) => {
        setEvents(Array.isArray(r.data?.events) ? r.data.events : []);
        setSource(r.data?.source || '');
        setUpdatedAt(r.data?.updatedAt || null);
      })
      .catch(() => setError('Could not load calendar. Check back soon.'))
      .finally(() => setLoading(false));
  }, [days]);

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
      const key = e.date || '';
      if (!out[key]) out[key] = [];
      out[key].push(e);
    });
    return out;
  }, [filtered]);

  const sortedDates = Object.keys(grouped).sort();
  const highCount = events.filter((e) => e.impact === 'high').length;

  return (
    <div className="ec-page">
      <div className="ec-header">
        <div className="ec-header-left">
          <h2 className="ec-title">Economic Calendar</h2>
          <p className="ec-sub">
            {source && source !== 'fallback' ? `Live data · Source: ${source}` : 'Showing upcoming economic events'}
            {updatedAt && (
              <span className="ec-updated"> · Updated {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
        <div className="ec-header-right">
          {highCount > 0 && (
            <span className="ec-high-badge">{highCount} High Impact</span>
          )}
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
            {grouped[dateKey].map((ev, i) => (
              <div
                key={i}
                className={`ec-event ec-event--${ev.impact}`}
              >
                <div className="ec-event-time">{ev.time || 'All Day'}</div>
                <div className={`ec-event-impact ec-event-impact--${ev.impact}`}>
                  <span className="ec-impact-dot" />
                  <span className="ec-impact-label">{IMPACT_LABELS[ev.impact] || ev.impact?.toUpperCase()}</span>
                </div>
                <div className="ec-event-currency">{ev.currency}</div>
                <div className="ec-event-name">{ev.event}</div>
                <div className="ec-event-data">
                  {ev.actual != null && (
                    <span className="ec-data-val ec-data-actual" title="Actual">A: {ev.actual}</span>
                  )}
                  {ev.forecast != null && (
                    <span className="ec-data-val ec-data-forecast" title="Forecast">F: {ev.forecast}</span>
                  )}
                  {ev.previous != null && (
                    <span className="ec-data-val ec-data-previous" title="Previous">P: {ev.previous}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="ec-source-note">
        {source === 'ForexFactory' && 'Data sourced from Forex Factory · '}
        {source === 'FMP' && 'Data sourced from Financial Modeling Prep · '}
        {source === 'TradingEconomics' && 'Data sourced from Trading Economics · '}
        Times shown in your local timezone
      </p>
    </div>
  );
}
