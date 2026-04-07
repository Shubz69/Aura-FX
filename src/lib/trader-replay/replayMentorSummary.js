import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { deriveCoaching } from './replayCoachingEngine';
import { REPLAY_STATUSES } from './replayDefaults';

function exampleLabel(kind) {
  if (kind === 'model') return 'Learning example · model';
  if (kind === 'caution') return 'Learning example · caution';
  if (kind) return 'Learning example';
  return 'Not flagged as example';
}

/**
 * Plain-text mentor / desk handoff for copy/paste (no export service).
 */
export function buildMentorSummaryText(session) {
  const s = normalizeReplay(session);
  const c = deriveCoaching(s);
  const rq = computeReplayQualityScore(s);
  const rv = computeReviewCompletenessScore(s);
  const when = s.replayDate || s.sourceDate || '—';
  const sym = s.asset || s.symbol || '—';
  const lines = [
    '── Aura Trader Replay · mentor summary ──',
    `Title: ${s.title || '—'}`,
    `Symbol: ${sym} · Mode: ${s.mode || 'trade'} · Date: ${when}`,
    `Status: ${s.replayStatus || '—'}${s.replayStatus === REPLAY_STATUSES.completed ? '' : ' (incomplete)'}`,
    `Replay quality (execution read): ${rq.score}`,
    `Review completeness: ${rv.score}%`,
    `Main lesson: ${c.mainLesson}`,
    `Biggest mistake: ${c.biggestMistake}`,
    `Best execution moment: ${c.bestMoment}`,
    `Repeat: ${c.repeatThis}`,
    `Avoid: ${c.avoidThis}`,
    `Improvement / next focus: ${s.improvementPlan || c.nextSessionFocus || '—'}`,
    `Learning asset: ${s.learningExample ? exampleLabel(s.learningExampleKind) : 'No'}`,
  ];
  if (c.takeaways?.length) {
    lines.push('Takeaways:');
    c.takeaways.slice(0, 4).forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
  }
  lines.push('── end ──');
  return lines.join('\n');
}
