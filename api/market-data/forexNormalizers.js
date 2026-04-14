/**
 * Twelve Data /forex_pairs and FX reference payloads — compact normalized bodies for DB.
 */

function pick(o, keys) {
  const out = {};
  for (const k of keys) {
    if (o && o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

function normalizeForexPairsUniverse(raw) {
  if (!raw || raw.status === 'error' || raw.code) return null;
  const arr = raw.data || raw.pairs || raw.values || [];
  const list = Array.isArray(arr) ? arr : [];
  const sample = list.slice(0, 120).map((r) =>
    pick(r, ['symbol', 'currency_base', 'currency_quote', 'currency_group', 'name'])
  );
  return {
    schemaVersion: 1,
    datasetKey: 'forex_pairs_universe',
    source: 'twelvedata',
    asOf: new Date().toISOString(),
    body: { count: list.length, sample },
  };
}

function normalizeDatasetPayload(datasetKey, raw) {
  if (datasetKey === 'forex_pairs_universe') return normalizeForexPairsUniverse(raw);
  return null;
}

module.exports = { normalizeDatasetPayload, normalizeForexPairsUniverse };
