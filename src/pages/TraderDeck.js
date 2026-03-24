/**
 * Trader Desk route (/trader-deck). UI structure/CSS imports are presentation-only;
 * data flow: state here + Api.* in MarketOutlookView / MarketIntelligenceBriefsView.
 */
import React, { useState, useMemo, useCallback } from 'react';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';
import TraderDeckCalendar from '../components/trader-deck/TraderDeckCalendar';
import TraderDeckCalendarBar from '../components/trader-deck/TraderDeckCalendarBar';
import TraderDeckWorldClocks from '../components/trader-deck/TraderDeckWorldClocks';
import MarketOutlookView from './trader-deck/MarketOutlookView';
import MarketIntelligenceBriefsView from './trader-deck/MarketIntelligenceBriefsView';
import NewsHeadlines from '../components/NewsHeadlines';
import '../styles/TraderDeckMarket.css';
import '../styles/TraderDeckTabs.css';
import '../styles/TraderDeckNews.css';
import '../styles/trader-deck/TraderDeckJournalGlass.css';
import '../styles/trader-deck/TraderDeckContentModern.css';

const today = () => new Date().toISOString().slice(0, 10);

const SESSIONS = [
  { name: 'Sydney', openH: 22, closeH: 7 },
  { name: 'Tokyo', openH: 0, closeH: 9 },
  { name: 'London', openH: 8, closeH: 17 },
  { name: 'New York', openH: 13, closeH: 22 },
];

function isSessionOpen({ openH, closeH }) {
  const h = new Date().getUTCHours();
  return openH < closeH ? (h >= openH && h < closeH) : (h >= openH || h < closeH);
}

function MarketSessionStatus() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);
  return (
    <ul className="td-deck-sessions-list">
      {SESSIONS.map((s) => {
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

  return (
    <AuraTerminalThemeShell>
    <div className="td-layout-page td-deck-with-tabs" id="td-deck-top">
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
            <button type="button" className="td-deck-calendar-overlay-close" onClick={() => setCalendarOverlayOpen(false)} aria-label="Close calendar">
              Close
            </button>
          </div>
        </div>
      )}

      <div className="td-deck-layout">
        <TraderDeckWorldClocks />
        <div className="td-deck-tab-zone" aria-label="Trader Desk navigation">
          <header className="td-deck-header td-deck-header--tab-zone">
            <nav className="td-deck-header-nav td-deck-header-left td-deck-main-tab-rail" aria-label="Trader Desk sections">
              <button
                type="button"
                className={`td-deck-tab${mainTab === 'outlook' ? ' td-deck-tab--active' : ''}`}
                onClick={() => setMainTab('outlook')}
              >
                MARKET OUTLOOK
              </button>
            </nav>
            <h1 className="td-deck-page-title">Trader Desk</h1>
            <nav className="td-deck-header-nav td-deck-header-right td-deck-main-tab-rail" aria-label="Trader Desk sections">
              <button
                type="button"
                className={`td-deck-tab${mainTab === 'intelligence' ? ' td-deck-tab--active' : ''}`}
                onClick={() => setMainTab('intelligence')}
              >
                MARKET INTELLIGENCE
              </button>
            </nav>
          </header>

          <div className="td-deck-divider-row td-deck-tab-zone-calendar">
            <div className="td-deck-header-line-left" aria-hidden="true" />
            <div className="td-deck-calendar-bar-wrap">
              <TraderDeckCalendarBar
                selectedDate={selectedDate}
                calendarMonth={calendarMonth}
                period={subTab}
                onPrevMonth={subTab === 'weekly' ? handlePrevWeek : handlePrevDay}
                onNextMonth={subTab === 'weekly' ? handleNextWeek : handleNextDay}
                onOpenCalendar={() => setCalendarOverlayOpen(true)}
              />
            </div>
            <div className="td-deck-header-line-right" aria-hidden="true" />
          </div>

          <div className="td-deck-below-header td-deck-tab-zone-period">
            <nav className="td-deck-sub-tabs td-deck-sub-tabs-under-left td-deck-period-segment" aria-label="Period">
              <button
                type="button"
                className={`td-deck-sub-tab${subTab === 'daily' ? ' td-deck-sub-tab--active' : ''}`}
                onClick={() => setSubTab('daily')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`td-deck-sub-tab${subTab === 'weekly' ? ' td-deck-sub-tab--active' : ''}`}
                onClick={() => setSubTab('weekly')}
              >
                Weekly
              </button>
            </nav>
          </div>
        </div>

        <div className="td-deck-content td-deck-content--modern">
          <div className="td-deck-content-box td-deck-content-box--modern journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
            <div className="td-deck-body td-deck-body-single">
              <main className="td-deck-main">
                <div className="td-deck-main-inner td-deck-main-inner--modern">
                  <div className="td-deck-main-stage">
                    <div className="td-deck-dashboard-wrap">
                      {mainTab === 'outlook' && (
                        <MarketOutlookView selectedDate={selectedDate} period={subTab} canEdit={canEdit} />
                      )}
                      {mainTab === 'intelligence' && (
                        <MarketIntelligenceBriefsView selectedDate={selectedDate} period={subTab} canEdit={canEdit} />
                      )}
                    </div>
                  </div>
                  <aside className="td-deck-rail" aria-label="Sessions and headlines">
                    <div className="td-deck-inbox-footer" aria-label="Sessions and headlines">
                      <div className="td-deck-inbox-footer-block td-deck-inbox-sessions">
                        <h2 className="td-deck-inbox-footer-title">Market sessions</h2>
                        <MarketSessionStatus />
                      </div>
                      <div className="td-deck-inbox-footer-block td-deck-inbox-headlines">
                        <NewsHeadlines />
                      </div>
                    </div>
                  </aside>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AuraTerminalThemeShell>
  );
}
