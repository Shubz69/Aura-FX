/**
 * GET /api/system/debug-instrument?symbol=XAUUSD
 * Non-production: open. Production: INSTRUMENT_DEBUG_SECRET + header x-instrument-debug-secret
 */

const registry = require('../../src/data/instrumentRegistry.json');
const { normalizeMarketSymbol, validateMarketSymbol } = require('../market/instrumentRegistry');
const { getInstrumentBehaviour } = require('../market/instrumentBehaviour');
const { getOrCreateRequestId, attachRequestId } = require('../utils/requestCorrelation');
const ERROR_CODES = require('../utils/errorCodes');

function upperSym(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-instrument-debug-secret');

  const requestId = getOrCreateRequestId(req);
  attachRequestId(res, requestId);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const expected = process.env.INSTRUMENT_DEBUG_SECRET || '';
  const given = req.headers['x-instrument-debug-secret'] || '';
  if (isProd && (!expected || given !== expected)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden — set INSTRUMENT_DEBUG_SECRET and x-instrument-debug-secret in production.',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }

  const raw = String(req.query.symbol || '').trim();
  const normalizedSymbol = normalizeMarketSymbol(raw);
  const canonical = normalizedSymbol || upperSym(raw) || '';
  const validation = validateMarketSymbol(raw);
  const behaviour = getInstrumentBehaviour(raw);

  const commoditySpec = canonical ? registry.commodityCalculationSpecs?.[canonical] || null : null;
  const fromWatch = (registry.commoditiesWatchlist || []).find((r) => upperSym(r.symbol) === canonical);

  const spec = commoditySpec
    ? {
        ...commoditySpec,
        symbol: canonical,
        displayName: commoditySpec.displayName || fromWatch?.displayName || canonical,
        source: 'commodityCalculationSpecs',
      }
    : {
        canonical,
        source: 'not_in_commodity_calculation_specs',
        hint: 'Full merged calculator spec is built client-side (instruments.js + registry overlay).',
      };

  return res.status(200).json({
    success: true,
    requestId,
    timestamp: new Date().toISOString(),
    query: { symbol: raw },
    normalizedSymbol,
    validation,
    behaviour,
    spec,
    overrides: null,
  });
};
