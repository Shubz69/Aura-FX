import React, { useState, useEffect } from 'react';
import CosmicBackground from '../../components/CosmicBackground';
import { getMarketIntelligence, SEED_MARKET_INTELLIGENCE } from '../../data/marketIntelligence';
import '../../styles/TraderDeckMarket.css';

function Arrow({ direction }) {
  const d = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '◆';
  return <span className={`td-market-arrow ${direction}`}>{d}</span>;
}

function MarketPulseGauge({ value, label }) {
  const rotation = -90 + (Number(value) / 100) * 90;
  const badgeClass = value <= 33 ? 'risk-off' : value <= 66 ? 'neutral' : 'risk-on';
  return (
    <div className="td-market-gauge-wrap">
      <div className="td-market-gauge">
        <div className="td-market-gauge-arc" />
        <div className="td-market-gauge-arc-fill" />
        <div
          className="td-market-gauge-needle"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <div className="td-market-gauge-labels">
        <span>Risk Off</span>
        <span>Risk On</span>
      </div>
      <span className={`td-market-pulse-badge ${badgeClass}`}>{label}</span>
    </div>
  );
}

export default function MarketIntelligenceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMarketIntelligence()
      .then(setData)
      .catch(() => setData(SEED_MARKET_INTELLIGENCE))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="td-market-page">
        <CosmicBackground />
        <div className="td-market-inner">
          <div className="td-market-header">
            <h1>Market Intelligence</h1>
            <p>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  const { marketRegime, marketPulse, keyDrivers, crossAssetSignals, marketChangesToday, traderFocus, riskRadar, updatedAt } = data;

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="td-market-page">
      <CosmicBackground />
      <div className="td-market-inner">
        <header className="td-market-header">
          <h1>Market Intelligence Dashboard</h1>
          <p>
            At-a-glance regime, pulse, drivers, and risk.
            {updatedLabel && <span className="td-market-updated"> · Updated {updatedLabel}</span>}
          </p>
        </header>

        <div className="td-market-grid">
          {/* 1. Market Regime */}
          <div className="td-market-panel">
            <h2 className="td-market-panel-title">Aurax Market Regime</h2>
            <div className="td-market-regime-row">
              <span>Current Regime</span>
              <span>{marketRegime.currentRegime}</span>
            </div>
            <div className="td-market-regime-row">
              <span>Primary Driver</span>
              <span>{marketRegime.primaryDriver}</span>
            </div>
            <div className="td-market-regime-row">
              <span>Secondary Driver</span>
              <span>{marketRegime.secondaryDriver}</span>
            </div>
            <div className="td-market-regime-row">
              <span>Market Sentiment</span>
              <span>{marketRegime.marketSentiment}</span>
            </div>
          </div>

          {/* 2. Market Pulse */}
          <div className="td-market-panel">
            <h2 className="td-market-panel-title">Aurax Market Pulse</h2>
            <MarketPulseGauge value={marketPulse.value} label={marketPulse.label} />
          </div>

          {/* 3. Key Market Drivers */}
          <div className="td-market-panel td-market-span-2">
            <h2 className="td-market-panel-title">Key Market Drivers</h2>
            <ul className="td-market-list">
              {keyDrivers.map((d, i) => (
                <li key={i}>
                  <Arrow direction={d.direction} />
                  <span className="label">{d.title}</span>
                  <span className="meta">{d.impact} Impact</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 4. Cross-Asset Signals */}
          <div className="td-market-panel">
            <h2 className="td-market-panel-title">Cross-Asset Signals</h2>
            <ul className="td-market-list">
              {crossAssetSignals.map((s, i) => (
                <li key={i}>
                  <Arrow direction={s.direction} />
                  <span className="label">{s.asset}</span>
                  <span className="meta">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 5. Market Change Today */}
          <div className="td-market-panel">
            <h2 className="td-market-panel-title">Market Change Today</h2>
            <ul className="td-market-bullets">
              {marketChangesToday.map((item, i) => (
                <li key={i}>{typeof item === 'string' ? item : item.title || item.description}</li>
              ))}
            </ul>
          </div>

          {/* 6. Trader Focus */}
          <div className="td-market-panel">
            <h2 className="td-market-panel-title">Trader Focus</h2>
            <ul className="td-market-bullets">
              {traderFocus.map((item, i) => (
                <li key={i}>{typeof item === 'string' ? item : item.text || item.title}</li>
              ))}
            </ul>
          </div>

          {/* 7. Risk Radar */}
          <div className="td-market-panel">
            <h2 className="td-market-panel-title">Risk Radar</h2>
            <ul className="td-market-bullets">
              {riskRadar.map((item, i) => (
                <li key={i}>{typeof item === 'string' ? item : item.text || item.title}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
