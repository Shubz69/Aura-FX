import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

export default function ExecutionLab() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Execution Lab</h1>
      <p className="aura-tab-sub">Entry, stop, exit efficiency and slippage</p>
      <div className="aura-tab-section">
        <h3>Entry Efficiency</h3>
        <div className="aura-tab-placeholder">How often entries match plan; fill quality</div>
      </div>
      <div className="aura-tab-section">
        <h3>Stop Placement Efficiency</h3>
        <div className="aura-tab-placeholder">Stop hit rate vs logical invalidation</div>
      </div>
      <div className="aura-tab-section">
        <h3>Exit Efficiency</h3>
        <div className="aura-tab-placeholder">Target vs trailing vs manual exit performance</div>
      </div>
      <div className="aura-tab-section">
        <h3>Slippage Analysis</h3>
        <div className="aura-tab-placeholder">Slippage distribution and impact on P/L</div>
      </div>
      <div className="aura-tab-section">
        <h3>Spread Impact</h3>
        <div className="aura-tab-placeholder">Cost of spread by pair and session</div>
      </div>
      <div className="aura-tab-section">
        <h3>Premature Exit Detection</h3>
        <div className="aura-tab-placeholder">Exits that closed before target or stop</div>
      </div>
    </div>
  );
}
