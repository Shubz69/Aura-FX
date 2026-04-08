/**
 * Trader Replay tier helpers — align with SubscriptionContext (tier, accessType, isAdmin).
 * Degrades to ACCESS when data missing.
 */

/** @returns {'ACCESS'|'PRO'|'ELITE'} */
export function getReplayTier({ tier, accessType, isAdmin } = {}) {
  if (isAdmin) return 'ELITE';
  const at = String(accessType || '');
  if (at === 'ELITE_ACTIVE' || at === 'A7FX_ELITE_ACTIVE') return 'ELITE';
  if (at === 'PRO_ACTIVE' || at === 'AURA_FX_ACTIVE') return 'PRO';
  const t = String(tier || 'ACCESS').toUpperCase();
  if (t === 'ELITE' || t === 'A7FX') return 'ELITE';
  if (t === 'PRO' || t === 'PREMIUM') return 'PRO';
  if (t === 'FREE') return 'ACCESS';
  return 'ACCESS';
}

/**
 * Feature flags for UI gating — keep core trade replay usable on ACCESS.
 * @param {string} replayTier from getReplayTier
 */
export function getReplayFeatureFlags(replayTier) {
  const rt = replayTier || 'ACCESS';
  const isPaid = rt !== 'ACCESS';
  return {
    tradeLibraryCore: true,
    dayReplay: true,
    /** Full scenario picker + ranked drills */
    scenarioReplay: isPaid,
    /** Extra scenario categories / copy treated as Elite */
    scenarioElitePositioning: rt === 'ELITE',
    learningExamples: isPaid,
    libraryAdvancedFilters: isPaid,
    libraryPremiumSorts: isPaid,
    habitStrip: isPaid,
    /** Extra score reasons on rail/modal */
    coachingSignalDepth: rt === 'ELITE' ? 3 : rt === 'PRO' ? 2 : 1,
    mentorSummaryCopy: isPaid,
    mentorFullLayout: rt === 'ELITE',
    followUpExpanded: isPaid,
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
