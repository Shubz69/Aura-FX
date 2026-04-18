'use strict';

/**
 * Trader Desk automated market briefs — exactly eight canonical categories (daily + weekly).
 * Stored `brief_kind` uses aura_institutional_daily_* / aura_institutional_weekly_* prefixes.
 */

/** Canonical sleeve keys (order fixed): same instruments/scoring domains for daily and weekly. */
const DESK_AUTOMATION_CATEGORY_KINDS = Object.freeze([
  'forex',
  'crypto',
  'commodities',
  'etfs',
  'stocks',
  'indices',
  'bonds',
  'futures',
]);

const KIND_SET = new Set(DESK_AUTOMATION_CATEGORY_KINDS);

/** Display names for UI / PDF headers. */
const DESK_CATEGORY_DISPLAY_NAME = Object.freeze({
  forex: 'Forex',
  crypto: 'Crypto',
  commodities: 'Commodities',
  etfs: 'ETFs',
  stocks: 'Stocks',
  indices: 'Indices',
  bonds: 'Bonds',
  futures: 'Futures',
});

/** Legacy DB `brief_kind` → canonical sleeve key (retrieval / migration). */
const LEGACY_DESK_KIND_MAP = Object.freeze({
  global_macro: 'indices',
  equities: 'stocks',
  geopolitics: 'commodities',
  market_sentiment: 'etfs',
  fixed_income: 'bonds',
  stocks: 'stocks',
  indices: 'indices',
  futures: 'futures',
  bonds: 'bonds',
  etfs: 'etfs',
  commodities: 'commodities',
  forex: 'forex',
  crypto: 'crypto',
  aura_institutional_daily_equities: 'etfs',
  aura_institutional_weekly_equities: 'etfs',
  aura_institutional_daily_fixed_income: 'bonds',
  aura_institutional_weekly_fixed_income: 'bonds',
});

const INSTITUTIONAL_KINDS = Object.freeze({
  daily: 'aura_institutional_daily',
  weekly: 'aura_institutional_weekly',
});

const INSTITUTIONAL_WEEKLY_WFA_KINDS = Object.freeze([
  'aura_institutional_weekly_forex',
  'aura_institutional_weekly_crypto',
  'aura_institutional_weekly_commodities',
  'aura_institutional_weekly_etfs',
  'aura_institutional_weekly_stocks',
  'aura_institutional_weekly_indices',
  'aura_institutional_weekly_bonds',
  'aura_institutional_weekly_futures',
]);

const INSTITUTIONAL_DAILY_WFA_KINDS = Object.freeze([
  'aura_institutional_daily_forex',
  'aura_institutional_daily_crypto',
  'aura_institutional_daily_commodities',
  'aura_institutional_daily_etfs',
  'aura_institutional_daily_stocks',
  'aura_institutional_daily_indices',
  'aura_institutional_daily_bonds',
  'aura_institutional_daily_futures',
]);

/** Legacy kinds no longer generated — purge when backfilling (non-exhaustive; scripts may widen).
 * Do not include bare sleeve names (forex, stocks, …) — those could match unrelated rows. */
const LEGACY_INTEL_BRIEF_KINDS = Object.freeze(
  new Set([
    'global_macro',
    'equities',
    'geopolitics',
    'market_sentiment',
    'general',
    'fixed_income',
    'aura_institutional_daily_equities',
    'aura_institutional_daily_fixed_income',
    'aura_institutional_weekly_equities',
    'aura_institutional_weekly_fixed_income',
    'aura_institutional_daily',
    'aura_institutional_weekly',
  ])
);

function isDeskAutomationCategoryKind(k) {
  return KIND_SET.has(String(k || '').toLowerCase());
}

function isLegacyGeneralBriefKind(k) {
  return String(k || '').toLowerCase() === 'general';
}

function isInstitutionalWeeklyWfaKind(k) {
  return INSTITUTIONAL_WEEKLY_WFA_KINDS.includes(String(k || '').toLowerCase());
}

function isInstitutionalDailyWfaKind(k) {
  return INSTITUTIONAL_DAILY_WFA_KINDS.includes(String(k || '').toLowerCase());
}

function isInstitutionalBriefKind(k) {
  const u = String(k || '').toLowerCase();
  return (
    u === INSTITUTIONAL_KINDS.daily ||
    u === INSTITUTIONAL_KINDS.weekly ||
    u === 'aura_sunday_market_open' ||
    isInstitutionalWeeklyWfaKind(u) ||
    isInstitutionalDailyWfaKind(u)
  );
}

function institutionalBriefKindForPeriod(period) {
  return period === 'weekly' ? INSTITUTIONAL_KINDS.weekly : INSTITUTIONAL_KINDS.daily;
}

function institutionalWeeklyWfaKinds() {
  return [...INSTITUTIONAL_WEEKLY_WFA_KINDS];
}

function canonicalDeskCategoryKind(k) {
  const raw = String(k || '').toLowerCase().trim();
  if (!raw) return raw;
  if (LEGACY_DESK_KIND_MAP[raw]) return LEGACY_DESK_KIND_MAP[raw];
  const inst = raw.match(/^aura_institutional_(?:daily|weekly)_(.+)$/);
  if (inst && KIND_SET.has(inst[1])) return inst[1];
  return raw;
}

function deskCategoryDisplayName(canonicalKind) {
  const c = String(canonicalKind || '').toLowerCase();
  return DESK_CATEGORY_DISPLAY_NAME[c] || canonicalKind;
}

function legacyAliasesForCanonical(canonicalKind) {
  const c = String(canonicalKind || '').toLowerCase();
  const aliases = [c];
  for (const [legacy, canon] of Object.entries(LEGACY_DESK_KIND_MAP)) {
    if (canon === c) aliases.push(legacy);
  }
  return [...new Set(aliases)];
}

/** Expected automated intel rows per desk date: eight category briefs only (daily or weekly period). */
function expectedIntelAutomationRowCount(period = 'daily') {
  void period;
  return DESK_AUTOMATION_CATEGORY_KINDS.length;
}

function institutionalDailyWfaKinds() {
  return [...INSTITUTIONAL_DAILY_WFA_KINDS];
}

module.exports = {
  DESK_AUTOMATION_CATEGORY_KINDS,
  DESK_CATEGORY_DISPLAY_NAME,
  LEGACY_DESK_KIND_MAP,
  LEGACY_INTEL_BRIEF_KINDS,
  INSTITUTIONAL_KINDS,
  INSTITUTIONAL_WEEKLY_WFA_KINDS,
  INSTITUTIONAL_DAILY_WFA_KINDS,
  isDeskAutomationCategoryKind,
  isInstitutionalWeeklyWfaKind,
  isInstitutionalDailyWfaKind,
  isLegacyGeneralBriefKind,
  isInstitutionalBriefKind,
  institutionalBriefKindForPeriod,
  institutionalWeeklyWfaKinds,
  institutionalDailyWfaKinds,
  canonicalDeskCategoryKind,
  deskCategoryDisplayName,
  legacyAliasesForCanonical,
  expectedIntelAutomationRowCount,
};
