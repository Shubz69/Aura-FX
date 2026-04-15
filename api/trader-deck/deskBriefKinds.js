'use strict';

/**
 * Trader Desk automated market-brief categories (single source for generation + retrieval).
 * Order is stable and intentional — keep cron, backfill, and UI filters aligned.
 */

const DESK_AUTOMATION_CATEGORY_KINDS = Object.freeze([
  'stocks',
  'indices',
  'futures',
  'forex',
  'crypto',
  'commodities',
  'bonds',
  'etfs',
]);

const KIND_SET = new Set(DESK_AUTOMATION_CATEGORY_KINDS);

const INSTITUTIONAL_KINDS = Object.freeze({
  daily: 'aura_institutional_daily',
  weekly: 'aura_institutional_weekly',
});

function isDeskAutomationCategoryKind(k) {
  return KIND_SET.has(String(k || '').toLowerCase());
}

function isLegacyGeneralBriefKind(k) {
  return String(k || '').toLowerCase() === 'general';
}

function isInstitutionalBriefKind(k) {
  const u = String(k || '').toLowerCase();
  return u === INSTITUTIONAL_KINDS.daily || u === INSTITUTIONAL_KINDS.weekly;
}

function institutionalBriefKindForPeriod(period) {
  return period === 'weekly' ? INSTITUTIONAL_KINDS.weekly : INSTITUTIONAL_KINDS.daily;
}

/** Expected rows for a full intel pack: 8 sleeves + 1 institutional brief. */
function expectedIntelAutomationRowCount() {
  return DESK_AUTOMATION_CATEGORY_KINDS.length + 1;
}

module.exports = {
  DESK_AUTOMATION_CATEGORY_KINDS,
  INSTITUTIONAL_KINDS,
  isDeskAutomationCategoryKind,
  isLegacyGeneralBriefKind,
  isInstitutionalBriefKind,
  institutionalBriefKindForPeriod,
  expectedIntelAutomationRowCount,
};
