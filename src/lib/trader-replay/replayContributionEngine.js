/**
 * Replay-derived contribution layer for wider Aura discipline/behavior profiles.
 * One input signal among many — not a replacement for Aurax or validator-derived behavior.
 * All outputs deterministic and conservative under sparse evidence.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { deriveCoaching } from './replayCoachingEngine';
import { REPLAY_STATUSES } from './replayDefaults';
import {
  filterCompletedSessions,
  sessionActivityDate,
  aggregateReplayPatterns,
  buildReplayIdentitySummary,
  buildRollingReplaySummaries,
  bucketMistakeText,
  REPLAY_IDENTITY_MIN_WEAK,
} from './replayIdentityEngine';

export const REPLAY_CONTRIBUTION_MIN_TREND = 2;

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function addDays(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ruleBrokenSession(s) {
  const t = `${s.ruleFollowed || ''} ${s.verdict || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return /broke|broken|ignored|violated|revenge|overtrad|fomo|no plan/i.test(t);
}

function tiltSession(s) {
  const t = `${s.emotionalState || ''} ${s.verdict || ''}`.toLowerCase();
  return /tilt|revenge|fomo|bored|panic|rushed/i.test(t);
}

function riskDefined(s) {
  return Boolean(String(s.stop || s.stopLoss || '').trim() && String(s.target || s.takeProfit || '').trim());
}

function mistakeHasBucket(s, bucketId) {
  const c = deriveCoaching(s);
  const parts = [s.reviewBiggestMistake, c.biggestMistake, s.whatIMissed, s.lessonSummary]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return parts.some((p) => bucketMistakeText(p) === bucketId);
}

/**
 * Sessions completed with activity date in [fromYmd, toYmd] inclusive.
 */
function completedInRange(sessions, fromYmd, toYmd) {
  return filterCompletedSessions(sessions).filter((s) => {
    const day = sessionActivityDate(s);
    return day && day >= fromYmd && day <= toYmd;
  });
}

function windowMetrics(list) {
  const n = list.length;
  if (!n) {
    return {
      n: 0,
      meanReviewCompleteness: null,
      meanDiscipline: null,
      meanPatience: null,
      meanEntryTiming: null,
      ruleBreakRate: null,
      tiltRate: null,
      riskDefinedRate: null,
      lateEntryBucketRate: null,
      cautionRate: null,
      modelRate: null,
    };
  }
  const revs = list.map((s) => computeReviewCompletenessScore(s).score);
  const disciplines = list.map((s) => Number(s.discipline) || 0);
  const patience = list.map((s) => Number(s.patience) || 0);
  const entry = list.map((s) => Number(s.entryTiming) || 0);
  const rb = list.filter(ruleBrokenSession).length;
  const tilt = list.filter(tiltSession).length;
  const risk = list.filter(riskDefined).length;
  const late = list.filter((s) => mistakeHasBucket(s, 'late_entry')).length;
  const cautions = list.filter((s) => s.learningExample && s.learningExampleKind === 'caution').length;
  const models = list.filter((s) => s.learningExample && s.learningExampleKind === 'model').length;
  return {
    n,
    meanReviewCompleteness: mean(revs),
    meanDiscipline: mean(disciplines),
    meanPatience: mean(patience),
    meanEntryTiming: mean(entry),
    ruleBreakRate: rb / n,
    tiltRate: tilt / n,
    riskDefinedRate: risk / n,
    lateEntryBucketRate: late / n,
    cautionRate: cautions / n,
    modelRate: models / n,
  };
}

/**
 * Compare two window metrics for directional trend (conservative thresholds).
 */
function compareMetricDirection(cur, prev, key, threshold) {
  const a = cur[key];
  const b = prev[key];
  if (a == null || b == null) return 'insufficient_evidence';
  if (cur.n < REPLAY_CONTRIBUTION_MIN_TREND || prev.n < REPLAY_CONTRIBUTION_MIN_TREND) {
    return 'insufficient_evidence';
  }
  const diff = a - b;
  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'slipping';
  return 'stable';
}

