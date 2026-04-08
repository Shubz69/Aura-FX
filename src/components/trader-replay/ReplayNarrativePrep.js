import React, { useMemo, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { buildReplayNarrativeBundle } from '../../lib/trader-replay/replayNarrativeEngine';

async function copyPlain(text, okMessage) {
  const payload = String(text || '').trim();
  if (!payload) {
    toast.error('Nothing to copy');
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      toast.success(okMessage);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = payload;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast.success(okMessage);
  } catch {
    toast.error('Copy not available — allow clipboard or select text manually');
  }
}

const TABS = [
  { id: 'weeklyBrief', label: 'Weekly desk brief' },
  { id: 'monthlyReview', label: 'Monthly review' },
];

function NarrativeSummary({ active }) {
  if (!active?.kind) return <p className="aura-tr-muted">Building narrative…</p>;
  if (active.kind === 'aura.replayNarrative.weeklyBrief') {
    return (
      <ul className="aura-tr-narrative-summary">
        <li><span className="aura-tr-narrative-tag aura-tr-narrative-tag--revisit">Revisit</span> {active.strongestLesson}</li>
        <li><span className="aura-tr-narrative-tag aura-tr-narrative-tag--correct">Correct</span> {active.topCaution}</li>
        <li><span className="aura-tr-narrative-tag aura-tr-narrative-tag--reinforce">Reinforce</span> {active.modelReinforce || '—'}</li>
        <li><span className="aura-tr-narrative-tag aura-tr-narrative-tag--monitor">Monitor</span> {active.monitorLine}</li>
        <li><span className="aura-tr-package-k">Next week</span> {active.nextWeekFocus}</li>
      </ul>
    );
  }
  if (active.kind === 'aura.replayNarrative.monthlyReview') {
    return (
      <ul className="aura-tr-narrative-summary">
        <li><span className="aura-tr-narrative-tag aura-tr-narrative-tag--reinforce">Reinforce</span> {active.strongestStrength}</li>
        <li><span className="aura-tr-narrative-tag aura-tr-narrative-tag--correct">Correct</span> {active.biggestWeakness}</li>
        <li><span className="aura-tr-package-k">Rv trend</span> {active.reviewCompletenessTrend}</li>
        <li><span className="aura-tr-package-k">Identity</span> {active.identityPatternLine}</li>
        <li><span className="aura-tr-package-k">Monthly focus</span> {active.monthlyDevelopmentFocus}</li>
      </ul>
    );
  }
  return null;
}

/**
 * Hub: narrative tabs + full copy. Compact: two copy buttons for modal/workspace.
 */
export default function ReplayNarrativePrep({ sessions = [], habitStats = null, variant = 'hub' }) {
  const bundle = useMemo(
    () => buildReplayNarrativeBundle(sessions, habitStats),
    [sessions, habitStats]
  );
  const [tab, setTab] = useState('weeklyBrief');
  const active = tab === 'monthlyReview' ? bundle.monthlyReview : bundle.weeklyBrief;

  const copyActive = useCallback(() => {
    copyPlain(active?.plainText, `Copied ${TABS.find((t) => t.id === tab)?.label || 'narrative'}`);
  }, [active, tab]);

  if (variant === 'compact') {
    return (
      <div className="aura-tr-narrative-compact" aria-label="Replay review narratives">
        <span className="aura-tr-copy-bar-label">Desk narratives</span>
        <div className="aura-tr-copy-bar-btns">
          <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={() => copyPlain(bundle.weeklyBrief.plainText, 'Copied weekly desk brief')}>
            Weekly brief
          </button>
          <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={() => copyPlain(bundle.monthlyReview.plainText, 'Copied monthly review')}>
            Monthly review
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="trader-suite-panel aura-tr-narrative-prep" aria-label="Replay-driven review narratives">
      <div className="aura-tr-package-prep-head">
        <span className="trader-suite-kicker">Review narratives</span>
        <span className="aura-tr-package-prep-note">Weekly desk brief and monthly discipline story — fused from your replay archive (not a full report).</span>
      </div>
      <div className="aura-tr-package-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`aura-tr-package-tab${tab === t.id ? ' aura-tr-package-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="aura-tr-package-body" role="tabpanel">
        <NarrativeSummary active={active} />
        <pre className="aura-tr-package-plain aura-tr-narrative-plain">{active?.plainText || ''}</pre>
        <div className="aura-tr-narrative-actions">
          <button type="button" className="trader-suite-btn trader-suite-btn--primary aura-tr-package-copy" onClick={copyActive}>
            Copy full narrative
          </button>
          {active?.compactShare ? (
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(active.compactShare, 'Copied compact share')}
            >
              Copy compact share
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
