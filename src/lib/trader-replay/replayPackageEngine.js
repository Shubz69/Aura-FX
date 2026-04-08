/**
 * Session-prep and mentor review packages — thin layer over identity, contribution, habit, coaching.
 * Deterministic, concise, no duplicate scoring frameworks.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { deriveCoaching } from './replayCoachingEngine';
import { REPLAY_STATUSES } from './replayDefaults';
import {
  buildReplayIdentitySummary,
  filterCompletedSessions,
  sessionActivityDate,
  aggregateReplayPatterns,
  bucketMistakeText,
  REPLAY_IDENTITY_MIN_WEAK,
} from './replayIdentityEngine';
import { buildReplayContributionProfile, buildReplayRollingDirectionalSignals } from './replayContributionEngine';
import { computeReplayHabitStats } from './replayHabit';
import { buildMentorCoachContext, getLearningExampleMentorFraming } from './replayMentorReviewEngine';

function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(ymd, delta) {
  const [y, m, day] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function completedInRange(sessions, fromYmd, toYmd) {
  return filterCompletedSessions(sessions).filter((s) => {
    const day = sessionActivityDate(s);
    return day && day >= fromYmd && day <= toYmd;
  });
}

function trimT(text, max = 200) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function compareSessionsCoachValue(a, b) {
  const arv = computeReviewCompletenessScore(a).score;
  const brv = computeReviewCompletenessScore(b).score;
  if (brv !== arv) return brv - arv;
  const aq = computeReplayQualityScore(a).score;
  const bq = computeReplayQualityScore(b).score;
  if (bq !== aq) return bq - aq;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

/** Exported for coaching pack / mentor selection — deterministic scoring. */
export function pickLearningExamples(completedList, kind, limit, patterns) {
  const filtered = completedList.filter((s) => s.learningExample && s.learningExampleKind === kind);
  const recurringBucket = patterns?.recurringMistakeTheme?.bucket;
  const scored = filtered.map((s) => {
    let bonus = 0;
    if (kind === 'caution' && recurringBucket) {
      const coach = deriveCoaching(s);
      const parts = [s.reviewBiggestMistake, coach.biggestMistake, s.whatIMissed, s.lessonSummary]
        .map((x) => String(x || '').trim())
        .filter(Boolean);
      if (parts.some((p) => bucketMistakeText(p) === recurringBucket)) bonus = 4;
    }
    if (kind === 'model') bonus += Math.min(3, patterns?.modelExampleCount || 0);
    const rv = computeReviewCompletenessScore(s).score;
    const q = computeReplayQualityScore(s).score;
    return { s, score: bonus * 1000 + rv * 10 + q };
  });
  scored.sort((a, b) => b.score - a.score || compareSessionsCoachValue(a.s, b.s));
  return scored.slice(0, limit).map((x) => x.s);
}

/**
 * Weekly mentor review: same coach-value scoring as pickLearningExamples, but sort by
 * activity date (newest first) so the pack stays tactically recent — distinct from monthly picks.
 */
export function pickWeeklyLearningExamples(weekList, kind, limit, patterns) {
  const filtered = weekList.filter((s) => s.learningExample && s.learningExampleKind === kind);
  if (!filtered.length) return [];
  const recurringBucket = patterns?.recurringMistakeTheme?.bucket;
  const scored = filtered.map((s) => {
    let bonus = 0;
    if (kind === 'caution' && recurringBucket) {
      const coach = deriveCoaching(s);
      const parts = [s.reviewBiggestMistake, coach.biggestMistake, s.whatIMissed, s.lessonSummary]
        .map((x) => String(x || '').trim())
        .filter(Boolean);
      if (parts.some((p) => bucketMistakeText(p) === recurringBucket)) bonus = 4;
    }
    if (kind === 'model') bonus += Math.min(3, patterns?.modelExampleCount || 0);
    const rv = computeReviewCompletenessScore(s).score;
    const q = computeReplayQualityScore(s).score;
    const day = sessionActivityDate(s) || '1970-01-01';
    return { s, day, score: bonus * 1000 + rv * 10 + q };
  });
  scored.sort((a, b) => {
    if (b.day !== a.day) return b.day.localeCompare(a.day);
    if (b.score !== a.score) return b.score - a.score;
    return compareSessionsCoachValue(a.s, b.s);
  });
  return scored.slice(0, limit).map((x) => x.s);
}

function sessionOneLiner(s) {
  const coach = deriveCoaching(s);
  const bit = coach.mainLesson && coach.mainLesson !== '—' ? coach.mainLesson : s.title || 'Replay';
  return trimT(bit, 120);
}

