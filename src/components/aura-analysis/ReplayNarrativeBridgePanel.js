import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function confLabel(conf) {
  if (conf === 'insufficient_evidence') return 'Evidence · thin';
  if (conf === 'emerging') return 'Evidence · emerging';
  if (conf === 'moderate') return 'Evidence · moderate';
  if (conf === 'strong') return 'Evidence · strong';
  return '';
}

/**
 * Thin week/month replay narrative bridge for Psychology, Trader CV, etc.
 * @param {{ visible: boolean, weekly?: object, monthly?: object, behaviorPattern?: object }} bridge — from buildReplayNarrativeBridgeForUi
 */
export default function ReplayNarrativeBridgePanel({ bridge, variant = 'psychology' }) {
  const [mode, setMode] = useState('weekly');
  if (!bridge?.visible || !bridge.weekly || !bridge.monthly) return null;

  const w = bridge.weekly;
  const m = bridge.monthly;

  const bp = bridge.behaviorPattern;

  return (
    <div className={`aa-replay-narrative-bridge aa-replay-narrative-bridge--${variant}`} aria-label="Replay review narrative bridge">
      <div className="aa-replay-narrative-bridge__head">
        <span className="aa-replay-narrative-bridge__label">Replay review bridge</span>
        <span className="aa-replay-narrative-bridge__hint">{bridge.disclaimer}</span>
      </div>
      {bp?.visible ? (
        <div className="aa-replay-behavior-pattern" aria-label="Replay behaviour pattern">
          <div className="aa-replay-behavior-pattern__head">
            <span className="aa-replay-behavior-pattern__label">Behaviour pattern</span>
            {bp.showArchetypeLabel && bp.primaryReplayArchetype ? (
              <span className="aa-replay-behavior-pattern__chip">{bp.primaryReplayArchetype.label}</span>
            ) : null}
            {confLabel(bp.archetypeConfidence) ? (
              <span className="aa-replay-behavior-pattern__conf">{confLabel(bp.archetypeConfidence)}</span>
            ) : null}
          </div>
          <p className="aa-replay-behavior-pattern__line">{bp.psychologyLines?.patternLine}</p>
          {bp.secondaryReplayArchetype ? (
            <p className="aa-replay-behavior-pattern__secondary">Also aligns with: {bp.secondaryReplayArchetype.label}</p>
          ) : null}
        </div>
      ) : null}
      <div className="aa-replay-narrative-bridge__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'weekly'}
          className={`aa-replay-narrative-bridge__tab${mode === 'weekly' ? ' aa-replay-narrative-bridge__tab--on' : ''}`}
          onClick={() => setMode('weekly')}
        >
          This week
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'monthly'}
          className={`aa-replay-narrative-bridge__tab${mode === 'monthly' ? ' aa-replay-narrative-bridge__tab--on' : ''}`}
          onClick={() => setMode('monthly')}
        >
          This month
        </button>
      </div>
      {bridge.sharedTrendChip || bridge.sharedTrendDetail ? (
        <div className="aa-replay-narrative-bridge__trend">
          {bridge.sharedTrendChip ? (
            <span className="aa-replay-narrative-bridge__chip">{bridge.sharedTrendChip}</span>
          ) : null}
          {bridge.sharedTrendDetail ? (
            <span className="aa-replay-narrative-bridge__trend-detail">{bridge.sharedTrendDetail}</span>
          ) : null}
        </div>
      ) : null}
      {mode === 'weekly' ? (
        <ul className="aa-replay-narrative-bridge__list">
          {w.snapshot ? (
            <li className="aa-replay-narrative-bridge__snap">{w.snapshot}</li>
          ) : null}
          <li>
            <span className="aa-replay-narrative-bridge__k">Rehearse</span>
            {w.rehearse}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Caution</span>
            {w.caution}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Reinforce</span>
            {w.reinforce}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Follow-through</span>
            {w.followThrough}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Watch</span>
            {w.monitor}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Next</span>
            {w.next}
          </li>
        </ul>
      ) : (
        <ul className="aa-replay-narrative-bridge__list">
          {m.snapshot ? (
            <li className="aa-replay-narrative-bridge__snap">{m.snapshot}</li>
          ) : null}
          <li>
            <span className="aa-replay-narrative-bridge__k">Monthly focus</span>
            {m.focus}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Reinforce</span>
            {m.reinforce}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Correct</span>
            {m.correct}
          </li>
          <li>
            <span className="aa-replay-narrative-bridge__k">Pattern / identity</span>
            {m.identity}
          </li>
          {m.rvTrend ? (
            <li>
              <span className="aa-replay-narrative-bridge__k">Review depth trend</span>
              {m.rvTrend}
            </li>
          ) : null}
          {m.example ? (
            <li>
              <span className="aa-replay-narrative-bridge__k">Revisit</span>
              {m.example}
            </li>
          ) : null}
        </ul>
      )}
      {bridge.evidenceNote ? (
        <p className="aa-replay-narrative-bridge__evidence">{bridge.evidenceNote}</p>
      ) : null}
      <div className="aa-replay-narrative-bridge__foot">
        <Link className="aa-replay-narrative-bridge__link" to={bridge.moreHref}>
          {bridge.moreLabel}
        </Link>
      </div>
    </div>
  );
}
