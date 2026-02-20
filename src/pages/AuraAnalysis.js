import React from 'react';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/roles';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/AuraAnalysis.css';

const AuraAnalysis = () => {
  const { user } = useAuth();
  const superAdmin = user && isSuperAdmin(user);

  return (
    <div className="aura-analysis-page">
      <CosmicBackground />
      <div className="aura-analysis-container">
        {superAdmin ? (
          <>
            <h1 className="aura-analysis-title">Aura Analysis</h1>
            <p className="aura-analysis-sub">Super Admin access. Analysis tools and dashboards will appear here.</p>
            <div className="aura-analysis-placeholder">
              <p>This area is reserved for Aura Analysis features.</p>
            </div>
          </>
        ) : (
          <>
            <h1 className="aura-analysis-title">Aura Analysis</h1>
            <p className="aura-analysis-sub">Incoming</p>
            <div className="aura-analysis-incoming">
              <p className="aura-analysis-incoming-text">This feature is coming soon. Stay tuned.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuraAnalysis;
