import { normalizeReplay } from './replayNormalizer';
import { mergeReplayDestination, buildDefaultReturnToReplayPath } from './replayToolHandoff';
import { deriveCoaching } from './replayCoachingEngine';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { rankSessionsForScenario } from './replayScenarioEngine';

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

const handoffOpts = (session, extra = {}) => ({
  returnPath: buildDefaultReturnToReplayPath(session),
  ...extra,
});

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
  const lek = s.learningExampleKind;

  const checklistTo = mergeReplayDestination(
    '/trader-deck/trade-validator/checklist',
    s,
    coaching,
    handoffOpts(s, { destination: 'checklist' })
  );
  const journalTo = mergeReplayDestination(
    '/journal',
    s,
    coaching,
    handoffOpts(s, { destination: 'journal' })
  );
  const deckJournalTo = mergeReplayDestination(
    '/trader-deck/trade-validator/journal',
    s,
    coaching,
    handoffOpts(s)
  );
  const validatorTo = mergeReplayDestination(
    '/trader-deck/trade-validator/overview',
    s,
    coaching,
    handoffOpts(s)
  );
  const playbookTo = mergeReplayDestination(
    '/trader-deck/trade-validator/trader-playbook',
    s,
    coaching,
    handoffOpts(s, { destination: 'playbook', openReviewTab: lek === 'model' || missed >= 0.35 })
  );

  if (lek === 'caution') {
    out.push({
      key: 'journal-caution',
      label: 'Journal · corrective reflection',
      to: journalTo,
      reason: 'Caution tape — capture what to avoid next session.',
    });
    out.push({
      key: 'validator-caution',
      label: 'The Operator · rules check',
      to: validatorTo,
      reason: 'Stress-test entries against your checklist before repeating the pattern.',
    });
  }

  if (lek === 'model') {
    out.push({
      key: 'playbook-model',
      label: 'Playbook · repeat this edge',
      to: playbookTo,
      reason: 'Model tape — codify the repeatable behaviour in Refine.',
    });
    out.push({
      key: 'checklist-model',
      label: 'Review checklist before next session',
      to: checklistTo,
      reason: 'Benchmark process — align the live checklist with this tape.',
    });
  }

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
      label: 'The Operator',
      to: validatorTo,
      reason: 'Stress-test the next setup against your rules.',
    });
  }

  if (missed >= 0.4) {
    out.push({
      key: 'playbook-mgmt',
      label: 'Playbook · management',
      to: mergeReplayDestination(
        '/trader-deck/trade-validator/trader-playbook',
        s,
        coaching,
        handoffOpts(s, { destination: 'playbook', openReviewTab: true })
      ),
      reason: 'High missed R — codify partials and runner policy.',
    });
  }

  out.push({
    key: 'checklist',
    label: 'Follow-up checklist',
    to: checklistTo,
    reason: 'Turn one behaviour into a next-session checklist item.',
  });

  out.push({
    key: 'trade-journal',
    label: 'Trade Journal (validator)',
    to: deckJournalTo,
    reason: 'Filter or log trades alongside this replay context.',
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
  return out
    .filter((a) => {
      if (seen.has(a.key)) return false;
      seen.add(a.key);
      return true;
    })
    .slice(0, 7);
}
