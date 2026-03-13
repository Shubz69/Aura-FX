import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import '../../styles/aura-analysis/AuraDashboard.css';

const TABS = [
  { path: 'overview', label: 'Overview' },
  { path: 'performance', label: 'Performance' },
  { path: 'risk-lab', label: 'Risk Lab' },
  { path: 'edge-analyzer', label: 'Edge Analyzer' },
  { path: 'execution-lab', label: 'Execution Lab' },
  { path: 'calendar', label: 'Calendar' },
  { path: 'growth', label: 'Growth' },
];

const base = '/aura-analysis/dashboard';

export default function AuraDashboardLayout() {
  return (
    <div className="aura-dashboard">
      <div className="aura-dashboard-tabs-wrap">
        <div className="aura-dashboard-tabs-inner">
          <Link to="/aura-analysis/ai" className="aura-dashboard-back">
            ← Connection Hub
          </Link>
          <nav className="aura-dashboard-tabs" aria-label="MT5 Dashboard sections">
            {TABS.map(({ path, label }) => (
              <NavLink
                key={path}
                to={`${base}/${path}`}
                className={({ isActive }) => `aura-dashboard-tab ${isActive ? 'active' : ''}`}
                end={path === 'overview'}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <main className="aura-dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
