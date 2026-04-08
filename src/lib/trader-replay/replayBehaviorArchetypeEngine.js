/**
 * Evidence-bounded replay behavior “archetypes” — soft descriptors composed from identity + contribution.
 * Not a personality system; deterministic thresholds; degrades on thin history.
 *
 * Thresholds (see code):
 * - `visible` UI strip: ≥2 completed replays.
 * - Soft archetype chip (`showArchetypeLabel`): ≥3 completed, confidence ≠ insufficient, primary score ≥30.
 * - `archetypeConfidence`: insufficient below MIN_WEAK sessions; emerging below MIN_STRONG; moderate default; strong if established theme or n≥12.
 * - Primary/secondary archetypes: scored from bucket themes, extractReplayIdentitySignals means, contribution trends, vault counts, identity contradictions.
 */
import { normalizeReplay } from './replayNormalizer';
import { REPLAY_STATUSES } from './replayDefaults';
import { computeReplayHabitStats } from './replayHabit';
import {
  filterCompletedSessions,
  aggregateReplayPatterns,
  extractReplayIdentitySignals,
  buildReplayIdentitySummary,
  REPLAY_IDENTITY_MIN_WEAK,
  REPLAY_IDENTITY_MIN_STRONG,
} from './replayIdentityEngine';
import { buildReplayContributionProfile } from './replayContributionEngine';

/** Bucket ids from replayIdentityEngine → higher-level review groups (no duplicate categories). */
const BUCKET_TO_GROUP = {
  late_entry: { id: 'entry_timing', label: 'Entry timing discipline' },
  exit_management: { id: 'exit_management', label: 'Exit & management patience' },
  risk_definition: { id: 'risk_definition', label: 'Risk definition & sizing' },
  discipline_emotion: { id: 'emotional_control', label: 'Emotional control & rules' },
  structure_read: { id: 'structure_reading', label: 'Structure & context reading' },
  other: { id: 'mixed', label: 'Mixed / uncategorised themes' },
};

const ARCHETYPE_CATALOG = {
  patient_confirmer: {
    id: 'patient_confirmer',
    label: 'Patient confirmer',
    description: 'Replay self-ratings skew patient with calmer entries versus chase-heavy language.',
  },
  impulsive_chaser: {
    id: 'impulsive_chaser',
    label: 'Impulsive chaser',
    description: 'Repeated late/chase language or weak entry timing in reviews.',
  },
  early_protector: {
    id: 'early_protector',
    label: 'Early protector',
    description: 'Exit / missed-R themes show up more than entry themes.',
  },
  review_heavy_execution_soft: {
    id: 'review_heavy_execution_soft',
    label: 'Review-strong, execution-soft',
    description: 'Review depth runs ahead of execution scores — insight without consistent follow-through.',
  },
  disciplined_reviewer_loose_manager: {
    id: 'disciplined_reviewer_loose_manager',
    label: 'Disciplined reviewer, loose manager',
    description: 'Reviews are thorough; management / exit signals still slip in the tape.',
  },
  repeatable_model_builder: {
    id: 'repeatable_model_builder',
    label: 'Repeatable model builder',
    description: 'Multiple model examples — process is being archived.',
  },
  caution_heavy_improving: {
    id: 'caution_heavy_improving',
    label: 'Caution-heavy, improving',
    description: 'Several caution examples with discipline trend not worsening.',
  },
  controlled_leakage: {
    id: 'controlled_leakage',
    label: 'Controlled but opportunity-leaking',
    description: 'Execution reads controlled; missed-R / exit leakage still costs.',
  },
};

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function meanSignals(completed) {
  if (!completed.length) return null;
  let late = 0;
  let earlyExit = 0;
  let miss = 0;
  for (const s of completed) {
    const sig = extractReplayIdentitySignals(s);
    late += sig.lateEntryTendency;
    earlyExit += sig.earlyExitTendency;
    miss += sig.missedOpportunityTendency;
  }
  const n = completed.length;
  return {
    lateEntryTendency: late / n,
    earlyExitTendency: earlyExit / n,
    missedOpportunityTendency: miss / n,
  };
}

/**
 * Collapse mistake histogram into grouped, sorted lines for UI.
 */
export function buildReplayPatternGroups(mistakeHistogram = []) {
  const byGroup = new Map();
  for (const row of mistakeHistogram) {
    const bid = row.bucket === 'other' ? 'other' : row.bucket;
    const map = BUCKET_TO_GROUP[bid] || BUCKET_TO_GROUP.other;
    const prev = byGroup.get(map.id) || { ...map, count: 0, buckets: [] };
    prev.count += row.count;
    if (!prev.buckets.includes(row.label)) prev.buckets.push(row.label);
    byGroup.set(map.id, prev);
  }
  return [...byGroup.values()].sort((a, b) => b.count - a.count);
}

/**
 * @returns {'insufficient_evidence'|'emerging'|'moderate'|'strong'}
 */
