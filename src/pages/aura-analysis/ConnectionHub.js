import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAuraConnection, useCanEnterAuraDashboard } from '../../context/AuraConnectionContext';
import { isSuperAdmin } from '../../utils/roles';
import { useReportsEligibility } from '../reports/useReportsEligibility';
import CosmicBackground from '../../components/CosmicBackground';
import AuraEnterTransition from '../../components/aura-analysis/AuraEnterTransition';
import '../../styles/aura-analysis/ConnectionHub.css';

const MT_CONNECT_HELPER =
  'Uses read-only investor credentials for secure analytics access. Enter your account login, investor password, and broker server. Used for analytics and performance insights only — no trading or account changes.';

// ── Credential Modal ────────────────────────────────────────────────────────
function ConnectModal({ platform, onClose, onSubmit, connecting, error }) {
  const [fields, setFields] = useState({});
  const [showSecret, setShowSecret] = useState({});

  const handleChange = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(fields);
  };

  const isMeta = platform.id === 'mt5' || platform.id === 'mt4';
  const submitLabel = platform.id === 'mt5' ? 'Connect MetaTrader 5' : platform.id === 'mt4' ? 'Connect MetaTrader 4' : `Connect ${platform.name}`;

  return (
    <div className="chub-modal-overlay" onClick={onClose}>
      <div className="chub-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chub-modal-header">
          <span className="chub-modal-icon">{PLATFORM_ICONS[platform.id] || '📊'}</span>
          <div>
            <div className="chub-modal-title">{platform.id === 'mt5' ? 'Connect MetaTrader 5' : platform.id === 'mt4' ? 'Connect MetaTrader 4' : `Connect ${platform.name}`}</div>
            <div className="chub-modal-sub">Read-only investor-password analytics connection</div>
          </div>
          <button className="chub-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isMeta && (
          <div className="chub-modal-info">
            <i className="fas fa-info-circle" />
            <span>{MT_CONNECT_HELPER}</span>
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
              <><i className="fas fa-link" /> {submitLabel}</>
            )}
          </button>
        </form>

        <div className="chub-modal-security">
          <i className="fas fa-lock" />
          <span>Credentials are encrypted and used only for read-only analytics connection.</span>
        </div>
      </div>
    </div>
  );
}

const PLATFORM_ICONS = {
  mt5: '📊',
  mt4: '📈',
};

/** Gold / amber accents only — matches Connection Hub cards (no purple/blue ring). */
const PLATFORM_COLORS = {
  mt5: 'rgba(248, 195, 125, 0.95)',
  mt4: 'rgba(234, 169, 96, 0.88)',
};