function compareRateDownIsGood(cur, prev, key, threshold) {
  const a = cur[key];
  const b = prev[key];
  if (a == null || b == null) return 'insufficient_evidence';
  if (cur.n < REPLAY_CONTRIBUTION_MIN_TREND || prev.n < REPLAY_CONTRIBUTION_MIN_TREND) {
    return 'insufficient_evidence';
  }
  const diff = b - a;
  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'slipping';
  return 'stable';
}

/**
 * Rolling improvement vs slippage (replay evidence only).
 */
export function buildReplayRollingDirectionalSignals(sessions = []) {
  const today = ymdToday();
  const last7 = completedInRange(sessions, addDays(today, -6), today);
  const prev7 = completedInRange(sessions, addDays(today, -13), addDays(today, -7));
  const last30 = completedInRange(sessions, addDays(today, -29), today);
  const prev30 = completedInRange(sessions, addDays(today, -59), addDays(today, -30));

  const wLast7 = windowMetrics(last7);
  const wPrev7 = windowMetrics(prev7);
  const wLast30 = windowMetrics(last30);
  const wPrev30 = windowMetrics(prev30);

  return {
    last7VsPrev7: {
      reviewCompleteness: compareMetricDirection(wLast7, wPrev7, 'meanReviewCompleteness', 5),
      disciplineSelfScore: compareMetricDirection(wLast7, wPrev7, 'meanDiscipline', 0.65),
      cautionShare: compareRateDownIsGood(wLast7, wPrev7, 'cautionRate', 0.12),
      modelShare: compareMetricDirection(wLast7, wPrev7, 'modelRate', 0.12),
      lateEntryTheme: compareRateDownIsGood(wLast7, wPrev7, 'lateEntryBucketRate', 0.15),
    },
    last30VsPrev30: {
      reviewCompleteness: compareMetricDirection(wLast30, wPrev30, 'meanReviewCompleteness', 4),
      disciplineSelfScore: compareMetricDirection(wLast30, wPrev30, 'meanDiscipline', 0.5),
      cautionShare: compareRateDownIsGood(wLast30, wPrev30, 'cautionRate', 0.1),
      modelShare: compareMetricDirection(wLast30, wPrev30, 'modelRate', 0.08),
      lateEntryTheme: compareRateDownIsGood(wLast30, wPrev30, 'lateEntryBucketRate', 0.12),
    },
    windows: {
      last7: wLast7,
      prev7: wPrev7,
      last30: wLast30,
      prev30: wPrev30,
    },
  };
}

/**
 * Discipline contribution index 0–100 + meta (not Aurax — replay-only layer).
 */
