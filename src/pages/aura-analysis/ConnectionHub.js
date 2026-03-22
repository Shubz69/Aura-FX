import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAuraConnection, useCanEnterAuraDashboard } from '../../context/AuraConnectionContext';
import { isSuperAdmin } from '../../utils/roles';
import CosmicBackground from '../../components/CosmicBackground';
import AuraEnterTransition from '../../components/aura-analysis/AuraEnterTransition';
import '../../styles/aura-analysis/ConnectionHub.css';

// ── Credential Modal ────────────────────────────────────────────────────────
function ConnectModal({ platform, onClose, onSubmit, connecting, error }) {
  const [fields, setFields] = useState({});
  const [showSecret, setShowSecret] = useState({});

  const handleChange = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(fields);
  };

  return (
    <div className="chub-modal-overlay" onClick={onClose}>
      <div className="chub-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chub-modal-header">
          <span className="chub-modal-icon">{PLATFORM_ICONS[platform.id] || '📊'}</span>
          <div>
            <div className="chub-modal-title">Connect {platform.name}</div>
            <div className="chub-modal-sub">Enter your credentials — encrypted before storage</div>
          </div>
          <button className="chub-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {(platform.id === 'mt5' || platform.id === 'mt4') && (
          <div className="chub-modal-info">
            <i className="fas fa-info-circle" />
            <span>Uses <strong>MetaAPI</strong>. Get your Account ID + API Token from <a href="https://app.metaapi.cloud" target="_blank" rel="noopener noreferrer">app.metaapi.cloud</a></span>
          </div>
        )}

        <form className="chub-modal-form" onSubmit={handleSubmit}>
          {platform.fields.map((f) => (
            <div className="chub-modal-field" key={f.key}>
              <label>{f.label}</label>
              <div className="chub-modal-input-wrap">
                <input
                  type={f.secret && !showSecret[f.key] ? 'password' : 'text'}
                  placeholder={f.placeholder}
                  value={fields[f.key] || ''}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  required
                  autoComplete="off"
                />
                {f.secret && (
                  <button
                    type="button"
                    className="chub-modal-eye"
                    onClick={() => setShowSecret((p) => ({ ...p, [f.key]: !p[f.key] }))}
                    tabIndex={-1}
                  >
                    <i className={`fas fa-eye${showSecret[f.key] ? '-slash' : ''}`} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="chub-modal-error">
              <i className="fas fa-exclamation-triangle" /> {error}
            </div>
          )}

          <button
            type="submit"
            className={`chub-modal-submit${connecting ? ' loading' : ''}`}
            disabled={connecting}
          >
            {connecting ? (
              <><i className="fas fa-spinner fa-spin" /> Connecting…</>
            ) : (
              <><i className="fas fa-link" /> Connect {platform.name}</>
            )}
          </button>
        </form>

        <div className="chub-modal-security">
          <i className="fas fa-lock" />
          <span>Credentials are AES-256-GCM encrypted and never exposed to the client</span>
        </div>
      </div>
    </div>
  );
}

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
  mt5: '#eaa960',
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
  const { platforms, connections, getConnection, connectPlatform, disconnectPlatform } = useAuraConnection();
  const canEnter = useCanEnterAuraDashboard(user);
  const superAdmin = user && isSuperAdmin(user);
  const [modalPlatform, setModalPlatform] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [successPlatform, setSuccessPlatform] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  const connectedCount = connections.length;

  const openModal = (platform) => {
    setConnectError('');
    setModalPlatform(platform);
  };

  const handleModalSubmit = async (fields) => {
    setConnecting(true);
    setConnectError('');
    try {
      await connectPlatform(modalPlatform.id, fields);
      setModalPlatform(null);
      setSuccessPlatform(modalPlatform.id);
      setTimeout(() => setSuccessPlatform(null), 2500);
    } catch (err) {
      setConnectError(err.message || 'Connection failed. Check your credentials.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (platformId) => {
    setDisconnecting(platformId);
    try {
      await disconnectPlatform(platformId);
    } catch {
      // silently ignore
    } finally {
      setDisconnecting(null);
    }
  };

  const handleEnterDashboard = () => {
    if (!canEnter) return;
    setTransitioning(true);
  };

  const handleTransitionComplete = () => {
    setTransitioning(false);
    navigate('/aura-analysis/dashboard/overview', { state: { fromTransition: true } });
  };

  const fmt$ = (value, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  return (
    <div className="connection-hub-page">
      <Particles />
      {transitioning && <AuraEnterTransition onComplete={handleTransitionComplete} />}
      {modalPlatform && (
        <ConnectModal
          platform={modalPlatform}
          onClose={() => { if (!connecting) setModalPlatform(null); }}
          onSubmit={handleModalSubmit}
          connecting={connecting}
          error={connectError}
        />
      )}
      <CosmicBackground />

      <div className="connection-hub-container">
        <header className="connection-hub-header">
          <h1 className="connection-hub-title">Connection Hub</h1>
          <p className="connection-hub-sub">
            Securely connect your trading platforms to unlock unified analytics,
            real-time sync, and AI-powered insights. Credentials are AES-256-GCM
            encrypted — never stored in plain text.
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
                {(() => {
                  const total = connections.reduce((s, c) => s + (c.accountInfo?.balance || 0), 0);
                  return total > 0 ? fmt$(total) : '—';
                })()}
              </span>
              <span className="hub-stat-label">Total Balance</span>
            </div>
            <div className="hub-stat">
              <span className="hub-stat-number">{connectedCount}</span>
              <span className="hub-stat-label">Live Connections</span>
            </div>
          </div>
        )}

        <div className="connection-hub-section-label">
          <span>Available Platforms</span>
        </div>

        <section className="connection-hub-grid">
          {platforms.map((p) => {
            const conn = getConnection(p.id);
            const isConn = !!conn;
            const isSuccess = successPlatform === p.id;
            const isDisconnecting = disconnecting === p.id;
            const info = conn?.accountInfo || {};

            return (
              <div
                key={p.id}
                className={`connection-card ${isConn ? 'connected' : ''}`}
                onMouseEnter={() => setHoveredCard(p.id)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{ '--platform-color': PLATFORM_COLORS[p.id] || '#eaa960' }}
              >
                <div className="connection-card-header">
                  <span className="connection-card-icon">{PLATFORM_ICONS[p.id] || '📊'}</span>
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
                      {info.balance != null && (
                        <span><i className="fas fa-wallet" /> Balance: {fmt$(info.balance, info.currency || 'USD')}</span>
                      )}
                      {info.equity != null && info.equity !== info.balance && (
                        <span><i className="fas fa-chart-line" /> Equity: {fmt$(info.equity, info.currency || 'USD')}</span>
                      )}
                      {info.name && (
                        <span><i className="fas fa-user" /> {info.name}</span>
                      )}
                      {info.server && (
                        <span><i className="fas fa-server" /> {info.server}</span>
                      )}
                      <span className="health">
                        <i className="fas fa-heartbeat" /> Health: <span className="health-ok">Live</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="connection-card-disconnect"
                      disabled={isDisconnecting}
                      onClick={() => handleDisconnect(p.id)}
                    >
                      {isDisconnecting
                        ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Disconnecting…</>
                        : <><i className="fas fa-unlink" style={{ marginRight: 8 }} />Disconnect</>
                      }
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
                      className={`connection-card-connect${isSuccess ? ' success' : ''}`}
                      onClick={() => openModal(p)}
                    >
                      {isSuccess
                        ? <><i className="fas fa-check connection-success-icon" /> Connected!</>
                        : <><i className="fas fa-link" style={{ marginRight: 8 }} />Connect Platform</>
                      }
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