function resolveArchetypeConfidence(n, signalStrength, themeLevel) {
  if (n < REPLAY_IDENTITY_MIN_WEAK) return 'insufficient_evidence';
  if (n < REPLAY_IDENTITY_MIN_STRONG) return 'emerging';
  if (themeLevel === 'established' || n >= 12) return 'strong';
  if (signalStrength === 'strong' || signalStrength === 'moderate') return 'moderate';
  return 'moderate';
}

function pickTopTwo(scores, minPrimary = 28, gapSecondary = 8) {
  const entries = Object.entries(scores)
    .filter(([, v]) => v >= minPrimary)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { primary: null, secondary: null, primaryScore: 0 };
  const [pId, pScore] = entries[0];
  const sec = entries[1] && pScore - entries[1][1] <= gapSecondary + 12 ? entries[1][0] : null;
  return { primary: pId, secondary: sec, primaryScore: pScore };
}

function scoreArchetypes(completed, patterns, meanSig, contrib, contradictions) {
  const n = completed.length;
  const avgPat = mean(completed.map((s) => Number(s.patience) || 0)) ?? 0;
  const avgEntry = mean(completed.map((s) => Number(s.entryTiming) || 0)) ?? 0;
  const avgDisc = mean(completed.map((s) => Number(s.discipline) || 0)) ?? 0;
  const avgQ = mean(completed.map((s) => extractReplayIdentitySignals(s).replayQualityScore)) ?? 0;
  const avgRv = mean(completed.map((s) => extractReplayIdentitySignals(s).reviewThoroughness)) ?? 0;

  const theme = patterns.recurringMistakeTheme;
  const trend = contrib.discipline?.replayDisciplineTrend;
  const models = patterns.modelExampleCount ?? 0;
  const cautions = patterns.cautionExampleCount ?? 0;

  const scores = {
    patient_confirmer: 0,
    impulsive_chaser: 0,
    early_protector: 0,
    review_heavy_execution_soft: 0,
    disciplined_reviewer_loose_manager: 0,
    repeatable_model_builder: 0,
    caution_heavy_improving: 0,
    controlled_leakage: 0,
  };

  if (meanSig) {
    if (avgPat >= 6 && avgEntry >= 6 && meanSig.lateEntryTendency < 0.48 && theme?.bucket !== 'late_entry') {
      scores.patient_confirmer = 32 + Math.min(28, avgPat * 3) + (theme?.bucket === 'structure_read' ? 8 : 0);
    }
    if (theme?.bucket === 'late_entry') scores.impulsive_chaser += 38;
    scores.impulsive_chaser += meanSig.lateEntryTendency * 42;
    if (avgEntry <= 5.2) scores.impulsive_chaser += 14;

    if (theme?.bucket === 'exit_management') scores.early_protector += 36;
    scores.early_protector += meanSig.earlyExitTendency * 38 + meanSig.missedOpportunityTendency * 22;

    if (contradictions.reflectionStrongMetricsSoft || (avgRv >= 0.58 && avgQ < 0.48 && n >= REPLAY_IDENTITY_MIN_WEAK)) {
      scores.review_heavy_execution_soft += 40;
    }

    if (avgRv >= 0.55 && (theme?.bucket === 'exit_management' || meanSig.earlyExitTendency > 0.42)) {
      scores.disciplined_reviewer_loose_manager += 36;
    }

    if (models >= 2) scores.repeatable_model_builder += 30 + Math.min(22, models * 4);
    if (cautions >= 2 && trend !== 'slipping') scores.caution_heavy_improving += 28 + Math.min(18, cautions * 3);
    if (avgDisc >= 5.8 && meanSig.missedOpportunityTendency > 0.38) {
      scores.controlled_leakage += 26 + meanSig.missedOpportunityTendency * 28;
    }
  }

  return scores;
}

function correctionStyleLine(patterns, groups, contrib) {
  const theme = patterns.recurringMistakeTheme;
  if (theme?.label) {
    return `Correction pressure clusters around ${theme.label.toLowerCase()} in your mistake text.`;
  }
  if (groups[0]) {
    return `Most replay friction sits under “${groups[0].label}”.`;
  }
  const c0 = contrib.behavior?.cautions?.[0];
  if (c0) return `Behaviour cautions point to: ${c0}`;
  return 'Keep tagging mistakes with concrete wording so corrections stay visible in review.';
}

function strengthStyleLine(patterns, contrib) {
  if (patterns.recurringStrengthTheme?.detail) {
    return patterns.recurringStrengthTheme.detail;
  }
  if (patterns.modelExampleCount >= 1) {
    return `You’re archiving repeatable process (${patterns.modelExampleCount} model example${patterns.modelExampleCount === 1 ? '' : 's'}).`;
  }
  const s0 = contrib.behavior?.strengths?.[0];
  if (s0) return `Strength signal: ${s0}`;
  return 'Complete a few more honest reviews so strengths can separate from noise.';
}