export function computeReplayDisciplineContribution(sessions = [], habitStats = null) {
  const completed = filterCompletedSessions(sessions);
  const n = completed.length;
  const patterns = aggregateReplayPatterns(sessions);

  if (n === 0) {
    return {
      replayDisciplineContribution: null,
      replayDisciplineSignals: [],
      replayDisciplineConfidence: 'low',
      replayDisciplineTrend: 'insufficient_evidence',
      replayDisciplineExplanation: 'No completed replays yet — finish reviews to build a discipline signal.',
    };
  }

  const revs = completed.map((s) => computeReviewCompletenessScore(s).score);
  const avgRv = mean(revs);
  const disciplines = completed.map((s) => Number(s.discipline) || 0);
  const patience = completed.map((s) => Number(s.patience) || 0);
  const avgDisc = mean(disciplines);
  const avgPat = mean(patience);
  const selfStack = ((avgDisc + avgPat) / 20) * 100;

  const streakDays = habitStats?.reviewStreakDays ?? 0;
  const streakBoost = clamp(streakDays * 2.2, 0, 18);

  let index = 0.48 * avgRv + 0.34 * selfStack + 0.18 * streakBoost;
  const signals = [
    `Avg review completeness ${Math.round(avgRv)}% (${n} completed)`,
    `Self-rated discipline/patience stack ${avgDisc.toFixed(1)} / ${avgPat.toFixed(1)} (0–10)`,
  ];
  if (streakDays > 0) signals.push(`Review streak ${streakDays}d (habit)`);

  if (patterns.recurringMistakeTheme?.bucket === 'late_entry' && patterns.recurringMistakeTheme.count >= 2) {
    index -= 10;
    signals.push(`Repeated late/chase theme in ${patterns.recurringMistakeTheme.count} reviews — discipline drag`);
  }
  const rbFrac = completed.filter(ruleBrokenSession).length / n;
  if (rbFrac >= 0.35) {
    index -= 6;
    signals.push('Rule-break language frequent vs your completed sample');
  }
  const tiltFrac = completed.filter(tiltSession).length / n;
  if (tiltFrac >= 0.3) {
    index -= 5;
    signals.push('Emotional slip language appears often in reviews');
  }

  index = clamp(Math.round(index), 0, 100);

  let confidence = 'low';
  if (n >= 6) confidence = 'high';
  else if (n >= 3) confidence = 'medium';

  const directional = buildReplayRollingDirectionalSignals(sessions);
  let replayDisciplineTrend = 'stable';
  const rvDir = directional.last7VsPrev7.reviewCompleteness;
  const discDir = directional.last7VsPrev7.disciplineSelfScore;
  if (rvDir === 'insufficient_evidence' && discDir === 'insufficient_evidence') {
    replayDisciplineTrend = 'insufficient_evidence';
  } else if (rvDir === 'improving' || discDir === 'improving') {
    replayDisciplineTrend = 'improving';
  } else if (rvDir === 'slipping' || discDir === 'slipping') {
    replayDisciplineTrend = 'slipping';
  }

  let replayDisciplineExplanation = '';
  if (replayDisciplineTrend === 'improving' && n >= REPLAY_IDENTITY_MIN_WEAK) {
    replayDisciplineExplanation = 'Replay reviews show stronger review discipline recently vs the prior week.';
  } else if (replayDisciplineTrend === 'slipping' && n >= REPLAY_IDENTITY_MIN_WEAK) {
    replayDisciplineExplanation = 'Replay discipline read softer recently than the prior week — close open reviews.';
  } else if (patterns.recurringMistakeTheme?.bucket === 'late_entry') {
    replayDisciplineExplanation = 'Repeated late-entry cautions are limiting replay discipline contribution.';
  } else if (index >= 62 && n >= 3) {
    replayDisciplineExplanation = 'Completed reviews and self-ratings support a positive replay discipline signal.';
  } else {
    replayDisciplineExplanation = 'Replay discipline contribution is neutral — add completed reviews for a clearer read.';
  }

  return {
    replayDisciplineContribution: index,
    replayDisciplineSignals: signals.slice(0, 5),
    replayDisciplineConfidence: confidence,
    replayDisciplineTrend,
    replayDisciplineExplanation,
  };
}

/**
 * Broader behavior contribution index + categorized lines.
 */
