import React from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import '../../styles/aura-analysis/AuraAnalysisShell.css';

const TABS = [
  { path: '/aura-analysis/overview', label: 'Overview' },
  { path: '/aura-analysis/calculator', label: 'Trade Calculator' },
  { path: '/aura-analysis/trade-validator', label: 'Trade Validator' },
  { path: '/aura-analysis/journal', label: 'Trade Journal' },
  { path: '/aura-analysis/analytics', label: 'Analytics' },
  { path: '/aura-analysis/leaderboard', label: 'Leaderboard' },
  { path: '/aura-analysis/profile', label: 'Profile' },
];

export default function AuraAnalysisShell({ children }) {
  return (
    <div className="aura-shell">
      <header className="aura-shell-hero">
        <div className="aura-shell-hero-inner">
          <div className="aura-shell-titles">
            <h1 className="aura-shell-title">Aura Analysis</h1>
            <p className="aura-shell-sub">Manual trade planning, validation and journaling tools</p>
          </div>
          <Link to="/aura-analysis/trade-validator" className="aura-shell-quick-add">
            <FaPlus aria-hidden /> Quick Add Trade
          </Link>
        </div>
      </header>

      <nav className="aura-shell-tabs-wrap" aria-label="Aura Analysis sections">
        <div className="aura-shell-tabs-inner">
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/aura-analysis/overview'}
              className={({ isActive }) => `aura-shell-tab ${isActive ? 'active' : ''}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="aura-shell-content">
        {children != null ? children : <Outlet />}
      </main>
    </div>
  );
}
