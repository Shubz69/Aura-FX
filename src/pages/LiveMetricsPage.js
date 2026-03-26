import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Live Metrics is represented by Aura Analysis "Performance" and session-linked analytics today.
 * This page exists to match the Aura Terminal operating system messaging.
 */
export default function LiveMetricsPage() {
  return <Navigate to="/aura-analysis/dashboard/performance" replace />;
}
