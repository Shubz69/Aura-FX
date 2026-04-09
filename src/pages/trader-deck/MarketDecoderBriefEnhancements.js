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

export function DecoderReadinessBlock({ readiness, insights }) {
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
      {insights ? (
        <div className="md-ref-insights-compact">
          {insights.rsi != null ? (
            <span>
              RSI {insights.rsi} · {insights.rsiState || '—'}
            </span>
          ) : (
            <span>RSI n/a</span>
          )}
          {insights.atrPercent != null ? <span>ADR {insights.atrPercent}%</span> : <span>ADR n/a</span>}
          {insights.momentum ? <span>Momentum · {insights.momentum}</span> : null}
        </div>
      ) : null}
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
