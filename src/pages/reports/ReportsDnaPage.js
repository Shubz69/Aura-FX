import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import { useAuth } from '../../context/AuthContext';
import { useReportsEligibility } from './useReportsEligibility';
import TraderDnaIntroSequence from '../../components/trader-dna/TraderDnaIntroSequence';
import TraderDnaReport, { hasRenderableDnaReport } from '../../components/trader-dna/TraderDnaReport';
import TraderDnaNotReady from '../../components/trader-dna/TraderDnaNotReady';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import '../../styles/trader-dna/TraderDna.css';

function ReportsDnaPageInner() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { eligibility, loading: eligibilityLoading } = useReportsEligibility(token);
  const [loading, setLoading] = useState(true);
  const [dna, setDna] = useState(null);
  const [error, setError] = useState('');
  const [introOpen, setIntroOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [afterIntroNotReady, setAfterIntroNotReady] = useState(false);
  const [eliteGate, setEliteGate] = useState(false);
  const introCompleteRef = useRef(false);
  const couldGenerateRef = useRef(false);

  const role = (eligibility?.role || '').toLowerCase();
  const canAccessDna = role === 'elite' || role === 'admin';

  const load = useCallback(async () => {
    if (eligibilityLoading) return;
    if (eligibility && !canAccessDna) {
      setLoading(false);
      setDna(null);
      setEliteGate(true);
      setError('Trader DNA is part of A7FX Elite. Upgrade to Elite to unlock this synthesis.');
      return;
    }
    setLoading(true);
    setError('');
    setEliteGate(false);
    try {
      const res = await Api.getTraderDna();
      const body = res?.data;
      if (!body || typeof body !== 'object') {
        setError('Unexpected response from the server. Please refresh the page.');
        setDna(null);
        return;
      }
      if (body.success === false) {
        setError(body.message || 'Trader DNA could not be loaded.');
        setDna(null);
        return;
      }
      setDna(body);
    } catch (e) {
      const status = e?.response?.status;
      const code = e?.response?.data?.code;
      const serverMsg = e?.response?.data?.message;
      let msg =
        serverMsg ||
        (status === 401
          ? 'Session expired — sign in again to load Trader DNA.'
          : status === 503
            ? 'Service temporarily unavailable. Try again in a moment.'
            : e.message || 'Failed to load Trader DNA');
      if (code === 'ELITE_REQUIRED') {
        setEliteGate(true);
        msg =
          serverMsg ||
          'Trader DNA is part of A7FX Elite. Upgrade to Elite to unlock this synthesis — Premium does not include it.';
      }
      if (!serverMsg && status === 500) {
        msg = 'Server error while loading Trader DNA. If this keeps happening, contact support.';
      }
      if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message || '')) {
        msg = 'Request timed out. Check your connection and tap Refresh status.';
      }
      setError(msg);
      setDna(null);
    } finally {
      setLoading(false);
    }
  }, [eligibility, eligibilityLoading, canAccessDna]);

  useEffect(() => {
    load();
  }, [load]);

  const handleIntroComplete = useCallback(async () => {
    if (introCompleteRef.current) return;
    introCompleteRef.current = true;
    setIntroOpen(false);
    if (couldGenerateRef.current) {
      setResolving(true);
      setAfterIntroNotReady(false);
      try {
        const res = await Api.generateTraderDna();
        if (res.data?.success !== false) {
          toast.success('Trader DNA sealed for this cycle.');
        }
        await load();
      } catch (e) {
        const code = e?.response?.data?.code;
        const msg = e?.response?.data?.message || e.message || 'Generation failed';
        if (code === 'CYCLE_ACTIVE') {
          toast.info(msg);
        } else {
          toast.error(msg);
        }
        await load();
      } finally {
        setResolving(false);
        introCompleteRef.current = false;
        couldGenerateRef.current = false;
      }
    } else {
      setAfterIntroNotReady(true);
      introCompleteRef.current = false;
      couldGenerateRef.current = false;
    }
  }, [load]);

  const openIntro = () => {
    introCompleteRef.current = false;
    couldGenerateRef.current = Boolean(dna?.canGenerateNow);
    if (!dna?.canGenerateNow) {
      setAfterIntroNotReady(false);
    }
    setIntroOpen(true);
  };

  const report = dna?.report;
  const hasReport = hasRenderableDnaReport(report);
  const canGen = Boolean(dna?.canGenerateNow);
  const cooldown = dna?.cooldown?.active;
  const remLabel = dna?.cooldown?.remaining?.label;

  return (
    <div className="tdna-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      {introOpen && <TraderDnaIntroSequence onComplete={handleIntroComplete} />}

      {resolving &&
        createPortal(
          <div className="tdna-resolving">
            <div className="tdna-resolving-spinner" />
            <span>Sealing profile · writing DNA snapshot</span>
          </div>,
          document.body
        )}

      <Link to="/reports" className="tdna-back">
        ← Performance & DNA
      </Link>

      <header className="tdna-landing-head">
        <p className="tdna-landing-kicker">Aura Terminal</p>
        <h1 className="tdna-landing-title">Trader DNA</h1>
        <p className="tdna-landing-sub">
          <strong>Who you are as a trader</strong> — built from data in The Operator and your journal (roughly{' '}
          {dna?.analysisWindowDays || 90} days). This is a blunt psychological and behavioural mirror, refreshed on a{' '}
          ~90-day cycle. <strong>How to get better:</strong> use{' '}
          <Link to="/reports" style={{ color: '#f8c37d', fontWeight: 700 }}>
            Monthly reports
          </Link>{' '}
          for ranked fixes, failure modes, and measurable checks — not DNA alone.
        </p>

        <div className="tdna-cta-row">
          <button
            type="button"
            className="tdna-btn tdna-btn--primary"
            onClick={openIntro}
            disabled={loading || eliteGate}
          >
            Enter DNA synthesis chamber
          </button>
          <Link to="/reports" className="tdna-btn tdna-btn--ghost">
            Monthly improvement playbook
          </Link>
          {hasReport && (
            <button type="button" className="tdna-btn tdna-btn--ghost" onClick={load} disabled={loading}>
              Refresh status
            </button>
          )}
        </div>
      </header>

      {loading && !dna && (
        <div className="tdna-load-panel" aria-live="polite">
          <div className="tdna-resolving-spinner tdna-load-panel-spinner" />
          <p className="tdna-landing-sub tdna-load-panel-text">
            Loading your DNA status, trade window, and any saved snapshot from the database…
          </p>
        </div>
      )}

      {error && (
        <div className="tdna-err" role="alert">
          <p>{error}</p>
          <div className="tdna-err-actions">
            {eliteGate && (
              <button type="button" className="tdna-btn tdna-btn--primary" onClick={() => navigate('/choose-plan')}>
                Upgrade to Elite
              </button>
            )}
            <button type="button" className="tdna-btn tdna-btn--ghost tdna-err-retry" onClick={() => load()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && dna?.loadWarning && <div className="tdna-warn-banner">{dna.loadWarning}</div>}

      {!loading &&
        dna?.dataHealth?.errors?.length > 0 &&
        dna.dataHealth.errors.map((err) => (
          <div key={err.source} className="tdna-warn-banner tdna-warn-banner--strong" role="status">
            {err.message}
          </div>
        ))}

      {!loading && dna?.snapshotCorrupt && !hasReport && (
        <div className="tdna-warn-banner tdna-warn-banner--strong" role="status">
          A DNA snapshot exists on your account but could not be read. When your cycle allows, run synthesis again to
          rebuild it, or contact support if this repeats.
        </div>
      )}

      {!loading && dna && cooldown && hasReport && (
        <div className="tdna-cooldown-strip">
          <span>
            <strong>Cycle locked.</strong> {remLabel ? `Next synthesis: ${remLabel}.` : 'Next window opening soon.'}
          </span>
          {dna.latestSnapshot?.nextEligibleAt && (
            <span>
              {new Date(dna.latestSnapshot.nextEligibleAt).toLocaleString(undefined, {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </span>
          )}
        </div>
      )}

      {!loading && dna && hasReport && <TraderDnaReport report={report} nextEligibleAt={dna.latestSnapshot?.nextEligibleAt} cycleDays={dna.cycleDays} />}

      {!loading && dna && !hasReport && (
        <TraderDnaNotReady dna={dna} afterIntro={afterIntroNotReady} />
      )}

      {!loading && dna && hasReport && canGen && (
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <button type="button" className="tdna-btn tdna-btn--primary" onClick={openIntro}>
            Run new cycle synthesis
          </button>
          <p className="tdna-landing-sub" style={{ marginTop: 12 }}>
            Eligible for a fresh DNA reading. The chamber sequence runs ~30 seconds before your profile is sealed.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ReportsDnaPage() {
  return (
    <AuraTerminalThemeShell>
      <ReportsDnaPageInner />
    </AuraTerminalThemeShell>
  );
}
