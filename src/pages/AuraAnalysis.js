import React from 'react';
import { Outlet } from 'react-router-dom';
import '../styles/AuraAnalysis.css';

/** Layout for Aura Analysis (Connection Hub + MetaTrader dashboard). Renders child route only. */
export default function AuraAnalysis() {
  return <Outlet />;
}
