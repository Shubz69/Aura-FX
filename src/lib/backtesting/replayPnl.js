/**
 * Backtesting / replay PnL in account USD for common instrument types.
 * Contract assumptions follow standard retail FX / bullion conventions.
 */

const METAL_XAU = 'metal_xau';
const METAL_XAG = 'metal_xag';
const FX_USD_QUOTE = 'fx_usd_quote';
const FX_USD_BASE = 'fx_usd_base';
const FX_JPY_QUOTE = 'fx_jpy_quote';
const FX_CROSS = 'fx_cross';
const CRYPTO = 'crypto';
const INDEX = 'index';

function normalizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\//g, '')
    .replace(/:/g, '');
}

/**
 * @returns {{ kind: string, contractSize: number, pipSize?: number, base?: string, quote?: string }}
 */
export function getReplayInstrumentSpec(symbol) {
  const s = normalizeSymbol(symbol);
  if (!s) return { kind: FX_USD_QUOTE, contractSize: 100000, pipSize: 0.0001 };

  if (s === 'XAUUSD') return { kind: METAL_XAU, contractSize: 100, pipSize: 0.01, base: 'XAU', quote: 'USD' };
  if (s === 'XAGUSD') return { kind: METAL_XAG, contractSize: 5000, pipSize: 0.001, base: 'XAG', quote: 'USD' };

  if (/^(BTC|ETH|SOL|XRP|ADA|DOGE|LTC)USD$/i.test(s) || /^(BTC|ETH)USDT$/i.test(s)) {
    const base = s.replace(/USDT|USD/i, '');
    return { kind: CRYPTO, contractSize: 1, base, quote: /USDT/i.test(s) ? 'USDT' : 'USD' };
  }

  const idxAliases = new Map([
    ['NASDAQ100', 'NDX'],
    ['NAS100', 'NDX'],
    ['NASDAQ', 'NDX'],
    ['NDX', 'NDX'],
    ['US500', 'SPX'],
    ['SPX500', 'SPX'],
    ['SP500', 'SPX'],
    ['SPX', 'SPX'],
    ['US30', 'DJI'],
    ['DJI', 'DJI'],
    ['DOW', 'DJI'],
  ]);
  if (idxAliases.has(s)) {
    return { kind: INDEX, contractSize: 1, quote: 'USD', id: idxAliases.get(s) };
  }

  if (/^[A-Z]{6}$/.test(s)) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (base === 'USD' && quote === 'JPY') {
      return { kind: FX_USD_BASE, contractSize: 100000, pipSize: 0.01, base, quote };
    }
    if (quote === 'JPY') {
      return { kind: FX_JPY_QUOTE, contractSize: 100000, pipSize: 0.01, base, quote };
    }
    if (base === 'USD') {
      return { kind: FX_USD_BASE, contractSize: 100000, pipSize: quote === 'JPY' ? 0.01 : 0.0001, base, quote };
    }
    if (quote === 'USD') {
      return { kind: FX_USD_QUOTE, contractSize: 100000, pipSize: 0.0001, base, quote };
    }
    return { kind: FX_CROSS, contractSize: 100000, pipSize: quote === 'JPY' ? 0.01 : 0.0001, base, quote };
  }

  return { kind: INDEX, contractSize: 1, quote: 'USD', id: s };
}

/** Long/buy gains when price rises. */
function signedDiff(direction, entry, exit) {
  const d = String(direction || 'long').toLowerCase();
  const isShort = d === 'short' || d === 'sell';
  const diff = isShort ? entry - exit : exit - entry;
  return Number.isFinite(diff) ? diff : 0;
}

/**
 * Approximate EURJPY / GBPJPY quote PnL to USD using USDJPY rate (JPY per 1 USD).
 */
function convertJpyPnlToUsd(pnlQuoteJpy, usdJpy) {
  if (!Number.isFinite(pnlQuoteJpy) || !Number.isFinite(usdJpy) || usdJpy <= 0) return null;
  return pnlQuoteJpy / usdJpy;
}

/**
 * Floating or closed trade PnL in USD.
 * @param {object} opts
 * @param {number} [opts.usdJpyHint] USDJPY rate for yen conversions (defaults to exit price when mode is FX_USD_BASE for USDJPY).
 * @param {number} [opts.crossUsdJpy] Required for EURJPY-style to convert yen PnL to USD — defaults to opts.exit if reasonable.
 */
export function replayTradePnlUsd(direction, entry, exit, instrument, lots, opts = {}) {
  const qty = Number(lots);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(qty)) return 0;
  if (!(qty > 0)) return 0;

  const spec = getReplayInstrumentSpec(instrument);
  const diff = signedDiff(direction, entry, exit);
  switch (spec.kind) {
    case METAL_XAU:
    case METAL_XAG:
    case INDEX:
    case CRYPTO:
      return diff * spec.contractSize * qty;

    case FX_USD_QUOTE:
      return diff * spec.contractSize * qty;

    case FX_USD_BASE: {
      const pnlQuote = diff * spec.contractSize * qty;
      if (spec.quote === 'JPY') {
        const usdJpy = Number(opts.usdJpyHint) > 0 ? Number(opts.usdJpyHint) : exit;
        if (Number.isFinite(usdJpy) && usdJpy > 0) return pnlQuote / usdJpy;
        return null;
      }
      const inv = Number(opts.quoteToUsdMultiplier);
      if (Number.isFinite(inv)) return pnlQuote * inv;
      return pnlQuote;
    }

    case FX_JPY_QUOTE: {
      const pnlJpy = diff * spec.contractSize * qty;
      const usdJpy = Number(opts.usdJpyHint) || Number(opts.crossUsdJpy);
      const rate = Number.isFinite(usdJpy) && usdJpy > 0 ? usdJpy : 150;
      const cvt = convertJpyPnlToUsd(pnlJpy, rate);
      return cvt !== null ? cvt : replayTradePnlUsdApproxCross(diff, qty, opts);
    }

    case FX_CROSS:
    default:
      return replayTradePnlUsdApproxCross(diff, qty, opts);
  }
}

function replayTradePnlUsdApproxCross(diff, qty, opts) {
  void opts;
  return diff * 100000 * qty;
}

/**
 * Aggregate floating PnL for open trades at a mark price (typically last close).
 */
export function replayPortfolioFloatingUsd(openTrades, markPrice, markAux = {}) {
  const px = Number(markPrice);
  if (!Number.isFinite(px)) return 0;
  const chartUsdJpy =
    Number(markAux.usdJpy) > 0 ? Number(markAux.usdJpy) : Number(markAux.crossUsdJpy) > 0 ? Number(markAux.crossUsdJpy) : NaN;
  let sum = 0;
  for (const t of openTrades || []) {
    const ins = normalizeSymbol(t.instrument || '');
    const entry = Number(t.entryPrice);
    const qty = Number(t.positionSize ?? t.lots);
    const hints = {};
    if (ins === 'USDJPY') hints.usdJpyHint = px;
    else if (ins.endsWith('JPY') && ins !== 'USDJPY') {
      hints.crossUsdJpy = Number.isFinite(chartUsdJpy) && chartUsdJpy > 0 ? chartUsdJpy : 150;
    }
    const p = replayTradePnlUsd(t.direction, entry, px, ins, qty, hints);
    sum += Number.isFinite(p) ? p : 0;
  }
  return sum;
}

export { normalizeSymbol as normalizeReplayInstrument };
