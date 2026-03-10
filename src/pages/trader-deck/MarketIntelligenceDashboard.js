import React, { useState, useEffect } from 'react';
import CosmicBackground from '../../components/CosmicBackground';
import { getMarketIntelligence, SEED_MARKET_INTELLIGENCE } from '../../data/marketIntelligence';
import '../../styles/TraderDeckMarket.css';

function Arrow({ direction }) {
  const d = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '◆';
  return <span className={`td-arrow td-arrow--${direction}`} aria-hidden>{d}</span>;
}

function MarketPulseGauge({ value, label }) {
  const rotation = -90 + (Number(value) / 100) * 90;
  const badgeClass = value <= 33 ? 'risk-off' : value <= 66 ? 'neutral' : 'risk-on';
  return (
    <div className="td-gauge-wrap">
      <div className="td-gauge" aria-hidden>
        <div className="td-gauge-arc" />
        <div className="td-gauge-arc-fill" />
        <div
          className="td-gauge-needle"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <div className="td-gauge-labels">
        <span>Risk Off</span>
        <span>Neutral</span>
        <span>Risk On</span>
      </div>
      <span className={`td-gauge-badge td-gauge-badge--${badgeClass}`}>{label}</span>
    </div>
  );
}

function DashboardCard({ title, children, className = '', wide }) {
  return (
    <section className={`td-card ${wide ? 'td-card--wide' : ''} ${className}`}>
      <h2 className="td-card-title">{title}</h2>
      <div className="td-card-body">{children}</div>
    </section>
  );
}

function RegimeRow({ label, value }) {
  return (
    <div className="td-regime-row">
      <span className="td-regime-label">{label}</span>
      <span className="td-regime-value">{value}</span>
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
      <div className="td-page">
        <CosmicBackground />
        <div className="td-dashboard">
          <div className="td-dashboard-shell">
            <header className="td-header">
              <h1>Market Intelligence</h1>
              <p>Loading…</p>
            </header>
          </div>
        </div>
      </div>
    );
  }

  const {
    marketRegime,
    marketPulse,
    keyDrivers = [],
    crossAssetSignals = [],
    marketChangesToday = [],
    traderFocus = [],
    riskRadar = [],
    updatedAt,
  } = data;

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="td-page">
      <CosmicBackground />
      <div className="td-dashboard">
        <div className="td-dashboard-shell">
          <header className="td-header">
            <h1>Market Intelligence Dashboard</h1>
            <p>
              At-a-glance regime, pulse, drivers, and risk.
              {updatedLabel && <span className="td-header-updated"> · Updated {updatedLabel}</span>}
            </p>
          </header>

          <div className="td-grid">
            {/* Row 1: Market Regime (large) | Market Pulse */}
            <DashboardCard title="Market Regime" className="td-card--regime">
              <RegimeRow label="Current Regime" value={marketRegime.currentRegime} />
              <RegimeRow label="Primary Driver" value={marketRegime.primaryDriver} />
              <RegimeRow label="Secondary Driver" value={marketRegime.secondaryDriver} />
              <RegimeRow label="Market Sentiment" value={marketRegime.marketSentiment} />
            </DashboardCard>

            <DashboardCard title="Market Pulse" className="td-card--pulse">
              <MarketPulseGauge value={marketPulse.value} label={marketPulse.label} />
            </DashboardCard>

            {/* Row 2: Key Market Drivers | Cross-Asset Signals | Market Change Today */}
            <DashboardCard title="Key Market Drivers" className="td-card--drivers">
              <ul className="td-list">
                {keyDrivers.map((d, i) => (
                  <li key={i}>
                    <Arrow direction={d.direction} />
                    <span className="td-list-label">{d.title}</span>
                    <span className="td-list-meta">{d.impact} Impact</span>
                  </li>
                ))}
              </ul>
            </DashboardCard>

            <DashboardCard title="Cross-Asset Signals" className="td-card--signals">
              <ul className="td-list">
                {crossAssetSignals.map((s, i) => (
                  <li key={i}>
                    <Arrow direction={s.direction} />
                    <span className="td-list-label">{s.asset}</span>
                    <span className="td-list-meta">{s.label}</span>
                  </li>
                ))}
              </ul>
            </DashboardCard>

            <DashboardCard title="Market Change Today" className="td-card--changes">
              <ul className="td-bullets">
                {marketChangesToday.length
                  ? marketChangesToday.map((item, i) => (
                      <li key={i}>{typeof item === 'string' ? item : item.title || item.description}</li>
                    ))
                  : <li className="td-empty">No themes yet</li>}
              </ul>
            </DashboardCard>

            {/* Row 3: Trader Focus | Risk Radar (wide) */}
            <DashboardCard title="Trader Focus" wide className="td-card--focus">
              <ul className="td-bullets">
                {traderFocus.length
                  ? traderFocus.map((item, i) => (
                      <li key={i}>{typeof item === 'string' ? item : item.text || item.title}</li>
                    ))
                  : <li className="td-empty">No focus items yet</li>}
              </ul>
            </DashboardCard>

            <DashboardCard title="Risk Radar" wide className="td-card--radar">
              <ul className="td-bullets">
                {riskRadar.length
                  ? riskRadar.map((item, i) => (
                      <li key={i}>{typeof item === 'string' ? item : item.text || item.title}</li>
                    ))
                  : <li className="td-empty">No upcoming events</li>}
              </ul>
            </DashboardCard>
          </div>
        </div>
      </div>
    </div>
  );
}
