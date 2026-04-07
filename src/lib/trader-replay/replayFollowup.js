import { normalizeReplay } from './replayNormalizer';
import { mergeReplayDestination, deriveCoaching } from './replayCoachingEngine';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { rankSessionsForScenario } from './replayScenarioEngine';

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Actionable follow-ups after a replay (links are path+search strings).
 * @returns {{ key: string, label: string, to: string, reason: string }[]}
 */
export function buildFollowUpActions(session, allSessions = []) {
  const s = normalizeReplay(session);
  const coaching = deriveCoaching(s);
  const rq = computeReplayQualityScore(s);
  const cq = computeReviewCompletenessScore(s);
  const missed = parseR(s.missedR) ?? 0;
  const disc = Number(s.discipline) || 0;
  const out = [];

  const checklistTo = mergeReplayDestination('/trader-deck/trade-validator/checklist', s, coaching);
  const journalTo = mergeReplayDestination('/trader-deck/trade-validator/journal', s, coaching);
  const validatorTo = mergeReplayDestination('/trader-deck/trade-validator/overview', s, coaching);
  const playbookTo = mergeReplayDestination('/trader-deck/trade-validator/trader-playbook', s, coaching);

  if (disc <= 5 || /revenge|bored|fomo/i.test(`${s.emotionalState} ${s.verdict}`)) {
    out.push({
      key: 'journal',
      label: 'Journal · discipline',
      to: journalTo,
      reason: 'Discipline or emotional tells need a written anchor.',
    });
  }

  if (rq.score < 48) {
    out.push({
      key: 'validator',
      label: 'Trade Validator',
      to: validatorTo,
      reason: 'Stress-test the next setup against your rules.',
    });
  }

  if (missed >= 0.4) {
    out.push({
      key: 'playbook-mgmt',
      label: 'Playbook · management',
      to: playbookTo,
      reason: 'High missed R — codify partials and runner policy.',
    });
  }

  out.push({
    key: 'checklist',
    label: 'Follow-up checklist',
    to: checklistTo,
    reason: 'Turn one behaviour into a next-session checklist item.',
  });

  if (rq.score >= 62 && cq.score >= 55 && !s.learningExample) {
    out.push({
      key: 'pin-model',
      label: 'Pin as model example',
      to: '/aura-analysis/dashboard/trader-replay#aura-tr-learning-asset',
      reason: 'Clean process on record — save it as a reference case.',
    });
  }

  if (missed >= 0.35 && allSessions.length > 1) {
    const ranked = rankSessionsForScenario(allSessions, 'high_missed_r');
    const other = ranked.find((row) => row.session.id && row.session.id !== s.id);
    if (other?.session?.id) {
      out.push({
        key: 'similar-missed',
        label: 'Open similar missed-R case',
        to: `/aura-analysis/dashboard/trader-replay?open=${encodeURIComponent(other.session.id)}`,
        reason: 'Compare management patterns across high leave-behind trades.',
      });
    }
  }

  const seen = new Set();
  return out.filter((a) => {
    if (seen.has(a.key)) return false;
    seen.add(a.key);
    return true;
  }).slice(0, 6);
}
