/**
 * Behaviour profiles from unified registry (no import from instruments.js — avoids circular deps).
 * Use buildBehaviourFromSpec(inst, canonical) from instruments.js after spec is resolved.
 */

import registry from '../../data/instrumentRegistry.json';

function assetClassToCategory(assetClass) {
  const a = String(assetClass || '').toLowerCase();
  if (a === 'commodity') return 'commodities';
  if (a === 'index') return 'indices';
  if (a === 'crypto') return 'crypto';
  if (a === 'stock') return 'stocks';
  if (a === 'future') return 'futures';
  return 'forex';
}

function inferCategoryFromCanonical(canonical) {
  const c = String(canonical || '').toUpperCase();
  if (registry.commodityCalculationSpecs?.[c]) return 'commodities';
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LINK|DOT|MATIC|AVAX|ATOM|LTC|SHIB|TRX|TON|NEAR|APT|ARB|OP)USD$/.test(c)) {
    return 'crypto';
  }
  if (['NAS100', 'SPX500', 'US30', 'GER40'].includes(c)) return 'indices';
  if (/^[A-Z]{6}$/.test(c)) return 'forex';
  return 'unknown';
}

/**
 * @param {import('./instruments').InstrumentSpec|null} inst
 * @param {string} canonical
 */
export function buildBehaviourFromSpec(inst, canonical) {
  const can = String(canonical || '').toUpperCase();
  const category = inst ? assetClassToCategory(inst.assetClass) : inferCategoryFromCanonical(can);
  const base = registry.categoryBehaviour?.[category] || registry.categoryBehaviour?.unknown || {};
  const sub = inst?.subCategory || registry.commodityCalculationSpecs?.[can]?.subCategory;
  const subBeh =
    sub && registry.commoditySubCategoryBehaviour?.[sub] ? registry.commoditySubCategoryBehaviour[sub] : {};
  return {
    normalizedSymbol: can,
    category,
    subCategory: sub || undefined,
    calculationMode: inst?.calculationMode,
    priceFormat: inst?.priceFormat,
    ...base,
    ...subBeh,
  };
}
