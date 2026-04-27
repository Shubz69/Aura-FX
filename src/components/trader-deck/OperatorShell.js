import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { OperatorAccountProvider } from '../../context/OperatorAccountContext';
import AuraTerminalThemeShell from '../AuraTerminalThemeShell';
import '../../styles/aura-analysis/AuraAnalysisShell.css';
import '../../styles/trader-deck/OperatorJournalGlass.css';
import '../../styles/trader-deck/OperatorTabModern.css';
import '../../styles/trader-deck/OperatorRouteThemeGold.css';
import '../../styles/trader-deck/OperatorJournalPanels.css';

const BASE = '/trader-deck/trade-validator';
const TABS = [
  { path: `${BASE}/overview`,        label: 'Overview' },
  { path: `${BASE}/checklist`,       label: 'Checklist' },
  { path: `${BASE}/calculator`,      label: 'Trade Calculator' },
  { path: `${BASE}/journal`,         label: 'Trade Journal' },
  { path: `${BASE}/analytics`,       label: 'Analytics' },
  { path: `${BASE}/trader-cv`,       label: 'Trader CV' },
  { path: `${BASE}/leaderboard`,     label: 'Leaderboard' },
];

export default function OperatorShell() {
  return (
    <OperatorAccountProvider>
    <AuraTerminalThemeShell>
    <div className="aura-shell trade-validator-shell journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      <header className="aura-shell-hero">
        <div className="aura-shell-hero-inner trade-validator-hero-inner trade-validator-hero-inner--centered">
          
          {/* ── Back to Operator Galaxy ── */}
          <nav className="trade-validator-hero-back" aria-label="Back to Operator Galaxy">
            <Link
             to="/operator-galaxy"
              className="trade-validator-back-link"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="trade-validator-back-icon">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Operator Galaxy
            </Link>
          </nav>

          <div className="aura-shell-titles trade-validator-hero-titles">
            <h1 className="aura-shell-title">The Operator</h1>
            <p className="aura-shell-sub">
              One workspace: Checklist, Calculator, Journal, Analytics, Trader CV & Leaderboard.
            </p>
          </div>

          {/* Spacer for symmetry */}
          <div className="trade-validator-hero-spacer" />
        </div>
      </header>

      <nav className="aura-shell-tabs-wrap aura-shell-tabs-wrap--validator" aria-label="The Operator sections">
        <div className="aura-shell-tabs-rail">
          <div className="aura-shell-tabs-inner aura-shell-tabs-inner--validator">
            {TABS.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                end
                className={({ isActive }) => `aura-shell-tab aura-shell-tab--validator ${isActive ? 'active' : ''}`}
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <main className="aura-shell-content">
        <Outlet />
      </main>
    </div>
    </AuraTerminalThemeShell>
    </OperatorAccountProvider>
  );
}