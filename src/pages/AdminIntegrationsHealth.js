import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FaChevronRight, FaExclamationTriangle, FaShieldAlt, FaSyncAlt } from 'react-icons/fa';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import AdminApi from '../services/AdminApi';
import { useAuth } from '../context/AuthContext';
import { isAdmin, isSuperAdmin } from '../utils/roles';
import '../styles/admin-integration-health.css';

function toneFor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'ok') return 'var(--green, #34d399)';
  if (s === 'not_configured') return 'rgba(148, 163, 184, 0.95)';
  if (s === 'degraded') return 'var(--amber, #fbbf24)';
  if (s === 'down') return 'var(--red, #f87171)';
  return 'rgba(148, 163, 184, 0.8)';
}

function barPercent(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'ok') return 100;
  if (s === 'degraded') return 55;
  if (s === 'down') return 18;
  if (s === 'not_configured') return 38;
  return 30;
}

export default function AdminIntegrationsHealth() {
  const { user } = useAuth();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await AdminApi.getIntegrationHealth();
      setPayload(response.data || null);
    } catch (err) {
      setPayload(null);
      setError(err?.response?.data?.message || err.message || 'Failed to load integration health');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const overallTone = useMemo(() => {
    const o = String(payload?.overall || '').toLowerCase();
    if (o === 'critical') return toneFor('down');
    if (o === 'degraded') return toneFor('degraded');
    if (o === 'not_configured') return toneFor('not_configured');
    return toneFor('ok');
  }, [payload]);

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin(user) && !isSuperAdmin(user)) return <Navigate to="/" replace />;

  return (
    <AuraTerminalThemeShell>
      <div className="integration-health-page aa-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
        <header className="integration-health-page__header">
          <div>
            <div className="integration-health-page__eyebrow">
              <FaShieldAlt aria-hidden style={{ opacity: 0.85, marginRight: 8 }} />
              Admin only
            </div>
            <h1 className="integration-health-page__title">External services health</h1>
            <p className="integration-health-page__lede">
              Third-party APIs and infrastructure this app depends on. If a bar is red or amber, dependent product areas may be degraded — use this to explain outages to users and prioritize fixes.
              This page is not visible to traders or non-admin accounts.
            </p>
            <Link to="/admin" className="integration-health-page__back">
              Back to Admin Panel <FaChevronRight aria-hidden style={{ marginLeft: 4, opacity: 0.7 }} />
            </Link>
          </div>
          <button
            type="button"
            className="integration-health-page__refresh"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            aria-busy={refreshing || loading}
          >
            <FaSyncAlt style={{ opacity: refreshing ? 0.55 : 1 }} />
            {refreshing || loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {error ? (
          <div className="integration-health-page__error" role="alert">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !payload ? (
          <div className="integration-health-page__skeleton-grid">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="integration-health-page__skeleton-card" />
            ))}
          </div>
        ) : null}

        {payload ? (
          <>
            <section className="integration-health-page__summary">
              <div className="integration-health-page__summary-main">
                <span className="integration-health-page__summary-label">Overall</span>
                <strong style={{ color: overallTone }}>{String(payload.overall || 'unknown').toUpperCase()}</strong>
              </div>
              <div className="integration-health-page__summary-meta">
                Checked {payload.checkedAt ? new Date(payload.checkedAt).toLocaleString() : '—'}
                {payload.durationMs != null ? ` · ${payload.durationMs}ms total` : ''}
              </div>
            </section>

            <ul className="integration-health-page__list">
              {(payload.integrations || []).map((row) => (
                <li key={row.id} className="integration-health-card">
                  <div className="integration-health-card__top">
                    <div>
                      <span className="integration-health-card__category">{row.category}</span>
                      <h2 className="integration-health-card__name">{row.name}</h2>
                    </div>
                    <span
                      className="integration-health-card__pill"
                      style={{
                        borderColor: toneFor(row.status),
                        color: toneFor(row.status),
                      }}
                    >
                      {String(row.status || '').replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="integration-health-card__bar-wrap" aria-hidden>
                    <div
                      className="integration-health-card__bar-fill"
                      style={{
                        width: `${barPercent(row.status)}%`,
                        background: `linear-gradient(90deg, ${toneFor(row.status)}, ${toneFor(row.status)}88)`,
                      }}
                    />
                  </div>

                  <p className="integration-health-card__purpose">{row.purpose}</p>

                  <div className="integration-health-card__meta">
                    {row.latencyMs != null ? (
                      <span>Latency ~{row.latencyMs}ms</span>
                    ) : (
                      <span>Latency n/a</span>
                    )}
                    {row.detail ? (
                      <span className="integration-health-card__detail" title={row.detail}>
                        {row.detail}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </AuraTerminalThemeShell>
  );
}
