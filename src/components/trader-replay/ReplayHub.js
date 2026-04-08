import React, { useMemo, useState } from 'react';
import { REPLAY_MODES, REPLAY_STATUSES } from '../../lib/trader-replay/replayDefaults';
import { normalizeReplay, computeReplayQualityScore, computeReviewCompletenessScore } from '../../lib/trader-replay/replayNormalizer';
import { deriveCoaching } from '../../lib/trader-replay/replayCoachingEngine';
import { buildReplayIdentitySummary } from '../../lib/trader-replay/replayIdentityEngine';
import { buildReplayContributionProfile } from '../../lib/trader-replay/replayContributionEngine';
import { buildReplayBehaviorArchetypeProfile } from '../../lib/trader-replay/replayBehaviorArchetypeEngine';
import { formatLearningExampleLabel } from '../../lib/trader-replay/replayEntitlements';
import ReplayPremiumNudge from './ReplayPremiumNudge';
import ReplayPackagePrep from './ReplayPackagePrep';
import ReplayNarrativePrep from './ReplayNarrativePrep';
import ReplayMonthlyCoachingPack from './ReplayMonthlyCoachingPack';

const HUB_SORTS = [
  { id: 'newest', label: 'Recent' },
  { id: 'best_reviewed', label: 'Best reviewed' },
  { id: 'weakest_execution', label: 'Weakest exec' },
  { id: 'learning_examples', label: 'Examples first' },
  { id: 'incomplete', label: 'Incomplete' },
];

