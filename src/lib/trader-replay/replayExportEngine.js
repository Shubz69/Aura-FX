/**
 * Centralized plain-text replay exports for copy, share, and light .txt download.
 * Reuses coaching, mentor, identity, and contribution engines — no duplicate scoring logic.
 */
import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { deriveCoaching, deriveSuggestedNextAction } from './replayCoachingEngine';
import { getReplayFinishPatternCallout } from './replayIdentityEngine';
import { buildReplayContributionProfile } from './replayContributionEngine';
import { computeReplayHabitStats } from './replayHabit';
import {
  formatMentorSummaryPlainLines,
  buildMentorCoachContext,
  getLearningExampleMentorFraming,
} from './replayMentorReviewEngine';

function normSessions(allSessions) {
  return (allSessions || []).map(normalizeReplay);
}

function trimLine(text, max = 140) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Trader-facing summary — no mentor priority block. */
export function buildReplayStandardExport(session, allSessions = []) {
  const s = normalizeReplay(session);
  const c = deriveCoaching(s);
  const rq = computeReplayQualityScore(s).score;
  const rv = computeReviewCompletenessScore(s).score;
  const suggested = deriveSuggestedNextAction(s);
  const when = s.replayDate || s.sourceDate || '—';
  const sym = s.asset || s.symbol || '—';
  const callout = getReplayFinishPatternCallout(s, allSessions);

  const lines = [
    '── Aura Trader Replay · my summary ──',
    `${sym} · ${when} · ${s.mode || 'trade'} · ${s.replayStatus || '—'}`,
    `Replay quality ${rq} · Review ${rv}%`,
    '',
    `Lesson: ${trimLine(c.mainLesson, 320)}`,
    `Biggest mistake: ${trimLine(c.biggestMistake, 260)}`,
    `Best moment: ${trimLine(c.bestMoment, 260)}`,
    `Plan: ${trimLine(s.improvementPlan || c.nextSessionFocus, 260)}`,
    '',
  ];

  if (callout.line) {
    lines.push(`Pattern note: ${trimLine(callout.line, 260)}`);
  }
  lines.push(`Next: ${suggested.label} — ${trimLine(suggested.reason, 180)}`);
  lines.push('── end ──');

  return lines.join('\n');
}

/** Full mentor / desk handoff (same payload as legacy mentor copy). */
export function buildReplayMentorExport(session, allSessions = []) {
  return formatMentorSummaryPlainLines(session, allSessions).join('\n');
}

/** Compact share snippet (Discord / chat). */
export function buildReplayShortShare(session, allSessions = []) {
  const s = normalizeReplay(session);
  const c = deriveCoaching(s);
  const rq = computeReplayQualityScore(s).score;
  const rv = computeReviewCompletenessScore(s).score;
  const suggested = deriveSuggestedNextAction(s);
  const when = s.replayDate || s.sourceDate || '—';
  const sym = s.asset || s.symbol || '—';

  const normalizedAll = normSessions(allSessions);
  const habit = computeReplayHabitStats(normalizedAll);
  const contrib = buildReplayContributionProfile(normalizedAll, habit);
  const signal = contrib.scoreContributionExplanations?.[0];

  const tag =
    s.learningExampleKind === 'model'
      ? '[MODEL · repeat]'
      : s.learningExampleKind === 'caution'
        ? '[CAUTION · fix]'
        : '[Replay]';

  const lines = [
    `${tag} ${sym} · ${when}`,
    `Lesson: ${trimLine(c.mainLesson, 180)}`,
  ];

  if (s.learningExampleKind === 'model') {
    lines.push(`Repeat: ${trimLine(c.repeatThis || c.mainLesson, 120)}`);
  } else {
    lines.push(`Watch: ${trimLine(c.biggestMistake || c.avoidThis, 120)}`);
  }

  let scoreLine = `Q${rq} · Rv${rv}%`;
  if (signal) scoreLine += ` · ${trimLine(signal, 90)}`;
  lines.push(scoreLine);
  lines.push(`Next: ${suggested.label}`);

  return lines.join('\n');
}