function examplesForCopy(sessions, kind, n, patterns) {
  return pickLearningExamples(sessions, kind, n, patterns).map((s) => ({
    id: s.id,
    title: s.title || '—',
    kind,
    symbol: s.asset || s.symbol || '—',
    date: s.replayDate || s.sourceDate || '—',
    line: sessionOneLiner(s),
  }));
}

function echoRecurringInList(theme, list) {
  if (!theme?.bucket) return false;
  return list.some((s) => {
    const coach = deriveCoaching(s);
    const parts = [s.reviewBiggestMistake, coach.biggestMistake, s.whatIMissed, s.lessonSummary]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return parts.some((p) => bucketMistakeText(p) === theme.bucket);
  });
}

function readinessFromSignals({ habitStats, contrib, incompleteCount }) {
  const trend = contrib.discipline?.replayDisciplineTrend;
  if (trend === 'slipping') return { level: 'low', line: 'Replay discipline read softer recently — review before size.' };
  if ((habitStats?.incompleteCount ?? incompleteCount) > 2) {
    return { level: 'low', line: 'Several open replay loops — close or triage before live risk.' };
  }
  if (habitStats?.reviewedToday && trend === 'improving') {
    return { level: 'high', line: 'Review discipline trending up and you logged work today.' };
  }
  if (trend === 'improving') return { level: 'medium', line: 'Trend improving — stay with the pre-trade checklist.' };
  return { level: 'medium', line: 'Standard readiness — skim focus + caution before the session.' };
}

function pickMentorFocusSession(normalized) {
  const patterns = aggregateReplayPatterns(normalized);
  const completed = filterCompletedSessions(normalized);
  const caution = pickLearningExamples(completed, 'caution', 1, patterns)[0];
  if (caution) return caution;
  const inProg = normalized
    .filter((s) => s.replayStatus === REPLAY_STATUSES.inProgress)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (inProg[0]) return normalizeReplay(inProg[0]);
  if (completed.length) {
    return [...completed].sort(
      (a, b) => computeReviewCompletenessScore(a).score - computeReviewCompletenessScore(b).score
    )[0];
  }
  return null;
}

/**
 * @param {object[]} sessions
 * @param {object|null} habitStats
 */
