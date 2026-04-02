/**
 * Unified behaviour metadata for instruments (volatility, sessions, spread, structure).
 * Uses instrumentRegistry.json + resolveInstrumentIntelligence for category/subCategory.
 */

const registry = require('../../src/data/instrumentRegistry.json');
const { resolveInstrumentIntelligence } = require('../ai/chartCheckRegistry');

function mergeBehaviour(category, normalizedSymbol) {
  const catBeh = registry.categoryBehaviour?.[category] || registry.categoryBehaviour?.unknown || {};
  const calc = registry.commodityCalculationSpecs?.[normalizedSymbol];
  const sub = calc?.subCategory;
  const subBeh =
    sub && registry.commoditySubCategoryBehaviour?.[sub] ? registry.commoditySubCategoryBehaviour[sub] : {};
  return { ...catBeh, ...subBeh };
}

/**
 * @param {string|null|undefined} rawSymbol
 * @returns {{
 *   normalizedSymbol: string,
 *   category: string,
 *   subCategory?: string,
 *   volatilityProfile?: string,
 *   sessionBehaviour?: string,
 *   spreadSensitivity?: string,
 *   manipulationRisk?: string,
 *   typicalStructureQuality?: string,
 *   intelligence: object
 * }}
 */
function getInstrumentBehaviour(rawSymbol) {
  const ctx = resolveInstrumentIntelligence(rawSymbol || '');
  const category = ctx.category || 'unknown';
  const sym = String(ctx.normalizedSymbol || '').toUpperCase();
  const merged = mergeBehaviour(category, sym);
  const calc = registry.commodityCalculationSpecs?.[sym];
  return {
    normalizedSymbol: ctx.normalizedSymbol || '',
    category,
    subCategory: calc?.subCategory,
    ...merged,
    intelligence: ctx.intelligence || {},
  };
}

/**
 * Compact string for AI prompts (chart-check).
 */
function getInstrumentBehaviourPromptFragment(rawSymbol) {
  const b = getInstrumentBehaviour(rawSymbol);
  const parts = [
    b.manipulationRisk && `manipulation risk: ${b.manipulationRisk}`,
    b.typicalStructureQuality && `typical structure: ${b.typicalStructureQuality}`,
    b.spreadSensitivity && `spread sensitivity: ${b.spreadSensitivity}`,
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : '';
}

module.exports = {
  getInstrumentBehaviour,
  getInstrumentBehaviourPromptFragment,
};
