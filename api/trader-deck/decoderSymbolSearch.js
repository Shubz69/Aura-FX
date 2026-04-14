/**
 * Market Decoder symbol suggestions — registry-aware, partial match, deduped by canonical.
 */

'use strict';

const { getWatchlistPayload } = require('../market/defaultWatchlist');
const { getResolvedSymbol, toCanonical } = require('../ai/utils/symbol-registry');
const { INSTRUMENT_UNIVERSE_BY_KIND } = require('./services/briefInstrumentUniverse');
const { getDecoderSymbolPopularity } = require('./decoderSymbolMetrics');

/** Curated liquid symbols shown when there is no query (aligned with Decoder product priorities). */
const DECODER_QUICK_PRIORITY = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'BTCUSD',
  'US500',
  'NAS100',
  'SPY',
];

let indexCache = null;
let indexBuiltAt = 0;
const INDEX_TTL_MS = 10 * 60 * 1000;

function safeResolve(raw) {
  try {
    return getResolvedSymbol(raw);
  } catch {
    return null;
  }
}

function buildSearchIndex() {
  const byCanonical = new Map();
  function add(rawSym, displayName, baseBoost) {
    const raw = String(rawSym || '').trim().toUpperCase();
    if (!raw) return;
    const r = safeResolve(raw);
    const canon = (r && r.canonical) || toCanonical(raw) || raw;
    const disp = String(displayName || (r && r.displaySymbol) || raw).trim();
    const prev = byCanonical.get(canon);
    const boost = Math.max(prev ? prev.boost : 0, baseBoost);
    const label = disp || prev?.label || canon;
    byCanonical.set(canon, { canonical: canon, label, boost });
  }

  DECODER_QUICK_PRIORITY.forEach((s, i) => add(s, null, 200 - i * 4));

  try {
    const wl = getWatchlistPayload();
    const groups = wl?.groups && typeof wl.groups === 'object' ? Object.values(wl.groups) : [];
    for (const g of groups) {
      for (const row of g?.symbols || g?.items || []) {
        const sym = String(row?.symbol || '').trim().toUpperCase();
        if (!sym) continue;
        add(sym, row.displayName, 40);
      }
    }
  } catch {
    /* ignore */
  }

  for (const list of Object.values(INSTRUMENT_UNIVERSE_BY_KIND || {})) {
    if (!Array.isArray(list)) continue;
    for (const s of list) add(s, null, 8);
  }

  return Array.from(byCanonical.values());
}

function getSearchIndex() {
  const now = Date.now();
  if (!indexCache || now - indexBuiltAt > INDEX_TTL_MS) {
    indexCache = buildSearchIndex();
    indexBuiltAt = now;
  }
  return indexCache;
}

function scoreRow(row, needle, pop) {
  if (!row || !row.canonical) return 0;
  const canon = String(row.canonical).toLowerCase();
  const label = String(row.label || '').toLowerCase();
  const popN = pop[row.canonical] || 0;
  let match = 0;
  if (!needle) {
    return row.boost + popN * 4;
  }
  if (canon === needle) return 10000 + row.boost + popN * 6;
  if (canon.startsWith(needle)) return 5000 + row.boost + popN * 6;
  if (label.includes(needle)) return 2000 + row.boost + popN * 5;
  if (canon.includes(needle)) return 800 + row.boost + popN * 4;
  const needleNoSlash = needle.replace(/\//g, '');
  const compact = canon.replace(/[^A-Z0-9]/gi, '');
  if (needleNoSlash.length >= 2 && compact.includes(needleNoSlash)) return 600 + row.boost + popN * 4;
  return 0;
}

/**
 * @param {string} q
 * @param {{ limit?: number, preset?: 'quick' }} [opts]
 */
function searchDecoderSymbols(q, opts = {}) {
  const limit = Math.min(25, Math.max(1, Number(opts.limit) || 12));
  const rows = getSearchIndex();
  const pop = getDecoderSymbolPopularity();
  const needle = String(q || '').trim().toLowerCase().replace(/\s+/g, '');

  if (opts.preset === 'quick' || !needle) {
    return rows
      .map((r) => ({ symbol: r.canonical, label: r.label, _s: scoreRow(r, '', pop) }))
      .sort((a, b) => b._s - a._s)
      .slice(0, limit)
      .map(({ symbol, label }) => ({ symbol, label }));
  }

  const out = rows
    .map((r) => {
      const s = scoreRow(r, needle, pop);
      return s > 0 ? { symbol: r.canonical, label: r.label, _s: s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._s - a._s)
    .slice(0, limit)
    .map(({ symbol, label }) => ({ symbol, label }));

  return out;
}

module.exports = {
  searchDecoderSymbols,
  getSearchIndex,
  DECODER_QUICK_PRIORITY,
};
