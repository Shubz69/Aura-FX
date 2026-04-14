/**
 * Normalize Twelve Data crypto reference payloads (compact bodies for DB).
 */

const { normalizeDatasetPayload: equityNormalize } = require('./equities/equityNormalizers');

function pick(o, keys) {
  const out = {};
  for (const k of keys) {
    if (o && o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

function normalizeCryptocurrenciesUniverse(raw) {
  if (!raw || raw.status === 'error' || raw.code) return null;
  const arr = raw.data || raw.cryptocurrencies || raw.values || [];
  const list = Array.isArray(arr) ? arr : [];
  const sample = list.slice(0, 100).map((r) =>
    pick(r, [
      'symbol',
      'currency_base',
      'currency_quote',
      'name',
      'exchange',
      'mic_code',
      'country',
    ])
  );
  return {
    schemaVersion: 1,
    datasetKey: 'cryptocurrencies_universe',
    source: 'twelvedata',
    asOf: new Date().toISOString(),
    body: { count: list.length, sample },
  };
}

function normalizeExchangeRate(raw) {
  if (!raw || raw.status === 'error' || raw.code) return null;
  return {
    schemaVersion: 1,
    datasetKey: 'exchange_rate',
    source: 'twelvedata',
    asOf: new Date().toISOString(),
    body: pick(raw, ['symbol', 'rate', 'timestamp', 'datetime', 'currency_base', 'currency_quote']),
  };
}

function normalizeCurrencyConversion(raw) {
  if (!raw || raw.status === 'error' || raw.code) return null;
  return {
    schemaVersion: 1,
    datasetKey: 'currency_conversion',
    source: 'twelvedata',
    asOf: new Date().toISOString(),
    body: pick(raw, ['symbol', 'amount', 'rate', 'timestamp', 'datetime']),
  };
}

function normalizeDatasetPayload(datasetKey, raw) {
  switch (datasetKey) {
    case 'cryptocurrencies_universe':
      return normalizeCryptocurrenciesUniverse(raw);
    case 'exchange_rate_pair':
      return normalizeExchangeRate(raw);
    case 'currency_conversion_pair':
      return normalizeCurrencyConversion(raw);
    default:
      return equityNormalize(datasetKey, raw);
  }
}

module.exports = { normalizeDatasetPayload, normalizeCryptocurrenciesUniverse };
