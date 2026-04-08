/**
 * Thin mentor / coach / admin read helpers for Trader Replay.
 * Deterministic, no messaging or permissions — review readiness only.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { deriveCoaching, deriveSuggestedNextAction } from './replayCoachingEngine';
import { REPLAY_STATUSES } from './replayDefaults';
import {
  aggregateReplayPatterns,
  bucketMistakeText,
  REPLAY_IDENTITY_MIN_WEAK,
} from './replayIdentityEngine';
import { buildReplayRollingDirectionalSignals, buildReplayContributionProfile } from './replayContributionEngine';
import { computeReplayHabitStats } from './replayHabit';

function mistakeBucketsFromSession(s, coach) {
  return [s.reviewBiggestMistake, coach.biggestMistake, s.whatIMissed, s.lessonSummary]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .map(bucketMistakeText)
    .filter(Boolean);
}

/**
 * Model vs caution framing for mentor-facing copy.
 */
export function getLearningExampleMentorFraming(session) {
  const s = normalizeReplay(session);
  if (!s.learningExample) {
    return { role: 'none', headline: null, mentorLine: null };
  }
  const coach = deriveCoaching(s);
  if (s.learningExampleKind === 'model') {
    const line = coach.repeatThis && coach.repeatThis !== '—'
      ? coach.repeatThis
      : (coach.mainLesson && coach.mainLesson !== '—' ? coach.mainLesson : 'Process captured in this review — extract playbook rules.');
    return {
      role: 'model',
      headline: 'Model — reinforce what to repeat',
      mentorLine: line.length > 220 ? `${line.slice(0, 217)}…` : line,
    };
  }
  if (s.learningExampleKind === 'caution') {
    const line = coach.avoidThis && coach.avoidThis !== '—'
      ? coach.avoidThis
      : (coach.biggestMistake && coach.biggestMistake !== '—' ? coach.biggestMistake : 'Risk behaviour in this review — define what must change.');
    return {
      role: 'caution',
      headline: 'Caution — correct what to avoid',
      mentorLine: line.length > 220 ? `${line.slice(0, 217)}…` : line,
    };
  }
  return { role: 'example', headline: 'Learning example', mentorLine: null };
}

/**
 * Compact coaching context for workspace / finish modal.
 */
