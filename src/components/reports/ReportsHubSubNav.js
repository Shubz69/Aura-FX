import React from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Hub navigation on Performance & DNA: Monthly → DNA.
 * Manual metrics (MT5 CSV) lives at /manual-metrics and Aura Analysis → Connection Hub.
 */
export default function ReportsHubSubNav({ role }) {
  if (role === 'premium' || role === 'elite' || role === 'admin') {
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
      </nav>
    );
  }
  return null;
}
