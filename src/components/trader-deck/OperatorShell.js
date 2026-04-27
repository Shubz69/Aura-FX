import React from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
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

// Pages that render WITHOUT the hero title and tab rail
const CLEAN_PAGES = [
  `${BASE}/trader-lab`,
  `${BASE}/trader-playbook`,
];

export default function OperatorShell() {
  const location = useLocation();
  const isCleanPage = CLEAN_PAGES.some(path => location.pathname.startsWith(path));

  return (
    <OperatorAccountProvider>
    <AuraTerminalThemeShell>
    <div className={`aura-shell trade-validator-shell journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page ${isCleanPage ? 'trade-validator-shell--clean' : ''}`}>
      
      {/* ── Hero Header ── */}
      <header className={`aura-shell-hero ${isCleanPage ? 'aura-shell-hero--clean' : ''}`}>
        <div className={`aura-shell-hero-inner trade-validator-hero-inner ${isCleanPage ? 'trade-validator-hero-inner--clean' : 'trade-validator-hero-inner--centered'}`}>
          
          {/* ── Back to Operator Galaxy (always visible) ── */}
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

          {/* ── Title (Trade Validator pages) ── */}
          {!isCleanPage && (
            <div className="aura-shell-titles trade-validator-hero-titles">
              <h1 className="aura-shell-title">Trade Validator</h1>
            </div>
          )}

          {/* ── Clean page title (Trader Lab / Playbook - centered) ── */}
          {isCleanPage && (
            <div className="aura-shell-titles trade-validator-hero-titles trade-validator-hero-titles--clean">
              <h1 className="aura-shell-title aura-shell-title--clean">
                {location.pathname.includes('trader-lab') ? 'Trader Lab' : 'Trade Playbook'}
              </h1>
            </div>
          )}

          {/* Spacer for symmetry */}
          {!isCleanPage && <div className="trade-validator-hero-spacer" />}
          {isCleanPage && <div className="trade-validator-hero-spacer-clean" />}
        </div>
      </header>

      {/* ── Tab Rail (hidden on clean pages) ── */}
      {!isCleanPage && (
        <nav className="aura-shell-tabs-wrap aura-shell-tabs-wrap--validator" aria-label="Trade Validator sections">
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
      )}

      <main className="aura-shell-content">
        <Outlet />
      </main>
    </div>
    </AuraTerminalThemeShell>
    </OperatorAccountProvider>
  );
}