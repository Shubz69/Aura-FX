import { normalizeReplay } from './replayNormalizer';
import { computeReplayQualityScore, computeReviewCompletenessScore } from './replayScoreEngine';
import { mergeReplayDestination, buildDefaultReturnToReplayPath } from './replayToolHandoff';

export {
  mergeReplayDestination,
  buildReplayIntegrationParams,
  buildCompactReplaySummary,
  inferValidatorChecklistTab,
  buildJournalDraftFromSearchParams,
  buildPlaybookReviewPrefillFromSearchParams,
  stripReplayHandoffParams,
  readReplayDateFromWindow,
  TR_HANDOFF,
} from './replayToolHandoff';

function firstSentence(text, max = 220) {
  const t = String(text || '').trim();
  if (!t) return '';
  const cut = t.split(/[.!?]\s/)[0] || t;
  return cut.length > max ? `${cut.slice(0, max)}…` : cut;
}

/**
 * Deterministic coaching package from stored replay fields (no LLM).
 * @returns {object}
 */
export function deriveCoaching(session) {
  const s = normalizeReplay(session);
  const verdictS = String(s.verdict || '').slice(0, 400);
  const insightS = String(s.insight || '').slice(0, 400);
  const lessonS = String(s.lessonSummary || '').trim();
  const saw = String(s.whatISaw || '').trim();
  const missed = String(s.whatIMissed || '').trim();
  const emotion = String(s.emotionalState || '').trim();
  const rule = String(s.ruleFollowed || '').trim();
  const plan = String(s.improvementPlan || '').trim();

  const mainLesson =
    lessonS ||
    firstSentence(insightS) ||
    firstSentence(verdictS) ||
    (s.keyDrivers ? firstSentence(s.keyDrivers, 180) : '') ||
    '';

  const biggestMistake =
    String(s.reviewBiggestMistake || '').trim() ||
    missed ||
    (/broke|broken|late|chase|revenge|fomo/i.test(verdictS) ? firstSentence(verdictS, 160) : '') ||
    '';

  const bestMoment =
    String(s.reviewBestMoment || '').trim() ||
    saw ||
    (s.outcome && /win/i.test(String(s.outcome)) ? `Clean outcome recorded: ${s.outcome}` : '');

  const entryN = Number(s.entryTiming) || 0;
  const discN = Number(s.discipline) || 0;
  const repeatThis =
    discN >= 7 && entryN >= 6
      ? 'Process discipline and timing you logged here — replicate the pre-trade checklist.'
      : entryN >= 7
        ? 'Patience at entry — keep waiting for the same quality of confirmation.'
        : insightS
          ? firstSentence(insightS, 140)
          : 'Anchor one repeatable behavior from this replay (e.g. wait for reclaim close).';

  const avoidThis =
    biggestMistake
      ? `Avoid repeating: ${firstSentence(biggestMistake, 120)}`
      : entryN <= 4
        ? 'Chasing or early triggers without your full confirmation stack.'
        : missed
          ? firstSentence(missed, 120)
          : 'Undefined risk or vague invalidation — tighten before size.';

  const nextSessionFocus =
    plan ||
    (discN <= 5 ? 'Session focus: execution discipline and rule adherence.' : '') ||
    (parseFloat(String(s.missedR || '').replace(/[^\d.-]/g, '')) >= 0.5
      ? 'Session focus: exit management and partial profit policy.'
      : '') ||
    'Session focus: one structural behavior from this verdict.';

  const disciplineNote =
    emotion || rule
      ? `${rule ? `Rules: ${firstSentence(rule, 100)}` : ''}${emotion ? ` · Headspace: ${firstSentence(emotion, 80)}` : ''}`.trim()
      : discN <= 5
        ? 'Self-rated discipline is soft — tie actions to playbook checkpoints next session.'
        : '';

  const riskNote =
    s.stop && s.target
      ? `Risk defined at ${s.stop} / ${s.target} — replay whether size matched that framework.`
      : 'No clean stop/target on record — define invalidation before the next live trade.';

  const executionNote =
    `Entry ${entryN}/10 · Discipline ${discN}/10 · Patience ${Number(s.patience) || 0}/10. ` +
    (verdictS ? firstSentence(verdictS, 120) : 'Log a sharper verdict next time to tighten feedback.');

  const takeaways = [];
  if (mainLesson) takeaways.push(mainLesson);
  if (biggestMistake) takeaways.push(`Risk to fix: ${firstSentence(biggestMistake, 100)}`);
  if (bestMoment) takeaways.push(`Signal to repeat: ${firstSentence(bestMoment, 100)}`);
  if (plan) takeaways.push(`Next: ${firstSentence(plan, 100)}`);
  const unique = [...new Set(takeaways.map((t) => t.trim()).filter(Boolean))].slice(0, 4);

  return {
    mainLesson: mainLesson || '—',
    biggestMistake: biggestMistake || '—',
    bestMoment: bestMoment || '—',
    repeatThis,
    avoidThis,
    nextSessionFocus,
    disciplineNote,
    riskNote,
    executionNote,
    takeaways: unique.length ? unique : ['Capture lesson + one improvement to activate this replay.'],
  };
}

