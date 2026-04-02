/**
 * Unified instrument normalization for server-side routes (watchlist snapshot, chart-check, etc.).
 * Data: src/data/instrumentRegistry.json (single source with frontend imports).
 */

const registry = require('../../src/data/instrumentRegistry.json');

function upperSym(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Map broker / UI / legacy symbols to canonical keys used in GROUPS + calculator.
 * @param {string} raw
 * @returns {string} canonical uppercase symbol (pass-through if no alias)
 */
function normalizeMarketSymbol(raw) {
  const u = upperSym(raw);
  if (!u) return '';
  const aliases = registry.symbolAliases || {};
  return aliases[u] ? upperSym(aliases[u]) : u;
}

/**
 * Validate symbol for server routes (chart-check, APIs). Uses chart intelligence + normalization.
 * @param {string} raw
 */
function validateMarketSymbol(raw) {
  let resolveInstrumentIntelligence;
  try {
    ({ resolveInstrumentIntelligence } = require('../ai/chartCheckRegistry'));
  } catch {
    resolveInstrumentIntelligence = () => ({
      normalizedSymbol: '',
      category: 'unknown',
      confirmedOnAura: false,
      source: 'none',
    });
  }
  const norm = normalizeMarketSymbol(String(raw || '').trim());
  const ctx = resolveInstrumentIntelligence(norm || raw || '');
  const hasNorm = Boolean(norm);
  const knownEnough =
    hasNorm && (ctx.confirmedOnAura || ctx.source === 'extended' || ctx.source === 'aura_watchlist');
  const valid = Boolean(knownEnough || (ctx.category !== 'unknown' && ctx.normalizedSymbol));
  return {
    valid,
    canonicalSymbol: norm || ctx.normalizedSymbol || '',
    inferredCategory: ctx.category || 'unknown',
    warning: valid ? null : 'Unknown instrument — analysis will use conservative assumptions.',
  };
}

/**
 * Dev-only consistency checks: watchlist commodities vs calculation specs, alias duplicates.
 */
function runRegistryConsistencyChecks() {
  if (process.env.NODE_ENV === 'production' && process.env.REGISTRY_VALIDATION !== '1') return;

  const { getWatchlistPayload } = require('./defaultWatchlist');
  const wl = getWatchlistPayload();
  const comm = wl.groups?.commodities?.symbols || [];
  for (const row of comm) {
    const s = String(row.symbol || '').toUpperCase();
    if (!registry.commodityCalculationSpecs?.[s]) {
      console.warn(`[instrumentRegistry] watchlist commodity ${s} has no commodityCalculationSpecs entry`);
    }
  }

  const aliasKeys = Object.keys(registry.symbolAliases || {});
  const dupAliasKeys = aliasKeys.filter((k, i) => aliasKeys.indexOf(k) !== i);
  if (dupAliasKeys.length) console.warn('[instrumentRegistry] duplicate symbolAliases keys:', dupAliasKeys);
}

try {
  runRegistryConsistencyChecks();
} catch (e) {
  if (process.env.NODE_ENV !== 'production') console.warn('[instrumentRegistry] consistency check skipped:', e.message);
}

module.exports = {
  registry,
  normalizeMarketSymbol,
  getSymbolAliases: () => ({ ...(registry.symbolAliases || {}) }),
  validateMarketSymbol,
  runRegistryConsistencyChecks,
};
