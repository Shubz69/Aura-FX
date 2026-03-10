import React, { useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import CosmicBackground from '../../components/CosmicBackground';
import TraderDeckOverview from './TraderDeckOverview';
import MarketIntelligenceDashboard from './MarketIntelligenceDashboard';
import TraderDeckTradeJournal from './TraderDeckTradeJournal';
import TraderDeckProfile from './TraderDeckProfile';
import '../../styles/trader-deck/TraderDeckLayout.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'market-intelligence', label: 'Market Intelligence' },
  { id: 'trade-journal', label: 'Trade Journal' },
  { id: 'profile', label: 'Profile' },
];

export default function TraderDeckLayout({ initialTab = 'overview', onBack }) {
  const [activeTab, setActiveTab] = useState(initialTab);

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
                aria-label="Back to Trader Deck menu"
              >
                <FaArrowLeft aria-hidden /> Back
              </button>
            )}
            <h1 className="td-layout-title">Trader Deck</h1>
            <p className="td-layout-sub">Manual trade planning, validation and journaling tools</p>
          </header>

          <nav className="td-layout-tabs-wrap" aria-label="Trader Deck sections">
            <div className="td-layout-tabs-inner">
              {TABS.map((tab) => (
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

          <main className="td-layout-content">
            {activeTab === 'overview' && <TraderDeckOverview />}
            {activeTab === 'market-intelligence' && <MarketIntelligenceDashboard embedded />}
            {activeTab === 'trade-journal' && <TraderDeckTradeJournal />}
            {activeTab === 'profile' && <TraderDeckProfile />}
          </main>
        </div>
      </div>
    </div>
  );
}
