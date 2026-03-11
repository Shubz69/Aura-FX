import React from 'react';
import CosmicBackground from '../components/CosmicBackground';
import MarketIntelligenceDashboard from './trader-deck/MarketIntelligenceDashboard';

export default function TraderDeck() {
  return (
    <div className="td-layout-page">
      <CosmicBackground />
      <MarketIntelligenceDashboard />
    </div>
  );
}
