/**
 * Replay → weekly desk brief / monthly discipline review narratives.
 * Composes replayPackageEngine weekly/monthly payloads with identity + contribution — no duplicate scoring.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayHabitStats } from './replayHabit';
import { buildReplayContributionProfile } from './replayContributionEngine';
import { buildReplayIdentitySummary } from './replayIdentityEngine';
import {
  buildReplayWeeklyPackage,
  buildReplayMonthlyPackage,
} from './replayPackageEngine';

function trimT(text, max = 220) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function exampleLine(ex, role) {
  if (!ex?.title) return '';
  return `[${role}] ${ex.title} — ${trimT(ex.line, 160)}`;
}

/**
 * @param {object[]} sessions
 * @param {object|null} habitStats
 */
export function buildWeeklyReplayBrief(sessions = [], habitStats = null) {
  const normalized = sessions.map(normalizeReplay);
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const w = buildReplayWeeklyPackage(sessions, h);
  const contrib = buildReplayContributionProfile(normalized, h);
  const identity = buildReplayIdentitySummary(normalized);

  const discTrend = contrib.discipline?.replayDisciplineTrend || '—';
  const discExpl = trimT(contrib.discipline?.replayDisciplineExplanation || contrib.scoreContributionExplanations?.[0], 200);
  const followThrough =
    w.avgReviewCompleteness != null
      ? `Rolling 7d average review depth ~${w.avgReviewCompleteness}% (saved-field rollup). ${h.incompleteCount ? `Open loops: ${h.incompleteCount} replay(s) not completed.` : 'No open in-progress count in library.'}`
      : 'Not enough completed replays in the 7d window for a stable review-depth average — keep closing reviews.';

  const modelEx = w.modelPicks?.[0];
  const cautionEx = w.cautionPicks?.[0];
  const revisitLines = [modelEx, cautionEx].filter(Boolean).map((ex) => exampleLine(ex, ex.kind === 'model' ? 'REVISIT · model' : 'REVISIT · caution'));

  const improved = w.improvementSignal;
  const cautionEchoNote = w.echoedThisWeek
    ? 'This theme showed up again in this week’s completed replays.'
    : 'Theme not clearly repeated inside this week’s completes — monitor next sessions.';
  const stillCorrect =
    trimT(contrib.behavior?.cautions?.[0], 220)
    || (w.repeatedCaution && w.repeatedCaution !== 'No established repeat theme yet — keep tagging mistakes.'
      ? `Keep correcting: ${trimT(w.repeatedCaution, 200)}`
      : 'Tag mistakes on the next replay so cautions become reviewable evidence.');

  const rehearse = w.strongestLesson && w.strongestLesson !== '—'
    ? `Rehearse the thread “${trimT(w.strongestLesson, 140)}” before the next live session — keep it procedural, not emotional.`
    : 'Log one more closed replay this week so a lesson thread can surface.';

  const nextWeek =
    w.reviewPriority === 'high'
      ? 'Next week: prioritise closing reviews and addressing the slipping signal before adding size.'
      : w.reviewPriority === 'low'
        ? 'Next week: establish rhythm — aim for at least two completed replays with honest mistake text.'
        : `Next week: ${trimT(w.developmentFocus, 200) || 'hold development focus from identity summary and re-check vault examples.'}`;

  const monitorLine =
    discTrend === 'slipping' || w.reviewPriority === 'high'
      ? '[MONITOR] Discipline / review signals — do not trade on autopilot until the loop tightens.'
      : '[MONITOR] Keep vault examples current; if the same mistake text repeats, escalate to a caution example.';

  const plainSections = [
    '── Aura Trader Replay · weekly desk brief ──',
    '',
    'Weekly replay snapshot',
    `Completed replays (7d window): ${w.completedCount}.`,
    w.avgReplayQuality != null && w.avgReviewCompleteness != null
      ? `Execution read (avg Q) ~${w.avgReplayQuality} · Review depth (avg Rv) ~${w.avgReviewCompleteness}% — both are replay-field rollups, not live P&L.`
      : 'Averages: insufficient data in-window — still useful to scan themes below.',
    '',
    'Strongest repeated lesson · REVISIT / REINFORCE',
    trimT(w.strongestLesson, 240) || '—',
    rehearse,
    '',
    'Most important caution · CORRECT',
    trimT(w.repeatedCaution, 240),
    cautionEchoNote,
    '',
    'Strongest model behaviour · REINFORCE',
    modelEx ? exampleLine(modelEx, 'REINFORCE') : 'No model-tagged example in-window — promote the next clean plan-following replay.',
    '',
    'Replay-derived discipline signal',
    `Trend label: ${discTrend}. ${discExpl || '—'}`,
    '',
    'Review completeness · follow-through',
    followThrough,
    h.nudge ? `Habit note: ${trimT(h.nudge, 200)}` : '',
    '',
    'What improved this week',
    trimT(improved, 240),
    '',
    'What still needs correction',
    trimT(stillCorrect, 280),
    '',
    'Examples worth revisiting (1–2)',
    ...(revisitLines.length ? revisitLines : ['— Add model/caution examples or complete more replays this week.']),
    '',
    monitorLine,
    '',
    'Next-week focus',
    trimT(nextWeek, 280),
    '',
    identity.evidence?.uncertaintyNotes?.[0] ? `Evidence: ${trimT(identity.evidence.uncertaintyNotes[0], 200)}` : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    '[Aura Replay · weekly brief]',
    `7d done: ${w.completedCount} · priority: ${w.reviewPriority}`,
    `Lesson thread: ${trimT(w.strongestLesson, 100) || '—'}`,
    `Caution: ${trimT(w.repeatedCaution, 100)}`,
    `Next week: ${trimT(nextWeek, 120)}`,
  ].join('\n');

  return {
    kind: 'aura.replayNarrative.weeklyBrief',
    generatedAt: new Date().toISOString(),
    snapshotLine: `${w.completedCount} completes (7d)${w.avgReplayQuality != null ? ` · Q~${w.avgReplayQuality}` : ''}${w.avgReviewCompleteness != null ? ` · Rv~${w.avgReviewCompleteness}%` : ''}`,
    strongestLesson: w.strongestLesson,
    rehearseBeforeSession: rehearse,
    topCaution: w.repeatedCaution,
    echoedThisWeek: w.echoedThisWeek,
    modelReinforce: modelEx ? exampleLine(modelEx, 'REINFORCE') : null,
    disciplineSignal: `${discTrend} — ${discExpl || '—'}`.trim(),
    followThroughNote: followThrough,
    improvedThisWeek: improved,
    stillNeedsCorrection: stillCorrect,
    examplesRevisit: revisitLines,
    monitorLine,
    nextWeekFocus: nextWeek,
    reviewPriority: w.reviewPriority,
    plainText,
    compactShare,
  };
}

