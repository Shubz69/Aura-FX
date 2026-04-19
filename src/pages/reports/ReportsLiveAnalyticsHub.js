/**
 * Curated index of live analytics & journals (TradeZella-style report library surface).
 * Links into existing Aura / deck routes — no duplicate metrics.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import ReportsHubSubNav from '../../components/reports/ReportsHubSubNav';
import { useAuth } from '../../context/AuthContext';
import { useReportsEligibility } from './useReportsEligibility';
import '../../styles/reports/ReportsLiveAnalyticsHub.css';

const SECTIONS = [
  {
    title: 'Aura Terminal — MetaTrader analytics',
    description: 'Live account stats, equity, risk, edge, execution, psychology, habits, growth.',
    links: [
      { to: '/aura-analysis/dashboard/overview', label: 'Overview', tag: 'Dashboard' },
      { to: '/aura-analysis/dashboard/performance', label: 'Performance', tag: 'P/L · R · scatter' },
      { to: '/aura-analysis/dashboard/risk-lab', label: 'Risk Lab', tag: 'DD · ruin · Kelly' },
      { to: '/aura-analysis/dashboard/edge-analyzer', label: 'Edge Analyzer', tag: 'Session · time' },
      { to: '/aura-analysis/dashboard/execution-lab', label: 'Execution Lab', tag: 'Quality · hold' },
      { to: '/aura-analysis/dashboard/calendar', label: 'Calendar intelligence', tag: 'Months · UTC' },
      { to: '/aura-analysis/dashboard/psychology', label: 'Psychology & discipline', tag: 'Behaviour' },
      { to: '/aura-analysis/dashboard/habits', label: 'Habits & strengths', tag: 'Setups · flags' },
      { to: '/aura-analysis/dashboard/growth', label: 'Growth engine', tag: 'CAGR · milestones' },
      { to: '/aura-analysis/dashboard/trader-replay', label: 'Trader Replay', tag: 'Session replay' },
    ],
  },
  {
    title: 'Journal & trade log',
    description: 'Daily diary, task discipline, validator trade grid (columns, CSV).',
    links: [
      { to: '/journal', label: 'Daily journal', tag: 'Diary · mood' },
      { to: '/trader-deck/trade-validator/journal', label: 'Trade log', tag: 'Rows · export' },
      { to: '/trader-deck/trade-validator/trader-playbook', label: 'Playbook', tag: 'Strategies' },
      { to: '/trader-deck/trade-validator/analytics', label: 'Deck analytics', tag: 'Operator KPIs' },
    ],
  },
  {
    title: 'Research & DNA',
    description: 'Monthly AI reports, 90-day DNA, manual CSV path, backtesting workspace.',
    links: [
      { to: '/reports', label: 'Monthly reports', tag: 'Coaching' },
      { to: '/reports/dna', label: 'Trader DNA', tag: '90-day' },
      { to: '/manual-metrics', label: 'Manual metrics / CSV', tag: 'Upload' },
      { to: '/backtesting', label: 'Backtesting', tag: 'Sessions' },
      { to: '/aura-analysis/ai', label: 'Connection Hub', tag: 'MT · CSV' },
    ],
  },
];

function ReportsLiveAnalyticsHubInner() {
  const { token } = useAuth();
  const { eligibility, loading, error, reload } = useReportsEligibility(token);

  if (loading) {
    return (
      <div className="rlah-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <p className="rlah-loading">Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rlah-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <p className="rlah-error">{error}</p>
        <button type="button" className="rlah-retry" onClick={reload}>Retry</button>
      </div>
    );
  }

  const role = eligibility?.role || 'access';

  return (
    <div className="rlah-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      <header className="rlah-header">
        <p className="rlah-eyebrow">Report library</p>
        <h1 className="rlah-title">Live analytics hub</h1>
        <p className="rlah-lede">
          TradeZella-style breadth: every surface below already exists in Aura — use this page as your table of contents.
          Filters and date ranges on the dashboard apply to MetaTrader-linked data.
        </p>
      </header>

      <ReportsHubSubNav role={role} year={eligibility?.currentPeriod?.year} month={eligibility?.currentPeriod?.month} />

      <div className="rlah-sections">
        {SECTIONS.map((sec) => (
          <section key={sec.title} className="rlah-section">
            <h2 className="rlah-section-title">{sec.title}</h2>
            <p className="rlah-section-desc">{sec.description}</p>
            <ul className="rlah-link-grid">
              {sec.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="rlah-card">
                    <span className="rlah-card-label">{l.label}</span>
                    <span className="rlah-card-tag">{l.tag}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ReportsLiveAnalyticsHub() {
  return (
    <AuraTerminalThemeShell>
      <ReportsLiveAnalyticsHubInner />
    </AuraTerminalThemeShell>
  );
}
