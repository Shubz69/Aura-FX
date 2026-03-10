import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AuraAnalysisShell from '../components/aura-analysis/AuraAnalysisShell';
import '../styles/AuraAnalysis.css';

const TABBED_PATHS = ['/aura-analysis/overview', '/aura-analysis/trade-validator', '/aura-analysis/calculator', '/aura-analysis/journal', '/aura-analysis/analytics', '/aura-analysis/leaderboard', '/aura-analysis/profile'];

/** Layout for Aura Analysis: when on a tabbed path, show Shell (title + tabs) + content. */
export default function AuraAnalysis() {
  const location = useLocation();
  const isTabbed = TABBED_PATHS.includes(location.pathname);
  if (isTabbed) {
    return (
      <AuraAnalysisShell>
        <Outlet />
      </AuraAnalysisShell>
    );
  }
  return <Outlet />;
}
