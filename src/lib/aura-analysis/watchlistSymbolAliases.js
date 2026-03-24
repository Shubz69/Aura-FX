/**
 * Maps Market Watch symbols (api/market/defaultWatchlist) to calculator instrument keys
 * used by getInstrumentOrFallback in instruments.js.
 */
export const WATCHLIST_SYMBOL_ALIASES = {
  WTI: 'USOIL',
  BRENT: 'UKOIL',
  SPX: 'SPX500',
  NDX: 'NAS100',
  DJI: 'US30',
  DAX: 'GER40',
};

/**
 * @param {string} symbol
 * @returns {string}
 */
export function resolveCalculatorSymbol(symbol) {
  const u = String(symbol || '').toUpperCase().trim();
  if (!u) return 'EURUSD';
  return WATCHLIST_SYMBOL_ALIASES[u] || u;
}
