/**
 * Maps Market Watch / legacy broker symbols → canonical calculator + registry keys.
 * Data: src/data/instrumentRegistry.json (same aliases as api/market/instrumentRegistry.js).
 */
import registry from '../../data/instrumentRegistry.json';

/** @type {Record<string, string>} */
export const WATCHLIST_SYMBOL_ALIASES = registry.symbolAliases || {};

/**
 * @param {string} symbol
 * @returns {string}
 */
export function resolveCalculatorSymbol(symbol) {
  const u = String(symbol || '').toUpperCase().trim();
  if (!u) return 'EURUSD';
  return WATCHLIST_SYMBOL_ALIASES[u] || u;
}
