import React, { useState, useMemo, useCallback } from 'react';
import CosmicBackground from '../components/CosmicBackground';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';
import TraderDeckCalendar from '../components/trader-deck/TraderDeckCalendar';
import TraderDeckCalendarBar from '../components/trader-deck/TraderDeckCalendarBar';
import MarketOutlookView from './trader-deck/MarketOutlookView';
import MarketIntelligenceBriefsView from './trader-deck/MarketIntelligenceBriefsView';
import '../styles/Journal.css';
import '../styles/TraderDeckMarket.css';
import '../styles/TraderDeckTabs.css';

const today = () => new Date().toISOString().slice(0, 10);

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
    <div className="td-layout-page td-deck-with-tabs">
      <CosmicBackground />

      {/* Full-screen calendar overlay: click bar to open, pick date to close */}
      {calendarOverlayOpen && (
        <div
          className="td-deck-calendar-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pick a date"
        >
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
            <button
              type="button"
              className="td-deck-calendar-overlay-close"
              onClick={() => setCalendarOverlayOpen(false)}
              aria-label="Close calendar"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="td-deck-layout">
        {/* Header: MARKET OUTLOOK (left) | Trader Desk (center) | MARKET INTELLIGENCE (right) */}
        <header className="td-deck-header">
          <nav className="td-deck-header-nav td-deck-header-left" aria-label="Trader Desk sections">
            <button
              type="button"
              className={`td-deck-tab${mainTab === 'outlook' ? ' td-deck-tab--active' : ''}`}
              onClick={() => setMainTab('outlook')}
            >
              MARKET OUTLOOK
            </button>
          </nav>
          <h1 className="td-deck-page-title">Trader Desk</h1>
          <nav className="td-deck-header-nav td-deck-header-right" aria-label="Trader Desk sections">
            <button
              type="button"
              className={`td-deck-tab${mainTab === 'intelligence' ? ' td-deck-tab--active' : ''}`}
              onClick={() => setMainTab('intelligence')}
            >
              MARKET INTELLIGENCE
            </button>
          </nav>
        </header>

        {/* Line under header */}
        <div className="td-deck-header-line" />

        {/* Compact calendar bar: centered. Daily = full date, Weekly = week range (e.g. 20th - 27th March 2026). Click opens full calendar. */}
        <div className="td-deck-calendar-bar-wrap">
          <nav className="td-deck-sub-tabs td-deck-sub-tabs-left" aria-label="Period">
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
          <TraderDeckCalendarBar
            selectedDate={selectedDate}
            calendarMonth={calendarMonth}
            period={subTab}
            onPrevMonth={subTab === 'weekly' ? handlePrevWeek : handlePrevMonth}
            onNextMonth={subTab === 'weekly' ? handleNextWeek : handleNextMonth}
            onOpenCalendar={() => setCalendarOverlayOpen(true)}
          />
        </div>

        {/* Content area: one full-width box, Market Outlook / Intelligence inside */}
        <div className="td-deck-content">
          <div className="td-deck-content-box">
            <div className="td-deck-body td-deck-body-single">
              <main className="td-deck-main">
                <div className="td-deck-main-inner">
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
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
