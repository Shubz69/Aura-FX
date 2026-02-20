import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

export default function PerformanceAnalytics() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Performance Analytics</h1>
      <p className="aura-tab-sub">Equity curve, breakdowns, and streak tracking</p>
      <div className="aura-tab-section">
        <h3>Equity Curve</h3>
        <div className="aura-tab-placeholder">Equity curve chart (time series)</div>
      </div>
      <div className="aura-tab-section">
        <h3>Daily / Weekly / Monthly Breakdown</h3>
        <div className="aura-tab-placeholder">Period breakdown tables and charts</div>
      </div>
      <div className="aura-tab-section">
        <h3>Pair Performance</h3>
        <div className="aura-tab-placeholder">Performance by symbol/pair</div>
      </div>
      <div className="aura-tab-section">
        <h3>Session Analysis</h3>
        <div className="aura-tab-placeholder">Session (London, NY, Asian) profitability</div>
      </div>
      <div className="aura-tab-section">
        <h3>Weekday & Time-of-Day Profitability</h3>
        <div className="aura-tab-placeholder">Heatmap or table by weekday and hour</div>
      </div>
      <div className="aura-tab-section">
        <h3>Trade Distribution & Streak Tracking</h3>
        <div className="aura-tab-placeholder">Win/loss distribution and streak stats</div>
      </div>
    </div>
  );
}
