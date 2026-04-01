import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FaDatabase, FaExclamationTriangle, FaLock, FaSyncAlt, FaWaveSquare } from 'react-icons/fa';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import AdminApi from '../services/AdminApi';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/roles';

function toneForStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'healthy' || value === 'ready' || value === 'fresh') return '#3ddc97';
  if (value === 'degraded' || value === 'refreshing' || value === 'stale' || value === 'high') return '#f5c451';
  if (value === 'critical' || value === 'error' || value === 'expired' || value === 'unhealthy') return '#ff6b6b';
  return '#8fb8ff';
}

function prettyLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatCard({ title, value, subtitle, status }) {
  const color = toneForStatus(status);
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.72)',
      border: `1px solid ${color}33`,
      borderRadius: 18,
      padding: '18px 20px',
      boxShadow: '0 20px 60px rgba(2, 6, 23, 0.28)',
      backdropFilter: 'blur(16px)',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div style={{ color, fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {subtitle ? <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 8 }}>{subtitle}</div> : null}
    </div>
  );
}

function DataTable({ title, rows, columns, emptyText = 'No data found.' }) {
  return (
    <section style={{
      background: 'rgba(15, 23, 42, 0.72)',
      border: '1px solid rgba(143,184,255,0.18)',
      borderRadius: 18,
      padding: 20,
      boxShadow: '0 20px 60px rgba(2, 6, 23, 0.24)',
      overflow: 'hidden',
    }}>
      <h3 style={{ color: '#fff', fontSize: 18, margin: '0 0 14px' }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14 }}>{emptyText}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      textAlign: 'left',
                      padding: '0 0 10px',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.48)',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {column.label}
                  </th>
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
                        style={{
                          padding: '12px 0',
                          fontSize: 13,
                          color: column.statusKey ? toneForStatus(status) : 'rgba(255,255,255,0.85)',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          verticalAlign: 'top',
                        }}
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
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '32px 20px 56px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}>
          <div>
            <div style={{ color: 'rgba(143,184,255,0.82)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              Super Admin
            </div>
            <h1 style={{ color: '#fff', margin: 0, fontSize: 34, lineHeight: 1.1 }}>Market Data Pipeline Monitor</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 760, margin: '10px 0 0', lineHeight: 1.6 }}>
              Track launch ingestion freshness, active refresh locks, decoder coverage, and provider usage pressure from one internal dashboard.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link to="/admin" style={{ color: '#8fb8ff', textDecoration: 'none', fontSize: 14 }}>
                Back to Admin Panel
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              border: '1px solid rgba(143,184,255,0.28)',
              background: 'rgba(17, 24, 39, 0.82)',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 12,
              cursor: refreshing ? 'default' : 'pointer',
            }}
          >
            <FaSyncAlt style={{ opacity: refreshing ? 0.55 : 1 }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            background: 'rgba(127, 29, 29, 0.35)',
            border: '1px solid rgba(255,107,107,0.28)',
            color: '#ffd1d1',
            padding: '14px 16px',
            borderRadius: 14,
          }}>
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !payload ? (
          <div style={{ color: 'rgba(255,255,255,0.7)', padding: '24px 4px' }}>Loading pipeline health...</div>
        ) : null}

        {payload ? (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 22,
            }}>
              {summaryCards.map((card) => (
                <StatCard key={card.title} {...card} />
              ))}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 22,
            }}>
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

            <section style={{
              background: 'rgba(15, 23, 42, 0.72)',
              border: '1px solid rgba(143,184,255,0.18)',
              borderRadius: 18,
              padding: 20,
              boxShadow: '0 20px 60px rgba(2, 6, 23, 0.24)',
            }}>
              <h3 style={{ color: '#fff', fontSize: 18, margin: '0 0 14px' }}>Freshness Breakdown</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {Object.entries(payload.freshness || {}).filter(([key]) => key !== 'aiContext').map(([key, value]) => (
                  <div key={key} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: 10 }}>{prettyLabel(key)}</div>
                    {Object.entries(value || {}).map(([bucket, count]) => (
                      <div key={bucket} style={{ display: 'flex', justifyContent: 'space-between', color: bucket === 'fresh' ? '#3ddc97' : bucket === 'stale' ? '#f5c451' : bucket === 'expired' ? '#ff6b6b' : 'rgba(255,255,255,0.68)', fontSize: 13, padding: '3px 0' }}>
                        <span>{prettyLabel(bucket)}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 18,
              color: 'rgba(255,255,255,0.58)',
              fontSize: 12,
            }}>
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
