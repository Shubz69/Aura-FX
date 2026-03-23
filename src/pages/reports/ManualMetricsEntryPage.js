/**
 * Manual metrics — Premium: CSV upload for MT5 snapshot (separate from Aura Analysis).
 * Elite/Admin: Premium-only upsell (CSV snapshot vs live Aura).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import ReportsHubSubNav from '../../components/reports/ReportsHubSubNav';
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

  const role = eligibility?.role;
  const premiumFlow = role === 'premium';

  const { csvStatus, loadingCsv } = useCsvPeriodSnapshot(
    token,
    year,
    month,
    premiumFlow && !loading && !!eligibility
  );

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cy - i);
  }, []);

  const onPeriodChange = (nextY, nextM) => {
    setYear(nextY);
    setMonth(nextM);
    setSearchParams({ year: String(nextY), month: String(nextM) }, { replace: true });
  };

  if (loading || !token) {
    return (
      <div className="rp-loading journal-glass-panel journal-glass-panel--pad mm-entry">
        <span className="rp-spinner" />
        <span>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rp-error-state journal-glass-panel journal-glass-panel--pad mm-entry">
        <p>{error}</p>
        <Link to="/reports" className="rp-btn rp-btn--secondary">Back to Performance &amp; DNA</Link>
      </div>
    );
  }

  if (!eligibility) return null;

  if (role === 'free') {
    return <Navigate to="/reports" replace />;
  }

  if (['elite', 'admin'].includes(role)) {
    return (
      <div className="rp-page journal-glass-panel journal-glass-panel--pad mm-entry">
        <ReportsHubSubNav role={role} year={eligibility.currentPeriod.year} month={eligibility.currentPeriod.month} />
        <div className="mm-upsell-card">
          <p className="mm-upsell-kicker">Manual metrics</p>
          <h1 className="mm-upsell-title">CSV snapshot is a Premium Performance feature</h1>
          <p className="mm-upsell-body">
            Upload your MT5 broker export to build a monthly snapshot dashboard under Performance &amp; DNA. Your Elite plan
            includes <strong>Aura Analysis</strong> for live MT5 connection, execution analytics, and the full dashboard —
            a separate product from this manual CSV flow.
          </p>
          <div className="mm-upsell-actions">
            <Link to="/subscription" className="rp-btn rp-btn--secondary">View Premium</Link>
            <Link to="/aura-analysis/ai" className="rp-btn rp-btn--primary">Open Aura Analysis</Link>
          </div>
          <p className="mm-upsell-note">
            <Link to="/reports">← Back to Monthly report</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rp-page journal-glass-panel journal-glass-panel--pad mm-entry">
      <div className="rp-header mm-entry-head">
        <div className="rp-header-stack">
          <p className="rp-eyebrow">Performance &amp; DNA</p>
          <h2 className="rp-title">Manual metrics</h2>
          <p className="rp-subtitle">
            Upload your MT5 trade history CSV for the month you select. After upload, we review the file and open your
            snapshot dashboard — separate from Aura Analysis (Elite live MT5).
          </p>
        </div>
      </div>

      <ReportsHubSubNav role="premium" year={year} month={month} />

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
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
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
        <Link to={`/reports/manual-metrics/dashboard?year=${year}&month=${month}`} className="mm-link-dashboard">
          Open dashboard for {MONTH_NAMES[month - 1]} {year}
        </Link>
        {' · '}
        <Link to="/reports">Monthly report</Link>
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