/**
 * @param {object[]} sessions
 * @param {object|null} habitStats
 */
export function buildMonthlyReplayReview(sessions = [], habitStats = null) {
  const normalized = sessions.map(normalizeReplay);
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const m = buildReplayMonthlyPackage(sessions, h);
  const contrib = buildReplayContributionProfile(normalized, h);
  const identity = buildReplayIdentitySummary(normalized);
  const patterns = identity.patterns;

  const strength = trimT(m.strengthSignal, 240);
  const weakness = trimT(m.weaknessSignal, 240);
  const vault = m.vaultDistribution;

  const topModel = m.topModels?.[0];
  const topCaution = m.topCautions?.[0];
  const exampleBlock = [
    topModel ? exampleLine(topModel, 'REINFORCE · model') : null,
    topCaution ? exampleLine(topCaution, 'CORRECT · caution') : null,
  ].filter(Boolean);

  let identityPattern = 'Insufficient completed sample for a stable identity read.';
  if (patterns?.recurringMistakeTheme?.level === 'established') {
    identityPattern = `Established recurrence in mistake text: ${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.count}×) — this is becoming part of the written replay record.`;
  } else if (patterns?.recurringMistakeTheme?.level === 'emerging') {
    identityPattern = `Emerging theme: ${patterns.recurringMistakeTheme.label} — monitor next month before treating it as fixed identity.`;
  } else if (identity.developmentFocus?.label) {
    identityPattern = `Development axis: ${identity.developmentFocus.label} — ${trimT(identity.developmentFocus.detail, 200)}`;
  }

  const mn = patterns?.modelExampleCount ?? 0;
  const cn = patterns?.cautionExampleCount ?? 0;
  const balanceNote =
    mn + cn === 0
      ? 'Vault balance: no tagged examples yet — bias toward one model and one caution as the sample grows.'
      : `Vault: ${mn} model(s), ${cn} caution(s) (${vault}) — use models to rehearse process; use cautions to correct drift.`;

  const monthlyFocusOneLine = trimT(
    m.correctionFocus || contrib.developmentActions?.[0] || identity.developmentGuidance?.topGrowthPriority?.practiceNext,
    240
  ) || 'Close more replays with explicit mistake + lesson text next month.';

  const plainSections = [
    '── Aura Trader Replay · monthly discipline review ──',
    '',
    'Monthly replay snapshot',
    `~30d completed: ${m.completedApprox30d}.`,
    m.contributionLine ? `Profile contribution (replay indices): ${trimT(m.contributionLine, 220)}` : '',
    '',
    'Strongest repeated strength · REINFORCE',
    strength,
    '',
    'Biggest recurring weakness · CORRECT',
    weakness,
    '',
    'Discipline trend (replay-derived)',
    trimT(m.disciplineTrendLabel, 120),
    trimT(contrib.discipline?.replayDisciplineExplanation, 200) || '',
    '',
    'Review discipline · completeness trend',
    trimT(m.reviewCompletenessTrend, 260),
    '',
    'Caution vs model balance',
    balanceNote,
    '',
    'Strongest learning examples to revisit',
    ...(exampleBlock.length ? exampleBlock : ['— Tag examples from the highest-signal replays when possible.']),
    '',
    'Pattern vs identity',
    identityPattern,
    '',
    'What must be corrected next month',
    trimT(m.correctionFocus, 260),
    '',
    'Monthly development focus (one line)',
    monthlyFocusOneLine,
    '',
    identity.evidence?.uncertaintyNotes?.[0] ? `Evidence caution: ${trimT(identity.evidence.uncertaintyNotes[0], 200)}` : '',
    '── end ──',
  ].filter(Boolean);

  const plainText = plainSections.join('\n');

  const compactShare = [
    '[Aura Replay · monthly review]',
    `~30d done: ${m.completedApprox30d} · Rv trend: ${trimT(m.reviewCompletenessTrend, 80)}`,
    `Strength: ${trimT(strength, 90)}`,
    `Weakness: ${trimT(weakness, 90)}`,
    `Focus: ${trimT(monthlyFocusOneLine, 120)}`,
  ].join('\n');

  return {
    kind: 'aura.replayNarrative.monthlyReview',
    generatedAt: new Date().toISOString(),
    snapshotLine: `~30d · ${m.completedApprox30d} completes`,
    strongestStrength: strength,
    biggestWeakness: weakness,
    disciplineTrend: m.disciplineTrendLabel,
    reviewCompletenessTrend: m.reviewCompletenessTrend,
    vaultBalanceNote: balanceNote,
    learningExamplesRevisit: exampleBlock,
    identityPatternLine: identityPattern,
    correctionNextMonth: m.correctionFocus,
    monthlyDevelopmentFocus: monthlyFocusOneLine,
    plainText,
    compactShare,
  };
}

export function buildReplayNarrativeBundle(sessions = [], habitStats = null) {
  return {
    generatedAt: new Date().toISOString(),
    weeklyBrief: buildWeeklyReplayBrief(sessions, habitStats),
    monthlyReview: buildMonthlyReplayReview(sessions, habitStats),
  };
}

export function formatReplayNarrativeBundlePlain(sessions, habitStats) {
  const b = buildReplayNarrativeBundle(sessions, habitStats);
  return [b.weeklyBrief.plainText, '\n\n', b.monthlyReview.plainText].join('');
}
