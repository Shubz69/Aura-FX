import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

export default function CalendarIntelligence() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Calendar Intelligence</h1>
      <p className="aura-tab-sub">Monthly profit calendar and daily breakdown</p>
      <div className="aura-tab-section">
        <h3>Monthly Profit Calendar</h3>
        <div className="aura-tab-placeholder">Green / red / neutral days per month; clickable cells</div>
      </div>
      <div className="aura-tab-section">
        <h3>Daily Breakdown (on click)</h3>
        <div className="aura-tab-placeholder">P/L, RR, discipline score, mood, session stats for selected day</div>
      </div>
      <div className="aura-tab-section">
        <h3>Weekly Overlays</h3>
        <div className="aura-tab-placeholder">Weekly aggregates and overlays on calendar</div>
      </div>
    </div>
  );
}