export function buildReplayPreSessionPackage(sessions = [], habitStats = null) {
  const normalized = sessions.map(normalizeReplay);
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const identity = buildReplayIdentitySummary(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const patterns = identity.patterns;
  const today = ymdToday();
  const last30 = completedInRange(normalized, addDays(today, -29), today);
  const pool = last30.length ? last30 : filterCompletedSessions(normalized);
  const models = examplesForCopy(pool, 'model', 2, patterns);
  const cautions = examplesForCopy(cautionExamplesFirst(pool, patterns), 'caution', 2, patterns);

  const topCaution = patterns.recurringMistakeTheme
    ? `${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.count}×)`
    : (cautions[0]?.line || 'No tagged caution examples yet — add one from a loss review.');

  const topModelLine = models[0]
    ? `Reinforce: ${models[0].title} · ${models[0].line}`
    : (identity.developmentGuidance?.strengths?.[0]?.maintain
      ? `Strength to keep: ${trimT(identity.developmentGuidance.strengths[0].maintain, 160)}`
      : 'Save a model example when you execute the plan well.');

  const dev = identity.developmentFocus;
  const todayFocus = dev?.detail
    ? `${dev.label} — ${trimT(dev.detail, 220)}`
    : trimT(identity.developmentGuidance?.topGrowthPriority?.practiceNext, 220) || 'Complete replays consistently to unlock a sharper prep read.';

  const incompleteCount = normalized.filter(
    (s) => s.replayStatus !== REPLAY_STATUSES.completed
  ).length;
  const readiness = readinessFromSignals({ habitStats: h, contrib, incompleteCount });

  const signalLine = contrib.scoreContributionExplanations?.[0] || contrib.discipline?.replayDisciplineExplanation || '—';
  const nextAction = contrib.developmentActions?.[0]
    || identity.developmentGuidance?.topGrowthPriority?.practiceNext
    || 'Finish today’s replay review while the trade is fresh.';

  const examplesToReview = [...models.slice(0, 1).map((m) => ({ ...m, role: 'reinforce' })), ...cautions.slice(0, 1).map((c) => ({ ...c, role: 'correct' }))].filter((x) => x.id);

  const plainLines = [
    '── Aura Trader Replay · pre-session focus ──',
    `Session readiness: ${readiness.level.toUpperCase()} — ${readiness.line}`,
    `Today’s focus: ${todayFocus}`,
    `Top caution theme: ${topCaution}`,
    `Model / repeat: ${topModelLine}`,
    `Replay signal: ${trimT(signalLine, 220)}`,
    `Do not ignore: ${trimT(contrib.behavior?.cautions?.[0] || topCaution, 200)}`,
    `Next action: ${trimT(nextAction, 220)}`,
  ];
  if (examplesToReview.length) {
    plainLines.push('Review now:');
    examplesToReview.forEach((ex, i) => {
      plainLines.push(`  ${i + 1}. [${ex.kind.toUpperCase()}] ${ex.title} — ${ex.line}`);
    });
  }
  plainLines.push('── end ──');

  return {
    kind: 'aura.replayPackage.preSession',
    generatedAt: new Date().toISOString(),
    sessionReadiness: readiness.level,
    sessionReadinessNote: readiness.line,
    reviewPriority: contrib.discipline?.replayDisciplineTrend === 'slipping' ? 'high' : incompleteCount > 1 ? 'medium' : 'standard',
    todayFocus,
    topCautionPattern: topCaution,
    topModelLine,
    examplesToReview,
    replaySignalLine: signalLine,
    nextAction,
    doNotIgnore: contrib.behavior?.cautions?.[0] || null,
    plainText: plainLines.join('\n'),
  };
}

/** Caution-heavy pool: cautions first, then recent completed */
function cautionExamplesFirst(pool, patterns) {
  const cautions = pool.filter((s) => s.learningExample && s.learningExampleKind === 'caution');
  if (cautions.length) return cautions;
  return pool;
}

export function buildReplayWeeklyPackage(sessions = [], habitStats = null) {
  const normalized = sessions.map(normalizeReplay);
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const identity = buildReplayIdentitySummary(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const rolling = identity.rolling?.last7d || {};
  const today = ymdToday();
  const weekList = completedInRange(normalized, addDays(today, -6), today);
  const patterns = identity.patterns;
  const directional = buildReplayRollingDirectionalSignals(normalized);

  const completedCount = rolling.completedCount ?? weekList.length;
  const avgQ = rolling.avgReplayQuality;
  const avgRv = rolling.avgReviewCompleteness;

  let strongestLesson = '—';
  if (weekList.length) {
    const coachLines = weekList
      .map((s) => {
        const c = deriveCoaching(s);
        return c.mainLesson && c.mainLesson !== '—' ? c.mainLesson : '';
      })
      .filter(Boolean);
    if (coachLines.length) {
      const freq = {};
      coachLines.forEach((l) => {
        const k = trimT(l, 80);
        freq[k] = (freq[k] || 0) + 1;
      });
      strongestLesson = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  const repeatedCaution = patterns.recurringMistakeTheme
    ? `${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.level})`
    : 'No established repeat theme yet — keep tagging mistakes.';

  const echoWeek = echoRecurringInList(patterns.recurringMistakeTheme, weekList);
  const models = examplesForCopy(weekList.length ? weekList : filterCompletedSessions(normalized), 'model', 2, patterns);
  const cautionExamples = examplesForCopy(weekList.length ? weekList : filterCompletedSessions(normalized), 'caution', 2, patterns);

  const dev = trimT(identity.developmentFocus?.detail || identity.developmentGuidance?.topGrowthPriority?.practiceNext, 200);
  let improvement = 'Insufficient overlap for a 7d vs prior read.';
  const rv7 = directional.last7VsPrev7?.reviewCompleteness;
  const disc7 = directional.last7VsPrev7?.disciplineSelfScore;
  if (rv7 === 'improving' || disc7 === 'improving') improvement = 'Improving vs prior week (review or self-discipline).';
  else if (rv7 === 'slipping' || disc7 === 'slipping') improvement = 'Slipping vs prior week — prioritise closing reviews.';
  else if (rv7 === 'stable' && disc7 === 'stable') improvement = 'Stable week-over-week.';

  let priority = 'standard';
  if (directional.last7VsPrev7?.lateEntryTheme === 'slipping' || rv7 === 'slipping') priority = 'high';
  else if (completedCount === 0) priority = 'low';

  const plainLines = [
    '── Aura Trader Replay · weekly review (7d) ──',
    `Completed replays: ${completedCount}`,
    avgQ != null && avgRv != null ? `Avg Q ${avgQ} · Rv ${avgRv}% (window rollup)` : 'Averages — not enough data in window.',
    `Strongest lesson thread: ${strongestLesson}`,
    `Repeated caution theme: ${repeatedCaution}${echoWeek ? '' : ' (not clearly echoed this week)'}`,
    models[0] ? `Best model pick: ${models[0].title} — ${models[0].line}` : 'No model example in window — tag the next clean execution.',
    cautionExamples[0] ? `Caution to review: ${cautionExamples[0].title} — ${cautionExamples[0].line}` : '',
    `Development focus: ${dev}`,
    `7d movement: ${improvement}`,
    `Review priority: ${priority}`,
    '── end ──',
  ].filter(Boolean);

  return {
    kind: 'aura.replayPackage.weekly',
    generatedAt: new Date().toISOString(),
    completedCount,
    avgReplayQuality: avgQ,
    avgReviewCompleteness: avgRv,
    strongestLesson,
    repeatedCaution,
    echoedThisWeek: echoWeek,
    modelPicks: models,
    cautionPicks: cautionExamples,
    developmentFocus: dev,
    improvementSignal: improvement,
    reviewPriority: priority,
    plainText: plainLines.join('\n'),
  };
}

export function buildReplayMonthlyPackage(sessions = [], habitStats = null) {
  const normalized = sessions.map(normalizeReplay);
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const identity = buildReplayIdentitySummary(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const directional = buildReplayRollingDirectionalSignals(normalized);
  const rolling = identity.rolling?.last30d || {};
  const today = ymdToday();
  const monthList = completedInRange(normalized, addDays(today, -29), today);
  const patterns = identity.patterns;

  const discTrend = contrib.discipline?.replayDisciplineTrend || '—';
  const behStr = contrib.behavior?.strengths?.[0] || '—';
  const behRisk = contrib.behavior?.cautions?.[0] || patterns.recurringMistakeTheme?.label || '—';

  const modelN = patterns.modelExampleCount ?? 0;
  const cautionN = patterns.cautionExampleCount ?? 0;
  const dist = `Models ${modelN} · Cautions ${cautionN} (vault, all-time sample)`;

  let rvTrend = 'Not enough completed sessions for 30d compare.';
  const rv30 = directional.last30VsPrev30?.reviewCompleteness;
  if (rv30 === 'improving') rvTrend = 'Review completeness up vs prior 30 days.';
  else if (rv30 === 'slipping') rvTrend = 'Review completeness down vs prior 30 days.';
  else if (rv30 === 'stable') rvTrend = 'Review completeness stable vs prior 30 days.';

  const completedN = rolling.completedCount ?? monthList.length;
  const topModels = examplesForCopy(monthList.length ? monthList : filterCompletedSessions(normalized), 'model', 3, patterns);
  const topCautions = examplesForCopy(monthList.length ? monthList : filterCompletedSessions(normalized), 'caution', 3, patterns);

  const correction = contrib.developmentActions?.[0]
    || `Pressure-test: ${patterns.recurringMistakeTheme?.label || 'discipline themes in mistake text'}`;

  const plainLines = [
    '── Aura Trader Replay · monthly review (30d) ──',
    `Completed in ~30d window: ${completedN}`,
    `Discipline / behavior trend (replay indices): ${discTrend} · behavior note: ${trimT(contrib.scoreContributionExplanations?.[0], 180)}`,
    `Vault distribution: ${dist}`,
    `Repeated strength signal: ${trimT(behStr, 200)}`,
    `Recurring weakness / caution: ${trimT(behRisk, 200)}`,
    `Review completeness trend: ${rvTrend}`,
    topModels.length ? `Top models: ${topModels.map((m) => m.title).join('; ')}` : '',
    topCautions.length ? `Top cautions: ${topCautions.map((c) => c.title).join('; ')}` : '',
    `Correction focus: ${trimT(correction, 240)}`,
    '── end ──',
  ].filter(Boolean);

  return {
    kind: 'aura.replayPackage.monthly',
    generatedAt: new Date().toISOString(),
    completedApprox30d: completedN,
    disciplineTrendLabel: discTrend,
    contributionLine: contrib.scoreContributionExplanations?.[0] || null,
    vaultDistribution: dist,
    strengthSignal: behStr,
    weaknessSignal: behRisk,
    reviewCompletenessTrend: rvTrend,
    topModels,
    topCautions,
    correctionFocus: correction,
    plainText: plainLines.join('\n'),
  };
}

export function buildReplayMentorPrepPackage(sessions = [], habitStats = null) {
  const normalized = sessions.map(normalizeReplay);
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const identity = buildReplayIdentitySummary(normalized);
  const contrib = buildReplayContributionProfile(normalized, h);
  const patterns = identity.patterns;
  const completed = filterCompletedSessions(normalized);
  const focusSession = pickMentorFocusSession(normalized);
  let coachCtx = null;
  let exampleFrame = null;
  if (focusSession) {
    coachCtx = buildMentorCoachContext(focusSession, normalized);
    exampleFrame = getLearningExampleMentorFraming(focusSession);
  }

  const models = pickLearningExamples(completed, 'model', 2, patterns);
  const cautions = pickLearningExamples(completed, 'caution', 2, patterns);

  let recurrence = 'insufficient_evidence';
  let recurrenceLine = 'Need more completed replays to classify.';
  if (completed.length >= REPLAY_IDENTITY_MIN_WEAK && patterns.recurringMistakeTheme) {
    recurrence = patterns.recurringMistakeTheme.level === 'established' ? 'recurring' : 'emerging';
    recurrenceLine = `${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.count}×)`;
  } else if (completed.length > 0 && completed.length < REPLAY_IDENTITY_MIN_WEAK) {
    recurrence = 'early_sample';
    recurrenceLine = `${completed.length} completed — themes still forming.`;
  }

  const topIssue = coachCtx?.focusFirst
    || identity.developmentFocus?.detail
    || identity.developmentGuidance?.topGrowthPriority?.headline
    || 'Anchor the next review on the trader’s stated plan gap.';

  const priority = coachCtx?.reviewPriority || (contrib.discipline?.replayDisciplineTrend === 'slipping' ? 'high' : 'medium');

  const nextActions = [
    contrib.developmentActions?.[0],
    contrib.developmentActions?.[1],
    coachCtx?.nextAction ? `${coachCtx.nextAction.label} — ${trimT(coachCtx.nextAction.reason, 120)}` : null,
  ].filter(Boolean).slice(0, 3);

  const profileSignal = contrib.scoreContributionExplanations?.[0] || '—';

  const reinforcement = models[0]
    ? `${models[0].title}: ${sessionOneLiner(models[0])}`
    : 'No model example on file — coach a clean checklist repeat.';

  const corrective = cautions[0]
    ? `${cautions[0].title}: ${sessionOneLiner(cautions[0])}`
    : (patterns.recurringMistakeTheme
      ? `Work recurring theme: ${patterns.recurringMistakeTheme.label}`
      : 'No caution example — use the next loss review.');

  const plainLines = [
    '── Aura Trader Replay · mentor session prep ──',
    `Review priority: ${priority}`,
    `Coach this first: ${trimT(topIssue, 280)}`,
    `Pattern status: ${recurrence} — ${recurrenceLine}`,
    exampleFrame?.headline ? `Vault framing: ${exampleFrame.headline}` : '',
    exampleFrame?.mentorLine ? trimT(exampleFrame.mentorLine, 220) : '',
    `Strongest model to reinforce: ${trimT(reinforcement, 240)}`,
    `Caution to correct: ${trimT(corrective, 240)}`,
    `Replay profile signal: ${trimT(profileSignal, 220)}`,
    focusSession ? `Focus replay: ${focusSession.title || focusSession.id || '—'}` : '',
    'Next actions:',
    ...nextActions.map((a, i) => `  ${i + 1}. ${a}`),
    '── end ──',
  ].filter(Boolean);

  return {
    kind: 'aura.replayPackage.mentorPrep',
    generatedAt: new Date().toISOString(),
    reviewPriority: priority,
    topIssueFirst: topIssue,
    recurrence,
    recurrenceLine,
    strongestModel: reinforcement,
    cautionCorrect: corrective,
    nextActions,
    replayProfileSignal: profileSignal,
    focusSessionId: focusSession?.id || null,
    focusSessionTitle: focusSession?.title || null,
    plainText: plainLines.join('\n'),
  };
}

export function buildReplayPackageBundle(sessions = [], habitStats = null) {
  return {
    generatedAt: new Date().toISOString(),
    preSession: buildReplayPreSessionPackage(sessions, habitStats),
    weekly: buildReplayWeeklyPackage(sessions, habitStats),
    monthly: buildReplayMonthlyPackage(sessions, habitStats),
    mentorPrep: buildReplayMentorPrepPackage(sessions, habitStats),
  };
}

export function formatReplayPackageBundlePlain(sessions, habitStats) {
  const b = buildReplayPackageBundle(sessions, habitStats);
  return [
    b.preSession.plainText,
    '\n\n',
    b.weekly.plainText,
    '\n\n',
    b.monthly.plainText,
    '\n\n',
    b.mentorPrep.plainText,
  ].join('');
}
