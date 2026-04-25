import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCanEnterAuraDashboard } from '../../context/AuraConnectionContext';
import { isQaTestModeEnabled } from '../../utils/qaTestMode';

/** Redirect to Connection Hub if user cannot enter dashboard (no MetaTrader link and not super admin). */
export default function AuraDashboardGuard({ children }) {
  const { user } = useAuth();
  const qaBypass = isQaTestModeEnabled();
  const canEnter = useCanEnterAuraDashboard(user);
  const location = useLocation();

  if (!qaBypass && !canEnter) {
    return <Navigate to="/aura-analysis/ai" state={{ from: location }} replace />;
  }

  return children;
}
