'use strict';

/**
 * Trader Desk automated market-brief categories (single source for generation + retrieval).
 * Order is fixed: 8 sleeves, same for daily and weekly.
 * Legacy DB `brief_kind` values map to these via `canonicalDeskCategoryKind`.
 */

const DESK_AUTOMATION_CATEGORY_KINDS = Object.freeze([
  'global_macro',
  'equities',
  'forex',
  'commodities',
  'fixed_income',
  'crypto',
  'geopolitics',
  'market_sentiment',
]);

const KIND_SET = new Set(DESK_AUTOMATION_CATEGORY_KINDS);

/** PDF-style labels (exact category names). */
const DESK_CATEGORY_DISPLAY_NAME = Object.freeze({
  global_macro: 'Global Macro',
  equities: 'Equities',
  forex: 'Forex',
  commodities: 'Commodities',
  fixed_income: 'Fixed Income',
  crypto: 'Crypto',
  geopolitics: 'Geopolitics',
  market_sentiment: 'Market Sentiment',
});

/** Prior automation slugs → canonical sleeve (stable narrative continuity). */
const LEGACY_DESK_KIND_MAP = Object.freeze({
  stocks: 'equities',
  indices: 'global_macro',
  futures: 'commodities',
  forex: 'forex',
  crypto: 'crypto',
  commodities: 'commodities',
  bonds: 'fixed_income',
  etfs: 'market_sentiment',
});

const INSTITUTIONAL_KINDS = Object.freeze({
  daily: 'aura_institutional_daily',
  weekly: 'aura_institutional_weekly',
});

/**
 * Weekly Fundamental Analysis (PDF): seven parallel institutional sleeves (no Global Macro).
 * Stored as distinct brief_kind rows for the same desk week date.
 */
const INSTITUTIONAL_WEEKLY_WFA_KINDS = Object.freeze([
  'aura_institutional_weekly_forex',
  'aura_institutional_weekly_crypto',
  'aura_institutional_weekly_commodities',
  'aura_institutional_weekly_fixed_income',
  'aura_institutional_weekly_equities',
  'aura_institutional_weekly_indices',
  'aura_institutional_weekly_stocks',
]);

/** Daily Brief PDF: seven parallel institutional sleeves (no Global Macro). Same category set as weekly WFA. */
const INSTITUTIONAL_DAILY_WFA_KINDS = Object.freeze([
  'aura_institutional_daily_forex',
  'aura_institutional_daily_crypto',
  'aura_institutional_daily_commodities',
  'aura_institutional_daily_fixed_income',
  'aura_institutional_daily_equities',
  'aura_institutional_daily_indices',
  'aura_institutional_daily_stocks',
]);

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

/** Institutional rows expected for a weekly desk date (seven parallel WFA briefs). */
function institutionalWeeklyWfaKinds() {
  return [...INSTITUTIONAL_WEEKLY_WFA_KINDS];
}

/** Map stored or incoming kind to one of DESK_AUTOMATION_CATEGORY_KINDS where applicable. */
function canonicalDeskCategoryKind(k) {
  const raw = String(k || '').toLowerCase().trim();
  if (!raw) return raw;
  if (LEGACY_DESK_KIND_MAP[raw]) return LEGACY_DESK_KIND_MAP[raw];
  return raw;
}

function deskCategoryDisplayName(canonicalKind) {
  const c = String(canonicalKind || '').toLowerCase();
  return DESK_CATEGORY_DISPLAY_NAME[c] || canonicalKind;
}

/** DB may still store legacy `brief_kind`; treat those rows as satisfying the canonical sleeve. */
function legacyAliasesForCanonical(canonicalKind) {
  const c = String(canonicalKind || '').toLowerCase();
  const aliases = [c];
  for (const [legacy, canon] of Object.entries(LEGACY_DESK_KIND_MAP)) {
    if (canon === c) aliases.push(legacy);
  }
  return [...new Set(aliases)];
}

/** Expected rows: 8 desk sleeves + seven daily PDF briefs, or eight desk + seven weekly WFA briefs. */
function expectedIntelAutomationRowCount(period = 'daily') {
  if (period === 'weekly') {
    return DESK_AUTOMATION_CATEGORY_KINDS.length + INSTITUTIONAL_WEEKLY_WFA_KINDS.length;
  }
  return DESK_AUTOMATION_CATEGORY_KINDS.length + INSTITUTIONAL_DAILY_WFA_KINDS.length;
}

function institutionalDailyWfaKinds() {
  return [...INSTITUTIONAL_DAILY_WFA_KINDS];
}

module.exports = {
  DESK_AUTOMATION_CATEGORY_KINDS,
  DESK_CATEGORY_DISPLAY_NAME,
  LEGACY_DESK_KIND_MAP,
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
