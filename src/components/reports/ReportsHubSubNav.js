import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * Hub navigation on Performance & DNA: Monthly → DNA → Manual metrics (Aura is separate; not a sub-tab here).
 */
export default function ReportsHubSubNav({ role, year, month }) {
  const location = useLocation();
  const dashboardTo = `/reports/manual-metrics/dashboard?year=${year}&month=${month}`;
  const manualMetricsPathActive = location.pathname.startsWith('/reports/manual-metrics');

  const manualMetricsClassName = () =>
    `rp-subnav-link${manualMetricsPathActive ? ' rp-subnav-link--active' : ''}`;

  if (role === 'premium') {
    return (
      <nav className="rp-subnav" aria-label="Performance and DNA sections">
        <NavLink end to="/reports" className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}>
          Monthly report
        </NavLink>
        <NavLink
          to="/reports/dna"
          className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}
        >
          DNA
        </NavLink>
        <NavLink to={dashboardTo} className={manualMetricsClassName}>
          Manual metrics
        </NavLink>
      </nav>
    );
  }
  if (role === 'elite' || role === 'admin') {
    return (
      <nav className="rp-subnav" aria-label="Performance and DNA sections">
        <NavLink end to="/reports" className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}>
          Monthly report
        </NavLink>
        <NavLink
          to="/reports/dna"
          className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}
        >
          DNA
        </NavLink>
        <NavLink to="/reports/manual-metrics" className={manualMetricsClassName}>
          Manual metrics
        </NavLink>
      </nav>
    );
  }
  return null;
}