export function computeReplayBehaviorContribution(sessions = []) {
  const completed = filterCompletedSessions(sessions);
  const n = completed.length;
  const patterns = aggregateReplayPatterns(sessions);

  if (n === 0) {
    return {
      replayBehaviorContribution: null,
      strengths: [],
      cautions: [],
      growthSignals: [],
      riskSignals: [],
      replayBehaviorConfidence: 'low',
    };
  }

  const avgRv = mean(completed.map((s) => computeReviewCompletenessScore(s).score));
  const avgPat = mean(completed.map((s) => Number(s.patience) || 0));
  const avgEntry = mean(completed.map((s) => Number(s.entryTiming) || 0));
  const riskShare = completed.filter(riskDefined).length / n;
  const missedHeavy = completed.filter((s) => (parseR(s.missedR) ?? 0) >= 0.35).length / n;

  const patienceScore = (avgPat / 10) * 100;
  const riskScore = riskShare * 100;
  const entryScore = (avgEntry / 10) * 100;
  const reviewScore = avgRv;

  let behaviorIndex = 0.28 * patienceScore + 0.22 * riskScore + 0.22 * entryScore + 0.28 * reviewScore;

  const strengths = [];
  if (avgPat >= 6.5) strengths.push(`Patience self-rating avg ${avgPat.toFixed(1)}/10 across replays`);
  if (riskShare >= 0.65) strengths.push(`Risk framework present on ${Math.round(riskShare * 100)}% of completed replays`);
  if (patterns.modelExampleCount >= 2) strengths.push(`${patterns.modelExampleCount} model examples — repeatable process captured`);
  if (patterns.recurringStrengthTheme) strengths.push(patterns.recurringStrengthTheme.detail);

  const cautions = [];
  if (avgPat < 5.5) cautions.push('Patience reads low on average — impulsiveness risk in replay self-ratings');
  if (missedHeavy >= 0.35) cautions.push('Missed-R or exit themes appear often — management consistency under question');
  if (patterns.recurringMistakeTheme?.bucket === 'late_entry') {
    cautions.push(`Late/chase pattern repeated (${patterns.recurringMistakeTheme.count}×) in review text`);
  }
  if (patterns.cautionExampleCount >= 3) cautions.push(`${patterns.cautionExampleCount} caution examples — refine rules before repeating`);

  const growthSignals = [];
  const dir = buildReplayRollingDirectionalSignals(sessions);
  if (dir.last30VsPrev30.reviewCompleteness === 'improving') {
    growthSignals.push('Review completeness up vs prior 30 days — review seriousness improving');
  }
  if (patterns.modelExampleCount > 0 && dir.last30VsPrev30.modelShare === 'improving') {
    growthSignals.push('More model examples recently — good process being archived');
  }

  const riskSignals = [];
  if (tiltSession(completed[completed.length - 1]) && n >= 3) {
    riskSignals.push('Latest replay still flags emotional tells — watch tilt on next session');
  }
  if (dir.last30VsPrev30.cautionShare === 'slipping') {
    riskSignals.push('Caution examples rising vs prior month — poor-process cases increasing');
  }

  behaviorIndex = clamp(Math.round(behaviorIndex - missedHeavy * 12), 0, 100);

  let replayBehaviorConfidence = 'low';
  if (n >= 6) replayBehaviorConfidence = 'high';
  else if (n >= 3) replayBehaviorConfidence = 'medium';

  return {
    replayBehaviorContribution: behaviorIndex,
    strengths: strengths.slice(0, 4),
    cautions: cautions.slice(0, 4),
    growthSignals: growthSignals.slice(0, 3),
    riskSignals: riskSignals.slice(0, 3),
    replayBehaviorConfidence,
  };
}

/**
 * Compact copy for Aurax/score-adjacent surfaces (Overview, Psychology, etc.).
 * Not a score — a replay-sourced supporting signal only.
 * @param {object} profile — output of buildReplayContributionProfile
 */
export function getCompactReplayScoreSurfaceSummary(profile) {
  if (!profile || profile.kind !== 'aura.replayContribution.v1') {
    return { visible: false };
  }
  const n = profile.evidence?.completedCount ?? 0;
  if (n === 0) {
    return { visible: false };
  }
  const d = profile.discipline;
  const b = profile.behavior;
  const dIdx = d.replayDisciplineContribution ?? 0;
  const bIdx = b.replayBehaviorContribution ?? 0;

  let chipText = 'Neutral';
  if (n < 3) {
    chipText = 'Limited evidence';
  } else if (d.replayDisciplineTrend === 'improving') {
    chipText = 'Improving';
  } else if (d.replayDisciplineTrend === 'slipping') {
    chipText = 'Watch';
  } else if (dIdx >= 62 && bIdx >= 55) {
    chipText = 'Positive signal';
  } else if (dIdx < 45 || bIdx < 45) {
    chipText = 'Watch';
  }

  const supportingLine = (profile.scoreContributionExplanations && profile.scoreContributionExplanations[0])
    || d.replayDisciplineExplanation
    || '';

  const trendChip = d.replayDisciplineTrend === 'improving'
    ? 'Replay discipline ↑'
    : d.replayDisciplineTrend === 'slipping'
      ? 'Replay discipline ↓'
      : null;

  return {
    visible: true,
    chipText,
    supportingLine: String(supportingLine).slice(0, 240),
    trendChip,
    disclaimer: 'Replay review signal — one profile input, not your full Aurax score.',
    moreHref: '/aura-analysis/dashboard/trader-replay',
    moreLabel: 'Trader Replay',
    completedCount: n,
  };
}

