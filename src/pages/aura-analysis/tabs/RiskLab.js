import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

export default function RiskLab() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Risk Lab</h1>
      <p className="aura-tab-sub">Drawdown, risk consistency, and compliance</p>
      <div className="aura-tab-section">
        <h3>Absolute & Relative Drawdown</h3>
        <div className="aura-tab-placeholder">Current and peak-to-trough drawdown metrics</div>
      </div>
      <div className="aura-tab-section">
        <h3>Historical Drawdown</h3>
        <div className="aura-tab-placeholder">Drawdown over time and recovery periods</div>
      </div>
      <div className="aura-tab-section">
        <h3>Risk Consistency Tracking</h3>
        <div className="aura-tab-placeholder">Consistency of position sizing and risk per trade</div>
      </div>
      <div className="aura-tab-section">
        <h3>Position Sizing Deviation</h3>
        <div className="aura-tab-placeholder">Deviation from target risk per trade</div>
      </div>
      <div className="aura-tab-section">
        <h3>Risk-of-Ruin Calculation</h3>
        <div className="aura-tab-placeholder">Probability of ruin under current strategy</div>
      </div>
      <div className="aura-tab-section">
        <h3>Stress Testing</h3>
        <div className="aura-tab-placeholder">Scenario and stress test results</div>
      </div>
      <div className="aura-tab-section">
        <h3>Prop-Firm Rule Compliance</h3>
        <div className="aura-tab-placeholder">Daily loss, max drawdown, and rule monitoring</div>
      </div>
    </div>
  );
}
