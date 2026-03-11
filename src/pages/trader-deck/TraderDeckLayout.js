import React, { useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import CosmicBackground from '../../components/CosmicBackground';
import TraderDeckOverview from './TraderDeckOverview';
import MarketIntelligenceDashboard from './MarketIntelligenceDashboard';
import TraderDeckTradeJournal from './TraderDeckTradeJournal';
import '../../styles/trader-deck/TraderDeckLayout.css';

const MAIN_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'market-intelligence', label: 'Market Intelligence' },
  { id: 'trade-journal', label: 'Trade Journal' },
];

const OVERVIEW_SEMI = [
  { id: 'glance', label: 'At a glance' },
  { id: 'calendar', label: 'Calendar' },
];

const MI_SEMI = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'signals', label: 'Signals' },
];

export default function TraderDeckLayout({ initialTab = 'overview', onBack }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [overviewSemi, setOverviewSemi] = useState('glance');
  const [miSemi, setMiSemi] = useState('dashboard');

  const showOverviewSemi = activeTab === 'overview';
  const showMiSemi = activeTab === 'market-intelligence';

  return (
    <div className="td-layout-page">
      <CosmicBackground />
      <div className="td-layout-dashboard">
        <div className="td-layout-shell">
          <header className="td-layout-header">
            {onBack && (
              <button
                type="button"
                className="td-layout-back"
                onClick={onBack}
                aria-label="Back to Trader Desk menu"
              >
                <FaArrowLeft aria-hidden /> Back
              </button>
            )}
            <h1 className="td-layout-title">Trader Deck</h1>
            <p className="td-layout-sub">Manual trade planning, validation and journaling tools</p>
          </header>

          <nav className="td-layout-tabs-wrap" aria-label="Trader Desk sections">
            <div className="td-layout-tabs-inner">
              {MAIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`td-layout-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {showOverviewSemi && (
            <nav className="td-layout-semi-wrap" aria-label="Overview sub-sections">
              <div className="td-layout-semi-inner">
                {OVERVIEW_SEMI.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`td-layout-semi-tab ${overviewSemi === s.id ? 'active' : ''}`}
                    onClick={() => setOverviewSemi(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </nav>
          )}

          {showMiSemi && (
            <nav className="td-layout-semi-wrap" aria-label="Market Intelligence sub-sections">
              <div className="td-layout-semi-inner">
                {MI_SEMI.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`td-layout-semi-tab ${miSemi === s.id ? 'active' : ''}`}
                    onClick={() => setMiSemi(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </nav>
          )}

          <main className="td-layout-content">
            {activeTab === 'overview' && (
              <TraderDeckOverview mode={overviewSemi} />
            )}
            {activeTab === 'market-intelligence' && (
              <MarketIntelligenceDashboard embedded mode={miSemi} />
            )}
            {activeTab === 'trade-journal' && <TraderDeckTradeJournal />}
          </main>
        </div>
      </div>
    </div>
  );
}
