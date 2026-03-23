import React from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Hub navigation on Performance & DNA: Premium gets CSV metrics + DNA; Elite gets Aura + DNA.
 */
export default function ReportsHubSubNav({ role, year, month }) {
  const metricsTo = `/reports/mt5-metrics?year=${year}&month=${month}`;
  if (role === 'premium') {
    return (
      <nav className="rp-subnav" aria-label="Performance and DNA sections">
        <NavLink end to="/reports" className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}>
          Monthly report
        </NavLink>
        <NavLink
          to={metricsTo}
          className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}
        >
          MT5 metrics
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
  if (role === 'elite' || role === 'admin') {
    return (
      <nav className="rp-subnav" aria-label="Performance and DNA sections">
        <NavLink end to="/reports" className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}>
          Monthly report
        </NavLink>
        <NavLink
          to="/aura-analysis/ai"
          className={({ isActive }) => `rp-subnav-link${isActive ? ' rp-subnav-link--active' : ''}`}
        >
          Aura Analysis
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
