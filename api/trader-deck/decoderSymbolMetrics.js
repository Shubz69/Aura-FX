/**
 * Decoder symbol decode counts (cache-backed, best-effort across instances).
 */

'use strict';

const { getCached, setCached } = require('../cache');

const CACHE_KEY = 'trader-desk:decoder-symbol-pop:v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function recordDecoderSymbolDecode(canonical) {
  const c = String(canonical || '').trim().toUpperCase();
  if (!c || c.length > 32) return;
  const cur = getCached(CACHE_KEY, CACHE_TTL_MS);
  const base = cur && typeof cur === 'object' ? { ...cur } : {};
  base[c] = (base[c] || 0) + 1;
  setCached(CACHE_KEY, base, CACHE_TTL_MS);
}

function getDecoderSymbolPopularity() {
  const cur = getCached(CACHE_KEY, CACHE_TTL_MS);
  return cur && typeof cur === 'object' ? { ...cur } : {};
}

module.exports = {
  recordDecoderSymbolDecode,
  getDecoderSymbolPopularity,
};
