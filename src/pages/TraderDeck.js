/**
 * Trader Desk route (/trader-deck). UI structure/CSS imports are presentation-only;
 * data flow: state here + Api.* in MarketOutlookView / MarketIntelligenceBriefsView.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';
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
import '../styles/trader-deck/TraderDeckWorldClocks.css';
import TraderDeckCalendar from '../components/trader-deck/TraderDeckCalendar';
import {
  TRADER_DESK_SESSIONS,
  isSessionOpen,
  getSessionCountdown,
  formatSessionEta,
} from '../utils/traderDeskSessions';

const today = () => new Date().toISOString().slice(0, 10);

function shiftIsoDate(dateStr, deltaDays) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

const SESSION_UI_TICK_MS = 30000;

// Combined component that pairs each session with its countdown
// Replace the MarketSessionsWithCountdowns component with this professional row layout
function MarketSessionsWithCountdowns() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), SESSION_UI_TICK_MS);
    return () => clearInterval(iv);
  }, []);
  const now = useMemo(() => Date.now(), [tick]);
  
  return (
    <div className="td-deck-sessions-row">
      {TRADER_DESK_SESSIONS.map((s) => {
        const open = isSessionOpen(s, now);
        const { ms, phrase } = getSessionCountdown(s, now);
        
        return (
          <div key={s.name} className="td-deck-session-tile">
            <div className="td-deck-session-tile-header">
              <span className={`td-deck-session-dot${open ? ' td-deck-session-dot--open' : ''}`} />
              <span className="td-deck-session-name">{s.name}</span>
              <span className={`td-deck-session-status${open ? ' td-deck-session-status--open' : ''}`}>
                {open ? '● OPEN' : '○ CLOSED'}
              </span>
            </div>
            <div className="td-deck-session-tile-countdown">
              <span className="td-deck-session-countdown-phrase">{phrase}</span>
              <span className="td-deck-session-countdown-eta">{formatSessionEta(ms)}</span>
            </div>
          </div>
        );
      })}
    </div>
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

  const datePickerBounds = useMemo(() => {
    const t = today();
    return { min: shiftIsoDate(t, -365), max: shiftIsoDate(t, 14) };
  }, []);

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
  }, []);

 return (
  <AuraTerminalThemeShell>
    <div className="td-layout-page td-deck-with-tabs" id="td-deck-top">

      {/* ✅ Overlay (tumhara feature) */}
      {calendarOverlayOpen && (
        <div className="td-deck-calendar-overlay" role="dialog" aria-modal="true">
          <div
            className="td-deck-calendar-overlay-backdrop"
            onClick={() => setCalendarOverlayOpen(false)}
          />
          <div className="td-deck-calendar-overlay-content">
            <TraderDeckCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              calendarMonth={calendarMonth}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
            />
            <button
              className="td-deck-calendar-overlay-close"
              onClick={() => setCalendarOverlayOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ✅ Main Layout */}
      <div className="td-deck-layout">

        {/* World Clocks */}
        <div className="td-deck-world-clocks-rail">
          <div className="td-deck-world-clocks-container">
            <TraderDeckWorldClocks />
          </div>
        </div>

        <div className="td-deck-tab-zone">

          {/* Header */}
          <header className="td-deck-header td-deck-header--tab-zone">
            <nav className="td-deck-header-left">
              <button
                className={`td-deck-tab${mainTab === 'outlook' ? ' td-deck-tab--active' : ''}`}
                onClick={() => setMainTab('outlook')}
              >
                MARKET OUTLOOK
              </button>
            </nav>

            <h1 className="td-deck-page-title">Trader Desk</h1>

            <nav className="td-deck-header-right">
              <button
                className={`td-deck-tab${mainTab === 'intelligence' ? ' td-deck-tab--active' : ''}`}
                onClick={() => setMainTab('intelligence')}
              >
                MARKET INTELLIGENCE
              </button>
            </nav>
          </header>

          {/* Calendar Bar */}
          <div className="td-deck-divider-row td-deck-tab-zone-calendar">
            <div className="td-deck-header-line-left" />
            <div className="td-deck-calendar-bar-wrap">
              <TraderDeckCalendarBar
                selectedDate={selectedDate}
                calendarMonth={calendarMonth}
                period={subTab}
                onPrevMonth={subTab === 'weekly' ? handlePrevWeek : handlePrevDay}
                onNextMonth={subTab === 'weekly' ? handleNextWeek : handleNextDay}
                onSelectDate={handleSelectDate}
                onOpenCalendar={() => setCalendarOverlayOpen(true)}
                dateMin={datePickerBounds.min}
                dateMax={datePickerBounds.max}
              />
            </div>
            <div className="td-deck-header-line-right" />
          </div>

          {/* Period Tabs + Sessions */}
          <div className="td-deck-below-header td-deck-period-stack">
            <div className="td-deck-period-row-main">
              <nav className="td-deck-sub-tabs">
                <button
                  className={`td-deck-sub-tab${subTab === 'daily' ? ' td-deck-sub-tab--active' : ''}`}
                  onClick={() => setSubTab('daily')}
                >
                  Daily
                </button>
                <button
                  className={`td-deck-sub-tab${subTab === 'weekly' ? ' td-deck-sub-tab--active' : ''}`}
                  onClick={() => setSubTab('weekly')}
                >
                  Weekly
                </button>
              </nav>
            </div>

            <MarketSessionsWithCountdowns />
          </div>

          {/* Main Content */}
          <div className="td-deck-content td-deck-content--modern">
            <div className="td-deck-content-box journal-glass-panel">
              <div className="td-deck-body">
                <main className="td-deck-main">
                  <div className="td-deck-main-inner">

                    <div className="td-deck-dashboard-wrap">
                      {mainTab === 'outlook' && (
                        <MarketOutlookView
                          selectedDate={selectedDate}
                          period={subTab}
                          canEdit={canEdit}
                        />
                      )}

                      {mainTab === 'intelligence' && (
                        <MarketIntelligenceBriefsView
                          selectedDate={selectedDate}
                          period={subTab}
                          canEdit={canEdit}
                        />
                      )}
                    </div>

                    <aside className="td-deck-rail">
                      <NewsHeadlines />
                    </aside>

                  </div>
                </main>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </AuraTerminalThemeShell>
);
}