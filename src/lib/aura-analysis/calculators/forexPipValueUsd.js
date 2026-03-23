/**
 * USD-denominated account: pip value per 1 standard lot in USD.
 * @typedef {'quote_usd'|'usd_base'|'jpy_cross'|'unknown_cross'} ForexPipUsdMode
 */

/**
 * @param {import('../instruments').InstrumentSpec} spec
 * @param {number} entry - FX rate (price)
 * @param {{ usdJpy?: number }} [options] - USD/JPY rate; required for JPY crosses (EURJPY, GBPJPY)
 * @returns {{
 *   usdPerPipPerLot: number | null,
 *   mode: ForexPipUsdMode,
 *   missingUsdJpy?: boolean,
 *   missingConversion?: boolean,
 *   invalidEntry?: boolean,
 * }}
 */
export function getForexPipValueUsdPerLot(spec, entry, options = {}) {
  const pipSize = spec.pipSize ?? 0.0001;
  const contract = spec.contractSize ?? 100_000;
  const pipInQuote = contract * pipSize;
  const sym = String(spec.symbol || '').toUpperCase().replace(/[^A-Z]/g, '');

  if (sym.length !== 6) {
    return legacyForexPipUsd(spec, entry, options);
  }

  const base = sym.slice(0, 3);
  const quote = sym.slice(3, 6);
  const usdJpy = Number(options.usdJpy);

  if (quote === 'USD') {
    return { usdPerPipPerLot: pipInQuote, mode: 'quote_usd' };
  }

  if (base === 'USD') {
    if (!Number.isFinite(entry) || entry <= 0) {
      return { usdPerPipPerLot: null, mode: 'usd_base', invalidEntry: true };
    }
    return { usdPerPipPerLot: pipInQuote / entry, mode: 'usd_base' };
  }

  if (quote === 'JPY') {
    if (!Number.isFinite(usdJpy) || usdJpy <= 0) {
      return { usdPerPipPerLot: null, mode: 'jpy_cross', missingUsdJpy: true };
    }
    return { usdPerPipPerLot: pipInQuote / usdJpy, mode: 'jpy_cross' };
  }

  return {
    usdPerPipPerLot: null,
    mode: 'unknown_cross',
    missingConversion: true,
  };
}

/** Fallback when symbol is not 6 letters (custom / fallback specs). */
function legacyForexPipUsd(spec, entry, options = {}) {
  const pipSize = spec.pipSize ?? 0.0001;
  const contract = spec.contractSize ?? 100_000;
  const pipInQuote = contract * pipSize;
  const quote = String(spec.quoteCurrency || 'USD').toUpperCase();
  const usdJpy = Number(options.usdJpy);

  if (quote === 'USD') {
    return { usdPerPipPerLot: pipInQuote, mode: 'quote_usd' };
  }

  const sym = String(spec.symbol || '').toUpperCase();
  if (sym.startsWith('USD') && sym.length >= 6) {
    if (!Number.isFinite(entry) || entry <= 0) {
      return { usdPerPipPerLot: null, mode: 'usd_base', invalidEntry: true };
    }
    return { usdPerPipPerLot: pipInQuote / entry, mode: 'usd_base' };
  }

  if (quote === 'JPY' && !sym.startsWith('USD')) {
    if (!Number.isFinite(usdJpy) || usdJpy <= 0) {
      return { usdPerPipPerLot: null, mode: 'jpy_cross', missingUsdJpy: true };
    }
    return { usdPerPipPerLot: pipInQuote / usdJpy, mode: 'jpy_cross' };
  }

  if (quote === 'JPY') {
    if (!Number.isFinite(entry) || entry <= 0) {
      return { usdPerPipPerLot: null, mode: 'usd_base', invalidEntry: true };
    }
    return { usdPerPipPerLot: pipInQuote / entry, mode: 'usd_base' };
  }

  if (!Number.isFinite(entry) || entry <= 0) {
    return { usdPerPipPerLot: null, mode: 'usd_base', invalidEntry: true };
  }
  return { usdPerPipPerLot: pipInQuote / entry, mode: 'usd_base' };
}

/**
 * @param {string} symbol
 * @returns {boolean}
 */
export function forexPairNeedsUsdJpy(symbol) {
  const sym = String(symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (sym.length !== 6) return false;
  const base = sym.slice(0, 3);
  const quote = sym.slice(3, 6);
  return quote === 'JPY' && base !== 'USD';
}
