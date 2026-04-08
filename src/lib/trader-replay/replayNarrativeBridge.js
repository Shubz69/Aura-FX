/**
 * Compact replay → discipline/profile bridge payloads for non-replay Aura surfaces.
 * Composes replayNarrativeEngine + replayBehaviorArchetypeEngine — no parallel insight stack.
 */
import { normalizeReplay } from './replayNormalizer';
import { REPLAY_STATUSES } from './replayDefaults';
import { computeReplayHabitStats } from './replayHabit';
import { buildWeeklyReplayBrief, buildMonthlyReplayReview } from './replayNarrativeEngine';
import { buildReplayBehaviorArchetypeProfile } from './replayBehaviorArchetypeEngine';

const MIN_COMPLETED_FOR_BRIDGE = 2;

function trunc(text, max = 180) {
  if (text == null || text === '') return '';
  const t = String(text).trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function disciplineTrendChip(trend) {
  if (trend === 'improving') return 'Replay discipline · improving';
  if (trend === 'slipping') return 'Replay discipline · slipping';
  if (trend === 'stable') return 'Replay discipline · stable';
  return null;
}

/**
 * UI-ready weekly/monthly bridge from replay narratives + optional contribution profile (trend only).
 * @param {object[]} sessions — raw or normalized replay rows
 * @param {object|null} habitStats — from computeReplayHabitStats; computed if null
 * @param {object|null} profile — buildReplayContributionProfile output for trend + completed count
 */
export function buildReplayNarrativeBridgeForUi(sessions = [], habitStats = null, profile = null) {
  const normalized = (sessions || []).map((s) => normalizeReplay(s));
  const completedCount =
    profile?.evidence?.completedCount ??
    normalized.filter((s) => s.replayStatus === REPLAY_STATUSES.completed).length;

  const h = habitStats ?? computeReplayHabitStats(normalized);
  const behaviorPattern = buildReplayBehaviorArchetypeProfile(sessions, h, profile);

  if (completedCount < MIN_COMPLETED_FOR_BRIDGE) {
    return {
      visible: false,
      weekly: null,
      monthly: null,
      sharedTrendChip: null,
      sharedTrendDetail: null,
      disclaimer: null,
      moreHref: '/aura-analysis/dashboard/trader-replay',
      moreLabel: 'Trader Replay',
      evidenceNote: null,
      behaviorPattern,
    };
  }
  const W = buildWeeklyReplayBrief(sessions, h);
  const M = buildMonthlyReplayReview(sessions, h);
  const d = profile?.discipline;
  const sharedTrendChip = disciplineTrendChip(d?.replayDisciplineTrend);
  const sharedTrendDetail =
    trunc(d?.replayDisciplineExplanation, 130) || trunc(W.disciplineSignal, 130) || null;

  const evidenceNote =
    completedCount < 4 ? 'Limited replay sample — treat as directional, not definitive.' : null;

  return {
    visible: true,
    disclaimer: 'Replay-derived review context (rolling windows — not live execution stats).',
    moreHref: '/aura-analysis/dashboard/trader-replay',
    moreLabel: 'Open Trader Replay',
    sharedTrendChip,
    sharedTrendDetail: sharedTrendDetail || null,
    evidenceNote,
    weekly: {
      snapshot: trunc(W.snapshotLine, 120),
      rehearse: trunc(W.rehearseBeforeSession, 200),
      caution: trunc(W.topCaution, 170),
      reinforce: W.modelReinforce ? trunc(W.modelReinforce, 170) : trunc(W.strongestLesson, 130),
      followThrough: trunc(W.followThroughNote, 160),
      monitor: trunc(W.monitorLine, 160),
      next: trunc(W.nextWeekFocus, 200),
    },
    monthly: {
      snapshot: trunc(M.snapshotLine, 120),
      focus: trunc(M.monthlyDevelopmentFocus, 220),
      reinforce: trunc(M.strongestStrength, 170),
      correct: trunc(M.biggestWeakness, 170),
      identity: trunc(M.identityPatternLine, 220),
      rvTrend: trunc(M.reviewCompletenessTrend, 150),
      example: M.learningExamplesRevisit?.[0] ? trunc(M.learningExamplesRevisit[0], 150) : null,
    },
    behaviorPattern,
  };
}
