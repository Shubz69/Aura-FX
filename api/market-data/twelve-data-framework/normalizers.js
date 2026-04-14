/**
 * Maps Twelve Data JSON to shared normalized payloads (schemaVersion in each payload).
 */

const { normalizeDatasetPayload } = require('../equities/equityNormalizers');
const { normalizeDatasetPayload: normalizeCryptoDatasetPayload } = require('../cryptoNormalizers');
const { normalizeDatasetPayload: normalizeForexDatasetPayload } = require('../forexNormalizers');

const NORMALIZERS = {
  equity: normalizeDatasetPayload,
  crypto: normalizeCryptoDatasetPayload,
  forex: (datasetKey, raw) => {
    const fx = normalizeForexDatasetPayload(datasetKey, raw);
    if (fx) return fx;
    return normalizeDatasetPayload(datasetKey, raw);
  },
};

function normalizeForNormalizerId(normalizerId, datasetKey, rawData) {
  const fn = NORMALIZERS[normalizerId || 'equity'];
  if (typeof fn !== 'function') return null;
  return fn(datasetKey, rawData);
}

module.exports = { NORMALIZERS, normalizeForNormalizerId };
