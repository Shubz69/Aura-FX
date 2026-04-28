/**
 * Manual metrics — CSV upload for MT5 snapshot (Premium, Elite, Admin).
 * Elite users may also use Aura Analysis for live MT5; this flow is optional manual CSV.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import CsvUploadSection from '../../components/reports/CsvUploadSection';
import { useReportsEligibility } from './useReportsEligibility';
import '../../styles/reports/ReportsPage.css';
import '../../styles/reports/ManualMetricsPages.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function useCsvPeriodSnapshot(token, year, month, enabled) {
  const [csvStatus, setCsvStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !token || !year || !month) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${BASE_URL}/api/reports/csv-metrics?year=${year}&month=${month}`,
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
  }, [token, year, month, enabled]);

  return { csvStatus, loadingCsv: loading };
}

function ManualMetricsEntryInner() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { eligibility, loading, error, reload } = useReportsEligibility(token);

  const [year, setYear] = useState(() => {
    const y = parseInt(searchParams.get('year'), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const m = parseInt(searchParams.get('month'), 10);
    return Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  });

  useEffect(() => {
    const y = parseInt(searchParams.get('year'), 10);
    const m = parseInt(searchParams.get('month'), 10);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      setYear(y);
      setMonth(m);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!eligibility?.currentPeriod) return;
    const yq = searchParams.get('year');
    const mq = searchParams.get('month');
    if (!yq || !mq) {
      const { year: cy, month: cm } = eligibility.currentPeriod;
      setYear(cy);
      setMonth(cm);
      setSearchParams({ year: String(cy), month: String(cm) }, { replace: true });
    }
  }, [eligibility, searchParams, setSearchParams]);

  useEffect(() => {
    const n = new Date();
    const cy = n.getFullYear();
    const cm = n.getMonth() + 1;
    if (year > cy || (year === cy && month > cm)) {
      setYear(cy);
      setMonth(cm);
      setSearchParams({ year: String(cy), month: String(cm) }, { replace: true });
    }
  }, [year, month, setSearchParams]);

  const role = (eligibility?.role || '').toLowerCase();
  const manualMetricsCsvEnabled = ['premium', 'pro', 'elite', 'admin', 'super_admin', 'superadmin'].includes(role);

  const { csvStatus, loadingCsv } = useCsvPeriodSnapshot(
    token,
    year,
    month,
    manualMetricsCsvEnabled && !loading && !!eligibility
  );

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cy - i);
  }, []);

  const periodIsFuture = useMemo(() => {
    const n = new Date();
    const cy = n.getFullYear();
    const cm = n.getMonth() + 1;
    return year > cy || (year === cy && month > cm);
  }, [year, month]);

  const isMonthDisabled = (m) => {
    const n = new Date();
    const cy = n.getFullYear();
    const cm = n.getMonth() + 1;
    if (year > cy) return true;
    if (year === cy && m > cm) return true;
    return false;
  };

  const onPeriodChange = (nextY, nextM) => {
    setYear(nextY);
    setMonth(nextM);
    setSearchParams({ year: String(nextY), month: String(nextM) }, { replace: true });
  };

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
    return <Navigate to="/reports" replace />;
  }

  return (
    <div className="rp-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page mm-entry">
      <div className="rp-header mm-entry-head">
        <div className="rp-header-stack">
          <p className="rp-eyebrow">MT5 CSV snapshot</p>
          <h2 className="rp-title">Manual metrics</h2>
          <p className="rp-subtitle">
            Upload your MT5 trade history CSV for the month you select. After upload, your snapshot opens on the manual
            metrics dashboard. Elite plans also include Aura Analysis for live MT5 — separate from this CSV flow. You can
            also reach this page from <strong>Aura Analysis → Connection Hub</strong>.
          </p>
        </div>
      </div>

      {periodIsFuture && (
        <div className="mm-dash-banner mm-dash-banner--warn mm-entry-banner" role="status">
          This period is in the future. Upload is only allowed for the current month or past months. Choose a closed month to continue.
        </div>
      )}

      <div className="mm-period-row">
        <label className="mm-period-label" htmlFor="mm-year">Period</label>
        <select
          id="mm-year"
          className="mm-period-select"
          value={year}
          onChange={(e) => onPeriodChange(Number(e.target.value), month)}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="mm-period-select"
          value={month}
          onChange={(e) => onPeriodChange(year, Number(e.target.value))}
          aria-label="Month"
        >
          {MONTH_NAMES.map((name, i) => {
            const m = i + 1;
            return (
              <option key={name} value={m} disabled={isMonthDisabled(m)}>
                {name}{isMonthDisabled(m) ? ' (future)' : ''}
              </option>
            );
          })}
        </select>
        {loadingCsv && <span className="mm-period-loading">Checking upload…</span>}
      </div>

      <CsvUploadSection
        token={token}
        year={year}
        month={month}
        csvStatus={csvStatus}
        onUploaded={reload}
      />

      <p className="mm-entry-footer">
        <Link
          to={`/manual-metrics/dashboard?year=${year}&month=${month}`}
          className="mm-link-dashboard"
          aria-disabled={!csvStatus}
          onClick={(e) => {
            if (!csvStatus) e.preventDefault();
          }}
          style={!csvStatus ? { opacity: 0.55, pointerEvents: 'none', cursor: 'not-allowed' } : undefined}
        >
          {csvStatus ? `Enter dashboard for ${MONTH_NAMES[month - 1]} ${year}` : 'Upload CSV to enter dashboard'}
        </Link>
        {' · '}
        <Link to="/aura-analysis/ai">Connection Hub</Link>
        {' · '}
        <Link to="/reports">Performance &amp; DNA</Link>
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
