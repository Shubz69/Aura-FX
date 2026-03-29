import React from 'react';
import { useNavigate } from 'react-router-dom';
import CosmicBackground from '../../components/CosmicBackground';
import '../../styles/AuraAnalysisGateway.css';

/** Optional entry screen; main app redirects to /aura-analysis/ai (Connection Hub). MetaTrader 4 & 5 only. */
export default function AuraAnalysisGateway() {
  const navigate = useNavigate();

  return (
    <div className="aura-gateway-page">
      <CosmicBackground />
      <div className="aura-gateway-inner">
        <header className="aura-gateway-header">
          <p className="aura-gateway-title">Aura Analysis</p>
          <h1 className="aura-gateway-headline">MetaTrader analytics</h1>
          <p className="aura-gateway-sub">
            Secure MetaTrader 4 or 5 via read-only investor access — performance analytics, account insights, and AI-powered reporting.
          </p>
        </header>

        <div className="aura-gateway-cards">
          <button
            type="button"
            className="aura-gateway-card"
            onClick={() => navigate('/aura-analysis/ai')}
            aria-label="Open Connection Hub"
          >
            <div className="aura-gateway-card-icon" aria-hidden>◇</div>
            <h2 className="aura-gateway-card-title">Connection Hub</h2>
            <p className="aura-gateway-card-desc">
              Connect MT4 or MT5 with encrypted investor credentials, then open the dashboard for metrics and insights.
            </p>
            <span className="aura-gateway-card-cta">
              Enter <span aria-hidden>→</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
