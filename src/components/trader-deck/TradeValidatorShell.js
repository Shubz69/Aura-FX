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
import '../../styles/trader-deck/TradeValidatorJournalPanels.css';

const BASE = '/trader-deck/trade-validator';
/** Main tab rail — Trader Lab & Playbook live in the header; Trader Replay is under Aura Analysis. */
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

const HERO_SUITE_LINKS = [
  { path: `${BASE}/trader-lab`, label: 'Trader Lab' },
  { path: `${BASE}/trader-playbook`, label: 'Trader Playbook' },
];

export default function TradeValidatorShell() {
  return (
    <TradeValidatorAccountProvider>
    <AuraTerminalThemeShell>
    <div className="aura-shell trade-validator-shell journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">
      <header className="aura-shell-hero">
        <div className="aura-shell-hero-inner trade-validator-hero-inner">
          <span className="trade-validator-hero-spacer" aria-hidden="true" />
          <div className="aura-shell-titles trade-validator-hero-titles">
            <h1 className="aura-shell-title">Trade Validator</h1>
            <p className="aura-shell-sub">Manual trade planning, validation and journaling tools</p>
          </div>
          <nav className="trade-validator-hero-suite" aria-label="Trader Lab and Playbook">
            {HERO_SUITE_LINKS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `trade-validator-hero-suite-link${isActive ? ' trade-validator-hero-suite-link--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
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
