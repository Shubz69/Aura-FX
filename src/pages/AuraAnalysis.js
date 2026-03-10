import React from 'react';
import { Outlet } from 'react-router-dom';
import '../styles/AuraAnalysis.css';

/** Layout for Aura Analysis: gateway (index), AI (ConnectionHub), or Trade Validator. */
export default function AuraAnalysis() {
  return <Outlet />;
}
