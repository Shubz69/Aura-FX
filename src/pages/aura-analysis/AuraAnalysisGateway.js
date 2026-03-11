import React from 'react';
import { useNavigate } from 'react-router-dom';
import CosmicBackground from '../../components/CosmicBackground';
import '../../styles/AuraAnalysisGateway.css';

/** Aura Analysis = MT5 only. This gateway is not used in routes (index redirects to /aura-analysis/ai). */
export default function AuraAnalysisGateway() {
  const navigate = useNavigate();

  return (
    <div className="aura-gateway-page">
      <CosmicBackground />
      <div className="aura-gateway-inner">
        <header className="aura-gateway-header">
          <p className="aura-gateway-title">Aura Analysis</p>
          <h1 className="aura-gateway-headline">MT5 Dashboard</h1>
          <p className="aura-gateway-sub">
            Connect your platforms and unlock unified analytics, real-time sync, and AI-powered insights.
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
              Connect MT5 and other platforms. Enter the dashboard for metrics, performance, and AI insights.
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