function tieBreak(a, b) {
  const u = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  if (u !== 0) return u;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

function evidenceShort(conf) {
  if (conf === 'insufficient_evidence') return 'Thin evidence';
  if (conf === 'emerging') return 'Emerging evidence';
  if (conf === 'moderate') return 'Moderate evidence';
  if (conf === 'strong') return 'Strong evidence';
  return '';
}

export default function ReplayHub({
  sessionsCount,
  continueSession,
  onChooseMode,
  onOpenLibrary,
  onBrowseLearningExamples,
  onTryDemo,
  sessions,
  onOpenSession,
  habitStats,
  replayTier = 'ACCESS',
  replayFlags,
}) {
  const [hubSort, setHubSort] = useState('newest');
  const [identityPeriod, setIdentityPeriod] = useState('last30d');

  const identitySummary = useMemo(() => buildReplayIdentitySummary(sessions || []), [sessions]);
  const rollingWindows = identitySummary.rolling;
  const windowSnapshot = rollingWindows[identityPeriod] || rollingWindows.last30d;
  const contributionProfile = useMemo(
    () => buildReplayContributionProfile(sessions || [], habitStats || null),
    [sessions, habitStats]
  );
  const behaviorArchetype = useMemo(
    () => buildReplayBehaviorArchetypeProfile(sessions || [], habitStats || null, contributionProfile),
    [sessions, habitStats, contributionProfile]
  );
  const disc = contributionProfile.discipline;
  const beh = contributionProfile.behavior;
  const trendShort =
    disc.replayDisciplineTrend === 'improving'
      ? 'Improving'
      : disc.replayDisciplineTrend === 'slipping'
        ? 'Slipping'
        : disc.replayDisciplineTrend === 'insufficient_evidence'
          ? '—'
          : 'Stable';

  const sortedRecent = useMemo(() => {
    const list = (sessions || []).map((r) => normalizeReplay(r));
    const scored = list.map((s) => ({
      s,
      exec: computeReplayQualityScore(s).score,
      rev: computeReviewCompletenessScore(s).score,
      ex: s.learningExample ? 1 : 0,
    }));
    scored.sort((a, b) => {
      switch (hubSort) {
        case 'best_reviewed':
          return b.rev - a.rev || tieBreak(a.s, b.s);
        case 'weakest_execution':
          return a.exec - b.exec || tieBreak(a.s, b.s);
        case 'learning_examples':
          return b.ex - a.ex || tieBreak(a.s, b.s);
        case 'incomplete':
          return a.rev - b.rev || tieBreak(a.s, b.s);
        case 'newest':
        default:
          return tieBreak(a.s, b.s);
      }
    });
    return scored.map((x) => x.s).slice(0, 8);
  }, [sessions, hubSort]);

  const canExamples = replayFlags?.learningExamples === true;
  const canScenario = replayFlags?.scenarioReplay === true;
  const showHabit = replayFlags?.habitStrip === true;
  const hubSortOptions = replayFlags?.libraryPremiumSorts === true
    ? HUB_SORTS
    : HUB_SORTS.filter((o) => !['learning_examples'].includes(o.id));

  return (
    <div className="aura-tr-hub">
      {showHabit && habitStats ? (
        <section className="trader-suite-panel aura-tr-habit-strip" aria-label="Review habit">
          <div className="aura-tr-habit-grid">
            <div>
              <span className="aura-tr-habit-label">Replay discipline</span>
              <strong className="aura-tr-habit-value">{habitStats.reviewStreakDays}d streak</strong>
              <span className="aura-tr-habit-meta">{habitStats.reviewedToday ? 'Logged today' : 'Nothing completed today'}</span>
            </div>
            <div>
              <span className="aura-tr-habit-label">This week</span>
              <strong className="aura-tr-habit-value">{habitStats.completedThisWeek}</strong>
              <span className="aura-tr-habit-meta">Completed replays</span>
            </div>
            <div>
              <span className="aura-tr-habit-label">Open loops</span>
              <strong className="aura-tr-habit-value">{habitStats.incompleteCount}</strong>
              <span className="aura-tr-habit-meta">Draft / in progress</span>
            </div>
            <div>
              <span className="aura-tr-habit-label">Learning assets</span>
              <strong className="aura-tr-habit-value">{habitStats.learningExamplesCount}</strong>
              <span className="aura-tr-habit-meta">Saved examples</span>
            </div>
          </div>
          <p className="aura-tr-habit-nudge">{habitStats.nudge}</p>
        </section>
      ) : (
        <section className="trader-suite-panel aura-tr-habit-strip aura-tr-habit-strip--compact">
          <ReplayPremiumNudge>
            Streaks, weekly rhythm, and example counts — included with Premium.
          </ReplayPremiumNudge>
        </section>
      )}

      <section className="trader-suite-panel aura-tr-identity-strip" aria-label="Replay identity snapshot">
        <div className="aura-tr-identity-head">
          <span className="trader-suite-kicker">Trader identity · replays</span>
          <label className="aura-tr-identity-period">
            <span className="aura-tr-muted">Window</span>
            <select
              className="trader-suite-select"
              value={identityPeriod}
              onChange={(e) => setIdentityPeriod(e.target.value)}
              aria-label="Replay identity time window"
            >
              <option value="last7d">Last 7 days</option>
              <option value="last30d">Last 30 days</option>
              <option value="calendarMonth">This month</option>
              <option value="previousMonth">Previous month</option>
              <option value="allTime">All time</option>
            </select>
          </label>
        </div>
        <div className="aura-tr-identity-grid">
          <div>
            <span className="aura-tr-identity-label">Completed</span>
            <strong className="aura-tr-identity-value">{windowSnapshot?.completedCount ?? 0}</strong>
            <span className="aura-tr-identity-meta">in selected window</span>
          </div>
          <div>
            <span className="aura-tr-identity-label">Avg Q / Rv</span>
            <strong className="aura-tr-identity-value">
              {windowSnapshot?.avgReplayQuality != null ? windowSnapshot.avgReplayQuality : '—'}
              {' · '}
              {windowSnapshot?.avgReviewCompleteness != null ? `${windowSnapshot.avgReviewCompleteness}%` : '—'}
            </strong>
            <span className="aura-tr-identity-meta">replay quality · review depth</span>
          </div>
          <div>
            <span className="aura-tr-identity-label">Examples</span>
            <strong className="aura-tr-identity-value">{windowSnapshot?.learningExamples ?? 0}</strong>
            <span className="aura-tr-identity-meta">model + caution</span>
          </div>
          <div>
            <span className="aura-tr-identity-label">Open loops</span>
            <strong className="aura-tr-identity-value">{windowSnapshot?.incompleteReviewsRemaining ?? '—'}</strong>
            <span className="aura-tr-identity-meta">not finished</span>
          </div>
        </div>
        <p className="aura-tr-identity-focus">
          <strong>{identitySummary.developmentFocus?.label || 'Focus'}</strong>
          {' · '}
          {identitySummary.developmentFocus?.detail || 'Complete more replays to unlock grounded patterns.'}
        </p>
        {identitySummary.evidence.uncertaintyNotes?.[0] &&
        identitySummary.evidence.signalStrength !== 'strong' ? (
          <p className="aura-tr-muted aura-tr-identity-note">{identitySummary.evidence.uncertaintyNotes[0]}</p>
        ) : null}
        {identitySummary.patterns.recurringMistakeTheme ? (
          <p className="aura-tr-identity-pattern">
            {identitySummary.patterns.recurringMistakeTheme.level === 'established' ? 'Established theme' : 'Emerging theme'}
            {' · '}
            {identitySummary.patterns.recurringMistakeTheme.label} · {identitySummary.patterns.recurringMistakeTheme.count}× in completed reviews
          </p>
        ) : null}
        {behaviorArchetype.visible ? (
          <div className="aura-tr-behavior-pattern" aria-label="Replay behaviour pattern">
            <div className="aura-tr-behavior-pattern-head">
              <span className="aura-tr-behavior-pattern-kicker">Behaviour pattern</span>
              {behaviorArchetype.showArchetypeLabel && behaviorArchetype.primaryReplayArchetype ? (
                <span className="aura-tr-chip aura-tr-chip--archetype">{behaviorArchetype.primaryReplayArchetype.label}</span>
              ) : null}
              {evidenceShort(behaviorArchetype.archetypeConfidence) ? (
                <span className="aura-tr-behavior-pattern-evidence">{evidenceShort(behaviorArchetype.archetypeConfidence)}</span>
              ) : null}
            </div>
            <p className="aura-tr-behavior-pattern-line">{behaviorArchetype.psychologyLines.patternLine}</p>
          </div>
        ) : null}
        {identitySummary.developmentGuidance?.topGrowthPriority?.practiceNext ? (
          <p className="aura-tr-muted aura-tr-identity-note">
            <strong>Practice · </strong>
            {identitySummary.developmentGuidance.topGrowthPriority.practiceNext}
          </p>
        ) : null}
        {identitySummary.developmentGuidance?.focusAreas?.[0]?.practiceNext ? (
          <p className="aura-tr-muted aura-tr-identity-note">
            <strong>Also target · </strong>
            {identitySummary.developmentGuidance.focusAreas[0].practiceNext}
          </p>
        ) : null}
        {identitySummary.developmentGuidance?.strengths?.[0]?.maintain ? (
          <p className="aura-tr-identity-pattern">
            <strong>Maintain · </strong>
            {identitySummary.developmentGuidance.strengths[0].maintain}
          </p>
        ) : null}
      </section>

      <section className="trader-suite-panel aura-tr-contribution-strip" aria-label="Replay profile contribution">
        <div className="aura-tr-contribution-head">
          <span className="trader-suite-kicker">Profile contribution · replay signal</span>
          <span className="aura-tr-contribution-note">Adds context for discipline/behavior — not your full Aurax Score</span>
        </div>
        <div className="aura-tr-contribution-grid">
          <div>
            <span className="aura-tr-identity-label">Discipline index</span>
            <strong className="aura-tr-identity-value">{disc.replayDisciplineContribution ?? '—'}</strong>
            <span className="aura-tr-identity-meta">{disc.replayDisciplineConfidence} confidence</span>
          </div>
          <div>
            <span className="aura-tr-identity-label">Behavior index</span>
            <strong className="aura-tr-identity-value">{beh.replayBehaviorContribution ?? '—'}</strong>
            <span className="aura-tr-identity-meta">{beh.replayBehaviorConfidence} confidence</span>
          </div>
          <div>
            <span className="aura-tr-identity-label">Discipline trend</span>
            <strong className="aura-tr-identity-value">{trendShort}</strong>
            <span className="aura-tr-identity-meta">last 7d vs prior week</span>
          </div>
        </div>
        {contributionProfile.scoreContributionExplanations[0] ? (
          <p className="aura-tr-contribution-expl">{contributionProfile.scoreContributionExplanations[0]}</p>
        ) : null}
        {contributionProfile.developmentActions[0] ? (
          <p className="aura-tr-contribution-action">
            <span className="aura-tr-muted">Next · </span>
            {contributionProfile.developmentActions[0]}
          </p>
        ) : null}
      </section>

      <ReplayPackagePrep sessions={sessions} habitStats={habitStats} variant="hub" />

      <ReplayNarrativePrep sessions={sessions} habitStats={habitStats} variant="hub" />

      <ReplayMonthlyCoachingPack sessions={sessions} habitStats={habitStats} />

      <p className="aura-tr-tier-ribbon" data-tier={replayTier}>
        {replayTier === 'ELITE' ? 'Elite desk · mentor-ready summaries & advanced library' : null}
        {replayTier === 'PRO' ? 'Pro · scenario drills & learning library' : null}
        {replayTier === 'ACCESS' ? 'Access · single-trade replay & core reflections' : null}
      </p>

      {continueSession ? (
        <section className="trader-suite-panel aura-tr-hub-continue">
          <div className="aura-tr-hub-continue-copy">
            <span className="trader-suite-kicker">Resume</span>
            <h2 className="aura-tr-hub-continue-title">Continue last replay</h2>
            <p className="aura-tr-hub-continue-meta">
              {continueSession.title}
              <span className="aura-tr-hub-dot"> · </span>
              {continueSession.asset || continueSession.symbol || '—'}
              <span className="aura-tr-hub-dot"> · </span>
              step {(continueSession.replayStep ?? 0) + 1}/{continueSession.replayMarkers?.length || 1}
            </p>
          </div>
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => onOpenSession(continueSession)}>
            Continue
          </button>
        </section>
      ) : null}

      <div className="aura-tr-hub-cards">
        <article className={`trader-suite-panel aura-tr-mode-card ${!canScenario ? 'aura-tr-mode-card--locked' : ''}`}>
          <span className="aura-tr-mode-eyebrow">Scenario</span>
          <h3>Scenario replay</h3>
          <p>Stress-test behaviour on worst days, revenge tells, poor timing, and missed opportunity — ranked from your history.</p>
          {canScenario ? (
            <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => onChooseMode(REPLAY_MODES.scenario)}>
              Start scenarios
            </button>
          ) : (
            <>
              <button type="button" className="trader-suite-btn trader-suite-btn--primary aura-tr-btn--disabled" disabled aria-disabled="true">
                Scenario replay
              </button>
              <ReplayPremiumNudge>
                Unlock ranked scenario drills and pattern-focused review.
              </ReplayPremiumNudge>
            </>
          )}
        </article>
        <article className="trader-suite-panel aura-tr-mode-card">
          <span className="aura-tr-mode-eyebrow">Session</span>
          <h3>Daily replay</h3>
          <p>Review a full session date: preparation, execution windows, and how the day scoreboard should read.</p>
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => onChooseMode(REPLAY_MODES.day)}>
            Pick a day
          </button>
        </article>
        <article className={`trader-suite-panel aura-tr-mode-card ${replayTier === 'ELITE' ? 'aura-tr-mode-card--elite' : ''}`}>
          <span className="aura-tr-mode-eyebrow">Trace</span>
          <h3>Individual trade replay</h3>
          <p>Deep dive one execution with markers, reflection, and links back to Playbook and Validator.</p>
          {replayTier === 'ELITE' ? (
            <p className="aura-tr-muted aura-tr-elite-hint">Elite includes richer mentor summaries and copy-ready desk notes on completed trades.</p>
          ) : null}
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => onChooseMode(REPLAY_MODES.trade)}>
            Open library
          </button>
        </article>
      </div>

      <section className="trader-suite-panel aura-tr-hub-footer">
        <div className="aura-tr-hub-footer-row">
          <div>
            <span className="trader-suite-kicker">Library</span>
            <h3 className="aura-tr-hub-footer-title">Recent replays ({sessionsCount})</h3>
            <p className="aura-tr-muted">Open any saved session — markers and notes restore exactly where you left off.</p>
          </div>
          <div className="aura-tr-hub-footer-actions">
            <label className="aura-tr-hub-sort">
              <span className="aura-tr-muted">Sort</span>
              <select className="trader-suite-select" value={hubSort} onChange={(e) => setHubSort(e.target.value)} aria-label="Sort recent replays">
                {hubSortOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            {canExamples ? (
              <button type="button" className="trader-suite-btn" onClick={() => onBrowseLearningExamples?.()}>
                Learning examples ({habitStats?.learningExamplesCount ?? 0})
              </button>
            ) : (
              <span className="aura-tr-locked-chip" title="Premium">
                Examples locked
              </span>
            )}
            <button type="button" className="trader-suite-btn" onClick={onOpenLibrary}>
              Browse all
            </button>
          </div>
        </div>
        {!sortedRecent?.length ? (
          <p className="aura-tr-empty">No sessions yet — create one from a mode above or try the guided example.</p>
        ) : (
          <ul className="aura-tr-recent-list">
            {sortedRecent.map((s) => {
              const ex = computeReplayQualityScore(s).score;
              const rv = computeReviewCompletenessScore(s).score;
              const coach = deriveCoaching(s);
              const status =
                s.replayStatus === REPLAY_STATUSES.completed ? 'Done' : s.replayStatus === REPLAY_STATUSES.inProgress ? 'Live' : 'Draft';
              const when = s.replayDate || s.sourceDate || (s.updatedAt ? String(s.updatedAt).slice(0, 10) : '—');
              const exLabel = formatLearningExampleLabel(s.learningExample, s.learningExampleKind);
              return (
                <li key={s.id}>
                  <button type="button" className="aura-tr-recent-btn" onClick={() => onOpenSession(s)}>
                    <div className="aura-tr-recent-btn-head">
                      <strong>{s.title}</strong>
                      {exLabel ? <span className="aura-tr-chip subtle aura-tr-chip--example">{exLabel}</span> : null}
                    </div>
                    <span className="aura-tr-recent-meta">
                      {s.mode || 'trade'} · {s.asset || '—'} · {when} · {status}
                    </span>
                    <span className="aura-tr-recent-meta">
                      {s.verdict ? `${s.verdict.slice(0, 56)}${s.verdict.length > 56 ? '…' : ''}` : s.outcome || '—'}
                      {' · '}
                      Q{ex} · Rv{rv}
                    </span>
                    {s.learningExample && coach.mainLesson && coach.mainLesson !== '—' ? (
                      <span className="aura-tr-recent-lesson" title={coach.mainLesson}>
                        Lesson · {coach.mainLesson.slice(0, 88)}{coach.mainLesson.length > 88 ? '…' : ''}
                      </span>
                    ) : null}
                    {s.learningExample && coach.bestMoment && coach.bestMoment !== '—' ? (
                      <span className="aura-tr-recent-meta">Best moment · {coach.bestMoment.slice(0, 72)}{coach.bestMoment.length > 72 ? '…' : ''}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="aura-tr-demo-row">
          <button type="button" className="trader-suite-btn" onClick={onTryDemo}>
            Try guided example (local)
          </button>
        </div>
      </section>
    </div>
  );
}
