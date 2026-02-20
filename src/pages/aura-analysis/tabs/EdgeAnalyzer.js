import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

export default function EdgeAnalyzer() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Edge Analyzer</h1>
      <p className="aura-tab-sub">Setup performance, alignment, and session heatmaps</p>
      <div className="aura-tab-section">
        <h3>Setup Performance Comparison</h3>
        <div className="aura-tab-placeholder">Compare performance by setup type</div>
      </div>
      <div className="aura-tab-section">
        <h3>Model Expectancy</h3>
        <div className="aura-tab-placeholder">Expectancy by model/setup</div>
      </div>
      <div className="aura-tab-section">
        <h3>HTF Alignment vs Counter-Trend Stats</h3>
        <div className="aura-tab-placeholder">Higher timeframe aligned vs counter-trend performance</div>
      </div>
      <div className="aura-tab-section">
        <h3>News vs Non-News Performance</h3>
        <div className="aura-tab-placeholder">Trades during news vs quiet periods</div>
      </div>
      <div className="aura-tab-section">
        <h3>Scalping / Intraday / Swing Comparison</h3>
        <div className="aura-tab-placeholder">Performance by style (scalping, intraday, swing)</div>
      </div>
      <div className="aura-tab-section">
        <h3>Session Heatmaps</h3>
        <div className="aura-tab-placeholder">Profitability heatmap by session and pair</div>
      </div>
      <div className="aura-tab-section">
        <h3>Pair Profitability Ranking</h3>
        <div className="aura-tab-placeholder">Ranked list of pairs by P/L or expectancy</div>
      </div>
    </div>
  );
}
