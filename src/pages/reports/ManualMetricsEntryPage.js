/**
 * Manual metrics — CSV upload for MT5 snapshot (Premium, Elite, Admin).
 * Elite users may also use Aura Analysis for live MT5; this flow is optional manual CSV.
 */
import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roles';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import CsvUploadSection from '../../components/reports/CsvUploadSection';
import { useReportsEligibility } from './useReportsEligibility';
import '../../styles/reports/ReportsPage.css';
import '../../styles/reports/ManualMetricsPages.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';

function useCsvPeriodSnapshot(token, enabled) {
  const [csvStatus, setCsvStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${BASE_URL}/api/reports/csv-metrics`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.success && data.hasData) {
          setCsvStatus({
            trade_count: data.trade_count ?? data.summary?.tradeCount,
            uploaded_at: data.uploaded_at,
          });
        } else {
          setCsvStatus(null);
        }
      } catch {
        if (!cancelled) setCsvStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, enabled]);

  return { csvStatus, loadingCsv: loading };
}

function ManualMetricsEntryInner() {
  const { token, user } = useAuth();
  const { eligibility, loading, error, reload } = useReportsEligibility(token);

  const role = (eligibility?.role || '').toLowerCase();
  const manualMetricsCsvEnabled =
    isSuperAdmin(user) ||
    ['premium', 'pro', 'elite', 'admin', 'super_admin', 'superadmin'].includes(role);

  const { csvStatus, loadingCsv } = useCsvPeriodSnapshot(
    token,
    manualMetricsCsvEnabled && !loading && !!eligibility
  );

  if (loading || !token) {
    return (
      <div className="rp-loading journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page mm-entry">
        <span className="rp-spinner" />
        <span>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rp-error-state journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page mm-entry">
        <p>{error}</p>
        <Link to="/aura-analysis/ai" className="rp-btn rp-btn--secondary">Back to Connection Hub</Link>
      </div>
    );
  }

  if (!eligibility) return null;

  if (!manualMetricsCsvEnabled) {
    return <Navigate to="/aura-analysis/ai" replace />;
  }

  return (
    <div className="rp-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page mm-entry">
      <div className="rp-header mm-entry-head">
        <div className="rp-header-stack">
          <p className="rp-eyebrow">MT5 CSV snapshot</p>
          <h2 className="rp-title">Manual metrics</h2>
          <p className="rp-subtitle">
            Upload your full MT5 trade history CSV. After upload, your snapshot opens on the manual
            metrics dashboard. Elite plans also include Aura Analysis for live MT5 — separate from this CSV flow. You can
            also reach this page from <strong>Aura Analysis → Connection Hub</strong>.
          </p>
        </div>
      </div>
      {loadingCsv && <div className="mm-period-loading">Checking upload…</div>}

      <CsvUploadSection
        token={token}
        csvStatus={csvStatus}
        onUploaded={reload}
      />

      <p className="mm-entry-footer">
        <Link
          to="/manual-metrics/dashboard"
          className="mm-link-dashboard"
          aria-disabled={!csvStatus}
          onClick={(e) => {
            if (!csvStatus) e.preventDefault();
          }}
          style={!csvStatus ? { opacity: 0.55, pointerEvents: 'none', cursor: 'not-allowed' } : undefined}
        >
          {csvStatus ? 'Enter dashboard' : 'Upload CSV to enter dashboard'}
        </Link>
        {' · '}
        <Link to="/aura-analysis/ai">Connection Hub</Link>
        {' · '}
        <Link to="/choose-plan">Plans</Link>
      </p>
    </div>
  );
}

export default function ManualMetricsEntryPage() {
  return (
    <AuraTerminalThemeShell>
      <ManualMetricsEntryInner />
    </AuraTerminalThemeShell>
  );
}
