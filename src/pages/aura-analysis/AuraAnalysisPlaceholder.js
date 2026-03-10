import React from 'react';

export default function AuraAnalysisPlaceholder({ title = 'Coming soon' }) {
  return (
    <div style={{ paddingTop: 24, textAlign: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>{title}</p>
    </div>
  );
}
