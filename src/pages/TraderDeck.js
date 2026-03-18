import React, { useState, useMemo, useCallback } from 'react';
import CosmicBackground from '../components/CosmicBackground';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';
import TraderDeckCalendar from '../components/trader-deck/TraderDeckCalendar';
import MarketOutlookView from './trader-deck/MarketOutlookView';
import MarketIntelligenceBriefsView from './trader-deck/MarketIntelligenceBriefsView';
import NewsHeadlines from '../components/NewsHeadlines';
import '../styles/Journal.css';
import '../styles/TraderDeckMarket.css';
import '../styles/TraderDeckTabs.css';
import '../styles/TraderDeckNews.css';

const today = () => new Date().toISOString().slice(0, 10);

const SESSIONS = [
  { name: 'Sydney',   openH: 22, closeH: 7  },
  { name: 'Tokyo',    openH: 0,  closeH: 9  },
  { name: 'London',   openH: 8,  closeH: 17 },
  { name: 'New York', openH: 13, closeH: 22 },
];

function isSessionOpen({ openH, closeH }) {
  const h = new Date().getUTCHours();
  return openH < closeH ? (h >= openH && h < closeH) : (h >= openH || h < closeH);
}

function MarketSessionStatus() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);
  return (
    <ul className="td-deck-sessions-list">
      {SESSIONS.map(s => {
        const open = isSessionOpen(s);
        return (
          <li key={s.name} className={`td-deck-session-item${open ? ' td-deck-session-item--open' : ''}`}>
            <span className={`td-deck-session-dot${open ? ' td-deck-session-dot--open' : ''}`} />
            <span className="td-deck-session-name">{s.name}</span>
            <span className={`td-deck-session-status${open ? ' td-deck-session-status--open' : ''}`}>{open ? 'Open' : 'Closed'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function getMonthStart(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export default function TraderDeck() {
  const { user } = useAuth();
  const canEdit = isAdmin(user);

  const [mainTab, setMainTab] = useState('outlook');
  const [subTab, setSubTab] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(today());
  const [calendarMonth, setCalendarMonth] = useState(today().slice(0, 7));
  const [calendarOverlayOpen, setCalendarOverlayOpen] = useState(false);

  const handlePrevMonth = useCallback(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const next = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    setCalendarMonth(next);
    if (selectedDate.slice(0, 7) !== next) setSelectedDate(getMonthStart(next));
  }, [calendarMonth, selectedDate]);

  const handleNextMonth = useCallback(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    setCalendarMonth(next);
    if (selectedDate.slice(0, 7) !== next) setSelectedDate(getMonthStart(next));
  }, [calendarMonth, selectedDate]);

  const handlePrevDay = useCallback(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const next = d.toISOString().slice(0, 10);
    setSelectedDate(next);
    setCalendarMonth(next.slice(0, 7));
  }, [selectedDate]);

  const handleNextDay = useCallback(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const next = d.toISOString().slice(0, 10);
    setSelectedDate(next);
    setCalendarMonth(next.slice(0, 7));
  }, [selectedDate]);

  const handlePrevWeek = useCallback(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    const next = d.toISOString().slice(0, 10);
    setSelectedDate(next);
    setCalendarMonth(next.slice(0, 7));
  }, [selectedDate]);

  const handleNextWeek = useCallback(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    const next = d.toISOString().slice(0, 10);
    setSelectedDate(next);
    setCalendarMonth(next.slice(0, 7));
  }, [selectedDate]);

  const handleSelectDate = useCallback((date) => {
    setSelectedDate(date);
    setCalendarMonth(date.slice(0, 7));
    setCalendarOverlayOpen(false);
  }, []);

  const datesWithContent = useMemo(() => ({}), []);

  const displayDate = (() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return isNaN(d.getTime()) ? selectedDate : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })();

  return (
    <div className="journal-page td-deck-journal-page" id="td-deck-top">
      <CosmicBackground />

      {/* Full-screen calendar overlay */}
      {calendarOverlayOpen && (
        <div className="td-deck-calendar-overlay" role="dialog" aria-modal="true" aria-label="Pick a date">
          <div className="td-deck-calendar-overlay-backdrop" onClick={() => setCalendarOverlayOpen(false)} />
          <div className="td-deck-calendar-overlay-content">
            <TraderDeckCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              calendarMonth={calendarMonth}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              datesWithContent={datesWithContent}
            />
            <button type="button" className="td-deck-calendar-overlay-close" onClick={() => setCalendarOverlayOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <div className="journal-layout td-deck-jlayout">

        {/* ══════════ SIDEBAR ══════════ */}
        <aside className="journal-sidebar td-deck-jsidebar">
          <header className="journal-sidebar-header">
            <h2 className="journal-sidebar-title">Trader Desk</h2>
            <p className="journal-sidebar-sub">Market Intelligence</p>
          </header>

          {/* Mini calendar */}
          <div className="journal-calendar td-deck-sidebar-cal">
            <TraderDeckCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              calendarMonth={calendarMonth}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              datesWithContent={datesWithContent}
            />
          </div>

          {/* Period sub-tabs */}
          <div className="td-deck-sidebar-period">
            <p className="td-deck-sidebar-period-label">VIEW</p>
            <div className="td-deck-sub-tabs td-deck-sub-tabs--vert">
              <button type="button" className={`td-deck-sub-tab${subTab === 'daily' ? ' td-deck-sub-tab--active' : ''}`} onClick={() => setSubTab('daily')}>Daily</button>
              <button type="button" className={`td-deck-sub-tab${subTab === 'weekly' ? ' td-deck-sub-tab--active' : ''}`} onClick={() => setSubTab('weekly')}>Weekly</button>
            </div>
          </div>

          {/* Market session status */}
          <div className="td-deck-sessions">
            <p className="td-deck-sidebar-period-label">MARKET SESSIONS</p>
            <MarketSessionStatus />
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <main className="journal-main td-deck-jmain">

          {/* Date heading + nav */}
          <div className="td-deck-main-datebar">
            <button type="button" className="journal-calendar-btn td-deck-nav-btn" onClick={subTab === 'weekly' ? handlePrevWeek : handlePrevDay} aria-label="Previous">‹</button>
            <div className="td-deck-main-dateinfo">
              <span className="td-deck-main-datestr">{displayDate}</span>
              <button type="button" className="td-deck-open-cal-btn" onClick={() => setCalendarOverlayOpen(true)} title="Open calendar">📅</button>
            </div>
            <button type="button" className="journal-calendar-btn td-deck-nav-btn" onClick={subTab === 'weekly' ? handleNextWeek : handleNextDay} aria-label="Next">›</button>
          </div>

          {/* Main tab nav */}
          <nav className="td-deck-main-tab-nav" aria-label="Trader Desk sections">
            <button type="button" className={`td-deck-main-tab-btn${mainTab === 'outlook' ? ' td-deck-main-tab-btn--active' : ''}`} onClick={() => setMainTab('outlook')}>
              <span className="td-deck-tab-icon">📊</span> Market Outlook
            </button>
            <button type="button" className={`td-deck-main-tab-btn${mainTab === 'intelligence' ? ' td-deck-main-tab-btn--active' : ''}`} onClick={() => setMainTab('intelligence')}>
              <span className="td-deck-tab-icon">🗂</span> Market Intelligence
            </button>
          </nav>

          {/* Tab content */}
          <div className="td-deck-tab-content">
            {mainTab === 'outlook' && (
              <MarketOutlookView selectedDate={selectedDate} period={subTab} canEdit={canEdit} />
            )}
            {mainTab === 'intelligence' && (
              <MarketIntelligenceBriefsView selectedDate={selectedDate} period={subTab} canEdit={canEdit} />
            )}
          </div>

          {/* Market Headlines */}
          <div className="td-deck-news-section">
            <NewsHeadlines />
          </div>
        </main>
      </div>
    </div>
  );
}
