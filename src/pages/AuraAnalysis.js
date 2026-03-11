import React from 'react';
import { Outlet } from 'react-router-dom';
import '../styles/AuraAnalysis.css';

/** Layout for Aura Analysis (MT5 / Connection Hub + dashboard). Renders child route only. */
export default function AuraAnalysis() {
  return <Outlet />;
}
