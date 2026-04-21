import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FaDatabase, FaExclamationTriangle, FaLock, FaSyncAlt, FaWaveSquare } from 'react-icons/fa';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import AdminApi from '../services/AdminApi';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/roles';

function toneForStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'healthy' || value === 'ready' || value === 'fresh') return 'var(--green)';
  if (value === 'degraded' || value === 'refreshing' || value === 'stale' || value === 'high') return 'var(--amber)';
  if (value === 'critical' || value === 'error' || value === 'expired' || value === 'unhealthy') return 'var(--red)';
  return 'var(--accent)';
}

function prettyLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatCard({ title, value, subtitle, status }) {
  const color = toneForStatus(status);
  return (
    <div className="aa-kpi">
      <div className="aa-kpi-label">{title}</div>
      <div className="aa-kpi-value" style={{ color }}>{value}</div>
      {subtitle ? <div className="aa-kpi-sub">{subtitle}</div> : null}
    </div>
  );
}

function DataTable({ title, rows, columns, emptyText = 'No data found.' }) {
  return (
    <section className="aa-card pipeline-data-table">
      <h3 className="pipeline-data-table__title">{title}</h3>
      {rows.length === 0 ? (
        <div className="aa--muted" style={{ fontSize: '0.85rem' }}>{emptyText}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="pipeline-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => {
                    const raw = typeof column.render === 'function' ? column.render(row) : row[column.key];
                    const status = column.statusKey ? row[column.statusKey] : null;
                    return (
                      <td
                        key={column.key}
                        style={column.statusKey ? { color: toneForStatus(status) } : undefined}
                      >
                        {raw == null || raw === '' ? '—' : raw}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function PipelineHealthAdmin() {
  const { user } = useAuth();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await AdminApi.getPipelineHealth();
      setPayload(response.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load pipeline health');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const summaryCards = useMemo(() => {
    if (!payload) return [];
    return [
      {
        title: 'Pipeline Status',
        value: prettyLabel(payload.status),
        subtitle: payload.checkedAt ? `Checked ${new Date(payload.checkedAt).toLocaleString()}` : null,
        status: payload.status,
      },
      {
        title: 'Watchlist Coverage',
        value: payload.coverage?.watchlistSymbols ?? 0,
        subtitle: `${payload.coverage?.latestSnapshots ?? 0} snapshots, ${payload.coverage?.latestDecoderStates ?? 0} decoder states`,
        status: payload.coverage?.aiContextReady ? 'healthy' : 'degraded',
      },
      {
        title: 'Active Locks',
        value: payload.activeLocks?.length ?? 0,
        subtitle: payload.activeLocks?.length ? 'Refresh currently in progress' : 'No ingestion lock held',
        status: payload.activeLocks?.length ? 'refreshing' : 'healthy',
      },
      {
        title: 'DB Pool',
        value: prettyLabel(payload.db?.status || 'unknown'),
        subtitle: payload.db?.avgQueryTimeMs != null ? `Avg query ${payload.db.avgQueryTimeMs}ms` : null,
        status: payload.db?.status,
      },
    ];
  }, [payload]);

  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin(user)) return <Navigate to="/admin" replace />;

  return (
    <AuraTerminalThemeShell>
      <div
        className="pipeline-health-page aa-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim pipeline-data-table-wrap"
        style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 20px 48px' }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
        >
          <div>
            <div className="aa-section-title" style={{ marginBottom: 8 }}>Super Admin</div>
            <h1 style={{ color: 'var(--text)', margin: 0, fontSize: '1.85rem', lineHeight: 1.1, fontWeight: 700 }}>
              Market Data Pipeline Monitor
            </h1>
            <p className="aa--muted" style={{ maxWidth: 760, margin: '10px 0 0', lineHeight: 1.6, fontSize: '0.92rem' }}>
              Track launch ingestion freshness, active refresh locks, decoder coverage, and provider usage pressure from one internal dashboard.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link to="/admin" className="aa--accent" style={{ textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
                Back to Admin Panel
              </Link>
            </div>
          </div>
          <button
            type="button"
            className="pipeline-health-refresh"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            aria-busy={refreshing || loading}
          >
            <FaSyncAlt style={{ opacity: refreshing ? 0.55 : 1 }} />
            {refreshing || loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="pipeline-health-error-banner" role="alert">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !payload ? (
          <div className="aa-grid-4" style={{ marginBottom: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aa-skeleton aa-skeleton-kpi" />
            ))}
          </div>
        ) : null}

        {payload ? (
          <>
            <div className="aa-grid-4" style={{ marginBottom: 22 }}>
              {summaryCards.map((card) => (
                <StatCard key={card.title} {...card} />
              ))}
            </div>

            <div className="aa-grid-4" style={{ marginBottom: 22 }}>
              <StatCard
                title="AI Context Packet"
                value={prettyLabel(payload.freshness?.aiContext?.status || 'missing')}
                subtitle={payload.freshness?.aiContext?.updatedAt ? `Updated ${new Date(payload.freshness.aiContext.updatedAt).toLocaleString()}` : 'No AI packet stored'}
                status={payload.freshness?.aiContext?.status}
              />
              <StatCard
                title="Recent Headlines"
                value={payload.coverage?.recentHeadlines ?? 0}
                subtitle={`Fresh ${payload.freshness?.headlines?.fresh ?? 0} | stale ${payload.freshness?.headlines?.stale ?? 0}`}
                status={(payload.freshness?.headlines?.expired || 0) > 0 ? 'degraded' : 'healthy'}
              />
              <StatCard
                title="Upcoming Events"
                value={payload.coverage?.upcomingEvents ?? 0}
                subtitle={`Fresh ${payload.freshness?.economicEvents?.fresh ?? 0} | stale ${payload.freshness?.economicEvents?.stale ?? 0}`}
                status={(payload.freshness?.economicEvents?.expired || 0) > 0 ? 'degraded' : 'healthy'}
              />
              <StatCard
                title="Check Duration"
                value={`${payload.checkDurationMs ?? 0}ms`}
                subtitle="Health endpoint runtime"
                status="unknown"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginBottom: 22 }}>
              <DataTable
                title="Provider Usage"
                rows={payload.usage || []}
                emptyText="No provider usage rows yet."
                columns={[
                  { key: 'provider', label: 'Provider' },
                  { key: 'feature', label: 'Feature' },
                  { key: 'totalCalls', label: 'Calls' },
                  { key: 'usagePct', label: 'Usage %', render: (row) => row.usagePct == null ? 'Unbounded' : `${row.usagePct}%` },
                  { key: 'pressure', label: 'Pressure', statusKey: 'pressure', render: (row) => prettyLabel(row.pressure) },
                  { key: 'lastCalledAt', label: 'Last Called', render: (row) => row.lastCalledAt ? new Date(row.lastCalledAt).toLocaleString() : '—' },
                ]}
              />
              <DataTable
                title="Active Refresh Locks"
                rows={payload.activeLocks || []}
                emptyText="No active locks."
                columns={[
                  { key: 'lockKey', label: 'Lock Key' },
                  { key: 'ownerId', label: 'Owner' },
                  { key: 'expiresAt', label: 'Expires', render: (row) => row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '—' },
                  { key: 'updatedAt', label: 'Updated', render: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—' },
                ]}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
              <DataTable
                title="Latest Snapshots"
                rows={payload.latest?.snapshots || []}
                columns={[
                  { key: 'key', label: 'Snapshot' },
                  { key: 'type', label: 'Type' },
                  { key: 'timeframe', label: 'Timeframe' },
                  { key: 'freshnessStatus', label: 'Freshness', statusKey: 'freshnessStatus', render: (row) => prettyLabel(row.freshnessStatus) },
                  { key: 'updatedAt', label: 'Updated', render: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—' },
                ]}
              />
              <DataTable
                title="Latest Decoder States"
                rows={payload.latest?.decoderStates || []}
                columns={[
                  { key: 'symbol', label: 'Symbol' },
                  { key: 'timeframe', label: 'Timeframe' },
                  { key: 'source', label: 'Source' },
                  { key: 'freshnessStatus', label: 'Freshness', statusKey: 'freshnessStatus', render: (row) => prettyLabel(row.freshnessStatus) },
                  { key: 'updatedAt', label: 'Updated', render: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—' },
                ]}
              />
            </div>

            <section className="aa-card pipeline-freshness-grid">
              <h3 className="pipeline-data-table__title">Freshness Breakdown</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {Object.entries(payload.freshness || {}).filter(([key]) => key !== 'aiContext').map(([key, value]) => (
                  <div key={key} className="aa-card">
                    <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 10, fontSize: '0.88rem' }}>{prettyLabel(key)}</div>
                    {Object.entries(value || {}).map(([bucket, count]) => (
                      <div key={bucket} className="pipeline-freshness-row">
                        <span>{prettyLabel(bucket)}</span>
                        <span style={{
                          color: bucket === 'fresh' ? 'var(--green)' : bucket === 'stale' ? 'var(--amber)' : bucket === 'expired' ? 'var(--red)' : 'var(--text-muted)',
                        }}
                        >
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <div
              className="aa--dim"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 18,
                fontSize: '0.72rem',
              }}
            >
              <FaDatabase />
              <span>Endpoint: `/api/market-data/health`</span>
              <FaLock style={{ marginLeft: 8 }} />
              <span>Access: super admin only</span>
              <FaWaveSquare style={{ marginLeft: 8 }} />
              <span>Source of truth: internal pipeline store</span>
            </div>
          </>
        ) : null}
      </div>
    </AuraTerminalThemeShell>
  );
}
