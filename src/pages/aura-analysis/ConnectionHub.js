import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAuraConnection, useCanEnterAuraDashboard } from '../../context/AuraConnectionContext';
import { isSuperAdmin } from '../../utils/roles';
import CosmicBackground from '../../components/CosmicBackground';
import AuraEnterTransition from '../../components/aura-analysis/AuraEnterTransition';
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

const PLATFORM_COLORS = {
  mt5: '#8b5cf6',
  mt4: '#6366f1',
  ctrader: '#3b82f6',
  dxtrade: '#10b981',
  tradovate: '#f59e0b',
  binance: '#fbbf24',
  bybit: '#6b7280',
  kraken: '#4f46e5',
  coinbase: '#2563eb',
};

// Particles component for background effect
const Particles = () => {
  const particlesRef = useRef(null);

  useEffect(() => {
    const particles = particlesRef.current;
    if (!particles) return;

    const particleCount = 50;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 15}s`;
      particle.style.animationDuration = `${10 + Math.random() * 10}s`;
      particles.appendChild(particle);
    }

    return () => {
      while (particles.firstChild) {
        particles.removeChild(particles.firstChild);
      }
    };
  }, []);

  return <div className="connection-hub-particles" ref={particlesRef} />;
};

export default function ConnectionHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { platforms, connections, getConnection, addConnection, removeConnection } = useAuraConnection();
  const canEnter = useCanEnterAuraDashboard(user);
  const superAdmin = user && isSuperAdmin(user);
  const [connecting, setConnecting] = useState(null);
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [successAnimation, setSuccessAnimation] = useState(null);

  const connectedCount = Object.keys(connections).length;

  const handleConnect = (platformId) => {
    setConnecting(platformId);
    
    // Simulate connection process
    setTimeout(() => {
      addConnection(platformId, {
        balance: 10000 + Math.floor(Math.random() * 50000),
        currency: 'USD',
        health: 'ok',
        lastSync: new Date().toISOString(),
        trades: Math.floor(Math.random() * 100),
        winRate: Math.floor(Math.random() * 30 + 60),
      });
      setConnecting(null);
      setSuccessAnimation(platformId);
      
      // Remove success animation after delay
      setTimeout(() => {
        setSuccessAnimation(null);
      }, 2000);
    }, 1500);
  };

  const handleEnterDashboard = () => {
    if (!canEnter) return;
    setTransitioning(true);
  };

  const handleTransitionComplete = () => {
    setTransitioning(false);
    navigate('/aura-analysis/dashboard/performance', { state: { fromTransition: true } });
  };

  // Format currency
  const formatCurrency = (value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="connection-hub-page">
      <Particles />
      {transitioning && (
        <AuraEnterTransition onComplete={handleTransitionComplete} />
      )}
      <CosmicBackground />
      
      <div className="connection-hub-container">
        <header className="connection-hub-header">
  <h1 className="connection-hub-title">
    Connection Hub
  </h1>
  <p className="connection-hub-sub">
    Securely connect your trading platforms to unlock unified analytics, 
    real-time sync, and AI-powered insights. All data remains encrypted 
    and under your control.
  </p>
</header>

        {/* Stats Strip */}
        {connectedCount > 0 && (
          <div className="connection-hub-stats-strip">
            <div className="hub-stat">
              <span className="hub-stat-number">{connectedCount}</span>
              <span className="hub-stat-label">Connected Platforms</span>
            </div>
            <div className="hub-stat">
              <span className="hub-stat-number">
                {Object.values(connections).reduce((sum, conn) => sum + (conn.balance || 0), 0) > 0 
                  ? '⟠' 
                  : '—'}
              </span>
              <span className="hub-stat-label">Total Value</span>
            </div>
            <div className="hub-stat">
              <span className="hub-stat-number">
                {Object.values(connections).filter(c => c.health === 'ok').length}
              </span>
              <span className="hub-stat-label">Healthy Connections</span>
            </div>
          </div>
        )}

        {/* Platform Grid Label */}
        <div className="connection-hub-section-label">
          <span>Available Platforms</span>
        </div>

        <section className="connection-hub-grid">
          {platforms.map((p) => {
            const conn = getConnection(p.id);
            const isConn = !!conn;
            const isConnecting = connecting === p.id;
            const showSuccess = successAnimation === p.id;
            
            return (
              <div 
                key={p.id} 
                className={`connection-card ${isConn ? 'connected' : ''} ${isConnecting ? 'connecting' : ''}`}
                onMouseEnter={() => setHoveredCard(p.id)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{ '--platform-color': PLATFORM_COLORS[p.id] || '#8b5cf6' }}
              >
                <div className="connection-card-header">
                  <span className="connection-card-icon">
                    {PLATFORM_ICONS[p.id] || '📊'}
                  </span>
                  <span className="connection-card-name">{p.name}</span>
                  <span className="connection-card-badge">{p.category}</span>
                </div>
                
                {isConn ? (
                  <>
                    <div className="connection-card-status">
                      <span className="status-dot ok" />
                      <span>Connected</span>
                      {conn.lastSync && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>
                          <i className="fas fa-sync-alt" style={{ marginRight: 4 }} />
                          {new Date(conn.lastSync).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    
                    <div className="connection-card-meta">
                      <span>
                        <i className="fas fa-wallet" />
                        Balance: {formatCurrency(conn.balance, conn.currency)}
                      </span>
                      <span>
                        <i className="fas fa-chart-line" />
                        Trades: {conn.trades || '—'}
                      </span>
                      <span>
                        <i className="fas fa-chart-pie" />
                        Win Rate: {conn.winRate ? `${conn.winRate}%` : '—'}
                      </span>
                      <span className="health">
                        <i className="fas fa-heartbeat" />
                        Health: <span className="health-ok">{conn.health}</span>
                      </span>
                    </div>
                    
                    <button
                      type="button"
                      className="connection-card-disconnect"
                      onClick={() => removeConnection(p.id)}
                    >
                      <i className="fas fa-unlink" style={{ marginRight: 8 }} />
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <div className="connection-card-status">
                      <span className="status-dot off" />
                      <span>Not connected</span>
                      {hoveredCard === p.id && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>
                          Click to connect
                        </span>
                      )}
                    </div>
                    
                    <div className="connection-card-meta">
                      <span>
                        <i className="fas fa-info-circle" />
                        Click connect to link {p.name}
                      </span>
                      <span>
                        <i className="fas fa-shield-alt" />
                        Encrypted connection
                      </span>
                      <span>
                        <i className="fas fa-bolt" />
                        Real-time sync ready
                      </span>
                    </div>
                    
                    <button
                      type="button"
                      className={`connection-card-connect ${isConnecting ? 'loading' : ''} ${showSuccess ? 'success' : ''}`}
                      onClick={() => handleConnect(p.id)}
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        'Connecting...'
                      ) : showSuccess ? (
                        <><i className="fas fa-check connection-success-icon" /> Connected!</>
                      ) : (
                        <>
                          <i className="fas fa-link" style={{ marginRight: 8 }} />
                          Connect Platform
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </section>

        <section className="connection-hub-enter">
          {superAdmin && connectedCount === 0 && (
            <div className="connection-hub-bypass-note">
              <i className="fas fa-crown" />
              <span>Super Admin: Test mode enabled — bypass connection requirement</span>
            </div>
          )}
          
          <button
            type="button"
            className="connection-hub-enter-btn"
            onClick={handleEnterDashboard}
            disabled={!canEnter}
          >
            <i className="fas fa-rocket" style={{ marginRight: 12 }} />
            Enter MT5 Dashboard
            <i className="fas fa-arrow-right" style={{ marginLeft: 12 }} />
          </button>
          
          {!canEnter && !superAdmin && (
            <p className="connection-hub-enter-hint">
              <i className="fas fa-lock" />
              Connect at least one platform to unlock analytics
              <i className="fas fa-chart-bar" style={{ marginLeft: 6 }} />
            </p>
          )}
          
          {canEnter && (
            <p className="connection-hub-enter-hint">
              <i className="fas fa-check-circle" style={{ color: '#10b981' }} />
              Ready to analyze — {connectedCount} platform{connectedCount !== 1 ? 's' : ''} connected
            </p>
          )}
        </section>
      </div>
    </div>
  );
}