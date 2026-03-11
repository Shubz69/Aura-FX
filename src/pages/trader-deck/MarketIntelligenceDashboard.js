import React, { useState, useEffect } from 'react';
import CosmicBackground from '../../components/CosmicBackground';
import TraderDeckDashboardShell from '../../components/trader-deck/TraderDeckDashboardShell';
import DashboardPanel from '../../components/trader-deck/DashboardPanel';
import RegimeRows from '../../components/trader-deck/RegimeRows';
import MarketPulseGauge from '../../components/trader-deck/MarketPulseGauge';
import DriverList from '../../components/trader-deck/DriverList';
import SignalList from '../../components/trader-deck/SignalList';
import ChangeList from '../../components/trader-deck/ChangeList';
import FocusList from '../../components/trader-deck/FocusList';
import RiskRadarList from '../../components/trader-deck/RiskRadarList';
import { getMarketIntelligence, SEED_MARKET_INTELLIGENCE } from '../../data/marketIntelligence';
import '../../styles/TraderDeckMarket.css';

/**
 * Normalize API response for components: backend uses name/score/signal, we support both.
 */
function normalizeForUI(data) {
  if (!data) return null;
  const regime = data.marketRegime;
  const pulse = data.marketPulse;
  const drivers = (data.keyDrivers || []).map((d) => ({
    name: d.name || d.title,
    direction: d.direction || 'neutral',
    impact: d.impact,
  }));
  const signals = (data.crossAssetSignals || []).map((s) => ({
    asset: s.asset,
    signal: s.signal || s.label,
    direction: s.direction || 'neutral',
  }));
  return {
    marketRegime: regime,
    marketPulse: {
      score: pulse && (typeof pulse.score === 'number' ? pulse.score : pulse.value) != null
        ? (pulse.score ?? pulse.value)
        : 50,
      label: (pulse && pulse.label) || 'NEUTRAL',
    },
    keyDrivers: drivers,
    crossAssetSignals: signals,
    marketChangesToday: data.marketChangesToday || [],
    traderFocus: data.traderFocus || [],
    riskRadar: data.riskRadar || [],
    updatedAt: data.updatedAt,
  };
}

export default function MarketIntelligenceDashboard({ embedded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMarketIntelligence()
      .then((raw) => {
        const normalized = normalizeForUI(raw) || normalizeForUI(SEED_MARKET_INTELLIGENCE);
        setData(normalized);
      })
      .catch(() => {
        setData(normalizeForUI(SEED_MARKET_INTELLIGENCE));
        setError('Using fallback data');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) {
    if (embedded) {
      return (
        <div className="td-mi td-mi--embedded">
          <div className="td-mi-loading">
            <div className="td-mi-loading-pulse" aria-hidden />
            <p>Loading market intelligence…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="td-mi td-mi--page">
        <CosmicBackground />
        <div className="td-mi-loading td-mi-loading--page">
          <div className="td-mi-loading-pulse" aria-hidden />
          <p>Loading market intelligence…</p>
        </div>
      </div>
    );
  }

  const ui = data || normalizeForUI(SEED_MARKET_INTELLIGENCE);
  const {
    marketRegime,
    marketPulse,
    keyDrivers,
    crossAssetSignals,
    marketChangesToday,
    traderFocus,
    riskRadar,
    updatedAt,
  } = ui;

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  const content = (
    <>
      {error && (
        <p className="td-mi-fallback-msg" role="status">
          {error}
        </p>
      )}
      <TraderDeckDashboardShell title="Aurax Trader Deck Market Intelligence">
        {/* Top row: Market Regime (left) | Market Pulse (right) */}
        <DashboardPanel title="▲ Aurax Market Regime" className="td-mi-panel--regime">
          <RegimeRows regime={marketRegime} />
        </DashboardPanel>
        <DashboardPanel title="Aurax Market Pulse" className="td-mi-panel--pulse">
          <MarketPulseGauge score={marketPulse.score} label={marketPulse.label} />
        </DashboardPanel>

        {/* Middle row: 3 equal cards */}
        <DashboardPanel title="Key Market Drivers" className="td-mi-panel--drivers">
          <DriverList drivers={keyDrivers} />
        </DashboardPanel>
        <DashboardPanel title="Cross-Asset Signals" className="td-mi-panel--signals">
          <SignalList signals={crossAssetSignals} />
        </DashboardPanel>
        <DashboardPanel title="Market Change Today" className="td-mi-panel--changes">
          <ChangeList items={marketChangesToday} />
        </DashboardPanel>

        {/* Bottom row: 2 wide cards */}
        <DashboardPanel title="Trader Focus" wide className="td-mi-panel--focus">
          <FocusList items={traderFocus} />
        </DashboardPanel>
        <DashboardPanel title="Risk Radar" wide className="td-mi-panel--radar">
          <RiskRadarList items={riskRadar} />
        </DashboardPanel>
      </TraderDeckDashboardShell>
      {updatedLabel && (
        <p className="td-mi-updated">Updated {updatedLabel}</p>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="td-mi td-mi--embedded">
        {content}
      </div>
    );
  }

  return (
    <div className="td-mi td-mi--page">
      <CosmicBackground />
      <div className="td-mi-page-inner">
        {content}
      </div>
    </div>
  );
}
