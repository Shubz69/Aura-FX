import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/roles';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/AuraAnalysis.css';

/** Non–super-admin users see "Incoming". Super admin sees Connection Hub and dashboard via Outlet. */
export default function AuraAnalysis() {
  const { user } = useAuth();
  const superAdmin = user && isSuperAdmin(user);

  if (!superAdmin) {
    return (
      <div className="aura-analysis-page">
        <CosmicBackground />
        <div className="aura-analysis-container">
          <h1 className="aura-analysis-title">Aura Analysis</h1>
          <p className="aura-analysis-sub">Incoming</p>
          <div className="aura-analysis-incoming">
            <p className="aura-analysis-incoming-text">This feature is coming soon. Stay tuned.</p>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
