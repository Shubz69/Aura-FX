import React, { useMemo, useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import {
  REPLAY_REVIEW_PRESET,
  buildReplayArchiveCoachingPack,
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

function priorityClass(p) {
  if (p === 'high') return 'aura-tr-coaching-pack__priority--high';
  if (p === 'low') return 'aura-tr-coaching-pack__priority--low';
  return 'aura-tr-coaching-pack__priority--mid';
}

function scopeClass(label) {
  if (label === 'recurring') return 'aura-tr-coaching-pack__scope--recurring';
  if (label === 'emerging') return 'aura-tr-coaching-pack__scope--emerging';
  if (label === 'isolated') return 'aura-tr-coaching-pack__scope--isolated';
  return 'aura-tr-coaching-pack__scope--thin';
}

function humanScope(label) {
  return String(label || '').replace(/_/g, ' ');
}

/** Legacy rolling ~30d coach pack — not a calendar preset id. */
const COACH_WINDOW_ROLLING = 'rolling';

/**
 * Hub: mentor weekly review, trader reflections, mentor monthly coaching — tabs, copy, preview.
 */
export default function ReplayMonthlyCoachingPack({ sessions = [], habitStats = null }) {
  const [tab, setTab] = useState('weekly');
  const [horizonPreset, setHorizonPreset] = useState(REPLAY_REVIEW_PRESET.ALL_TIME);
  const [coachWindow, setCoachWindow] = useState(COACH_WINDOW_ROLLING);

  const weeklyPack = useMemo(
    () => buildReplayWeeklyReviewPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const reflectionPack = useMemo(
    () => buildReplayWeeklyReflectionPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const monthlyReflectionPack = useMemo(
    () => buildReplayMonthlyReflectionPack(sessions, habitStats),
    [sessions, habitStats]
  );
  const monthlyPack = useMemo(() => {
    if (coachWindow === COACH_WINDOW_ROLLING) {
      return buildReplayMonthlyCoachingPack(sessions, habitStats);
    }
    if (coachWindow === REPLAY_REVIEW_PRESET.ALL_TIME) {
      return buildReplayArchiveCoachingPack(sessions, habitStats);
    }
    return buildReplayMonthlyCoachingPack(sessions, habitStats, { presetWindow: coachWindow });
  }, [sessions, habitStats, coachWindow]);
  const longHorizonPack = useMemo(
    () => buildReplayLongHorizonReviewPack(sessions, habitStats, { presetWindow: horizonPreset }),
    [sessions, habitStats, horizonPreset]
  );

  const active =
    tab === 'weekly'
      ? weeklyPack
      : tab === 'reflection'
        ? reflectionPack
        : tab === 'monthlyReflection'
          ? monthlyReflectionPack
          : tab === 'horizon'
            ? longHorizonPack
            : monthlyPack;

  const onCopyFull = useCallback(() => {
    const msg =
      tab === 'weekly'
        ? 'Copied weekly review pack'
        : tab === 'reflection'
          ? 'Copied weekly reflection pack'
          : tab === 'monthlyReflection'
            ? 'Copied monthly reflection pack'
            : tab === 'horizon'
              ? `Copied long-horizon review (${longHorizonPack.windowLabel})`
              : monthlyPack.isArchiveCoachPack
                ? `Copied archive coach review (${monthlyPack.windowLabel})`
                : `Copied monthly coaching pack (${monthlyPack.windowLabel})`;
    copyPlain(active.plainText, msg);
  }, [active.plainText, tab, longHorizonPack.windowLabel, monthlyPack.windowLabel, monthlyPack.isArchiveCoachPack]);

  const onCopyShare = useCallback(() => {
    const msg =
      tab === 'weekly'
        ? 'Copied weekly pack share'
        : tab === 'reflection'
          ? 'Copied weekly reflection share'
          : tab === 'monthlyReflection'
            ? 'Copied monthly reflection share'
            : tab === 'horizon'
              ? `Copied long-horizon share (${longHorizonPack.windowLabel})`
              : monthlyPack.isArchiveCoachPack
                ? `Copied archive coach share (${monthlyPack.windowLabel})`
                : `Copied coaching share (${monthlyPack.windowLabel})`;
    copyPlain(active.compactShare, msg);
  }, [active.compactShare, tab, longHorizonPack.windowLabel, monthlyPack.windowLabel, monthlyPack.isArchiveCoachPack]);

  return (
    <section className="trader-suite-panel aura-tr-coaching-pack" aria-label="Coaching packs">
      <div className="aura-tr-coaching-pack-head">
        <span className="trader-suite-kicker">Coaching packs</span>
        <span className="aura-tr-coaching-pack-note">
          Review / Coaching = mentor; Reflections = your self-review (week → month → long horizon).
        </span>
      </div>
      <div className="aura-tr-package-tabs aura-tr-coaching-pack-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'weekly'}
          className={`aura-tr-package-tab${tab === 'weekly' ? ' aura-tr-package-tab--active' : ''}`}
          onClick={() => setTab('weekly')}
        >
          Weekly review
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reflection'}
          className={`aura-tr-package-tab${tab === 'reflection' ? ' aura-tr-package-tab--active' : ''}`}
          onClick={() => setTab('reflection')}
        >
          Weekly reflection
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monthlyReflection'}
          className={`aura-tr-package-tab${tab === 'monthlyReflection' ? ' aura-tr-package-tab--active' : ''}`}
          onClick={() => setTab('monthlyReflection')}
        >
          Monthly reflection
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'horizon'}
          className={`aura-tr-package-tab${tab === 'horizon' ? ' aura-tr-package-tab--active' : ''}`}
          onClick={() => setTab('horizon')}
        >
          Long horizon
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monthly'}
          className={`aura-tr-package-tab${tab === 'monthly' ? ' aura-tr-package-tab--active' : ''}`}
          onClick={() => setTab('monthly')}
        >
          Monthly coaching
        </button>
      </div>

      {tab === 'weekly' ? (
        <>
          <div className="aura-tr-coaching-pack-meta">
            <span className={`aura-tr-coaching-pack__priority ${priorityClass(weeklyPack.reviewPriority)}`}>
              Priority · {weeklyPack.reviewPriority}
            </span>
            {weeklyPack.issueScope?.label ? (
              <span className={`aura-tr-coaching-pack__chip aura-tr-coaching-pack__scope ${scopeClass(weeklyPack.issueScope.label)}`}>
                {humanScope(weeklyPack.issueScope.label)}
              </span>
            ) : null}
          </div>
          <div className="aura-tr-coaching-pack-movement" aria-label="Movement this week">
            {weeklyPack.improvingThisWeek && !/insufficient/i.test(weeklyPack.improvingThisWeek) ? (
              <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--improving">Improving</span>
            ) : null}
            {weeklyPack.slippedThisWeek ? (
              <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--slip">Slipped</span>
            ) : null}
            {weeklyPack.stillRepeatingThisWeek ? (
              <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--repeat">Repeating</span>
            ) : null}
          </div>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">Coach first · </span>
            {weeklyPack.coachFocusFirst}
          </p>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Changed vs last week</span>
            <span className="aura-tr-coaching-pack-v">{weeklyPack.whatChangedThisWeek}</span>
          </p>
          <div className="aura-tr-coaching-pack-pair">
            <div>
              <span className="aura-tr-coaching-pack-k">Reinforce now</span>
              <span className="aura-tr-coaching-pack-v">{weeklyPack.strongestModelThisWeek}</span>
            </div>
            <div>
              <span className="aura-tr-coaching-pack-k">Correct now</span>
              <span className="aura-tr-coaching-pack-v">{weeklyPack.strongestCautionThisWeek}</span>
            </div>
          </div>
          {weeklyPack.modelExamplesToDiscuss.length || weeklyPack.cautionExamplesToDiscuss.length ? (
            <div className="aura-tr-coaching-pack-examples">
              <span className="aura-tr-coaching-pack-k">Discuss in review</span>
              <ul>
                {[...weeklyPack.modelExamplesToDiscuss, ...weeklyPack.cautionExamplesToDiscuss].map((e, idx) => (
                  <li key={e.id || `w-${idx}-${e.title}`}>{e.title} · {e.line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {weeklyPack.evidenceNote ? (
            <p className="aura-tr-muted aura-tr-coaching-pack-evidence">{weeklyPack.evidenceNote}</p>
          ) : null}
        </>
      ) : tab === 'reflection' ? (
        <>
          <div className="aura-tr-coaching-pack-meta">
            <span className="aura-tr-coaching-pack__chip aura-tr-coaching-pack__reflection">Trader reflection</span>
            <span className="aura-tr-muted aura-tr-coaching-pack-reflection-note">Self-review · not a mentor brief</span>
          </div>
          <div className="aura-tr-coaching-pack-movement" aria-label="Reflection cues">
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--rehearse">Rehearse</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--correct">Correct</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--revisit">Revisit</span>
          </div>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">This week I learned · </span>
            {reflectionPack.mainLessonThisWeek}
          </p>
          <div className="aura-tr-coaching-pack-pair">
            <div>
              <span className="aura-tr-coaching-pack-k">Repeat next week</span>
              <span className="aura-tr-coaching-pack-v">{reflectionPack.repeatNextWeek}</span>
            </div>
            <div>
              <span className="aura-tr-coaching-pack-k">Stop / correct</span>
              <span className="aura-tr-coaching-pack-v">{reflectionPack.stopCorrectNextWeek}</span>
            </div>
          </div>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Improved</span>
            <span className="aura-tr-coaching-pack-v">{reflectionPack.improvedThisWeek || '—'}</span>
          </p>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Still needs attention</span>
            <span className="aura-tr-coaching-pack-v">{reflectionPack.stillNeedsAttention}</span>
          </p>
          <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
            <span className="aura-tr-muted">Journal / playbook · </span>
            {reflectionPack.journalValidatorNudge}
          </p>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">My focus next week · </span>
            {reflectionPack.nextWeekFocusOneLine}
          </p>
          {reflectionPack.examplesToRevisit.length ? (
            <div className="aura-tr-coaching-pack-examples">
              <span className="aura-tr-coaching-pack-k">Revisit before next week</span>
              <ul>
                {reflectionPack.examplesToRevisit.map((e, idx) => (
                  <li key={e.id || `rv-${idx}-${e.title}`}>
                    <span className="aura-tr-coaching-pack-ex-kind">{e.kind}</span> {e.title} — {e.line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reflectionPack.evidenceNote ? (
            <p className="aura-tr-muted aura-tr-coaching-pack-evidence">{reflectionPack.evidenceNote}</p>
          ) : null}
        </>
      ) : tab === 'monthlyReflection' ? (
        <>
          <div className="aura-tr-coaching-pack-meta">
            <span className="aura-tr-coaching-pack__chip aura-tr-coaching-pack__reflection aura-tr-coaching-pack__reflection--monthly">
              Monthly reflection
            </span>
            <span className="aura-tr-muted aura-tr-coaching-pack-reflection-note">Self-review · process view</span>
          </div>
          <div className="aura-tr-coaching-pack-movement" aria-label="Monthly reflection cues">
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--rehearse">Reinforce</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--correct">Correct</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--refine">Refine</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--revisit">Revisit</span>
          </div>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">This month I learned · </span>
            {monthlyReflectionPack.mainLessonThisMonth}
          </p>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Becoming part of my process</span>
            <span className="aura-tr-coaching-pack-v">{monthlyReflectionPack.processBecoming}</span>
          </p>
          <div className="aura-tr-coaching-pack-pair">
            <div>
              <span className="aura-tr-coaching-pack-k">Keep next month</span>
              <span className="aura-tr-coaching-pack-v">{monthlyReflectionPack.keepNextMonth}</span>
            </div>
            <div>
              <span className="aura-tr-coaching-pack-k">Correct next month</span>
              <span className="aura-tr-coaching-pack-v">{monthlyReflectionPack.correctNextMonth}</span>
            </div>
          </div>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Pattern (before habit)</span>
            <span className="aura-tr-coaching-pack-v">{monthlyReflectionPack.patternBeforeHabit}</span>
          </p>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Improved</span>
            <span className="aura-tr-coaching-pack-v">{monthlyReflectionPack.improvedThisMonth || '—'}</span>
          </p>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Still needs attention</span>
            <span className="aura-tr-coaching-pack-v">{monthlyReflectionPack.stillNeedsAttention}</span>
          </p>
          <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
            <span className="aura-tr-muted">Journal / playbook / validator · </span>
            {monthlyReflectionPack.journalValidatorNudge}
          </p>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">My focus next month · </span>
            {monthlyReflectionPack.nextMonthFocusOneLine}
          </p>
          {monthlyReflectionPack.examplesToRevisit.length ? (
            <div className="aura-tr-coaching-pack-examples">
              <span className="aura-tr-coaching-pack-k">Revisit before next month</span>
              <ul>
                {monthlyReflectionPack.examplesToRevisit.map((e, idx) => (
                  <li key={e.id || `mr-${idx}-${e.title}`}>
                    <span className="aura-tr-coaching-pack-ex-kind">{e.kind}</span> {e.title} — {e.line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {monthlyReflectionPack.evidenceNote ? (
            <p className="aura-tr-muted aura-tr-coaching-pack-evidence">{monthlyReflectionPack.evidenceNote}</p>
          ) : null}
        </>
      ) : tab === 'horizon' ? (
        <>
          <div className="aura-tr-coaching-pack-meta">
            <span className="aura-tr-coaching-pack__chip aura-tr-coaching-pack__reflection aura-tr-coaching-pack__reflection--horizon">
              Long-horizon review
            </span>
            <span className="aura-tr-muted aura-tr-coaching-pack-reflection-note">
              {longHorizonPack.windowLabel}
              {longHorizonPack.windowFromYmd && longHorizonPack.windowToYmd
                ? ` · ${longHorizonPack.windowFromYmd} → ${longHorizonPack.windowToYmd}`
                : ' · full archive'}
              {' · strategic'}
            </span>
          </div>
          <div className="aura-tr-horizon-presets" role="group" aria-label="Review window">
            {[
              { id: REPLAY_REVIEW_PRESET.LAST_90D, label: '90d' },
              { id: REPLAY_REVIEW_PRESET.LAST_180D, label: '180d' },
              { id: REPLAY_REVIEW_PRESET.YTD, label: 'YTD' },
              { id: REPLAY_REVIEW_PRESET.ALL_TIME, label: 'All-time' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`aura-tr-horizon-preset-chip${horizonPreset === p.id ? ' aura-tr-horizon-preset-chip--active' : ''}`}
                aria-pressed={horizonPreset === p.id}
                onClick={() => setHorizonPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="aura-tr-coaching-pack-movement" aria-label="Keep refine eliminate">
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--keep">Keep</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--refine">Refine</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--eliminate">Eliminate</span>
            <span className="aura-tr-coaching-pack-move aura-tr-coaching-pack-move--revisit">Anchor</span>
          </div>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Snapshot</span>
            <span className="aura-tr-coaching-pack-v">{longHorizonPack.longHorizonSnapshot}</span>
          </p>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">{longHorizonPack.uiLabels?.processEmerging || 'Process emerging'} · </span>
            {longHorizonPack.processEmerging}
          </p>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">{longHorizonPack.uiLabels?.enduringLesson || 'Enduring lesson'} · </span>
            {longHorizonPack.enduringLesson}
          </p>
          <div className="aura-tr-coaching-pack-pair">
            <div>
              <span className="aura-tr-coaching-pack-k">{longHorizonPack.uiLabels?.strengthHeld || 'Strength that held'}</span>
              <span className="aura-tr-coaching-pack-v">{longHorizonPack.repeatableStrength}</span>
            </div>
            <div>
              <span className="aura-tr-coaching-pack-k">{longHorizonPack.uiLabels?.cautionRepeats || 'Caution that repeats'}</span>
              <span className="aura-tr-coaching-pack-v">{longHorizonPack.persistentCaution}</span>
            </div>
          </div>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">{longHorizonPack.uiLabels?.improved || 'Improved (long run)'}</span>
            <span className="aura-tr-coaching-pack-v">{longHorizonPack.improvedLongRun}</span>
          </p>
          <p className="aura-tr-coaching-pack-delta">
            <span className="aura-tr-coaching-pack-k">Still leaking</span>
            <span className="aura-tr-coaching-pack-v">{longHorizonPack.stillLeaking}</span>
          </p>
          <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
            <span className="aura-tr-muted">Keep · </span>
            {longHorizonPack.keepInProcess}
          </p>
          <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
            <span className="aura-tr-muted">Refine · </span>
            {longHorizonPack.refineBeforeCeiling}
          </p>
          <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
            <span className="aura-tr-muted">Eliminate · </span>
            {longHorizonPack.eliminateLeak}
          </p>
          <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
            <span className="aura-tr-muted">Strategic nudge · </span>
            {longHorizonPack.strategicNudge}
          </p>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">{longHorizonPack.uiLabels?.nextFocus || 'Next quarter / phase'} · </span>
            {longHorizonPack.nextQuarterFocusOneLine}
          </p>
          {longHorizonPack.anchorExamples.length ? (
            <div className="aura-tr-coaching-pack-examples">
              <span className="aura-tr-coaching-pack-k">Anchor replays</span>
              <ul>
                {longHorizonPack.anchorExamples.map((e, idx) => (
                  <li key={e.id || `lh-${idx}-${e.title}`}>
                    <span className="aura-tr-coaching-pack-ex-kind">{e.kind}</span> {e.title} — {e.line}
                    {e.anchorLine ? (
                      <div className="aura-tr-muted aura-tr-coaching-pack-anchor-hint">{e.anchorLine}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {longHorizonPack.evidenceNote ? (
            <p className="aura-tr-muted aura-tr-coaching-pack-evidence">{longHorizonPack.evidenceNote}</p>
          ) : null}
        </>
      ) : (
        <>
          <div className="aura-tr-coaching-pack-meta">
            <span className={`aura-tr-coaching-pack__priority ${priorityClass(monthlyPack.reviewPriority)}`}>
              Priority · {monthlyPack.reviewPriority}
            </span>
            {monthlyPack.isArchiveCoachPack ? (
              <span className="aura-tr-coaching-pack__chip aura-tr-coaching-pack__chip--archive">Archive coach</span>
            ) : null}
            {monthlyPack.archetypeLabel ? (
              <span className="aura-tr-coaching-pack__chip">{monthlyPack.archetypeLabel}</span>
            ) : null}
            <span className="aura-tr-muted aura-tr-coaching-pack-reflection-note">
              {monthlyPack.windowLabel}
              {monthlyPack.windowFromYmd && monthlyPack.windowToYmd
                ? ` · ${monthlyPack.windowFromYmd} → ${monthlyPack.windowToYmd}`
                : monthlyPack.isArchiveCoachPack
                  ? ' · full replay archive'
                  : null}
            </span>
          </div>
          <div className="aura-tr-horizon-presets" role="group" aria-label="Coaching window">
            {[
              { id: COACH_WINDOW_ROLLING, label: '~30d' },
              { id: REPLAY_REVIEW_PRESET.LAST_90D, label: '90d' },
              { id: REPLAY_REVIEW_PRESET.LAST_180D, label: '180d' },
              { id: REPLAY_REVIEW_PRESET.YTD, label: 'YTD' },
              { id: REPLAY_REVIEW_PRESET.ALL_TIME, label: 'All-time' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`aura-tr-horizon-preset-chip${coachWindow === p.id ? ' aura-tr-horizon-preset-chip--active' : ''}`}
                aria-pressed={coachWindow === p.id}
                onClick={() => setCoachWindow(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="aura-tr-coaching-pack-focus">
            <span className="aura-tr-muted">Coach first · </span>
            {monthlyPack.coachFocusFirst}
          </p>
          <div className="aura-tr-coaching-pack-pair">
            <div>
              <span className="aura-tr-coaching-pack-k">{monthlyPack.uiLabels?.reinforce || 'Reinforce'}</span>
              <span className="aura-tr-coaching-pack-v">{monthlyPack.strongestModelBehaviour}</span>
            </div>
            <div>
              <span className="aura-tr-coaching-pack-k">{monthlyPack.uiLabels?.correct || 'Correct'}</span>
              <span className="aura-tr-coaching-pack-v">{monthlyPack.strongestRepeatedCaution}</span>
            </div>
          </div>
          {monthlyPack.isArchiveCoachPack && monthlyPack.improvedLongArc ? (
            <p className="aura-tr-coaching-pack-delta">
              <span className="aura-tr-coaching-pack-k">{monthlyPack.uiLabels?.improved || 'Long-run movement'}</span>
              <span className="aura-tr-coaching-pack-v">{monthlyPack.improvedLongArc}</span>
            </p>
          ) : null}
          {monthlyPack.isArchiveCoachPack && monthlyPack.eliminateBeforeCeiling ? (
            <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
              <span className="aura-tr-muted">{monthlyPack.uiLabels?.still || 'Eliminate / ceiling'} · </span>
              {monthlyPack.eliminateBeforeCeiling}
            </p>
          ) : null}
          {monthlyPack.isArchiveCoachPack && monthlyPack.recurringLesson ? (
            <p className="aura-tr-coaching-pack-focus aura-tr-coaching-pack-focus--narrow">
              <span className="aura-tr-muted">Recurring lesson (archive) · </span>
              {monthlyPack.recurringLesson}
            </p>
          ) : null}
          {monthlyPack.isArchiveCoachPack && monthlyPack.nextPhaseLine ? (
            <p className="aura-tr-coaching-pack-focus">
              <span className="aura-tr-muted">Next phase / quarter · </span>
              {monthlyPack.nextPhaseLine}
            </p>
          ) : null}
          {monthlyPack.modelExamplesToReinforce.length ? (
            <div className="aura-tr-coaching-pack-examples">
              <span className="aura-tr-coaching-pack-k">
                {monthlyPack.isArchiveCoachPack ? 'Anchor — reinforce' : 'Model examples'}
              </span>
              <ul>
                {monthlyPack.modelExamplesToReinforce.map((e, idx) => (
                  <li key={e.id || `m-${idx}-${e.title}`}>
                    {e.title} · {e.line}
                    {e.archiveCoachLine ? (
                      <div className="aura-tr-muted aura-tr-coaching-pack-anchor-hint">{e.archiveCoachLine}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {monthlyPack.cautionExamplesToCorrect.length ? (
            <div className="aura-tr-coaching-pack-examples">
              <span className="aura-tr-coaching-pack-k">
                {monthlyPack.isArchiveCoachPack ? 'Anchor — correct' : 'Caution examples'}
              </span>
              <ul>
                {monthlyPack.cautionExamplesToCorrect.map((e, idx) => (
                  <li key={e.id || `c-${idx}-${e.title}`}>
                    {e.title} · {e.line}
                    {e.archiveCoachLine ? (
                      <div className="aura-tr-muted aura-tr-coaching-pack-anchor-hint">{e.archiveCoachLine}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {monthlyPack.evidenceNote ? (
            <p className="aura-tr-muted aura-tr-coaching-pack-evidence">{monthlyPack.evidenceNote}</p>
          ) : null}
        </>
      )}

      <pre className="aura-tr-package-plain aura-tr-coaching-pack-plain">{active.plainText}</pre>
      <div className="aura-tr-coaching-pack-actions">
        <button type="button" className="trader-suite-btn trader-suite-btn--primary aura-tr-package-copy" onClick={onCopyFull}>
          Copy full pack
        </button>
        <button type="button" className="trader-suite-btn aura-tr-copy-btn" onClick={onCopyShare}>
          Copy share snippet
        </button>
      </div>
    </section>
  );
}
