import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCanEnterAuraDashboard } from '../../context/AuraConnectionContext';

/** Redirect to Connection Hub if user cannot enter dashboard (no connection and not super admin). */
export default function AuraDashboardGuard({ children }) {
  const { user } = useAuth();
  const canEnter = useCanEnterAuraDashboard(user);
  const location = useLocation();

  if (!canEnter) {
    return <Navigate to="/aura-analysis" state={{ from: location }} replace />;
  }

  return children;
}
