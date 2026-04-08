import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Api from '../../services/Api';

/**
 * Read-only Trader DNA snapshot for Aura Overview (cross-product moat).
 */
export default function AuraDnaOverviewCard() {
  const [state, setState] = useState({ loading: true, err: null, payload: null });

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await Api.getTraderDna();
        if (cancel) return;
        const d = res?.data;
        if (d?.success === false) {
          setState({
            loading: false,
            err: d?.message || 'Unavailable',
            snapshot: null,
            report: null,
            status: d?.code || null,
          });
          return;
        }
        setState({
          loading: false,
          err: null,
          snapshot: d?.latestSnapshot || null,
          report: d?.report || null,
          status: d?.status || null,
        });
      } catch (e) {
        if (!cancel) {
          const msg = e?.response?.data?.message || e?.message || 'Could not load Trader DNA';
          setState({ loading: false, err: msg, snapshot: null, report: null, status: null });
        }
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (state.loading) {
    return (
      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-skeleton" style={{ height: 88, borderRadius: 10 }} aria-hidden />
      </div>
    );
  }

  const p = state.report;
  const snap = state.snapshot;
  const archetype = snap?.archetype || p?.archetype;
  const priority = p?.improvementPriority || p?.development?.topPriority || p?.crossPlatform?.priorities?.[0]?.title;
  const score = snap?.overallScore ?? p?.scores?.overallDNA ?? p?.scores?.composite;

  if (state.err && !p && !snap) {
    return (
      <div className="aa-card" style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="aa-section-title">Trader DNA</div>
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
          {state.err} — open the full report for details.
        </p>
        <Link to="/reports/dna" className="aura-db-refresh-btn" style={{ marginTop: 10, display: 'inline-block', textDecoration: 'none', padding: '6px 12px' }}>
          Open Trader DNA
        </Link>
      </div>
    );
  }

  return (
    <div className="aa-card aa-card--accent" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="aa-section-title" style={{ marginBottom: 6 }}>Trader DNA (cross-platform)</div>
          <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6, maxWidth: 520 }}>
            Synthesizes Validator, journal, replay, playbook, lab, and deck signals — not just MetaTrader history.
          </p>
        </div>
        {state.status && (
          <span className="aa-pill aa-pill--accent" style={{ fontSize: '0.58rem' }}>{String(state.status)}</span>
        )}
        {score != null && Number.isFinite(Number(score)) && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Score</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8c37d' }}>{Math.round(Number(score))}</div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55 }}>
        {archetype && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>Archetype: </span>
            <strong style={{ color: '#eaa960' }}>{String(archetype)}</strong>
          </div>
        )}
        {priority && (
          <div>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>Focus: </span>
            {String(priority)}
          </div>
        )}
        {!archetype && !priority && (
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Generate a snapshot in Reports to populate your DNA card.</span>
        )}
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/reports/dna" style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f8c37d', textDecoration: 'none' }}>
          Full DNA report →
        </Link>
        <Link to="/trader-deck/trade-validator/trader-cv" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>
          Trader CV
        </Link>
      </div>
    </div>
  );
}
