import React, { useState, useMemo, useCallback } from 'react';
import CosmicBackground from '../components/CosmicBackground';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';
import TraderDeckCalendar from '../components/trader-deck/TraderDeckCalendar';
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

  const datesWithContent = useMemo(() => ({}), []);

  return (
    <div className="td-layout-page td-deck-with-tabs">
      <CosmicBackground />
      <div className="td-deck-layout">
        {/* Main tabs */}
        <header className="td-deck-main-tabs">
          <h1 className="td-deck-page-title">Trader Desk</h1>
          <nav className="td-deck-tabs" aria-label="Trader Desk sections">
            <button
              type="button"
              className={`td-deck-tab${mainTab === 'outlook' ? ' td-deck-tab--active' : ''}`}
              onClick={() => setMainTab('outlook')}
            >
              Market Outlook
            </button>
            <button
              type="button"
              className={`td-deck-tab${mainTab === 'intelligence' ? ' td-deck-tab--active' : ''}`}
              onClick={() => setMainTab('intelligence')}
            >
              Market Intelligence
            </button>
          </nav>
        </header>

        {/* Sub-tabs */}
        <div className="td-deck-sub-tabs-wrap">
          <nav className="td-deck-sub-tabs" aria-label="Period">
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

        <div className="td-deck-body">
          {/* Sidebar: calendar (same UI/UX as Journal) */}
          <aside className="td-deck-sidebar">
            <div className="td-deck-sidebar-inner">
              <TraderDeckCalendar
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                calendarMonth={calendarMonth}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                datesWithContent={datesWithContent}
              />
            </div>
          </aside>

          {/* Main content */}
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
  );
}