/**
 * Short explanation lines for profile surfaces (Aurax-adjacent, replay-sourced).
 */
export function buildReplayScoreContributionExplanations(profile) {
  const out = [];
  const d = profile.discipline;
  const b = profile.behavior;
  if (d.replayDisciplineExplanation) out.push(d.replayDisciplineExplanation);
  if (d.replayDisciplineTrend === 'improving') {
    out.push('Last 7 days vs prior week: review depth and self-discipline trending up.');
  } else if (d.replayDisciplineTrend === 'slipping') {
    out.push('Last 7 days vs prior week: replay discipline read down — finish reflections while fresh.');
  }
  if (b.strengths[0]) out.push(`Strength signal · ${b.strengths[0]}`);
  if (b.cautions[0]) out.push(`Caution signal · ${b.cautions[0]}`);
  if (profile.directional?.last30VsPrev30?.lateEntryTheme === 'improving') {
    out.push('Late/chase language less frequent than the prior 30-day window.');
  } else if (profile.directional?.last30VsPrev30?.lateEntryTheme === 'slipping') {
    out.push('Late/chase language more frequent than the prior 30-day window.');
  }
  return [...new Set(out)].filter(Boolean).slice(0, 6);
}

/**
 * Actionable development lines tied to existing Aura flows.
 */
export function buildReplayDevelopmentActions(profile) {
  const actions = [];
  const patterns = profile.patterns;
  const d = profile.discipline;
  const b = profile.behavior;

  if (d.replayDisciplineTrend === 'improving') {
    actions.push('Keep journaling post-trade reflections — review follow-through is improving.');
  }
  if (patterns?.recurringMistakeTheme?.bucket === 'late_entry') {
    actions.push('Focus on entry patience — late-entry cautions are the most repeated replay issue.');
  }
  if (b.cautions.some((c) => /Missed-R|exit/i.test(c))) {
    actions.push('Use The Operator checklist before the next session — exit/management themes repeat.');
  }
  if (patterns?.modelExampleCount >= 1) {
    actions.push('Turn strong model examples into Playbook rules under Refine.');
  }
  if (d.replayDisciplineContribution != null && d.replayDisciplineContribution < 48) {
    actions.push('Complete reviews fully — low review completeness is capping replay contribution.');
  }
  if (actions.length < 2 && profile.habitStats?.incompleteCount > 0) {
    actions.push(`Close ${profile.habitStats.incompleteCount} open replay loop(s) to strengthen your profile signal.`);
  }
  return [...new Set(actions)].slice(0, 5);
}

/**
 * Full payload for CV, hub, and modals.
 * @param {object|null} habitStats — from computeReplayHabitStats(sessions)
 */
export function buildReplayContributionProfile(sessions = [], habitStats = null) {
  const completed = filterCompletedSessions(sessions);
  const identity = buildReplayIdentitySummary(sessions);
  const rolling = buildRollingReplaySummaries(sessions);
  const patterns = aggregateReplayPatterns(sessions);
  const directional = buildReplayRollingDirectionalSignals(sessions);
  const discipline = computeReplayDisciplineContribution(sessions, habitStats);
  const behavior = computeReplayBehaviorContribution(sessions);
  const explanations = buildReplayScoreContributionExplanations({
    discipline,
    behavior,
    directional,
    patterns,
  });
  const developmentActions = buildReplayDevelopmentActions({
    discipline,
    behavior,
    patterns,
    habitStats,
    directional,
  });

  return {
    kind: 'aura.replayContribution.v1',
    generatedAt: new Date().toISOString(),
    evidence: {
      completedCount: completed.length,
      totalSessions: sessions.length,
      note: 'Replay-sourced index only; combines with validator/journal behavior elsewhere.',
    },
    discipline,
    behavior,
    directional,
    rolling,
    identity,
    patterns,
    scoreContributionExplanations: explanations,
    developmentActions,
  };
}
