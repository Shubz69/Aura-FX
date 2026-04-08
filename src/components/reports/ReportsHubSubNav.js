import React from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Hub navigation on Performance & DNA: Monthly → DNA.
 * Manual metrics (MT5 CSV) lives at /manual-metrics and Aura Analysis → Connection Hub.
 */
export default function ReportsHubSubNav({ role }) {
  const showMonthly =
    role === 'premium' || role === 'elite' || role === 'admin' || role === 'pro';

  return (
    <nav className="rp-subnav" aria-label="Performance and DNA sections">
      <NavLink
        to="/reports/live"
        className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}
      >
        Live analytics
      </NavLink>
      {showMonthly ? (
        <NavLink end to="/reports" className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}>
          Monthly report
        </NavLink>
      ) : (
        <NavLink end to="/reports" className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}>
          Reports hub
        </NavLink>
      )}
      <NavLink
        to="/reports/dna"
        className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}
      >
        DNA
      </NavLink>
    </nav>
  );
}
