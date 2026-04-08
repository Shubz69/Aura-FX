import React, { useMemo, useState, useCallback, Fragment } from 'react';
import { toast } from 'react-toastify';
import { buildReplayPackageBundle } from '../../lib/trader-replay/replayPackageEngine';
import {
  buildReplayLongHorizonReviewPack,
  buildReplayMonthlyCoachingPack,
  buildReplayMonthlyReflectionPack,
  buildReplayWeeklyReflectionPack,
  buildReplayWeeklyReviewPack,
} from '../../lib/trader-replay/replayCoachingPackEngine';

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
  { id: 'preSession', label: 'Pre-session' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'mentorPrep', label: 'Mentor prep' },
];

function PackageSummary({ active }) {
  if (!active?.kind) return <p className="aura-tr-muted">Building package…</p>;
  if (active.kind === 'aura.replayPackage.preSession') {
    return (
      <ul className="aura-tr-package-summary">
        <li><span className="aura-tr-package-k">Readiness</span> {active.sessionReadiness} — {active.sessionReadinessNote}</li>
        <li><span className="aura-tr-package-k">Today</span> {active.todayFocus}</li>
        <li><span className="aura-tr-package-k">Caution</span> {active.topCautionPattern}</li>
        <li><span className="aura-tr-package-k">Next</span> {active.nextAction}</li>
      </ul>
    );
  }
  if (active.kind === 'aura.replayPackage.weekly') {
    return (
      <ul className="aura-tr-package-summary">
        <li><span className="aura-tr-package-k">7d completes</span> {active.completedCount}</li>
        <li><span className="aura-tr-package-k">Lesson thread</span> {active.strongestLesson}</li>
        <li><span className="aura-tr-package-k">Movement</span> {active.improvementSignal}</li>
        <li><span className="aura-tr-package-k">Priority</span> {active.reviewPriority}</li>
      </ul>
    );
  }
  if (active.kind === 'aura.replayPackage.monthly') {
    return (
      <ul className="aura-tr-package-summary">
        <li><span className="aura-tr-package-k">~30d done</span> {active.completedApprox30d}</li>
        <li><span className="aura-tr-package-k">Vault</span> {active.vaultDistribution}</li>
        <li><span className="aura-tr-package-k">Rv trend</span> {active.reviewCompletenessTrend}</li>
        <li><span className="aura-tr-package-k">Correct</span> {active.correctionFocus}</li>
      </ul>
    );
  }
  if (active.kind === 'aura.replayPackage.mentorPrep') {
    return (
      <ul className="aura-tr-package-summary">
        <li><span className="aura-tr-package-k">Priority</span> {active.reviewPriority}</li>
        <li><span className="aura-tr-package-k">Coach first</span> {active.topIssueFirst}</li>
        <li><span className="aura-tr-package-k">Pattern</span> {active.recurrence} — {active.recurrenceLine}</li>
        <li><span className="aura-tr-package-k">Reinforce</span> {active.strongestModel}</li>
        <li><span className="aura-tr-package-k">Correct</span> {active.cautionCorrect}</li>
      </ul>
    );
  }
  return null;
}

/**
 * Hub: full prep card with tabs + copy.
 * compact: one row of copy actions (modal / workspace rail).
 */
