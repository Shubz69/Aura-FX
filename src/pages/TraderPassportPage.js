import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/TraderPassport.css';
import TraderCVTab from './aura-analysis/TraderCVTab';

/**
 * Trader Passport is currently fulfilled by Trader CV in Aura Analysis.
 * We keep this page to match the Aura Terminal™ product messaging.
 */
export default function TraderPassportPage() {
  const { user } = useAuth();
  const [active] = useState('passport');

  const guard = useMemo(() => Boolean(user?.id), [user?.id]);
  if (!guard) return <Navigate to="/login" replace />;

  return (
    <div className="tp-page">
      <section className="tp-hero">
        <h1>Trader Passport</h1>
        <p>Identity layer combining Trader CV performance evidence and behavioural signals.</p>
      </section>
      <section className="tp-body">
        <TraderCVTab activeTab={active} />
      </section>
    </div>
  );
}
