import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import TraderDnaIntroSequence from '../../components/trader-dna/TraderDnaIntroSequence';
import TraderDnaReport, { hasRenderableDnaReport } from '../../components/trader-dna/TraderDnaReport';
import TraderDnaNotReady from '../../components/trader-dna/TraderDnaNotReady';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import '../../styles/trader-dna/TraderDna.css';

function ReportsDnaPageInner() {
  const [loading, setLoading] = useState(true);
  const [dna, setDna] = useState(null);
  const [error, setError] = useState('');
  const [introOpen, setIntroOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [afterIntroNotReady, setAfterIntroNotReady] = useState(false);
  const introCompleteRef = useRef(false);
  const couldGenerateRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
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
  }, []);

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
    <div className="tdna-page journal-glass-panel journal-glass-panel--pad">
      {introOpen && <TraderDnaIntroSequence onComplete={handleIntroComplete} />}

      {resolving && (
        <div className="tdna-resolving">
          <div className="tdna-resolving-spinner" />
          <span>Sealing profile · writing DNA snapshot</span>
        </div>
      )}

      <Link to="/reports" className="tdna-back">
        ← Monthly Reports
      </Link>

      <header className="tdna-landing-head">
        <p className="tdna-landing-kicker">Aura Terminal</p>
        <h1 className="tdna-landing-title">Trader DNA</h1>
        <p className="tdna-landing-sub">
          A behavioural, execution, and psychological identity synthesis built from your validated trades and journal
          signal. Eligibility uses roughly your last {dna?.analysisWindowDays || 90} days (~3 months) of data; each sealed
          report is stored for your account until the next cycle.
        </p>

        <div className="tdna-cta-row">
          <button type="button" className="tdna-btn tdna-btn--primary" onClick={openIntro} disabled={loading}>
            Enter DNA synthesis chamber
          </button>
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
          <button type="button" className="tdna-btn tdna-btn--ghost tdna-err-retry" onClick={() => load()}>
            Try again
          </button>
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
