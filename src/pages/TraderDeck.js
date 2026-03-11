import React, { useState } from 'react';
import CosmicBackground from '../components/CosmicBackground';
import TraderDeckGateway from './trader-deck/TraderDeckGateway';
import TraderDeckLayout from './trader-deck/TraderDeckLayout';

export default function TraderDeck() {
  const [showGateway, setShowGateway] = useState(true);
  const [initialTab, setInitialTab] = useState('overview');

  const handleGatewaySelect = (tab) => {
    setInitialTab(tab);
    setShowGateway(false);
  };

  if (showGateway) {
    return (
      <div className="td-layout-page">
        <CosmicBackground />
        <div className="td-layout-dashboard">
          <div className="td-layout-shell">
            <header className="td-layout-header">
              <h1 className="td-layout-title">Trader Deck</h1>
            </header>
            <main className="td-layout-content">
              <TraderDeckGateway onSelect={handleGatewaySelect} />
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TraderDeckLayout
      initialTab={initialTab}
      onBack={() => setShowGateway(true)}
    />
  );
}
