import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

export default function PsychologyDiscipline() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Psychology & Discipline</h1>
      <p className="aura-tab-sub">Rule adherence, mood, and behavioural patterns</p>
      <div className="aura-tab-section">
        <h3>Rule Adherence Percentage</h3>
        <div className="aura-tab-placeholder">% of trades that followed plan/rules</div>
      </div>
      <div className="aura-tab-section">
        <h3>Emotional Volatility Index</h3>
        <div className="aura-tab-placeholder">Volatility in behaviour or sizing linked to emotions</div>
      </div>
      <div className="aura-tab-section">
        <h3>Mood vs Performance Correlation</h3>
        <div className="aura-tab-placeholder">Journal mood vs P/L correlation</div>
      </div>
      <div className="aura-tab-section">
        <h3>Revenge Trading Detection</h3>
        <div className="aura-tab-placeholder">Flags for trades after losses (revenge patterns)</div>
      </div>
      <div className="aura-tab-section">
        <h3>Oversizing Alerts</h3>
        <div className="aura-tab-placeholder">Alerts when position size exceeded plan</div>
      </div>
      <div className="aura-tab-section">
        <h3>Behavioural Pattern Tracking</h3>
        <div className="aura-tab-placeholder">Recurring behavioural patterns over time</div>
      </div>
    </div>
  );
}
