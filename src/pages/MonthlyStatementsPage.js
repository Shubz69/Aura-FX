import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Monthly Statements correspond to the Reports area in this codebase.
 * We redirect to the monthly report hub page so the UX is reachable.
 */
export default function MonthlyStatementsPage() {
  return <Navigate to="/reports" replace />;
}