function psychologyPatternLine(theme, groups, meanSig, contrib, primaryId, conf) {
  if (conf === 'insufficient_evidence') {
    return 'Replay evidence is still thin — log a few more completed reviews before leaning on behaviour labels.';
  }
  if (primaryId && ARCHETYPE_CATALOG[primaryId]) {
    const soft = ARCHETYPE_CATALOG[primaryId].description;
    return `Recent replays suggest ${soft.charAt(0).toLowerCase()}${soft.slice(1)}`;
  }
  if (theme?.label) {
    return `Replay reviews keep pointing to ${theme.label.toLowerCase()} in mistake fields.`;
  }
  if (meanSig && meanSig.lateEntryTendency > 0.5) {
    return 'Session signals lean toward late-entry pressure versus ideal timing.';
  }
  if (groups[0]) {
    return `Pattern grouping centres on ${groups[0].label.toLowerCase()}.`;
  }
  const exp = contrib.scoreContributionExplanations?.[0];
  if (exp) return exp;
  return 'Keep reviews consistent so behaviour patterns can stabilise.';
}

/**
 * @param {object[]} sessions
 * @param {object|null} habitStats
 * @param {object|null} profile — optional buildReplayContributionProfile (avoids duplicate work if caller has it)
 */
export function buildReplayBehaviorArchetypeProfile(sessions = [], habitStats = null, profile = null) {
  const normalized = (sessions || []).map((s) => normalizeReplay(s));
  const completed = filterCompletedSessions(normalized);
  const n = completed.length;
  const h = habitStats ?? computeReplayHabitStats(normalized);
  const contrib = profile ?? buildReplayContributionProfile(normalized, h);
  const patterns = aggregateReplayPatterns(normalized);
  const identity = buildReplayIdentitySummary(normalized);
  const meanSig = meanSignals(completed);
  const groups = buildReplayPatternGroups(patterns.mistakeHistogram || []);
  const contradictions = identity.evidence?.contradictionFlags || {};

  const scores = scoreArchetypes(completed, patterns, meanSig, contrib, contradictions);
  const { primary, secondary, primaryScore } = pickTopTwo(scores, 26, 10);

  const themeLevel = patterns.recurringMistakeTheme?.level || null;
  const conf = resolveArchetypeConfidence(
    n,
    identity.evidence?.signalStrength || 'insufficient',
    themeLevel
  );

  const showArchetypeLabel =
    conf !== 'insufficient_evidence' && primary && primaryScore >= 30 && n >= REPLAY_IDENTITY_MIN_WEAK;

  const reasons = [];
  if (patterns.recurringMistakeTheme) {
    reasons.push(`Mistake theme: ${patterns.recurringMistakeTheme.label} (${patterns.recurringMistakeTheme.count}×).`);
  }
  if (meanSig && meanSig.lateEntryTendency >= 0.45) {
    reasons.push('Late-entry tendency reads elevated across saved session signals.');
  }
  if (meanSig && meanSig.earlyExitTendency >= 0.42) {
    reasons.push('Exit / missed-R signals show up in session extracts.');
  }
  if (patterns.modelExampleCount >= 2) {
    reasons.push(`${patterns.modelExampleCount} model examples in the vault.`);
  }
  if (contrib.discipline?.replayDisciplineTrend === 'improving') {
    reasons.push('Replay discipline trend vs prior week: improving.');
  }
  if (contradictions.reflectionStrongMetricsSoft) {
    reasons.push('Review text depth runs ahead of execution scores in the sample.');
  }

  const correctionStyle = correctionStyleLine(patterns, groups, contrib);
  const strengthStyle = strengthStyleLine(patterns, contrib);
  const patternLine = psychologyPatternLine(
    patterns.recurringMistakeTheme,
    groups,
    meanSig,
    contrib,
    showArchetypeLabel ? primary : null,
    conf
  );

  return {
    kind: 'aura.replayBehaviorArchetype.v1',
    generatedAt: new Date().toISOString(),
    evidence: {
      completedCount: n,
      minSessionsForLabel: REPLAY_IDENTITY_MIN_WEAK,
      signalStrength: identity.evidence?.signalStrength || 'none',
    },
    primaryReplayArchetype: showArchetypeLabel && primary ? { id: primary, ...ARCHETYPE_CATALOG[primary] } : null,
    secondaryReplayArchetype:
      showArchetypeLabel && secondary && ARCHETYPE_CATALOG[secondary]
        ? { id: secondary, ...ARCHETYPE_CATALOG[secondary] }
        : null,
    archetypeConfidence: conf,
    archetypeReasons: reasons.slice(0, 4),
    correctionStyle,
    strengthStyle,
    patternGroups: groups,
    psychologyLines: {
      patternLine,
      correctionLine: correctionStyle,
      strengthLine: strengthStyle,
    },
    /** UI: show soft archetype chips */
    showArchetypeLabel,
    /** At least show pattern line when 2+ completes */
    visible: n >= 2,
  };
}
