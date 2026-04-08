import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import '../../styles/aura-analysis/AuraShared.css';
import '../../styles/backtesting/Backtesting.css';

const links = [
  { to: '/backtesting', end: true, label: 'Hub' },
  { to: '/backtesting/sessions', label: 'Sessions' },
  { to: '/backtesting/trades', label: 'Trades' },
  { to: '/backtesting/reports', label: 'Reports' },
];

export default function BacktestingLayout() {
  return (
    <AuraTerminalThemeShell bodyClassName="journal-glass-panel--pad">
      <div className="journal-glass-panel journal-glass-panel--rim aa-page bt-root">
        <nav className="bt-nav-tabs" aria-label="Backtesting sections">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </AuraTerminalThemeShell>
  );
}
