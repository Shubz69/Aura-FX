/**
 * Short transition after CSV upload — then routes to manual metrics dashboard.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import ReportsHubSubNav from '../../components/reports/ReportsHubSubNav';
import '../../styles/reports/ManualMetricsPages.css';
import '../../styles/reports/ReportsPage.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PROCESS_MS = 2800;

function ManualMetricsProcessingInner() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const year = parseInt(searchParams.get('year'), 10);
  const month = parseInt(searchParams.get('month'), 10);
  const [tick, setTick] = useState(0);

  const valid = Number.isFinite(year) && year >= 2000 && Number.isFinite(month) && month >= 1 && month <= 12;

  useEffect(() => {
    if (!valid || !token) return;
    const t = setInterval(() => setTick((x) => x + 1), 400);
    const done = setTimeout(() => {
      navigate(`/reports/manual-metrics/dashboard?year=${year}&month=${month}`, { replace: true });
    }, PROCESS_MS);
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
  }, [valid, token, year, month, navigate]);

  if (!valid) {
    return (
      <div className="mm-process journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <p>Invalid period.</p>
        <Link to="/reports/manual-metrics" className="rp-btn rp-btn--secondary">Manual metrics</Link>
      </div>
    );
  }

  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const phase = tick % 4;

  return (
    <div className="mm-process journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      <ReportsHubSubNav role="premium" year={year} month={month} />
      <div className="mm-process-inner">
        <div className="mm-process-ring" aria-hidden>
          <div className={`mm-process-dot mm-process-dot--${phase}`} />
        </div>
        <h1 className="mm-process-title">Reviewing your MT5 data</h1>
        <p className="mm-process-sub">
          Parsing <strong>{label}</strong> export and building your snapshot metrics…
        </p>
        <p className="mm-process-hint">You’ll be taken to your manual metrics dashboard in a moment.</p>
        <Link to={`/reports/manual-metrics/dashboard?year=${year}&month=${month}`} className="mm-process-skip">
          Skip to dashboard
        </Link>
      </div>
    </div>
  );
}

export default function ManualMetricsProcessingPage() {
  return (
    <AuraTerminalThemeShell>
      <ManualMetricsProcessingInner />
    </AuraTerminalThemeShell>
  );
}