/**
 * @returns {{ label: string, href: string, reason: string }}
 */
export function deriveSuggestedNextAction(session) {
  const s = normalizeReplay(session);
  const { score: rq } = computeReplayQualityScore(s);
  const { score: cq, missingHints } = computeReviewCompletenessScore(s);
  const coaching = deriveCoaching(s);
  const disc = Number(s.discipline) || 0;
  const missed = parseFloat(String(s.missedR || '').replace(/[^\d.-]/g, '')) || 0;

  if (cq < 42) {
    return {
      label: 'Complete review checklist',
      href: mergeReplayDestination('/trader-deck/trade-validator/checklist', s, coaching, {
        destination: 'checklist',
        returnPath: buildDefaultReturnToReplayPath(s),
      }),
      reason: missingHints[0] || 'Reflection fields will compound value from this replay.',
    };
  }

  if (disc <= 4 || /revenge|bored|fomo/i.test(`${s.emotionalState} ${s.verdict}`)) {
    return {
      label: 'Journal · discipline reflection',
      href: mergeReplayDestination('/journal', s, coaching, {
        destination: 'journal',
        returnPath: buildDefaultReturnToReplayPath(s),
      }),
      reason: 'Discipline or emotional tells flagged — log context while it is fresh.',
    };
  }

  if (rq < 45 || Number(s.entryTiming) <= 4) {
    return {
      label: 'Trade Validator · setup check',
      href: mergeReplayDestination('/trader-deck/trade-validator/overview', s, coaching, {
        returnPath: buildDefaultReturnToReplayPath(s),
      }),
      reason: 'Execution read is weak — stress-test the next setup in Validator.',
    };
  }

  if (missed >= 0.45) {
    return {
      label: 'Playbook · management rules',
      href: mergeReplayDestination('/trader-deck/trade-validator/trader-playbook', s, coaching, {
        destination: 'playbook',
        openReviewTab: true,
        returnPath: buildDefaultReturnToReplayPath(s),
      }),
      reason: 'High missed R — tighten management / scale-out language in Playbook.',
    };
  }

  if (rq >= 68 && cq >= 55) {
    return {
      label: 'Save as learning example',
      href: mergeReplayDestination('/trader-deck/trade-validator/trader-playbook', s, coaching, {
        destination: 'playbook',
        openReviewTab: true,
        returnPath: buildDefaultReturnToReplayPath(s),
      }),
      reason: 'Strong replay arc — pin this as a reference case in Playbook.',
    };
  }

  return {
    label: 'Open Journal with lesson',
    href: mergeReplayDestination('/journal', s, coaching, {
      destination: 'journal',
      returnPath: buildDefaultReturnToReplayPath(s),
    }),
    reason: coaching.mainLesson !== '—' ? firstSentence(coaching.mainLesson, 120) : 'Solid review — archive the takeaway in Journal.',
  };
}