export function buildMentorCoachContext(session, allSessions = []) {
  const s = normalizeReplay(session);
  const normalizedAll = (allSessions || []).map(normalizeReplay);
  const coach = deriveCoaching(s);
  const rq = computeReplayQualityScore(s).score;
  const rv = computeReviewCompletenessScore(s).score;
  const patterns = aggregateReplayPatterns(normalizedAll);
  const directional = buildReplayRollingDirectionalSignals(normalizedAll);
  const suggested = deriveSuggestedNextAction(s);
  const exFrame = getLearningExampleMentorFraming(s);

  let recurrence = { label: 'insufficient_evidence', line: null };
  const n = patterns.completedCount || 0;
  if (n >= REPLAY_IDENTITY_MIN_WEAK && patterns.recurringMistakeTheme) {
    const buckets = mistakeBucketsFromSession(s, coach);
    const hit = buckets.includes(patterns.recurringMistakeTheme.bucket);
    if (hit && patterns.recurringMistakeTheme.level === 'established') {
      recurrence = {
        label: 'recurring',
        line: `Matches established pattern: ${patterns.recurringMistakeTheme.label}.`,
      };
    } else if (hit) {
      recurrence = {
        label: 'emerging',
        line: `Echoes emerging theme: ${patterns.recurringMistakeTheme.label}.`,
      };
    } else {
      recurrence = {
        label: 'isolated',
        line: 'Mistake text does not match your dominant recurring bucket — may be a one-off.',
      };
    }
  } else if (n < REPLAY_IDENTITY_MIN_WEAK) {
    recurrence = {
      label: 'insufficient_evidence',
      line: 'Not enough completed replays to separate one-off vs recurring.',
    };
  }

  let trajectory = { label: 'neutral', line: null };
  const le = directional.last30VsPrev30?.lateEntryTheme;
  if (le === 'improving' && n >= REPLAY_IDENTITY_MIN_WEAK) {
    trajectory = { label: 'improving', line: 'Late/chase language down vs your prior 30-day window.' };
  } else if (le === 'slipping' && n >= REPLAY_IDENTITY_MIN_WEAK) {
    trajectory = { label: 'slipping', line: 'Late/chase language up vs your prior 30-day window.' };
  }

  let focusFirst = '';
  if (s.replayStatus !== REPLAY_STATUSES.completed) {
    focusFirst = 'Finish and save this review — mentor read stays thin until status is completed.';
  } else if (rv < 48) {
    focusFirst = 'Expand reflection fields first — review depth is below coaching-useful.';
  } else if (exFrame.role === 'caution') {
    focusFirst = 'Prioritise correcting the behaviour this caution tape flags before the next live session.';
  } else if (recurrence.label === 'recurring') {
    focusFirst = 'Drill the recurring theme — tie it to explicit rules and pre-trade checks.';
  } else if (exFrame.role === 'model') {
    focusFirst = 'Codify the repeatable process from this model into playbook checkpoints.';
  } else if (coach.mainLesson && coach.mainLesson !== '—') {
    const t = coach.mainLesson.slice(0, 130);
    focusFirst = `Anchor: ${t}${coach.mainLesson.length > 130 ? '…' : ''}`;
  } else {
    focusFirst = 'Pick one concrete behaviour from this replay to install next session.';
  }

  let reviewPriority = 'medium';
  let priorityHint = '';
  if (s.replayStatus !== REPLAY_STATUSES.completed || rv < 52) {
    reviewPriority = 'high';
    priorityHint = 'Incomplete or shallow review — limited mentor signal.';
  } else if (exFrame.role === 'caution' && recurrence.label === 'recurring') {
    reviewPriority = 'high';
    priorityHint = 'Caution example aligned with a recurring pattern — worth a focused session.';
  } else if (exFrame.role === 'model' && rv >= 70 && rq >= 55) {
    reviewPriority = 'low';
    priorityHint = 'Strong teaching tape — good source for rules and demos.';
  } else if (exFrame.role === 'model') {
    reviewPriority = 'medium';
    priorityHint = 'Model example — extract what to repeat.';
  } else {
    priorityHint = 'Standard review — use lesson and plan in the summary.';
  }

  const habit = computeReplayHabitStats(normalizedAll);
  const contrib = buildReplayContributionProfile(normalizedAll, habit);
  const contribLine = contrib.evidence?.completedCount > 0 && contrib.scoreContributionExplanations?.[0]
    ? contrib.scoreContributionExplanations[0]
    : null;

  const bullets = [];
  bullets.push({ key: 'focus', text: focusFirst });
  if (exFrame.headline && exFrame.mentorLine) {
    bullets.push({ key: 'example', text: `${exFrame.headline}: ${exFrame.mentorLine}` });
  }
  if (recurrence.line) bullets.push({ key: 'recurrence', text: recurrence.line });
  if (trajectory.line) bullets.push({ key: 'trajectory', text: trajectory.line });

  return {
    focusFirst,
    exampleFraming: exFrame,
    recurrence,
    trajectory,
    reviewPriority,
    priorityHint,
    nextAction: { label: suggested.label, reason: suggested.reason, href: suggested.href },
    profileContributionLine: contribLine,
    bullets: bullets.slice(0, 5),
  };
}

/**
 * Extra library row chips + optional mentor cue (avoid calling full coach context per row).
 */
