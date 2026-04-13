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
  { path: `${BASE}/calculator`,      label: 'Trade Calculator' },
  { path: `${BASE}/journal`,         label: 'Trade Journal' },
  { path: `${BASE}/analytics`,       label: 'Analytics' },
  { path: `${BASE}/trader-cv`,       label: 'Trader CV' },
  { path: `${BASE}/leaderboard`,     label: 'Leaderboard' },
];

const HERO_TRADER_LAB = { path: `${BASE}/trader-lab`, label: 'Trader Lab' };
const HERO_PLAYBOOK = { path: `${BASE}/trader-playbook`, label: 'Trader Playbook' };
const HERO_MISSED = { path: `${BASE}/missed-trade-review`, label: 'Missed Review' };

export default function TradeValidatorShell() {
  return (
    <TradeValidatorAccountProvider>
    <AuraTerminalThemeShell>
    <div className="aura-shell trade-validator-shell journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      <header className="aura-shell-hero">
        <div className="aura-shell-hero-inner trade-validator-hero-inner">
          <nav className="trade-validator-hero-suite trade-validator-hero-suite--left" aria-label="Trader Lab">
            <NavLink
              to={HERO_TRADER_LAB.path}
              className={({ isActive }) =>
                `trade-validator-hero-suite-link${isActive ? ' trade-validator-hero-suite-link--active' : ''}`
              }
            >
              {HERO_TRADER_LAB.label}
            </NavLink>
          </nav>
          <div className="aura-shell-titles trade-validator-hero-titles">
            <h1 className="aura-shell-title">Trade Validator</h1>
            <p className="aura-shell-sub">
              One workspace: Trader Lab (plan), Playbook (rules), then Checklist, Calculator, and Journal. Import context from
              Trader Desk → Market Decoder → Export.
            </p>
          </div>
          <nav className="trade-validator-hero-suite trade-validator-hero-suite--right" aria-label="Playbook and review">
            <NavLink
              to={HERO_PLAYBOOK.path}
              className={({ isActive }) =>
                `trade-validator-hero-suite-link${isActive ? ' trade-validator-hero-suite-link--active' : ''}`
              }
            >
              {HERO_PLAYBOOK.label}
            </NavLink>
            <NavLink
              to={HERO_MISSED.path}
              className={({ isActive }) =>
                `trade-validator-hero-suite-link${isActive ? ' trade-validator-hero-suite-link--active' : ''}`
              }
            >
              {HERO_MISSED.label}
            </NavLink>
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
    </TradeValidatorAccountProvider>
  );
}
