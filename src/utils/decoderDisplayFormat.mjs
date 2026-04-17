/**
 * Market Decoder — instrument-aware price / metric display.
 * ESM only — React. Node API uses `decoderDisplayFormat.js` (CommonJS).
 * @see decoderDisplayFormat.js (keep logic in sync)
 */

function trimTrailingDecimalZeros(str) {
  if (str == null || typeof str !== 'string') return str;
  if (!str.includes('.')) return str;
  let s = str.replace(/(\.\d*?[1-9])0+$/, '$1');
  s = s.replace(/\.0+$/, '');
  if (s === '-0') return '0';
  return s;
}

function assetLikeFromStrings(canonical, display) {
  const c = String(canonical || '').toUpperCase();
  const d = String(display || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c.includes('XAU') || d.includes('XAU')) return 'gold';
  if (c.includes('XAG') || d.includes('XAG')) return 'silver';
  if (c.includes('BTC') || d.startsWith('BTC')) return 'btc';
  if (c.includes('ETH') || d.startsWith('ETH')) return 'eth';
  return 'other';
}

function isFxJpyPair(display, quote) {
  const q = String(quote || '').toUpperCase();
  if (q === 'JPY') return true;
  const u = String(display || '').toUpperCase().replace(/[^A-Z]/g, '');
  return u.length === 6 && u.endsWith('JPY');
}

export function buildDecoderPriceContext(brief) {
  if (!brief || typeof brief !== 'object') {
    return { marketType: 'FX', quote: 'USD', display: '', canonical: '', assetLike: 'other' };
  }
  const inst = brief.instrument || {};
  const mt = inst.marketType || brief.header?.marketType || 'FX';
  const display = String(inst.display || brief.header?.asset || '').toUpperCase().replace(/[^A-Z]/g, '');
  const quote = inst.quote || brief.header?.quoteCurrency || 'USD';
  const canonical = String(inst.canonical || brief.meta?.canonicalSymbol || display);
  return {
    marketType: mt,
    quote,
    display,
    canonical,
    assetLike: assetLikeFromStrings(canonical, display),
  };
}

export function buildDecoderPriceContextFromInstrument(instrument) {
  const inst = instrument || {};
  const mt = inst.marketType || 'FX';
  const display = String(inst.display || '').toUpperCase().replace(/[^A-Z]/g, '');
  const quote = inst.quote || 'USD';
  const canonical = String(inst.canonical || display);
  return {
    marketType: mt,
    quote,
    display,
    canonical,
    assetLike: assetLikeFromStrings(canonical, display),
  };
}

function maxDecimalsForPrice(n, ctx) {
  const mt = ctx.marketType;
  const abs = Math.abs(Number(n));
  if (mt === 'FX') {
    return isFxJpyPair(ctx.display, ctx.quote) ? 3 : 5;
  }
  if (mt === 'Commodity') {
    if (ctx.assetLike === 'gold' || ctx.assetLike === 'silver') return 2;
    return 5;
  }
  if (mt === 'Crypto') {
    if (abs >= 1000) return 2;
    if (abs >= 1) return 4;
    if (abs >= 0.01) return 6;
    return 8;
  }
  if (mt === 'Index' || mt === 'Equity') {
    return 4;
  }
  return 4;
}

export function formatDecoderPriceRaw(value, ctx) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return null;
  const merged = ctx && typeof ctx === 'object' ? ctx : {};
  const mt = merged.marketType || 'FX';

  if (mt === 'Index' || mt === 'Equity') {
    if (Math.abs(n - Math.round(n)) < 1e-5) return String(Math.round(n));
    return trimTrailingDecimalZeros(n.toFixed(2));
  }

  const md = maxDecimalsForPrice(n, merged);
  return trimTrailingDecimalZeros(n.toFixed(md));
}

export function formatDecoderPriceOrDash(value, ctx) {
  const s = formatDecoderPriceRaw(value, ctx);
  return s == null ? '—' : s;
}

export function formatDecoderPriceForInstrument(value, instrument) {
  return formatDecoderPriceRaw(value, buildDecoderPriceContextFromInstrument(instrument));
}

export function crossTileContext(tileId) {
  const id = String(tileId || '').toLowerCase();
  if (id === 'spy') {
    return { marketType: 'Equity', quote: 'USD', display: 'SPY', canonical: 'SPY', assetLike: 'other' };
  }
  if (id === 'eurusd') {
    return { marketType: 'FX', quote: 'USD', display: 'EURUSD', canonical: 'EURUSD', assetLike: 'other' };
  }
  if (id === 'xau') {
    return { marketType: 'Commodity', quote: 'USD', display: 'XAUUSD', canonical: 'XAUUSD', assetLike: 'gold' };
  }
  if (id === 'btc') {
    return { marketType: 'Crypto', quote: 'USD', display: 'BTCUSD', canonical: 'BTCUSD', assetLike: 'btc' };
  }
  return { marketType: 'Equity', quote: 'USD', display: '', canonical: '', assetLike: 'other' };
}

export function formatCrossTilePrice(price, tileId) {
  return formatDecoderPriceOrDash(price, crossTileContext(tileId));
}

export function formatDecoderMetricPercent(value, maxDecimals = 2) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return null;
  const md = Math.min(4, Math.max(0, maxDecimals));
  return trimTrailingDecimalZeros(n.toFixed(md));
}

export { trimTrailingDecimalZeros };
