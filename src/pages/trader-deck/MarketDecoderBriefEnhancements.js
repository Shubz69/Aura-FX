/**
 * Dense institutional sub-panels for Market Decoder brief (layout-agnostic).
 */
import React from 'react';
import { FiCheck, FiAlertCircle, FiMinusCircle, FiClock } from 'react-icons/fi';

function StatusGlyph({ status }) {
  if (status === 'valid') return <FiCheck className="md-engine-ico md-engine-ico--ok" aria-hidden />;
  if (status === 'invalid') return <FiAlertCircle className="md-engine-ico md-engine-ico--bad" aria-hidden />;
  return <FiMinusCircle className="md-engine-ico md-engine-ico--pend" aria-hidden />;
}

export function DecoderSessionBadge({ flow, overlayNote }) {
  if (!flow?.currentSession) return null;
  return (
    <div className="md-ref-session-badge" role="status">
      <span className="md-ref-session-badge-main">Active desk · {flow.currentSession}</span>
      {overlayNote ? <span className="md-ref-session-badge-sub">{overlayNote}</span> : null}
    </div>
  );
}

export function DecoderSessionFlowStrip({ flow }) {
  if (!flow) return null;
  const blocks = [
    { key: 'asia', title: 'Asia', data: flow.asia },
    { key: 'london', title: 'London', data: flow.london },
    { key: 'ny', title: 'New York', data: flow.newYork },
  ];
  return (
    <div className="md-ref-session-flow" aria-label="Session flow summary">
      {blocks.map(({ key, title, data }) => (
        <div key={key} className="md-ref-session-flow-cell">
          <span className="md-ref-session-flow-name">{title}</span>
          <span className="md-ref-session-flow-phase">{data?.behavior || '—'}</span>
          <span className="md-ref-session-flow-detail">{data?.detail || ''}</span>
        </div>
      ))}
    </div>
  );
}

export function DecoderReadinessBlock({ readiness }) {
  if (!readiness) return null;
  return (
    <div className="md-ref-readiness">
      <div className="md-ref-readiness-score">
        <span className="md-ref-readiness-num">{readiness.score ?? '—'}</span>
        <span className="md-ref-readiness-denom">/ 100</span>
      </div>
      <div className="md-ref-readiness-meta">
        <div>
          <span className="md-ref-readiness-k">Confidence</span>
          <span className="md-ref-readiness-v">{readiness.confidence || '—'}</span>
        </div>
        <div>
          <span className="md-ref-readiness-k">Session fit</span>
          <span className="md-ref-readiness-v">{readiness.sessionAlignment || '—'}</span>
        </div>
        <div>
          <span className="md-ref-readiness-k">Structure</span>
          <span className="md-ref-readiness-v">{readiness.structureQuality || '—'}</span>
        </div>
        <div>
          <span className="md-ref-readiness-k">Vol regime</span>
          <span className="md-ref-readiness-v">{readiness.volatilitySuitability || '—'}</span>
        </div>
      </div>
    </div>
  );
}

/** Dense desk row: only fields present on the decoder brief / OHLC (no invented values). */
export function DecoderDeskIntelStrip({ brief }) {
  if (!brief) return null;
  const checks = Array.isArray(brief.confirmationEngine?.checks) ? brief.confirmationEngine.checks : [];
  const verdict = (id) => {
    const c = checks.find((x) => x.id === id);
    return c?.verdict || null;
  };
  const bars = brief.meta?.chartBars;
  let rangeVsAdr = null;
  if (bars?.length) {
    const last = bars[bars.length - 1];
    const h = Number(last.high);
    const l = Number(last.low);
    const c = Number(last.close);
    if ([h, l, c].every(Number.isFinite) && c !== 0) {
      const todayPct = Math.round(((h - l) / c) * 10000) / 100;
      const adr = brief.insights?.adrPercent;
      if (adr != null && Number.isFinite(Number(adr)) && Number(adr) > 0) {
        const ratio = todayPct / Number(adr);
        const tag = ratio >= 1 ? '≥1× ADR' : '<1× ADR';
        rangeVsAdr = `${todayPct}% today · ${adr}% ADR · ${tag}`;
      } else {
        rangeVsAdr = `${todayPct}% (last bar range)`;
      }
    }
  }
  if (!rangeVsAdr && brief.insights?.adrPercent != null) {
    rangeVsAdr = `ADR ${brief.insights.adrPercent}% of spot`;
  }
  const vol =
    brief.insights?.volatilityRegime ||
    (brief.marketPulse?.volatility ? String(brief.marketPulse.volatility) : null);
  const cells = [
    { k: 'Vol regime', v: vol || '—' },
    { k: 'Range vs ADR', v: rangeVsAdr || '—' },
    { k: 'Session bias', v: brief.instantRead?.bias || brief.marketPulse?.biasLabel || '—' },
    { k: 'Structure', v: brief.insights?.structureState || '—' },
    { k: 'Liquidity', v: verdict('liquidity') || '—' },
    {
      k: 'Event risk',
      v: brief.eventRiskSummary?.state ? String(brief.eventRiskSummary.state).toUpperCase() : '—',
    },
    { k: 'Cross-market', v: verdict('correlation') || '—' },
  ];
  return (
    <div className="md-ref-desk-intel" aria-label="Desk intelligence">
      {cells.map((cell) => (
        <div key={cell.k} className="md-ref-desk-intel-cell">
          <span className="md-ref-desk-intel-k">{cell.k}</span>
          <span className="md-ref-desk-intel-v">{cell.v}</span>
        </div>
      ))}
    </div>
  );
}

export function DecoderConfirmationFooter({ confirmation, postureHeadline, postureSub }) {
  if (!confirmation?.checks?.length) return null;
  const action = String(confirmation.finalAction || 'WAIT').toUpperCase();
  return (
    <div className="md-ref-footer-engine">
      <div className="md-ref-footer-checks">
        {confirmation.checks.map((c) => (
          <div key={c.id} className={`md-ref-footer-check md-ref-footer-check--${c.status}`}>
            <StatusGlyph status={c.status} />
            <div className="md-ref-footer-check-text">
              <span className="md-ref-footer-check-label">{c.label}</span>
              <span className="md-ref-footer-check-verdict">{c.verdict}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="md-ref-footer-action">
        <span className="md-ref-footer-action-cap">{action}</span>
        {postureHeadline ? <span className="md-ref-footer-action-posture">{postureHeadline}</span> : null}
        {postureSub ? <span className="md-ref-footer-action-sub">{postureSub}</span> : null}
      </div>
    </div>
  );
}

export function DecoderSmartAlerts({ alerts }) {
  if (!alerts || !alerts.length) return null;
  return (
    <ul className="md-ref-alerts-list">
      {alerts.map((a, i) => (
        <li key={`${a.type}-${i}`} className={`md-ref-alerts-item md-ref-alerts-item--${a.type || 'note'}`}>
          <span className="md-ref-alerts-type">{a.type}</span>
          <span className="md-ref-alerts-text">{a.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function DecoderEventRiskHeader({ summary, scopeLabel }) {
  if (!summary) return null;
  const s = String(summary.state || 'low');
  return (
    <div className={`md-ref-event-risk-cap md-ref-event-risk-cap--${s}`}>
      <FiClock aria-hidden className="md-ref-event-risk-ico" />
      <span>
        Event risk · <strong>{s}</strong>
        {scopeLabel ? ` · ${scopeLabel}` : ''}
      </span>
    </div>
  );
}
