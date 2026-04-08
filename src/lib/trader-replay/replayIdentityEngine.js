/**
 * Deterministic replay-derived identity signals, pattern aggregation, and CV-ready summaries.
 * Outputs are evidence-bounded: small samples and weak text never produce “certain” labels.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { deriveCoaching } from './replayCoachingEngine';
import { REPLAY_STATUSES } from './replayDefaults';

export const REPLAY_IDENTITY_MIN_WEAK = 3;
export const REPLAY_IDENTITY_MIN_STRONG = 6;

/** Established recurring theme: enough sessions and repeated bucket hits. */
const RECURRING_MIN_BUCKET_ESTABLISHED = 3;
const RECURRING_MIN_BUCKET_EMERGING = 2;

const TREND_DELTA_POINTS = 6;
const LIBRARY_DELTA_BASELINE = 10;
const LIBRARY_DELTA_DEEP = 8;

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Calendar day for analytics (prefer completion / update / replay date). */
export function sessionActivityDate(session) {
  const n = normalizeReplay(session);
  const raw = n.completedAt || n.updatedAt || n.replayDate || n.sourceDate;
  if (!raw) return null;
  const d = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function filterCompletedSessions(sessions = []) {
  return sessions
    .map((s) => normalizeReplay(s))
    .filter((s) => s.replayStatus === REPLAY_STATUSES.completed);
}

function chaseOrLateHeuristic(s) {
  const t = `${s.verdict || ''} ${s.insight || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return /chase|late|fomo|impulse|early|front[- ]?run|poor timing|too soon/i.test(t);
}

function earlyExitHeuristic(s) {
  const missed = parseR(s.missedR) ?? 0;
  const t = `${s.verdict || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return missed >= 0.35 || /premature|early exit|cut the runner|left r/i.test(t);
}

function emotionalTiltHeuristic(s) {
  const t = `${s.emotionalState || ''} ${s.verdict || ''}`.toLowerCase();
  return /tilt|revenge|fomo|bored|panic|rushed/i.test(t);
}

function riskDefined(s) {
  return Boolean(String(s.stop || s.stopLoss || '').trim() && String(s.target || s.takeProfit || '').trim());
}

const MISTAKE_BUCKET_RULES = [
  { id: 'late_entry', label: 'Late or chase entries', re: /late|chase|fomo|impulse|too soon|early|front.?run|timing/i },
  { id: 'exit_management', label: 'Exits and missed R', re: /exit|runner|partial|missed|left on|premature|stop/i },
  { id: 'risk_definition', label: 'Risk and size', re: /risk|size|stop|invalidat|lever/i },
  { id: 'discipline_emotion', label: 'Discipline and emotion', re: /discipline|rule|tilt|revenge|bored|emotion/i },
  { id: 'structure_read', label: 'Structure and context', re: /structure|bias|context|htf|read|setup/i },
];

/**
 * Map free text to a stable mistake bucket (first match wins).
 * @returns {string|null}
 */
export function bucketMistakeText(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const rule of MISTAKE_BUCKET_RULES) {
    if (rule.re.test(t)) return rule.id;
  }
  return 'other';
}

function mistakeSources(session, coaching) {
  const s = normalizeReplay(session);
  const c = coaching || deriveCoaching(s);
  return [s.reviewBiggestMistake, c.biggestMistake, s.whatIMissed, s.lessonSummary]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

function avgReflectionTextLength(completed) {
  if (!completed.length) return 0;
  let sum = 0;
  for (const s of completed) {
    const blob = [s.lessonSummary, s.insight, s.verdict, s.whatIMissed, s.improvementPlan]
      .map((x) => String(x || '').trim())
      .join(' ');
    sum += blob.length;
  }
  return sum / completed.length;
}

/**
 * @returns {'none'|'insufficient'|'limited'|'moderate'|'strong'}
 */
export function evidenceSignalStrength(completedCount, avgTextLen = 0) {
  if (completedCount <= 0) return 'none';
  if (completedCount < REPLAY_IDENTITY_MIN_WEAK) return 'insufficient';
  const textBoost = avgTextLen > 220 ? 1 : avgTextLen > 90 ? 0 : -1;
  const tier = completedCount + textBoost;
  if (tier < REPLAY_IDENTITY_MIN_WEAK) return 'insufficient';
  if (completedCount < REPLAY_IDENTITY_MIN_STRONG) return 'limited';
  if (completedCount < 12) return 'moderate';
  return 'strong';
}

function detectContradictions(avgQ, avgRv, n, avgTextLen) {
  if (n < REPLAY_IDENTITY_MIN_WEAK || avgQ == null || avgRv == null) {
    return { metricsStrongReflectionWeak: false, reflectionStrongMetricsSoft: false };
  }
  const thinText = avgTextLen < 70 && n >= REPLAY_IDENTITY_MIN_WEAK;
  return {
    metricsStrongReflectionWeak: avgQ >= 58 && avgRv < 40,
    reflectionStrongMetricsSoft: avgRv >= 60 && avgQ < 46,
    thinWrittenReflection: thinText,
  };
}

function mistakeLabel(id) {
  return MISTAKE_BUCKET_RULES.find((m) => m.id === id)?.label || 'Other themes';
}

/**
 * Recurring mistake surface only when bucket is not `other` and counts are stable.
 */
function mistakeThemeFromTop(mistakeTop, n) {
  if (!mistakeTop?.length) return null;
  const [id, count] = mistakeTop[0];
  if (!id || id === 'other') return null;
  const label = mistakeLabel(id);
  const established = n >= REPLAY_IDENTITY_MIN_STRONG && count >= RECURRING_MIN_BUCKET_ESTABLISHED;
  const emerging =
    n >= REPLAY_IDENTITY_MIN_WEAK
    && !established
    && count >= RECURRING_MIN_BUCKET_EMERGING;
  if (!established && !emerging) return null;
  return {
    bucket: id,
    label,
    count,
    level: established ? 'established' : 'emerging',
  };
}

/**
 * Per-session grounded signals (0–1 scalars where applicable).
 * @returns {object}
 */
export function extractReplayIdentitySignals(session) {
  const s = normalizeReplay(session);
  const coaching = deriveCoaching(s);
  const rq = computeReplayQualityScore(s).score / 100;
  const cq = computeReviewCompletenessScore(s).score / 100;
  const e = Number(s.entryTiming) || 0;
  const d = Number(s.discipline) || 0;
  const p = Number(s.patience) || 0;
  const stack = (e + d + p) / 30;

  const missed = parseR(s.missedR) ?? 0;
  const chase = chaseOrLateHeuristic(s);

  const entryNorm = clamp01(e / 10);
  let lateEntryTendency = 1 - entryNorm;
  if (chase) lateEntryTendency = Math.min(1, lateEntryTendency + 0.12);
  lateEntryTendency = clamp01(lateEntryTendency * 0.92 + (e <= 3 ? 0.06 : 0));

  const earlyExitTendency = earlyExitHeuristic(s)
    ? clamp01(0.38 + missed * 0.55)
    : clamp01(missed * 0.45);

  return {
    sessionId: s.id || null,
    completed: s.replayStatus === REPLAY_STATUSES.completed,
    executionDiscipline: stack,
    patience: p / 10,
    lateEntryTendency,
    earlyExitTendency,
    riskDefinitionQuality: riskDefined(s) ? 1 : 0,
    managementConsistency: stack,
    emotionalControl: emotionalTiltHeuristic(s) ? 0.35 : clamp01(0.72 + Math.min(0.22, d / 45)),
    missedOpportunityTendency: clamp01(missed / 1.45),
    structureReadingStrength: clamp01(
      (String(s.biasAtTime || '').length > 2 ? 0.22 : 0)
        + (String(s.insight || '').length > 40 ? 0.42 : 0.08)
        + cq * 0.34,
    ),
    reviewThoroughness: cq,
    learningFollowThrough: s.learningExample ? 1 : 0,
    learningModel: s.learningExample && s.learningExampleKind === 'model' ? 1 : 0,
    learningCaution: s.learningExample && s.learningExampleKind === 'caution' ? 1 : 0,
    scenarioType: s.scenarioType || '',
    mistakeBuckets: mistakeSources(s, coaching).map(bucketMistakeText).filter(Boolean),
    replayQualityScore: rq,
    reviewCompletenessScore: cq,
  };
}

function normalizeLessonKey(text) {
  const t = String(text || '').trim();
  if (!t || t === '—') return '';
  return t.slice(0, 72).replace(/\s+/g, ' ');
}

function topBucketCounts(sessions, pickMistake) {
  const counts = {};
  for (const s of sessions) {
    const coaching = deriveCoaching(s);
    const keys = pickMistake
      ? mistakeSources(s, coaching).map(bucketMistakeText).filter(Boolean)
      : [coaching.mainLesson].filter((x) => x && x !== '—');
    const seen = new Set(keys);
    seen.forEach((k) => {
      counts[k] = (counts[k] || 0) + 1;
    });
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function symbolAggregates(completed) {
  const by = {};
  for (const s of completed) {
    const sym = (s.asset || s.symbol || '').trim();
    if (!sym) continue;
    if (!by[sym]) by[sym] = { n: 0, exec: 0, rev: 0 };
    by[sym].n += 1;
    by[sym].exec += computeReplayQualityScore(s).score;
    by[sym].rev += computeReviewCompletenessScore(s).score;
  }
  return Object.entries(by)
    .map(([symbol, v]) => ({
      symbol,
      count: v.n,
      avgReplayQuality: v.n ? Math.round(v.exec / v.n) : 0,
      avgReviewCompleteness: v.n ? Math.round(v.rev / v.n) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function scenarioAggregates(completed) {
  const by = {};
  for (const s of completed) {
    const st = String(s.scenarioType || '').trim();
    if (!st) continue;
    by[st] = (by[st] || 0) + 1;
  }
  return Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([scenarioType, count]) => ({ scenarioType, count }));
}

/**
 * Aggregate patterns with evidence counts (completed sessions only).
 * @returns {object}
 */
export function aggregateReplayPatterns(sessions = []) {
  const completed = filterCompletedSessions(sessions);
  const n = completed.length;
  const mistakeTop = topBucketCounts(completed, true);
  const lessonCounts = {};
  for (const s of completed) {
    const k = normalizeLessonKey(deriveCoaching(s).mainLesson || s.lessonSummary);
    if (!k) continue;
    lessonCounts[k] = (lessonCounts[k] || 0) + 1;
  }
  const recurringLessons = Object.entries(lessonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([text, count]) => ({ text, count }));

  let strongestRepeatable = null;
  let weakestExecution = null;
  if (n >= REPLAY_IDENTITY_MIN_WEAK) {
    const avgDisc = completed.reduce((a, s) => a + (Number(s.discipline) || 0), 0) / n;
    const avgEntry = completed.reduce((a, s) => a + (Number(s.entryTiming) || 0), 0) / n;
    if (avgDisc >= 6.5) {
      strongestRepeatable = {
        label: 'Discipline stack',
        detail: `Self-rated discipline averages ${avgDisc.toFixed(1)}/10 across ${n} completed reviews.`,
        evidence: n,
      };
    }
    if (avgEntry <= 5.5) {
      weakestExecution = {
        label: 'Entry timing',
        detail: `Self-rated entry timing averages ${avgEntry.toFixed(1)}/10 across ${n} completed reviews.`,
        evidence: n,
      };
    }
  }

  const models = completed.filter((s) => s.learningExample && s.learningExampleKind === 'model').length;
  const cautions = completed.filter((s) => s.learningExample && s.learningExampleKind === 'caution').length;

  const recurringMistakeTheme = mistakeThemeFromTop(mistakeTop, n);

  return {
    completedCount: n,
    recurringMistakeTheme,
    recurringStrengthTheme: strongestRepeatable,
    weakestExecutionCategory: weakestExecution,
    recurringLessons,
    modelExampleCount: models,
    cautionExampleCount: cautions,
    symbolStats: n >= REPLAY_IDENTITY_MIN_WEAK ? symbolAggregates(completed).slice(0, 8) : [],
    scenarioStats: scenarioAggregates(completed),
    mistakeHistogram: mistakeTop.map(([id, count]) => ({ bucket: id, label: mistakeLabel(id), count })),
  };
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function summarizeWindow(completedInWindow) {
  const list = completedInWindow.map((s) => normalizeReplay(s));
  if (!list.length) {
    return {
      completedCount: 0,
      avgReplayQuality: null,
      avgReviewCompleteness: null,
      learningExamples: 0,
      modelCount: 0,
      cautionCount: 0,
      incompleteReviewsRemaining: null,
      topMistakeTheme: null,
    };
  }
  const execs = list.map((s) => computeReplayQualityScore(s).score);
  const revs = list.map((s) => computeReviewCompletenessScore(s).score);
  const mistakeTop = topBucketCounts(list, true);
  return {
    completedCount: list.length,
    avgReplayQuality: Math.round(mean(execs)),
    avgReviewCompleteness: Math.round(mean(revs)),
    learningExamples: list.filter((s) => s.learningExample).length,
    modelCount: list.filter((s) => s.learningExample && s.learningExampleKind === 'model').length,
    cautionCount: list.filter((s) => s.learningExample && s.learningExampleKind === 'caution').length,
    incompleteReviewsRemaining: null,
    topMistakeTheme: mistakeThemeFromTop(mistakeTop, list.length),
  };
}

function addDays(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function ymdTodayUtc() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthBounds(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { first, last };
}

/**
 * Rolling and calendar windows over completed replays.
 * @returns {Record<string, object>}
 */
export function buildRollingReplaySummaries(sessions = []) {
  const completed = filterCompletedSessions(sessions).filter((s) => sessionActivityDate(s));
  const today = ymdTodayUtc();

  const inRange = (s, from, to) => {
    const day = sessionActivityDate(s);
    return day && day >= from && day <= to;
  };

  const last7From = addDays(today, -6);
  const last30From = addDays(today, -29);

  const { first: curMonthFirst, last: curMonthLast } = monthBounds(today);
  const prevMonthRef = addDays(curMonthFirst, -1);
  const { first: prevMonthFirst, last: prevMonthLast } = monthBounds(prevMonthRef);

  const draftOrLive = sessions
    .map((s) => normalizeReplay(s))
    .filter((s) => s.replayStatus !== REPLAY_STATUSES.completed);

  const windows = {
    last7d: summarizeWindow(completed.filter((s) => inRange(s, last7From, today))),
    last30d: summarizeWindow(completed.filter((s) => inRange(s, last30From, today))),
    calendarMonth: summarizeWindow(completed.filter((s) => inRange(s, curMonthFirst, curMonthLast))),
    previousMonth: summarizeWindow(completed.filter((s) => inRange(s, prevMonthFirst, prevMonthLast))),
    allTime: summarizeWindow(completed),
  };

  windows.last7d.incompleteReviewsRemaining = draftOrLive.length;
  windows.last30d.incompleteReviewsRemaining = draftOrLive.length;
  windows.calendarMonth.incompleteReviewsRemaining = draftOrLive.length;
  windows.previousMonth.incompleteReviewsRemaining = null;
  windows.allTime.incompleteReviewsRemaining = draftOrLive.length;

  return windows;
}

function primaryDriversFromPatterns(patterns, avgQ, avgRv) {
  const drivers = [];
  if (patterns.recurringMistakeTheme) {
    drivers.push(`Repeated theme: ${patterns.recurringMistakeTheme.label}`);
  } else if (patterns.mistakeHistogram?.[0] && patterns.completedCount >= REPLAY_IDENTITY_MIN_WEAK) {
    drivers.push(`Most common bucket: ${patterns.mistakeHistogram[0].label}`);
  }
  if (avgRv != null && avgRv < 44) drivers.push('Review fields are often thin relative to execution scores.');
  if (avgQ != null && avgQ < 46) drivers.push('Structured execution reads are below mid-range on average.');
  if (patterns.modelExampleCount + patterns.cautionExampleCount > 0) {
    drivers.push('Learning examples are tagging repeatable model vs caution behaviour.');
  }
  return drivers.slice(0, 4);
}

function pickDevelopmentFocus(patterns, avgQ, avgRv, n, contradictions, signalStrength, avgTextLen) {
  if (n === 0) {
    return {
      focusKey: 'establish_baseline',
      label: 'Establish baseline',
      detail: 'Finish at least one completed replay review to anchor identity signals.',
      evidence: 0,
      rationale: 'No completed replays yet.',
    };
  }
  if (n < REPLAY_IDENTITY_MIN_WEAK) {
    return {
      focusKey: 'build_sample',
      label: 'Build sample',
      detail: `With ${n} completed ${n === 1 ? 'review' : 'reviews'}, themes stay provisional until ${REPLAY_IDENTITY_MIN_WEAK}+ are logged.`,
      evidence: n,
      rationale: 'Insufficient completed sessions for stable aggregate themes.',
    };
  }

  if (contradictions.thinWrittenReflection && avgQ != null && avgQ >= 52) {
    return {
      focusKey: 'deepen_reflection',
      label: 'Deepen reflection',
      detail: 'Scores look workable, but written lessons and mistakes are thin — expand the narrative fields.',
      evidence: n,
      rationale: 'Short reflection text vs structured execution scores.',
    };
  }

  if (contradictions.metricsStrongReflectionWeak) {
    return {
      focusKey: 'align_writeup_execution',
      label: 'Align write-up with execution',
      detail: 'Execution reads are solid, but review depth is trailing — complete verdict, lesson, and gap fields more fully.',
      evidence: n,
      rationale: 'Average replay quality above review completeness.',
    };
  }

  if (contradictions.reflectionStrongMetricsSoft) {
    return {
      focusKey: 'tighten_execution_inputs',
      label: 'Tighten execution inputs',
      detail: 'Written reviews are rich, but scored execution reads are soft — check timing, risk, and discipline sliders honestly.',
      evidence: n,
      rationale: 'Review completeness higher than replay quality score.',
    };
  }

  if (patterns.recurringMistakeTheme?.level === 'established') {
    return {
      focusKey: 'pressure_test_theme',
      label: 'Pressure-test the theme',
      detail: `${patterns.recurringMistakeTheme.label} recurs across ${patterns.recurringMistakeTheme.count} reviews — treat it as a primary drill until it fades.`,
      evidence: patterns.recurringMistakeTheme.count,
      rationale: 'Repeated keyword bucket across mistake fields with enough sessions.',
    };
  }

  if (patterns.recurringMistakeTheme?.level === 'emerging') {
    return {
      focusKey: 'watch_emerging_theme',
      label: 'Watch an emerging theme',
      detail: `${patterns.recurringMistakeTheme.label} is surfacing — keep tagging mistakes so it can confirm or clear.`,
      evidence: patterns.recurringMistakeTheme.count,
      rationale: 'Early recurrence; needs more reviews to harden.',
    };
  }

  if (avgRv != null && avgRv < 44 && signalStrength !== 'strong') {
    return {
      focusKey: 'strengthen_review_depth',
      label: 'Strengthen review depth',
      detail: 'Average review completeness is modest — finish reflection fields before chasing new setups.',
      evidence: n,
      rationale: 'Mean review completeness below mid-line.',
    };
  }

  if (avgQ != null && avgQ < 46) {
    return {
      focusKey: 'raise_execution_clarity',
      label: 'Raise execution clarity',
      detail: 'Replay quality reads low on average — tighten risk, timing, and discipline inputs on each review.',
      evidence: n,
      rationale: 'Mean replay quality below mid-line.',
    };
  }

  return {
    focusKey: 'stay_consistent',
    label: 'Stay consistent',
    detail: 'Signals look balanced — keep logging lessons, tagging examples, and closing incomplete reviews.',
    evidence: n,
    rationale: 'No dominant conflict or recurring bucket at current evidence strength.',
  };
}

function guidanceModeFromEvidence(n, signalStrength) {
  if (n < REPLAY_IDENTITY_MIN_WEAK || signalStrength === 'none' || signalStrength === 'insufficient') {
    return 'gather_evidence';
  }
  if (signalStrength === 'limited' || n < REPLAY_IDENTITY_MIN_STRONG) return 'provisional';
  return 'grounded';
}

function applyTonePrefix(mode, parts) {
  if (mode !== 'provisional') return parts;
  const [why, ...rest] = parts;
  return [why ? `Provisional read — ${why}` : why, ...rest];
}

function expandPrimaryGuidance(focusKey, ctx) {
  const { patterns, n, reviewDisciplineTrend } = ctx;
  const theme = patterns.recurringMistakeTheme;

  const byKey = {
    establish_baseline: {
      whyItMatters: 'Completed replays with filled review fields are what feed your identity and CV signals.',
      costIfIgnored: 'You cannot rank mistakes or execution gaps from unfinished reviews.',
      whenCorrected: 'A single closed loop sets replay Q, review depth, and text baselines for everything after.',
      practiceNext: 'Finish the next replay through mistake, lesson, verdict, and one improvement line.',
      stopDoing: 'Closing the replay while skipping the written review block.',
      reviewInFutureReplays: ['Did I step every marker before marking complete?', 'Is the mistake written as a behaviour, not a mood?'],
    },
    build_sample: {
      whyItMatters: `Themes and risk calls need at least ${REPLAY_IDENTITY_MIN_WEAK} completed reviews before they stop being noise.`,
      costIfIgnored: 'Early reads flip whenever one outlier review swings averages.',
      whenCorrected: `At ${REPLAY_IDENTITY_MIN_WEAK}+ completions, recurrence rules and trend checks start to bite.`,
      practiceNext: 'Close the next replay with explicit miss and lesson text — keep phrasing consistent when the error class repeats.',
      stopDoing: 'Treating one or two replays as a full identity read.',
      reviewInFutureReplays: ['Does this mistake bucket match the last review’s bucket?', 'Did I log risk (stop/target) on every completion?'],
    },
    deepen_reflection: {
      whyItMatters: 'Execution sliders without narrative miss triggers, context, and the “why” behind the numbers.',
      costIfIgnored: 'Strong-looking scores can mask repeat process errors that only show up in language.',
      whenCorrected: 'Matching text to scores lets the system separate skill from self-report drift.',
      practiceNext: 'On the next replay, write a two-sentence mistake chain: setup → trigger → break.',
      stopDoing: 'One-line mistakes that never reference timing, invalidation, or size.',
      reviewInFutureReplays: ['Does the written mistake explain what you would do differently on the next identical setup?', 'Did verdict reference plan vs actual?'],
    },
    align_writeup_execution: {
      whyItMatters: 'When replay Q outruns review depth, your archive understates what actually broke.',
      costIfIgnored: 'You lose searchable lessons and inflate confidence in execution that is not fully explained.',
      whenCorrected: 'Aligned write-ups make backtests of your behaviour possible across time.',
      practiceNext: 'Fill verdict, gap fields, and lesson before filing complete — match words to the scored timing/risk stack.',
      stopDoing: 'Submitting complete with half-empty review grids while metrics look polished.',
      reviewInFutureReplays: ['If replay Q is above your average, did the text explain why?', 'Which field is still empty, and why?'],
    },
    tighten_execution_inputs: {
      whyItMatters: 'Rich text with soft execution scores suggests the sliders are not yet an honest instrument.',
      costIfIgnored: 'Aggregates understate real friction in timing, size, or patience.',
      whenCorrected: 'Honest sliders plus good text produce stable identity signals.',
      practiceNext: 'Re-score entry timing, discipline, and patience against the chart you just replayed — adjust before save.',
      stopDoing: 'Narrating a tough trade while leaving timing discipline near defaults.',
      reviewInFutureReplays: ['Do the sliders match the story in the mistake field?', 'Did risk parameters match what you actually tolerated live?'],
    },
    pressure_test_theme: {
      whyItMatters: `Repeated "${theme?.label || 'this'}" mentions across reviews mean the log, not imagination, is flagging a process issue.`,
      costIfIgnored: 'The same error class keeps diluting edge even when singles look acceptable.',
      whenCorrected: 'Focused drills on that class show up as fewer hits in the same bucket over time.',
      practiceNext: `Next replay: state the invalidation that would void the entry before you click — tie it to ${theme?.label || 'this theme'}.`,
      stopDoing: `Generic mistake notes that never tie back to ${theme?.label || 'the recurring class'}.`,
      reviewInFutureReplays: [`Did this replay hit the same "${theme?.label || 'theme'}" bucket again?`, 'What rule would have filtered this entry?'],
    },
    watch_emerging_theme: {
      whyItMatters: `Early repetition of "${theme?.label || 'this theme'}" deserves tags now before it hardens into habit.`,
      costIfIgnored: 'Waiting lets the pattern establish with more capital at stake.',
      whenCorrected: 'Either the bucket fades with honest fixes, or it promotes with evidence you can drill.',
      practiceNext: 'Tag mistakes with the same vocabulary when the behaviour matches — avoid “other”.',
      stopDoing: 'Rewriting mistakes in unrelated wording that never hits the same bucket.',
      reviewInFutureReplays: ['Is this the same failure mode as last time, phrased differently?', 'Would a checklist item have blocked it?'],
    },
    strengthen_review_depth: {
      whyItMatters: 'Low average review completeness caps how much your archive can teach you later.',
      costIfIgnored: 'You will not be able to trust “why” behind trades when notes are empty.',
      whenCorrected: 'Higher completion stabilizes coaching outputs across weeks.',
      practiceNext: 'Before complete, verify lesson, verdict, gap, and emotional label fields are non-empty.',
      stopDoing: 'Racing to complete without capturing what you felt and what broke.',
      reviewInFutureReplays: ['Which required field was hardest — and why?', 'Does review % move closer to your last replay?'],
    },
    raise_execution_clarity: {
      whyItMatters: 'Low replay Q usually means risk, timing, or discipline signals are thin or inconsistent.',
      costIfIgnored: 'Identity will read “noisy execution” even when narrative sounds confident.',
      whenCorrected: 'Cleaner inputs raise both Q and the usefulness of cross-replay comparison.',
      practiceNext: 'Define stop/target on every replay, then score timing after walking markers.',
      stopDoing: 'Leaving risk undefined then debating outcomes in prose only.',
      reviewInFutureReplays: ['Were stops/targets explicit on file before results?', 'Do timing scores line up with chase/late language?'],
    },
    stay_consistent: {
      whyItMatters: 'Balanced signals mean your next edge comes from repetition and honest logging, not a new toggle.',
      costIfIgnored: 'Inconsistent cadence hides slow drift until a streak of bad outcomes.',
      whenCorrected: 'Rhythm keeps rolling windows sensitive enough to catch drift early.',
      practiceNext: 'Keep tagging learning examples (model vs caution) whenever behaviour repeats.',
      stopDoing: 'Skipping examples on repeat behaviours — they anchor future library hints.',
      reviewInFutureReplays: ['Did today’s replay add anything new versus your rolling average?', 'Any draft replays to clear?'],
    },
  };

  const row = byKey[focusKey] || byKey.stay_consistent;
  const mode = ctx.guidanceMode;
  const [whyItMatters, costIfIgnored, whenCorrected, practiceNext, stopDoing] = applyTonePrefix(mode, [
    row.whyItMatters,
    row.costIfIgnored,
    row.whenCorrected,
    row.practiceNext,
    row.stopDoing,
  ]);
  let checks = [...row.reviewInFutureReplays];
  if (reviewDisciplineTrend === 'needs_attention' && focusKey !== 'strengthen_review_depth') {
    checks = [`Review depth dipped versus your prior window — add: ${checks[0] || 'one extra sentence on what broke.'}`];
  }
  return {
    focusKey,
    headline: ctx.developmentFocus.label,
    detail: ctx.developmentFocus.detail,
    whyItMatters,
    costIfIgnored,
    whenCorrected,
    practiceNext,
    stopDoing,
    reviewInFutureReplays: checks.slice(0, 3),
    evidenceWeight: ctx.developmentFocus.evidence ?? n,
  };
}

function buildSecondaryFocusAreas(primaryKey, ctx) {
  const { patterns, avgQ, reviewDisciplineTrend, signalStrength, n } = ctx;
  const theme = patterns.recurringMistakeTheme;
  const weakEx = patterns.weakestExecutionCategory;
  const candidates = [];

  const push = (id, rank, headline, practiceNext, stopDoing, kind) => {
    candidates.push({ id, rank, headline, practiceNext, stopDoing, kind: kind || 'weakness' });
  };

  if (
    theme
    && primaryKey !== 'pressure_test_theme'
    && primaryKey !== 'watch_emerging_theme'
  ) {
    push(
      'recurring_theme',
      2,
      theme.level === 'established' ? `Revisit ${theme.label}` : `Monitor ${theme.label}`,
      `Use one consistent phrase in the mistake field when ${theme.label} appears.`,
      'Renaming the same error with unrelated keywords each time.',
      'weakness',
    );
  }

  if (weakEx && primaryKey !== 'raise_execution_clarity') {
    push(
      'weak_exec_category',
      3,
      weakEx.label,
      `Next replay: score ${weakEx.label.toLowerCase()} against the tape, then explain the delta in one line.`,
      'Ignoring weak averages on the self-rating stack when text says the opposite.',
      'weakness',
    );
  }

  if (reviewDisciplineTrend === 'needs_attention' && primaryKey !== 'strengthen_review_depth') {
    push(
      'review_slip',
      4,
      'Review depth vs prior window',
      'Restore completeness on the next replay before adding new scenarios.',
      'Closing faster with thinner fields when schedules tighten.',
      'process',
    );
  }

  if (avgQ != null && avgQ < 48 && primaryKey !== 'raise_execution_clarity') {
    push(
      'soft_execution_signal',
      5,
      'Execution signal clarity',
      'Align stop/target and timing scores with what the chart shows before filing complete.',
      'Narrating outcomes without updating execution inputs.',
      'weakness',
    );
  }

  candidates.sort((a, b) => a.rank - b.rank);
  const seen = new Set([primaryKey]);
  const out = [];
  for (const c of candidates) {
    if (out.length >= 2) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (signalStrength === 'insufficient' && c.id !== 'recurring_theme') continue;
    out.push({
      rank: out.length + 2,
      headline: c.headline,
      whyItMatters:
        c.id === 'recurring_theme'
          ? 'Multiple reviews point to the same bucket — secondary drill until counts fall.'
          : c.id === 'weak_exec_category'
            ? weakEx?.detail || 'Averages show friction in this execution category.'
            : c.id === 'review_slip'
              ? 'Rolling review completeness trails your earlier window.'
              : 'Replay Q is below a clean mid-line — inputs may be soft or incomplete.',
      practiceNext: c.practiceNext,
      stopDoing: c.stopDoing,
      kind: c.kind,
    });
  }
  return out;
}

function buildStrengthsLayer(ctx) {
  const { patterns, avgQ, avgRv, reviewDisciplineTrend, n, signalStrength } = ctx;
  const out = [];
  if (patterns.recurringStrengthTheme) {
    out.push({
      headline: patterns.recurringStrengthTheme.label,
      maintain: `Keep logging discipline the same way — ${patterns.recurringStrengthTheme.detail}`,
      evidenceLine: patterns.recurringStrengthTheme.detail,
      kind: 'strength',
    });
  }
  if (avgRv != null && avgRv >= 52 && n >= REPLAY_IDENTITY_MIN_WEAK && signalStrength !== 'insufficient') {
    out.push({
      headline: 'Review throughput',
      maintain: `Average review completeness at ${avgRv}% supports detailed coaching downstream.`,
      evidenceLine: 'Mean review completeness across completed replays.',
      kind: 'strength',
    });
  }
  if (reviewDisciplineTrend === 'improving' && n >= REPLAY_IDENTITY_MIN_WEAK) {
    out.push({
      headline: 'Review momentum',
      maintain: 'Recent completeness is up versus your earlier three-week window — keep the cadence.',
      evidenceLine: 'Rolling window compare on review scores.',
      kind: 'strength',
    });
  }
  if (avgQ != null && avgQ >= 58 && n >= REPLAY_IDENTITY_MIN_WEAK) {
    out.push({
      headline: 'Execution read',
      maintain: 'Replay quality averages strong — protect it with honest mistakes when trades go wrong.',
      evidenceLine: 'Mean replay quality across completed replays.',
      kind: 'strength',
    });
  }
  const uniq = [];
  const seen = new Set();
  for (const s of out) {
    if (seen.has(s.headline)) continue;
    seen.add(s.headline);
    uniq.push(s);
    if (uniq.length >= 2) break;
  }
  return uniq;
}

function buildCoachingBundle(primary, secondaries, strengths, mode) {
  const doingWell = strengths.map((s) => `${s.headline}: ${s.maintain}`);
  let limiting = null;
  if (primary.focusKey === 'pressure_test_theme' || primary.focusKey === 'watch_emerging_theme') {
    limiting = primary.detail;
  } else if (secondaries[0]?.headline) {
    limiting = secondaries[0].headline;
  } else {
    limiting = primary.detail;
  }

  const futureReplayChecks = [
    ...primary.reviewInFutureReplays,
    ...secondaries.flatMap((s) => (s.practiceNext ? [s.practiceNext] : [])),
  ].slice(0, 4);

  if (mode === 'gather_evidence') {
    return {
      doingWell: doingWell.slice(0, 1),
      repeatedlyLimiting: 'Not enough completed replays to separate pattern from noise yet.',
      practiceNext: primary.practiceNext,
      stopDoing: primary.stopDoing,
      futureReplayChecks: primary.reviewInFutureReplays.slice(0, 2),
    };
  }

  return {
    doingWell,
    repeatedlyLimiting: limiting,
    practiceNext: primary.practiceNext,
    stopDoing: primary.stopDoing,
    futureReplayChecks,
  };
}

/**
 * Ranked, evidence-bounded development guidance (deterministic).
 */
export function buildDevelopmentGuidanceBlock(input) {
  const {
    developmentFocus,
    patterns,
    contradictions,
    signalStrength,
    n,
    avgQ,
    avgRv,
    reviewDisciplineTrend,
  } = input;

  const guidanceMode = guidanceModeFromEvidence(n, signalStrength);
  const focusKey = developmentFocus.focusKey || 'stay_consistent';
  const ctx = {
    developmentFocus,
    patterns,
    contradictions,
    signalStrength,
    n,
    avgQ,
    avgRv,
    reviewDisciplineTrend,
    guidanceMode,
  };

  const topGrowthPriority = expandPrimaryGuidance(focusKey, ctx);
  const focusAreas =
    guidanceMode === 'gather_evidence'
      ? []
      : buildSecondaryFocusAreas(focusKey, ctx);
  const strengths = buildStrengthsLayer(ctx);
  const coaching = buildCoachingBundle(topGrowthPriority, focusAreas, strengths, guidanceMode);

  const insufficientEvidence =
    guidanceMode === 'gather_evidence'
      ? n < REPLAY_IDENTITY_MIN_WEAK
        ? 'Gather more completed replays before prioritising behavioural fixes.'
        : 'Average reflection depth is thin — add text evidence before leaning on themes.'
      : null;

  return {
    guidanceMode,
    insufficientEvidenceMessage: insufficientEvidence,
    topGrowthPriority,
    focusAreas,
    strengths,
    coaching,
  };
}

/**
 * Full identity summary for hub / workspace.
 */
export function buildReplayIdentitySummary(sessions = []) {
  const completed = filterCompletedSessions(sessions);
  const patterns = aggregateReplayPatterns(sessions);
  const rolling = buildRollingReplaySummaries(sessions);
  const n = completed.length;
  const avgTextLen = avgReflectionTextLength(completed);

  const execs = completed.map((s) => computeReplayQualityScore(s).score);
  const revs = completed.map((s) => computeReviewCompletenessScore(s).score);
  const avgQ = n ? Math.round(mean(execs)) : null;
  const avgRv = n ? Math.round(mean(revs)) : null;

  let confidence = 'low';
  if (n >= REPLAY_IDENTITY_MIN_STRONG) confidence = 'high';
  else if (n >= REPLAY_IDENTITY_MIN_WEAK) confidence = 'medium';

  const signalStrength = evidenceSignalStrength(n, avgTextLen);
  const contradictions = detectContradictions(avgQ, avgRv, n, avgTextLen);

  let reviewDisciplineTrend = 'stable';
  const last7 = rolling.last7d.completedCount ? rolling.last7d.avgReviewCompleteness : null;
  const prev23avg = completed.filter((s) => {
    const day = sessionActivityDate(s);
    return day && day >= addDays(ymdTodayUtc(), -29) && day <= addDays(ymdTodayUtc(), -7);
  });
  if (prev23avg.length >= 3 && last7 != null) {
    const olderAvg = mean(prev23avg.map((s) => computeReviewCompletenessScore(s).score));
    if (last7 > olderAvg + TREND_DELTA_POINTS) reviewDisciplineTrend = 'improving';
    else if (last7 < olderAvg - TREND_DELTA_POINTS) reviewDisciplineTrend = 'needs_attention';
  }

  const uncertaintyNotes = [];
  if (n < REPLAY_IDENTITY_MIN_WEAK) uncertaintyNotes.push('Identity themes need more completed replays before they are reliable.');
  if (signalStrength === 'insufficient' || signalStrength === 'limited') {
    uncertaintyNotes.push('Interpretation is conservative until the sample grows.');
  }
  if (contradictions.thinWrittenReflection) {
    uncertaintyNotes.push('Written reflections are short relative to scored fields — nuance may be missing.');
  }

  const developmentFocus = pickDevelopmentFocus(patterns, avgQ, avgRv, n, contradictions, signalStrength, avgTextLen);
  const drivers = primaryDriversFromPatterns(patterns, avgQ, avgRv);
  const developmentGuidance = buildDevelopmentGuidanceBlock({
    developmentFocus,
    patterns,
    contradictions,
    signalStrength,
    n,
    avgQ,
    avgRv,
    reviewDisciplineTrend,
  });

  return {
    generatedAt: new Date().toISOString(),
    evidence: {
      completedCount: n,
      totalSessions: sessions.length,
      minSessionsForPatterns: REPLAY_IDENTITY_MIN_WEAK,
      confidence,
      signalStrength,
      avgReflectionTextLength: Math.round(avgTextLen),
      contradictionFlags: contradictions,
      uncertaintyNotes,
    },
    explainability: {
      primaryDrivers: drivers,
      uncertaintyReasons: uncertaintyNotes,
      usedFields: [
        'Replay quality score',
        'Review completeness score',
        'Self-rated discipline, patience, entry timing',
        'Mistake and lesson text (keyword buckets)',
        'Learning example flags',
      ],
    },
    averages: {
      replayQuality: avgQ,
      reviewCompleteness: avgRv,
    },
    patterns,
    rolling,
    reviewDisciplineTrend,
    developmentFocus,
    developmentGuidance,
  };
}

/**
 * Compact CV / scorecard-oriented payload (portable).
 */
function confidenceLineFromSignal(signalStrength, n) {
  if (n === 0) return null;
  if (signalStrength === 'strong') return 'Evidence confidence: high (sample + depth).';
  if (signalStrength === 'moderate') return 'Evidence confidence: moderate — useful, still accumulating.';
  if (signalStrength === 'limited') return 'Evidence confidence: limited — prioritize more closes.';
  if (signalStrength === 'insufficient' || signalStrength === 'none') {
    return 'Evidence confidence: low — needs more completed replays or richer notes.';
  }
  return 'Evidence confidence: directional only.';
}

function buildCvDevelopmentProfile(patterns, averages, evidence, developmentGuidance) {
  const n = evidence.completedCount;
  const strongestTrait = patterns.recurringStrengthTheme
    ? {
        label: patterns.recurringStrengthTheme.label,
        line: patterns.recurringStrengthTheme.detail,
      }
    : averages.replayQuality != null && averages.replayQuality >= 58 && n >= REPLAY_IDENTITY_MIN_WEAK
      ? {
          label: 'Execution read',
          line: `Replay quality averages ${averages.replayQuality} across completed reviews — keep losses as honest as wins.`,
        }
      : averages.reviewCompleteness != null && averages.reviewCompleteness >= 55 && n >= REPLAY_IDENTITY_MIN_WEAK
        ? {
            label: 'Review depth',
            line: `Review completeness averages ${averages.reviewCompleteness}% — your archive carries usable detail.`,
          }
        : null;

  const highestRiskTrait = patterns.recurringMistakeTheme
    ? {
        label: patterns.recurringMistakeTheme.label,
        line:
          patterns.recurringMistakeTheme.level === 'established'
            ? `Established in mistake text (${patterns.recurringMistakeTheme.count}×) — primary drill until counts fall.`
            : `Emerging in mistake text (${patterns.recurringMistakeTheme.count}×) — confirm or clear with consistent tags.`,
      }
    : patterns.weakestExecutionCategory && n >= REPLAY_IDENTITY_MIN_WEAK
      ? {
          label: patterns.weakestExecutionCategory.label,
          line: patterns.weakestExecutionCategory.detail,
        }
      : null;

  return {
    strongestTrait,
    highestRiskTrait,
    developmentPriority: developmentGuidance.topGrowthPriority.headline,
    developmentPractice: developmentGuidance.topGrowthPriority.practiceNext,
    developmentWhy: developmentGuidance.topGrowthPriority.whyItMatters,
    stopDoing: developmentGuidance.topGrowthPriority.stopDoing,
    focusSecondary: developmentGuidance.focusAreas.map((a) => a.headline).slice(0, 2),
    strengthsBullets: developmentGuidance.strengths.map((s) => `${s.headline} — ${s.maintain}`).slice(0, 2),
    guidanceMode: developmentGuidance.guidanceMode,
    insufficientEvidenceMessage: developmentGuidance.insufficientEvidenceMessage,
    evidenceConfidenceLine: confidenceLineFromSignal(evidence.signalStrength, n),
  };
}

export function buildReplayCvSnapshot(sessions = []) {
  const summary = buildReplayIdentitySummary(sessions);
  const {
    patterns,
    averages,
    evidence,
    rolling,
    reviewDisciplineTrend,
    developmentFocus,
    explainability,
    developmentGuidance,
  } = summary;


  const evidenceLabel =
    evidence.completedCount === 0
      ? null
      : evidence.signalStrength === 'strong'
        ? 'Grounded sample — replay identity is well supported.'
        : evidence.signalStrength === 'moderate'
          ? 'Developing sample — themes are directionally useful.'
          : evidence.signalStrength === 'limited'
            ? 'Limited sample — treat themes as directional, not definitive.'
            : 'Thin sample — interpret identity signals cautiously.';

  const explainabilitySummary =
    developmentFocus.rationale
    && (evidence.completedCount >= REPLAY_IDENTITY_MIN_WEAK
      ? `${developmentFocus.label}: ${developmentFocus.rationale}`
      : developmentFocus.detail);

  const developmentProfile = buildCvDevelopmentProfile(patterns, averages, evidence, developmentGuidance);

  return {
    kind: 'aura.replayIdentity.v1',
    schemaRevision: 3,
    generatedAt: summary.generatedAt,
    completedReplayCount: evidence.completedCount,
    totalSessions: evidence.totalSessions,
    averageReplayQuality: averages.replayQuality,
    averageReviewCompleteness: averages.reviewCompleteness,
    learningExampleCount: patterns.modelExampleCount + patterns.cautionExampleCount,
    modelExampleCount: patterns.modelExampleCount,
    cautionExampleCount: patterns.cautionExampleCount,
    topRepeatedWeakness: patterns.recurringMistakeTheme,
    topRepeatedStrength: patterns.recurringStrengthTheme,
    currentDevelopmentFocus: developmentFocus,
    reviewDisciplineTrend,
    recentGrowthSignal:
      reviewDisciplineTrend === 'improving'
        ? 'Review completeness is trending higher versus your prior three-week window.'
        : reviewDisciplineTrend === 'needs_attention'
          ? 'Review depth trails your prior three-week window — close out drafts when you can.'
          : null,
    attentionNeededSignal:
      patterns.weakestExecutionCategory && evidence.completedCount >= REPLAY_IDENTITY_MIN_WEAK
        ? patterns.weakestExecutionCategory.detail
        : null,
    rollingLast30d: rolling.last30d,
    rollingCalendarMonth: rolling.calendarMonth,
    confidence: evidence.confidence,
    signalStrength: evidence.signalStrength,
    evidenceLabel,
    explainabilitySummary,
    uncertaintyNotes: evidence.uncertaintyNotes,
    primaryDrivers: explainability.primaryDrivers,
    developmentGuidance: {
      guidanceMode: developmentGuidance.guidanceMode,
      topGrowthPriority: developmentGuidance.topGrowthPriority,
      focusAreas: developmentGuidance.focusAreas,
      strengths: developmentGuidance.strengths,
      coaching: developmentGuidance.coaching,
      insufficientEvidenceMessage: developmentGuidance.insufficientEvidenceMessage,
    },
    developmentProfile,
  };
}

/**
 * Library row: subtle chips + optional footline (pattern intelligence).
 */
export function getReplayLibraryRowHints(session, identitySummary) {
  const s = normalizeReplay(session);
  const ex = computeReplayQualityScore(s).score;
  const rv = computeReviewCompletenessScore(s).score;
  const chips = [];
  const pat = identitySummary?.patterns;
  const avgQ = identitySummary?.averages?.replayQuality;
  const avgRv = identitySummary?.averages?.reviewCompleteness;
  const n = pat?.completedCount ?? 0;
  const ss = identitySummary?.evidence?.signalStrength;

  const enough = n >= REPLAY_IDENTITY_MIN_WEAK && ss !== 'insufficient';

  if (enough && avgQ != null && ex < avgQ - LIBRARY_DELTA_BASELINE) {
    chips.push('Below your replay Q baseline');
  }
  if (enough && avgRv != null && rv > avgRv + LIBRARY_DELTA_DEEP) {
    chips.push('Deeper review than your average');
  }

  if (
    pat?.recurringMistakeTheme
    && s.replayStatus === REPLAY_STATUSES.completed
    && pat.recurringMistakeTheme.level === 'established'
  ) {
    const buckets = mistakeSources(s, deriveCoaching(s)).map(bucketMistakeText).filter(Boolean);
    if (buckets.includes(pat.recurringMistakeTheme.bucket)) {
      chips.push('Matches established theme');
    }
  }

  if (s.learningExample && s.learningExampleKind === 'model' && pat?.modelExampleCount >= 2) {
    chips.push('Model example');
  }
  if (s.learningExample && s.learningExampleKind === 'caution' && pat?.cautionExampleCount >= 2) {
    chips.push('Caution example');
  }

  let footline = null;
  if (enough && avgQ != null && avgRv != null) {
    if (ex >= avgQ + 6 && rv >= avgRv - 4) {
      footline = 'Ahead of your baseline on execution read — keep the same review discipline.';
    } else if (ex < avgQ - 12) {
      footline = 'Execution read is below your typical baseline — revisit timing and risk fields.';
    }
  }

  return { chips: [...new Set(chips)].slice(0, 3), footline };
}

/**
 * Finish modal: evidence-backed wrap-up + next replay focus (deterministic).
 * @returns {{ line: string|null, confidence: string, uncertaintyNote: string|null, nextReplayFocus: string, wrapUpTone: 'gather_evidence'|'maintain'|'address', strengthLine: string|null, weaknessLine: string|null }}
 */
export function getReplayFinishPatternCallout(finishedSession, allSessions = []) {
  const summary = buildReplayIdentitySummary(allSessions);
  const g = summary.developmentGuidance;
  const s = normalizeReplay(finishedSession);
  const pat = summary.patterns;
  const n = pat.completedCount;
  const ss = summary.evidence.signalStrength;
  const avgQ = summary.averages.replayQuality;
  const avgRv = summary.averages.reviewCompleteness;
  const ex = computeReplayQualityScore(s).score;
  const rv = computeReviewCompletenessScore(s).score;
  const buckets = mistakeSources(s, deriveCoaching(s)).map(bucketMistakeText).filter(Boolean);
  const theme = pat.recurringMistakeTheme;
  const themeHit = Boolean(theme && buckets.includes(theme.bucket));

  const nextFromGuidance =
    g.topGrowthPriority.reviewInFutureReplays[0] || g.topGrowthPriority.practiceNext;

  if (n === 0) {
    return {
      line: null,
      confidence: summary.evidence.confidence,
      uncertaintyNote: 'Complete more replays to build an identity snapshot.',
      nextReplayFocus: g.topGrowthPriority.practiceNext,
      wrapUpTone: 'gather_evidence',
      strengthLine: null,
      weaknessLine: null,
    };
  }

  if (n < REPLAY_IDENTITY_MIN_WEAK) {
    return {
      line: `Baseline forming: ${n} completed ${n === 1 ? 'replay' : 'replays'} — add more closes so priorities can rank against your own average.`,
      confidence: summary.evidence.confidence,
      uncertaintyNote: 'Themes stay provisional until more reviews finish.',
      nextReplayFocus: g.topGrowthPriority.practiceNext,
      wrapUpTone: 'gather_evidence',
      strengthLine: null,
      weaknessLine: null,
    };
  }

  if (theme?.level === 'established' && themeHit) {
    return {
      line: `This review aligns with your established pattern: ${theme.label}. Your archive is pointing at the same failure class again.`,
      confidence: summary.evidence.confidence,
      uncertaintyNote: ss === 'limited' ? 'Aggregate sample is still limited — keep pressure-testing with more completes.' : null,
      nextReplayFocus: nextFromGuidance,
      wrapUpTone: 'address',
      strengthLine: null,
      weaknessLine: `Fix next: ${g.coaching.stopDoing}`,
    };
  }

  if (summary.reviewDisciplineTrend === 'improving' && rv >= (avgRv ?? 0) - 4) {
    return {
      line: 'Review depth is improving versus your prior window — this completion reinforces the cadence.',
      confidence: summary.evidence.confidence,
      uncertaintyNote: null,
      nextReplayFocus: g.coaching.futureReplayChecks[0] || g.topGrowthPriority.practiceNext,
      wrapUpTone: 'maintain',
      strengthLine:
        avgQ != null && ex >= avgQ - 4
          ? 'Replay quality on this session sits near or above your baseline — maintain the same honesty on scratch trades.'
          : 'Maintain this review discipline on the next replay; keep scoring losses with the same rigour.',
      weaknessLine: null,
    };
  }

  const belowQ = avgQ != null && ex < avgQ - 8;
  if (belowQ) {
    return {
      line: `This replay’s execution read (${ex}) trails your rolling average (${avgQ}) on ${n} completed reviews — revisit timing and risk fields before the next save.`,
      confidence: summary.evidence.confidence,
      uncertaintyNote: ss !== 'strong' ? 'Cross-replay deltas stay directional until the sample deepens.' : null,
      nextReplayFocus: g.topGrowthPriority.practiceNext,
      wrapUpTone: 'address',
      strengthLine: null,
      weaknessLine: 'Tighten the mismatch between story and sliders while the tape is fresh.',
    };
  }

  const varianceFromTheme =
    theme && theme.level === 'established' && !themeHit
      ? `Your established theme is ${theme.label}; this session did not tag that bucket — note whether this is variance or a real process shift.`
      : null;

  return {
    line: `Across ${n} completed replays you average replay Q ${avgQ ?? '—'} and review depth ${avgRv ?? '—'}%; this row adds another comparable datapoint.`,
    confidence: summary.evidence.confidence,
    uncertaintyNote: ss !== 'strong' ? 'Treat identity readouts as directional until evidence depth catches up.' : null,
    nextReplayFocus: nextFromGuidance,
    wrapUpTone: theme ? 'address' : 'maintain',
    strengthLine:
      avgRv != null && rv >= avgRv + 5
        ? 'This replay’s review completeness is above your average — reuse this depth as the standard.'
        : null,
    weaknessLine: varianceFromTheme,
  };
}
