import React from 'react';
import { useNavigate } from 'react-router-dom';
import CosmicBackground from '../../components/CosmicBackground';
import '../../styles/AuraAnalysisGateway.css';

export default function AuraAnalysisGateway() {
  const navigate = useNavigate();

  return (
    <div className="aura-gateway-page">
      <CosmicBackground />
      <div className="aura-gateway-inner">
        <header className="aura-gateway-header">
          <p className="aura-gateway-title">Aura Analysis</p>
          <h1 className="aura-gateway-headline">Choose your path</h1>
          <p className="aura-gateway-sub">
            Validate your trade setup or dive into AI-powered analytics and insights.
          </p>
        </header>

        <div className="aura-gateway-cards">
          <button
            type="button"
            className="aura-gateway-card"
            onClick={() => navigate('/aura-analysis/trade-validator', { state: { fromGateway: true } })}
            aria-label="Open Trade Validator"
          >
            <div className="aura-gateway-card-icon" aria-hidden>✓</div>
            <h2 className="aura-gateway-card-title">Trade Validator</h2>
            <p className="aura-gateway-card-desc">
              Run your trade through the confluence checklist and risk calculator. Log results and track PnL.
            </p>
            <span className="aura-gateway-card-cta">
              Enter <span aria-hidden>→</span>
            </span>
          </button>

          <button
            type="button"
            className="aura-gateway-card"
            onClick={() => navigate('/aura-analysis/ai')}
            aria-label="Open AI Analysis"
          >
            <div className="aura-gateway-card-icon" aria-hidden>◇</div>
            <h2 className="aura-gateway-card-title">AI Analysis</h2>
            <p className="aura-gateway-card-desc">
              Connect your platforms and unlock unified analytics, real-time sync, and AI-powered insights.
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
