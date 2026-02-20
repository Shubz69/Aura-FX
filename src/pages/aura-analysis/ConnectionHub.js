import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAuraConnection, useCanEnterAuraDashboard } from '../../context/AuraConnectionContext';
import { isSuperAdmin } from '../../utils/roles';
import CosmicBackground from '../../components/CosmicBackground';
import '../../styles/aura-analysis/ConnectionHub.css';

const PLATFORM_ICONS = {
  mt5: '📊',
  mt4: '📈',
  ctrader: '🖥️',
  dxtrade: '💹',
  tradovate: '📉',
  binance: '🟡',
  bybit: '⚫',
  kraken: '🔵',
  coinbase: '🔵',
};

export default function ConnectionHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { platforms, connections, getConnection, addConnection, removeConnection } = useAuraConnection();
  const canEnter = useCanEnterAuraDashboard(user);
  const superAdmin = user && isSuperAdmin(user);
  const [connecting, setConnecting] = useState(null);

  const handleConnect = (platformId) => {
    setConnecting(platformId);
    setTimeout(() => {
      addConnection(platformId, {
        balance: 10000 + Math.floor(Math.random() * 50000),
        currency: 'USD',
        health: 'ok',
      });
      setConnecting(null);
    }, 1200);
  };

  const handleEnterDashboard = () => {
    if (!canEnter) return;
    navigate('/aura-analysis/dashboard/overview');
  };

  return (
    <div className="connection-hub-page">
      <CosmicBackground />
      <div className="connection-hub-container">
        <header className="connection-hub-header">
          <h1 className="connection-hub-title">Connection Hub</h1>
          <p className="connection-hub-sub">
            Connect your trading platforms for secure, unified analytics. Data stays encrypted and synced.
          </p>
        </header>

        <section className="connection-hub-grid">
          {platforms.map((p) => {
            const conn = getConnection(p.id);
            const isConn = !!conn;
            return (
              <div key={p.id} className={`connection-card ${isConn ? 'connected' : ''}`}>
                <div className="connection-card-header">
                  <span className="connection-card-icon">{PLATFORM_ICONS[p.id] || '📊'}</span>
                  <span className="connection-card-name">{p.name}</span>
                  <span className="connection-card-badge">{p.category}</span>
                </div>
                {isConn ? (
                  <>
                    <div className="connection-card-status">
                      <span className="status-dot ok" /> Connected
                    </div>
                    <div className="connection-card-meta">
                      <span>Last sync: {conn.lastSync ? new Date(conn.lastSync).toLocaleString() : '—'}</span>
                      <span>Balance: {conn.currency} {Number(conn.balance).toLocaleString()}</span>
                      <span className="health">Health: <span className="health-ok">{conn.health}</span></span>
                    </div>
                    <button
                      type="button"
                      className="connection-card-disconnect"
                      onClick={() => removeConnection(p.id)}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <div className="connection-card-status">
                      <span className="status-dot off" /> Not connected
                    </div>
                    <button
                      type="button"
                      className="connection-card-connect"
                      onClick={() => handleConnect(p.id)}
                      disabled={connecting === p.id}
                    >
                      {connecting === p.id ? 'Connecting…' : 'Connect'}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </section>

        <section className="connection-hub-enter">
          {superAdmin && !connections.length && (
            <p className="connection-hub-bypass-note">
              Super Admin: You can enter Aura Analysis without a connected account for testing.
            </p>
          )}
          <button
            type="button"
            className="connection-hub-enter-btn"
            onClick={handleEnterDashboard}
            disabled={!canEnter}
          >
            Enter Aura Analysis
          </button>
          {!canEnter && !superAdmin && (
            <p className="connection-hub-enter-hint">Connect at least one account to access analytics.</p>
          )}
        </section>
      </div>
    </div>
  );
}
