/**
 * Trader Replay tier helpers — align with SubscriptionContext (tier, accessType, isAdmin).
 * Degrades to FREE when data missing.
 */

/** @returns {'FREE'|'PREMIUM'|'ELITE'} */
export function getReplayTier({ tier, accessType, isAdmin } = {}) {
  if (isAdmin) return 'ELITE';
  const at = String(accessType || '');
  if (at === 'A7FX_ELITE_ACTIVE') return 'ELITE';
  if (at === 'AURA_FX_ACTIVE') return 'PREMIUM';
  const t = String(tier || 'FREE').toUpperCase();
  if (t === 'ELITE' || t === 'A7FX') return 'ELITE';
  if (t === 'PREMIUM') return 'PREMIUM';
  return 'FREE';
}

/**
 * Feature flags for UI gating — keep core trade replay usable on FREE.
 * @param {string} replayTier from getReplayTier
 */
export function getReplayFeatureFlags(replayTier) {
  const rt = replayTier || 'FREE';
  return {
    tradeLibraryCore: true,
    dayReplay: true,
    /** Full scenario picker + ranked drills */
    scenarioReplay: rt !== 'FREE',
    /** Extra scenario categories / copy treated as Elite */
    scenarioElitePositioning: rt === 'ELITE',
    learningExamples: rt !== 'FREE',
    libraryAdvancedFilters: rt !== 'FREE',
    libraryPremiumSorts: rt !== 'FREE',
    habitStrip: rt !== 'FREE',
    /** Extra score reasons on rail/modal */
    coachingSignalDepth: rt === 'ELITE' ? 3 : rt === 'PREMIUM' ? 2 : 1,
    mentorSummaryCopy: rt !== 'FREE',
    mentorFullLayout: rt === 'ELITE',
    followUpExpanded: rt !== 'FREE',
  };
}

export const CHOOSE_PLAN_PATH = '/choose-plan';

/** @param {string|null|undefined} kind */
export function formatLearningExampleLabel(learningExample, kind) {
  if (!learningExample) return '';
  if (kind === 'model') return 'Model example';
  if (kind === 'caution') return 'Caution example';
  return 'Learning example';
}
