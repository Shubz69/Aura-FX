/**
 * mysql2 can return BIGINT / DECIMAL edge cases that break JSON.stringify (BigInt).
 */

function jsonNumber(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Recursively convert BigInt and normalize plain objects/arrays for res.json(). */
function jsonSafeDeep(value) {
  if (value == null) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(jsonSafeDeep);
  if (typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = jsonSafeDeep(value[k]);
    }
    return out;
  }
  return value;
}

module.exports = { jsonNumber, jsonSafeDeep };
