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

/** Bottom overlay on chart: session flow + vol / structure / liquidity (real brief fields only). */
export function DecoderMarketStateOverlay({ brief }) {
  if (!brief) return null;
  const flow = brief.sessionFlow;
  const checks = Array.isArray(brief.confirmationEngine?.checks) ? brief.confirmationEngine.checks : [];
  const liqV = checks.find((x) => x.id === 'liquidity')?.verdict || '—';
  const vol =
    brief.insights?.volatilityRegime ||
    (brief.marketPulse?.volatility ? String(brief.marketPulse.volatility) : '—');
  const structure = brief.insights?.structureState || '—';
  const sessions = flow
    ? [
        { key: 'asia', t: 'Asia', b: flow.asia },
        { key: 'london', t: 'London', b: flow.london },
        { key: 'ny', t: 'NY', b: flow.newYork },
      ]
    : [];
  return (
    <div className="md-mse-overlay" aria-label="Market state">
      <div className="md-mse-overlay-sessions">
        {sessions.length
          ? sessions.map(({ key, t, b }) => (
              <div key={key} className="md-mse-sess">
                <span className="md-mse-sess-name">{t}</span>
                <span className="md-mse-sess-phase">{b?.behavior || '—'}</span>
              </div>
            ))
          : null}
      </div>
      <div className="md-mse-overlay-mid" aria-hidden />
      <div className="md-mse-overlay-states">
        <div className="md-mse-state">
          <span className="md-mse-state-k">Vol</span>
          <span className="md-mse-state-v">{vol}</span>
        </div>
        <div className="md-mse-state">
          <span className="md-mse-state-k">Structure</span>
          <span className="md-mse-state-v">{structure}</span>
        </div>
        <div className="md-mse-state">
          <span className="md-mse-state-k">Liquidity</span>
          <span className="md-mse-state-v md-mse-state-v--clip" title={liqV}>
            {liqV}
          </span>
        </div>
      </div>
    </div>
  );
}

const DECISION_IDS = ['structure', 'liquidity', 'session', 'volatility', 'correlation'];

/** Full-width horizontal decision strip (replaces tall confirmation card). */
export function DecoderDecisionBar({ confirmation, postureHeadline, postureSub, fallbackAction }) {
  const action = String(
    confirmation?.finalAction || fallbackAction || briefFallbackAction(postureHeadline) || 'WAIT',
  ).toUpperCase();
  const byId = {};
  (confirmation?.checks || []).forEach((c) => {
    byId[c.id] = c;
  });
  const slots = DECISION_IDS.map((id) => {
    const c = byId[id];
    return {
      id,
      label: c?.label || id.charAt(0).toUpperCase() + id.slice(1),
      status: c?.status || 'pending',
      short: shortenVerdict(c?.verdict, id),
    };
  });
  return (
    <div className="md-decision-bar" role="region" aria-label="Confirmation engine">
      <div className="md-decision-bar-slots">
        {slots.map((s) => (
          <div key={s.id} className={`md-decision-slot md-decision-slot--${s.status}`}>
            <StatusGlyph status={s.status} />
            <div className="md-decision-slot-text">
              <span className="md-decision-slot-label">{s.label}</span>
              <span className="md-decision-slot-verdict">{s.short}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={`md-decision-bar-action md-decision-bar-action--${actionToClass(action)}`}>
        <span className="md-decision-bar-action-cap">{action}</span>
        {postureHeadline ? <span className="md-decision-bar-action-posture">{postureHeadline}</span> : null}
        {postureSub ? <span className="md-decision-bar-action-sub">{postureSub}</span> : null}
      </div>
    </div>
  );
}

function briefFallbackAction(headline) {
  const h = String(headline || '').toLowerCase();
  if (h.includes('wait')) return 'WAIT';
  if (h.includes('caution')) return 'CAUTION';
  return null;
}

function actionToClass(a) {
  if (a === 'EXECUTE') return 'execute';
  if (a === 'READY') return 'ready';
  if (a === 'CAUTION') return 'caution';
  return 'wait';
}

function shortenVerdict(verdict, id) {
  if (!verdict) return '—';
  const v = String(verdict);
  if (v.length <= 42) return v;
  if (id === 'correlation') return v.split('·')[0]?.trim() || v.slice(0, 40) + '…';
  return `${v.slice(0, 40)}…`;
}

export function DecoderConfirmationFooter({ confirmation, postureHeadline, postureSub }) {
  if (!confirmation?.checks?.length) return null;
  return (
    <DecoderDecisionBar
      confirmation={confirmation}
      postureHeadline={postureHeadline}
      postureSub={postureSub}
    />
  );
}

export function DecoderSmartAlerts({ alerts }) {
  if (!alerts || !alerts.length) {
    return <p className="md-ref-alerts-empty">No active mechanical alerts for this decode.</p>;
  }
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
