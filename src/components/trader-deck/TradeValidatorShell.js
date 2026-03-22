/**
 * Trade Validator route shell (/trader-deck/trade-validator/*). Nav + Outlet only;
 * tab pages own their logic. Theme CSS is scoped with .trade-validator-shell.
 */
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { TradeValidatorAccountProvider } from '../../context/TradeValidatorAccountContext';
import AuraTerminalThemeShell from '../AuraTerminalThemeShell';
import '../../styles/aura-analysis/AuraAnalysisShell.css';
import '../../styles/trader-deck/TradeValidatorJournalGlass.css';
import '../../styles/trader-deck/TradeValidatorTabModern.css';
import '../../styles/trader-deck/TradeValidatorRouteThemeGold.css';

const BASE = '/trader-deck/trade-validator';
const TABS = [
  { path: `${BASE}/overview`,        label: 'Overview' },
  { path: `${BASE}/checklist`,       label: 'Checklist' },
  { path: `${BASE}/ai-chart-check`,  label: 'AI Chart Check' },
  { path: `${BASE}/calculator`,      label: 'Trade Calculator' },
  { path: `${BASE}/journal`,         label: 'Trade Journal' },
  { path: `${BASE}/analytics`,       label: 'Analytics' },
  { path: `${BASE}/trader-cv`,       label: 'Trader CV' },
  { path: `${BASE}/leaderboard`,     label: 'Leaderboard' },
];

export default function TradeValidatorShell() {
  return (
    <TradeValidatorAccountProvider>
    <AuraTerminalThemeShell>
    <div className="aura-shell trade-validator-shell journal-glass-panel journal-glass-panel--pad">
      <header className="aura-shell-hero">
        <div className="aura-shell-hero-inner">
          <div className="aura-shell-titles">
            <h1 className="aura-shell-title">Trade Validator</h1>
            <p className="aura-shell-sub">Manual trade planning, validation and journaling tools</p>
          </div>
        </div>
      </header>

      <nav className="aura-shell-tabs-wrap aura-shell-tabs-wrap--validator" aria-label="Trade Validator sections">
        <div className="aura-shell-tabs-rail">
          <div className="aura-shell-tabs-inner aura-shell-tabs-inner--validator">
            {TABS.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.path === `${BASE}/checklist`}
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
    </TradeValidatorAccountProvider>
  );
}
