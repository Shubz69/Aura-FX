/**
 * Fast stable fingerprint for closed-trade institutional inputs.
 * Used to skip redundant Monte Carlo / heavy merges when filters haven't changed materially.
 */

function hashNum(n) {
  if (!Number.isFinite(n)) return 0;
  const x = Math.round(n * 1e6);
  return ((x * 73856093) ^ (x >>> 16)) >>> 0;
}

function hashStr(s) {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * @param {Array<{id?:string,mfeUsd?:number,maeUsd?:number,mfeR?:number,maeR?:number,mfeTime?:string,maeTime?:string}>} sortedClosed
 * @param {number[]} pnls
 * @param {number} startBalance
 */
export function institutionalInputFingerprint(sortedClosed, pnls, startBalance) {
  let h = (sortedClosed.length * 374761393) ^ hashNum(startBalance);
  const n = sortedClosed.length;
  for (let i = 0; i < n; i++) {
    const t = sortedClosed[i];
    const p = pnls[i];
    h ^= hashStr(String(t?.id ?? i));
    h ^= hashStr(String(t?.closeTime || t?.openTime || ''));
    h ^= hashNum(p);
    h ^= hashNum(t?.mfeUsd);
    h ^= hashNum(t?.maeUsd);
    h ^= hashNum(t?.mfeR);
    h ^= hashNum(t?.maeR);
    h ^= hashStr(String(t?.mfeTime || ''));
    h ^= hashStr(String(t?.maeTime || ''));
    h = Math.imul(h, 1597334677) >>> 0;
  }
  return `inst_${h.toString(16)}`;
}