/** Disconnected-card feature lines (MT4 & MT5). */
const META_CARD_FEATURES = [
  { icon: 'fa-eye', text: 'Read-only investor access' },
  { icon: 'fa-lock', text: 'Encrypted credentials' },
  { icon: 'fa-chart-line', text: 'Analytics and performance insights' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
  const { user, token } = useAuth();
  const { platforms, connections, connectPlatform, disconnectPlatform, renameConnection } = useAuraConnection();
  const canEnter = useCanEnterAuraDashboard(user);
  const superAdmin = user && isSuperAdmin(user);
  const { eligibility: reportsEligibility } = useReportsEligibility(token);
  const [modalPlatform, setModalPlatform] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [successPlatform, setSuccessPlatform] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const [selectedConnectionByPlatform, setSelectedConnectionByPlatform] = useState({});
  const [csvStatus, setCsvStatus] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');

  const connectedCount = connections.length;
  const getPlatformConnections = useCallback((platformId) => (
    connections.filter((c) => c.platformId === platformId)
  ), [connections]);

  const getSelectedConnection = useCallback((platformId) => {
    const rows = getPlatformConnections(platformId);
    if (!rows.length) return null;
    const selectedId = selectedConnectionByPlatform[platformId];
    return rows.find((c) => String(c.connectionId) === String(selectedId)) || rows[0];
  }, [getPlatformConnections, selectedConnectionByPlatform]);

  const reportsRole = (reportsEligibility?.role || '').toLowerCase();
  const csvEnabled = superAdmin || ['premium', 'elite', 'admin'].includes(reportsRole);
  const now = new Date();
  const csvYear = reportsEligibility?.currentPeriod?.year || now.getFullYear();
  const csvMonth = reportsEligibility?.currentPeriod?.month || (now.getMonth() + 1);
  const csvPeriodLabel = `${MONTH_NAMES[(csvMonth || 1) - 1] || MONTH_NAMES[0]} ${csvYear}`;
  const isCsvConnected = !!(csvStatus && (csvStatus.tradeCount || 0) > 0);

  useEffect(() => {
    let cancelled = false;
    const loadCsvStatus = async () => {
      if (!token || !csvEnabled || !csvYear || !csvMonth) {
        setCsvStatus(null);
        return;
      }
      setCsvLoading(true);
      setCsvError('');
      try {
        const apiBase = process.env.REACT_APP_API_URL || '';
        const res = await fetch(
          `${apiBase}/api/reports/csv-metrics?year=${csvYear}&month=${csvMonth}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.success && data.hasData) {
          setCsvStatus({
            tradeCount: Number(data.trade_count ?? data.summary?.tradeCount ?? 0) || 0,
            uploadedAt: data.uploaded_at || null,
            periodYear: Number(data.period?.year || csvYear),
            periodMonth: Number(data.period?.month || csvMonth),
          });
        } else {
          setCsvStatus(null);
        }
      } catch (e) {
        if (!cancelled) {
          setCsvStatus(null);
          setCsvError('Could not check CSV snapshot right now.');
        }
      } finally {
        if (!cancelled) setCsvLoading(false);
      }
    };
    loadCsvStatus();
    return () => {
      cancelled = true;
    };
  }, [token, csvEnabled, csvYear, csvMonth]);

  const openModal = (platform) => {
    if (platform?.id !== 'mt5' && platform?.id !== 'mt4') return;
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

  const handleDisconnect = async (platformId, connectionId) => {
    setDisconnecting(connectionId || platformId);
    try {
      await disconnectPlatform(platformId, connectionId);
    } catch {
      // silently ignore
    } finally {
      setDisconnecting(null);
    }
  };

  const handleTransitionComplete = useCallback(() => {
    setTransitioning(false);
    navigate('/aura-analysis/dashboard/overview', { state: { fromTransition: true } });
  }, [navigate]);

  const handleEnterDashboard = useCallback(() => {
    if (!canEnter) return;
    setTransitioning(true);
  }, [canEnter]);

  const fmt$ = (value, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  const fmtDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

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
            Securely connect your MetaTrader account using read-only investor access to unlock performance analytics, account insights, and AI-powered reporting. Credentials are encrypted and never exposed in plain text.
          </p>
        </header>

        {/* Stats Strip */}
        {connectedCount > 0 && (
          <div className="connection-hub-stats-strip">
            <div className="hub-stat">
              <span className="hub-stat-number">{connectedCount}</span>
              <span className="hub-stat-label">Connected accounts</span>
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
              <span className="hub-stat-label">Active connections</span>
            </div>
          </div>
        )}

        <div className="connection-hub-section-label">
          <span>MetaTrader</span>
        </div>

        <section className="connection-hub-grid">
          {platforms.map((p) => {
            const platformConnections = getPlatformConnections(p.id);
            const conn = getSelectedConnection(p.id);
            const isConn = !!conn;
            const isMeta = p.id === 'mt5' || p.id === 'mt4';
            const connectCta =
              p.id === 'mt5' ? 'Connect MetaTrader 5' : p.id === 'mt4' ? 'Connect MetaTrader 4' : 'Connect Platform';
            const isSuccess = successPlatform === p.id;
            const isDisconnecting = disconnecting === (conn?.connectionId || p.id);
            const info = conn?.accountInfo || {};

            return (
              <div
                key={p.id}
                className={`connection-card ${isConn ? 'connected' : ''}`}
                onMouseEnter={() => setHoveredCard(p.id)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{ '--platform-color': PLATFORM_COLORS[p.id] || 'rgba(248, 195, 125, 0.95)' }}
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
                      {platformConnections.length > 1 && (
                        <select
                          className="chub-account-switch"
                          value={String(conn.connectionId || '')}
                          onChange={(e) => setSelectedConnectionByPlatform((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', color: '#d8d8d8', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, fontSize: '0.72rem' }}
                        >
                          {platformConnections.map((row) => (
                            <option key={String(row.connectionId || row.label)} value={String(row.connectionId || '')}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                      )}
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
                      {conn.label && (
                        <span><i className="fas fa-user" /> {conn.label}</span>
                      )}
                      {info.name && (
                        <span><i className="fas fa-id-badge" /> {info.name}</span>
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
                        className="connection-card-connect"
                        onClick={() => {
                          const current = prompt('Rename this account', conn.label || '');
                          if (current && String(current).trim()) {
                            // eslint-disable-next-line no-void
                            void (async () => {
                              try {
                                await renameConnection(conn.connectionId, current.trim());
                              } catch (_) {}
                            })();
                          }
                        }}
                        style={{ marginTop: 8 }}
                      >
                        <i className="fas fa-pen" style={{ marginRight: 8 }} />
                        Rename account
                      </button>
                    <button
                      type="button"
                      className="connection-card-disconnect"
                      disabled={isDisconnecting}
                        onClick={() => handleDisconnect(p.id, conn.connectionId)}
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
                      <span>{isMeta ? 'Available for connection' : 'Not available'}</span>
                      {isMeta && hoveredCard === p.id && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>
                          Click to connect
                        </span>
                      )}
                    </div>

                    <div className="connection-card-meta">
                      {isMeta
                        ? META_CARD_FEATURES.map((row) => (
                            <span key={row.text}>
                              <i className={`fas ${row.icon}`} />
                              {row.text}
                            </span>
                          ))
                        : null}
                    </div>

                    <button
                      type="button"
                      className={`connection-card-connect${isSuccess ? ' success' : ''}`}
                      disabled={!isMeta}
                      onClick={() => openModal(p)}
                    >
                      {isSuccess ? (
                        <><i className="fas fa-check connection-success-icon" /> Connected!</>
                      ) : (
                        <><i className="fas fa-link" style={{ marginRight: 8 }} />{connectCta}</>
                      )}
                    </button>
                  </>
                )}
                {isMeta && isConn && (
                  <button
                    type="button"
                    className="connection-card-connect"
                    style={{ marginTop: 8 }}
                    onClick={() => openModal(p)}
                  >
                    <i className="fas fa-plus" style={{ marginRight: 8 }} />
                    Add another account
                  </button>
                )}
              </div>
            );
          })}
        </section>

        <section className="connection-hub-enter connection-hub-enter--after-mt">
          {superAdmin && connectedCount === 0 && (
            <div className="connection-hub-bypass-note">
              <i className="fas fa-crown" />
              <span>Super Admin: test mode — bypass MetaTrader connection requirement</span>
            </div>
          )}
          
          <button
            type="button"
            className="connection-hub-enter-btn"
            onClick={handleEnterDashboard}
            disabled={!canEnter}
          >
            <i className="fas fa-rocket" style={{ marginRight: 12 }} />
            Enter Dashboard
            <i className="fas fa-arrow-right" style={{ marginLeft: 12 }} />
          </button>
          
          {!canEnter && !superAdmin && (
            <p className="connection-hub-enter-hint">
              <i className="fas fa-lock" />
              Connect a MetaTrader account to unlock analytics
              <i className="fas fa-chart-bar" style={{ marginLeft: 6 }} />
            </p>
          )}
          
          {canEnter && (
            <p className="connection-hub-enter-hint">
              <i className="fas fa-check-circle" style={{ color: '#10b981' }} />
              Ready to analyze — {connectedCount} account{connectedCount !== 1 ? 's' : ''} connected
            </p>
          )}
        </section>

        <div className="connection-hub-section-label connection-hub-section-label--manual-below">
          <span>Manual Metrics</span>
        </div>

        <section className="connection-hub-grid connection-hub-grid--single connection-hub-grid--csv-tail">
          <div
            className={`connection-card csv-connection-card ${isCsvConnected ? 'connected' : ''}`}
            style={{ '--platform-color': 'rgba(248, 195, 125, 0.95)' }}
          >
            <div className="connection-card-header">
              <span className="connection-card-icon">📄</span>
              <span className="connection-card-name">CSV Snapshot</span>
              <span className="connection-card-badge">Manual metrics</span>
            </div>

            <div className="connection-card-status">
              <span className={`status-dot ${isCsvConnected ? 'ok' : 'off'}`} />
              <span>
                {csvLoading
                  ? 'Checking snapshot…'
                  : isCsvConnected
                    ? `Connected for ${csvPeriodLabel}`
                    : csvEnabled
                      ? 'Ready to connect with CSV'
                      : 'Upgrade required'}
              </span>
            </div>

            <div className="connection-card-meta">
              <span><i className="fas fa-calendar-alt" /> Period: {csvPeriodLabel}</span>
              {isCsvConnected ? (
                <>
                  <span><i className="fas fa-list-ol" /> Trades: {csvStatus.tradeCount}</span>
                  <span><i className="fas fa-clock" /> Uploaded: {fmtDateTime(csvStatus.uploadedAt)}</span>
                  <span><i className="fas fa-chart-pie" /> Dashboard: CSV-only performance profile</span>
                </>
              ) : (
                <>
                  <span><i className="fas fa-upload" /> Connect with CSV from your broker export</span>
                  <span><i className="fas fa-shield-alt" /> No trading access — analysis only</span>
                  <span><i className="fas fa-chart-area" /> Opens dedicated CSV dashboard (MT-style layout)</span>
                </>
              )}
            </div>

            {csvError && (
              <div className="chub-inline-warning">
                <i className="fas fa-exclamation-triangle" /> {csvError}
              </div>
            )}

            {csvEnabled ? (
              <div className="csv-connection-actions">
                <button
                  type="button"
                  className="connection-card-connect"
                  onClick={() => navigate(`/manual-metrics?year=${csvYear}&month=${csvMonth}`)}
                >
                  <i className="fas fa-link" style={{ marginRight: 8 }} />
                  Connect with CSV
                </button>
                {isCsvConnected && (
                  <button
                    type="button"
                    className="connection-card-disconnect csv-dashboard-btn"
                    onClick={() => navigate(`/manual-metrics/dashboard?year=${csvYear}&month=${csvMonth}`)}
                  >
                    <i className="fas fa-chart-line" style={{ marginRight: 8 }} />
                    Enter Dashboard
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="connection-card-connect"
                onClick={() => navigate('/choose-plan')}
              >
                <i className="fas fa-crown" style={{ marginRight: 8 }} />
                Upgrade to Connect CSV
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}