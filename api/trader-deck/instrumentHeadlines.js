/**
 * Rank news headlines by relevance to a resolved decoder asset (rules-only; no ML).
 * Used by marketDecoderEngine → brief.meta.instrumentHeadlines.
 */

/** @type {Record<string, string[]>} */
const EXTRA_KEYS_BY_SYMBOL = {
  EURUSD: ['eur', 'euro', 'usd', 'dollar', 'ecb', 'fed', 'europe', 'emu', 'germany', 'france'],
  GBPUSD: ['gbp', 'pound', 'boe', 'uk', 'britain', 'usd', 'dollar', 'fed', 'england'],
  USDJPY: ['usd', 'dollar', 'jpy', 'yen', 'boj', 'japan', 'fed'],
  XAUUSD: ['gold', 'xau', 'bullion', 'precious', 'usd', 'dollar', 'fed', 'treasury', 'yield'],
  XAGUSD: ['silver', 'xag', 'precious', 'usd', 'dollar'],
  BTCUSD: ['btc', 'bitcoin', 'crypto', 'digital', 'usd', 'dollar'],
  ETHUSD: ['eth', 'ethereum', 'crypto', 'digital', 'usd', 'dollar'],
  SPY: ['spy', 's&p', 'sp500', 'sp 500', 'equity', 'stock', 'fed', 'earnings'],
};

/**
 * @param {{ marketType: string, displaySymbol?: string, canonicalSymbol?: string }} resolved
 * @param {string} displaySymbol
 * @returns {string[]}
 */
function matchTokensForAsset(resolved, displaySymbol) {
  const u = String(displaySymbol || resolved?.displaySymbol || '').toUpperCase();
  const set = new Set();
  const add = (t) => {
    const x = String(t || '').trim().toLowerCase();
    if (x.length >= 2) set.add(x);
  };

  const preset = EXTRA_KEYS_BY_SYMBOL[u];
  if (preset) {
    preset.forEach(add);
    return [...set];
  }

  const mt = String(resolved?.marketType || '');
  if (mt === 'FX' && u.length === 6 && /^[A-Z]{6}$/.test(u)) {
    add(u.slice(0, 3));
    add(u.slice(3));
    add('forex');
  } else if (mt === 'Crypto') {
    const base = u.replace(/USDT|USD$/i, '');
    if (base && base !== u) add(base.toLowerCase());
    add('crypto');
    add(u.toLowerCase());
  } else if (mt === 'Commodity' || /XAU|GOLD|XAG|SILVER/i.test(u)) {
    if (/XAU|GOLD/i.test(u)) {
      ['gold', 'xau', 'bullion', 'precious'].forEach(add);
    }
    if (/XAG|SILVER/i.test(u)) {
      ['silver', 'xag', 'precious'].forEach(add);
    }
    add('usd');
  } else if (mt === 'Equity' || mt === 'Index') {
    add(u.split(/[:.]/)[0].toLowerCase());
    add('equity');
    add('stock');
  }

  const compact = u.replace(/[^A-Z0-9]/gi, '');
  if (compact.length >= 2) add(compact.toLowerCase());
  add(u.toLowerCase());

  return [...set];
}

/**
 * @param {{ marketType: string }} resolved
 * @param {string} displaySymbol
 * @param {Array<{ title?: string, source?: string, url?: string, datetime?: string }>} anchorNews
 * @param {{ maxRelevant?: number, maxFallback?: number }} [opts]
 */
function rankInstrumentHeadlines(resolved, displaySymbol, anchorNews, opts = {}) {
  const maxRelevant = opts.maxRelevant ?? 6;
  const maxFallback = opts.maxFallback ?? 4;
  const list = Array.isArray(anchorNews) ? anchorNews : [];
  const keys = matchTokensForAsset(resolved, displaySymbol);

  if (!keys.length || !list.length) {
    return {
      items: list.slice(0, maxRelevant),
      scope: list.length ? 'fallback' : 'none',
      total: list.length,
    };
  }

  const scored = list.map((item, i) => {
    const hay = `${String(item.title || '')} ${String(item.source || '')}`.toLowerCase();
    const score = keys.reduce((acc, k) => (hay.includes(k) ? acc + 1 : acc), 0);
    return { item, score, i };
  });

  const relevant = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);

  const fallback = scored
    .filter((x) => x.score === 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.item);

  const items = relevant.length ? relevant.slice(0, maxRelevant) : fallback.slice(0, maxFallback);

  return {
    items,
    scope: relevant.length ? 'relevant' : relevant.length === 0 && list.length ? 'fallback' : 'none',
    total: list.length,
  };
}

module.exports = { rankInstrumentHeadlines, matchTokensForAsset };