/** Structured note for internal / trainer use. */
export function buildReplayInternalNote(session, allSessions = []) {
  const s = normalizeReplay(session);
  const ctx = buildMentorCoachContext(s, allSessions);
  const c = deriveCoaching(s);
  const normalizedAll = normSessions(allSessions);
  const habit = computeReplayHabitStats(normalizedAll);
  const contrib = buildReplayContributionProfile(normalizedAll, habit);
  const callout = getReplayFinishPatternCallout(s, allSessions);
  const ex = ctx.exampleFraming;

  const lines = [
    '=== INTERNAL · Trader Replay note ===',
    '',
    '[META]',
    `Title: ${s.title || '—'}`,
    `Id: ${s.id || 'local'}`,
    `Symbol: ${s.asset || s.symbol || '—'} · Date: ${s.replayDate || s.sourceDate || '—'}`,
    `Mode / status: ${s.mode || 'trade'} / ${s.replayStatus || '—'}`,
    '',
    '[PRIORITY]',
    `${String(ctx.reviewPriority).toUpperCase()} — ${ctx.priorityHint}`,
    '',
    '[COACH FOCUS]',
    ...ctx.bullets.map((b) => `• ${b.text}`),
    '',
    '[LESSON / RISK]',
    `Lesson: ${trimLine(c.mainLesson, 340)}`,
    `Mistake: ${trimLine(c.biggestMistake, 340)}`,
    `Best: ${trimLine(c.bestMoment, 220)}`,
    `Plan: ${trimLine(s.improvementPlan || c.nextSessionFocus, 340)}`,
  ];

  if (ex.headline && ex.mentorLine) {
    lines.push('', '[VAULT FRAMING]', ex.headline, ex.mentorLine);
  }

  lines.push('', '[PATTERNS / HISTORY]');
  if (ctx.recurrence.line) lines.push(ctx.recurrence.line);
  if (ctx.trajectory.line) lines.push(ctx.trajectory.line);
  if (callout.line) lines.push(`Identity callout: ${callout.line}`);

  lines.push('', '[PROFILE SIGNAL]');
  if (contrib.scoreContributionExplanations?.[0]) {
    lines.push(contrib.scoreContributionExplanations[0]);
  }
  if (contrib.developmentActions?.[0]) {
    lines.push(`Development: ${contrib.developmentActions[0]}`);
  }

  lines.push('', '[NEXT]', `${ctx.nextAction.label} — ${ctx.nextAction.reason}`, '', '=== end internal note ===');

  return lines.join('\n');
}

/** Portable text for a saved model/caution example. */
export function buildReplayLearningExampleCard(session, allSessions = []) {
  const s = normalizeReplay(session);
  if (!s.learningExample) return '';

  const ex = getLearningExampleMentorFraming(s);
  const c = deriveCoaching(s);
  const rq = computeReplayQualityScore(s).score;
  const rv = computeReviewCompletenessScore(s).score;
  const when = s.replayDate || s.sourceDate || '—';
  const sym = s.asset || s.symbol || '—';
  const kind = s.learningExampleKind === 'model' ? 'MODEL' : s.learningExampleKind === 'caution' ? 'CAUTION' : 'EXAMPLE';

  const lines = [
    '── Aura · Learning example card ──',
    `${kind} · ${sym} · ${when}`,
    '',
  ];
  if (ex.headline) lines.push(ex.headline);
  if (ex.mentorLine) lines.push(ex.mentorLine);
  lines.push('', `Lesson: ${trimLine(c.mainLesson, 220)}`);
  if (s.learningExampleKind === 'caution') {
    lines.push(`Correct: ${trimLine(c.biggestMistake, 220)}`);
  }
  if (s.learningExampleKind === 'model') {
    lines.push(`Repeat: ${trimLine(c.repeatThis, 220)}`);
  }
  const habit = computeReplayHabitStats(normSessions(allSessions));
  const contrib = buildReplayContributionProfile(normSessions(allSessions), habit);
  if (contrib.scoreContributionExplanations?.[0]) {
    lines.push(`Signal: ${trimLine(contrib.scoreContributionExplanations[0], 160)}`);
  }
  lines.push(`Scores · Q${rq} · Rv${rv}%`);
  lines.push('── end ──');

  return lines.join('\n');
}

/** All variants for clipboard or bundled .txt */
export function buildReplayExportBundle(session, allSessions = []) {
  const s = normalizeReplay(session);
  return {
    standard: buildReplayStandardExport(s, allSessions),
    mentor: buildReplayMentorExport(s, allSessions),
    shortShare: buildReplayShortShare(s, allSessions),
    internalNote: buildReplayInternalNote(s, allSessions),
    learningExampleCard: s.learningExample ? buildReplayLearningExampleCard(s, allSessions) : '',
  };
}

export function suggestReplayExportFilename(session, suffix = 'bundle') {
  const s = normalizeReplay(session);
  const sym = String(s.asset || s.symbol || 'replay').replace(/[^\w.-]+/g, '_').slice(0, 32);
  const d = String(s.replayDate || s.sourceDate || 'note').replace(/[^\d-]/g, '').slice(0, 12);
  const safeSuffix = String(suffix || 'replay').replace(/[^\w-]+/g, '-').slice(0, 24);
  return `aura-tr-${sym}-${d}-${safeSuffix}.txt`;
}

export function downloadTextFile(filename, text) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.txt';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
