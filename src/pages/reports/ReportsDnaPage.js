import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import TraderDnaIntroSequence from '../../components/trader-dna/TraderDnaIntroSequence';
import TraderDnaReport, { hasRenderableDnaReport } from '../../components/trader-dna/TraderDnaReport';
import TraderDnaNotReady from '../../components/trader-dna/TraderDnaNotReady';
import '../../styles/trader-dna/TraderDna.css';

export default function ReportsDnaPage() {
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
      setDna(res.data);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load Trader DNA';
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
    <div className="tdna-page">
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
          signal. Refreshes on a strict {dna?.cycleDays || 90}-day cadence once minimum data quality is met.
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

      {loading && !dna && <p className="tdna-landing-sub">Loading DNA engine…</p>}

      {error && <div className="tdna-err">{error}</div>}

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