export default function ReplayPackagePrep({ sessions = [], habitStats = null, variant = 'hub' }) {
  const bundle = useMemo(
    () => buildReplayPackageBundle(sessions, habitStats),
    [sessions, habitStats]
  );
  const coachingPackMonthly = useMemo(
    () => buildReplayMonthlyCoachingPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const coachingPackWeekly = useMemo(
    () => buildReplayWeeklyReviewPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const coachingPackReflection = useMemo(
    () => buildReplayWeeklyReflectionPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const coachingPackMonthlyReflection = useMemo(
    () => buildReplayMonthlyReflectionPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const coachingPackLongHorizon = useMemo(
    () => buildReplayLongHorizonReviewPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const [tab, setTab] = useState('preSession');
  const active = bundle[tab];

  const copyActive = useCallback(() => {
    copyPlain(active?.plainText, `Copied ${TABS.find((t) => t.id === tab)?.label || 'package'}`);
  }, [active, tab]);

  if (variant === 'compact') {
    return (
      <Fragment>
        <div className="aura-tr-package-compact" aria-label="Review prep packages">
          <span className="aura-tr-copy-bar-label">Prep packages</span>
          <div className="aura-tr-copy-bar-btns">
            <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={() => copyPlain(bundle.preSession.plainText, 'Copied pre-session focus')}>
              Pre-session
            </button>
            <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={() => copyPlain(bundle.weekly.plainText, 'Copied weekly review')}>
              Weekly
            </button>
            <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={() => copyPlain(bundle.monthly.plainText, 'Copied monthly review')}>
              Monthly
            </button>
            <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={() => copyPlain(bundle.mentorPrep.plainText, 'Copied mentor prep')}>
              Mentor prep
            </button>
          </div>
        </div>
        <div className="aura-tr-package-compact aura-tr-coaching-pack-compact" aria-label="Coaching packs">
          <span className="aura-tr-copy-bar-label">Coaching pack</span>
          <div className="aura-tr-copy-bar-btns">
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackWeekly.plainText, 'Copied weekly review pack')}
            >
              Weekly pack
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackWeekly.compactShare, 'Copied weekly pack share')}
            >
              Weekly share
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackMonthly.plainText, 'Copied monthly coaching pack')}
            >
              Monthly pack
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackMonthly.compactShare, 'Copied monthly pack share')}
            >
              Monthly share
            </button>
          </div>
        </div>
        <div className="aura-tr-package-compact aura-tr-coaching-pack-compact" aria-label="Weekly self-review">
          <span className="aura-tr-copy-bar-label">Self-review</span>
          <div className="aura-tr-copy-bar-btns">
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackReflection.plainText, 'Copied weekly reflection pack')}
            >
              Reflection pack
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackReflection.compactShare, 'Copied reflection share')}
            >
              Reflection share
            </button>
          </div>
        </div>
        <div className="aura-tr-package-compact aura-tr-coaching-pack-compact" aria-label="Monthly self-review">
          <span className="aura-tr-copy-bar-label">Monthly self-review</span>
          <div className="aura-tr-copy-bar-btns">
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackMonthlyReflection.plainText, 'Copied monthly reflection pack')}
            >
              Month reflection
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackMonthlyReflection.compactShare, 'Copied monthly reflection share')}
            >
              Month share
            </button>
          </div>
        </div>
        <div className="aura-tr-package-compact aura-tr-coaching-pack-compact" aria-label="Long-horizon self-review">
          <span className="aura-tr-copy-bar-label">Long horizon</span>
          <div className="aura-tr-copy-bar-btns">
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackLongHorizon.plainText, 'Copied long-horizon review pack')}
            >
              Horizon pack
            </button>
            <button
              type="button"
              className="trader-suite-btn aura-tr-copy-btn"
              onClick={() => copyPlain(coachingPackLongHorizon.compactShare, 'Copied long-horizon share')}
            >
              Horizon share
            </button>
          </div>
        </div>
      </Fragment>
    );
  }

  return (
    <section className="trader-suite-panel aura-tr-package-prep" aria-label="Review prep bundles">
      <div className="aura-tr-package-prep-head">
        <span className="trader-suite-kicker">Review packages</span>
        <span className="aura-tr-package-prep-note">Session prep, week/month snapshots, coach 1:1 — from your replay archive</span>
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
        <PackageSummary active={active} />
        <pre className="aura-tr-package-plain">{active?.plainText || ''}</pre>
        <button type="button" className="trader-suite-btn trader-suite-btn--primary aura-tr-package-copy" onClick={copyActive}>
          Copy this package
        </button>
      </div>
    </section>
  );
}