export function getLibraryMentorRowAugment(session, identitySummary) {
  const s = normalizeReplay(session);
  const chips = [];
  const rv = computeReviewCompletenessScore(s).score;
  const rq = computeReplayQualityScore(s).score;
  const pat = identitySummary?.patterns;

  if (s.replayStatus !== REPLAY_STATUSES.completed) {
    chips.push('Needs completion');
  } else if (rv < 50) {
    chips.push('Shallow review');
  }

  if (
    s.learningExampleKind === 'caution'
    && pat?.recurringMistakeTheme?.level === 'established'
    && s.replayStatus === REPLAY_STATUSES.completed
  ) {
    const buckets = mistakeBucketsFromSession(s, deriveCoaching(s));
    if (buckets.includes(pat.recurringMistakeTheme.bucket)) {
      chips.push('Recurring caution');
    }
  }

  if (s.learningExampleKind === 'model' && s.replayStatus === REPLAY_STATUSES.completed && rv >= 68) {
    chips.push('Teach-ready model');
  }

  let reviewCue = null;
  if (s.learningExampleKind === 'caution' && chips.includes('Recurring caution')) {
    reviewCue = 'Coach focus: repeating mistake theme — correct before next size.';
  } else if (s.learningExampleKind === 'model' && rv >= 68 && rq >= 52) {
    reviewCue = 'Good teaching example — use in playbook walk-through.';
  } else if (s.replayStatus === REPLAY_STATUSES.completed && rv < 48) {
    reviewCue = 'Review depth low — push trader to finish before mentor debrief.';
  }

  return { chips: [...new Set(chips)].slice(0, 2), reviewCue };
}

function exampleLabel(kind) {
  if (kind === 'model') return 'Learning example · MODEL (repeat this process)';
  if (kind === 'caution') return 'Learning example · CAUTION (correct this behaviour)';
  if (kind) return 'Learning example';
  return 'Not flagged as vault example';
}

/**
 * Plain lines for clipboard mentor summary (no duplicate essay blocks).
 */
export function formatMentorSummaryPlainLines(session, allSessions = []) {
  const s = normalizeReplay(session);
  const c = deriveCoaching(s);
  const rq = computeReplayQualityScore(s);
  const rv = computeReviewCompletenessScore(s);
  const ctx = buildMentorCoachContext(s, allSessions);
  const when = s.replayDate || s.sourceDate || '—';
  const sym = s.asset || s.symbol || '—';

  const lines = [
    '── Aura Trader Replay · mentor summary ──',
    `Symbol: ${sym}`,
    `Replay date: ${when}`,
    `Mode: ${s.mode || 'trade'} · Status: ${s.replayStatus || '—'}${s.replayStatus === REPLAY_STATUSES.completed ? '' : ' (incomplete)'}`,
    `Replay quality (execution read): ${rq.score}`,
    `Review completeness: ${rv.score}%`,
    `Review priority: ${ctx.reviewPriority} — ${ctx.priorityHint}`,
    `Coach focus first: ${ctx.focusFirst}`,
    `Main lesson: ${c.mainLesson}`,
    `Biggest mistake: ${c.biggestMistake}`,
    `Best execution moment: ${c.bestMoment}`,
    `Improvement / plan: ${s.improvementPlan || c.nextSessionFocus || '—'}`,
    `Learning vault: ${s.learningExample ? exampleLabel(s.learningExampleKind) : 'No'}`,
  ];

  const ex = ctx.exampleFraming;
  if (ex.headline && ex.mentorLine) {
    lines.push(`${ex.headline}: ${ex.mentorLine}`);
  }
  if (ctx.recurrence.line && ctx.recurrence.label !== 'insufficient_evidence') {
    lines.push(`Pattern context: ${ctx.recurrence.line}`);
  }
  if (ctx.trajectory.line) {
    lines.push(`Trajectory (replay history): ${ctx.trajectory.line}`);
  }
  if (ctx.profileContributionLine) {
    lines.push(`Replay profile signal: ${ctx.profileContributionLine}`);
  }

  lines.push(`Next best action: ${ctx.nextAction.label} — ${ctx.nextAction.reason}`);

  if (c.takeaways?.length) {
    const compact = c.takeaways
      .filter((t) => t && !lines.some((ln) => ln.includes(t.slice(0, 40))))
      .slice(0, 3);
    if (compact.length) {
      lines.push('Takeaways:');
      compact.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
    }
  }

  lines.push('── end ──');
  return lines;
}
