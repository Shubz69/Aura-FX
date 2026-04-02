/**
 * GET /api/system/instrument-integrity
 * Dev: open without auth. Production: set INSTRUMENT_INTEGRITY_SECRET and send header
 * x-instrument-integrity-secret: <secret>
 */

const path = require('path');
const registry = require('../../src/data/instrumentRegistry.json');
const { getWatchlistPayload } = require('../market/defaultWatchlist');
const { buildInstrumentIntegrityReport } = require('./instrumentIntegrityReport');
const { getOrCreateRequestId, attachRequestId } = require('../utils/requestCorrelation');
const { recordIntegrityCheckFailed, getSnapshot } = require('../utils/systemMetrics');
const ERROR_CODES = require('../utils/errorCodes');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-instrument-integrity-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const requestId = getOrCreateRequestId(req);
  attachRequestId(res, requestId);

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const expected = process.env.INSTRUMENT_INTEGRITY_SECRET || '';
  const given = req.headers['x-instrument-integrity-secret'] || '';
  if (isProd && (!expected || given !== expected)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden — set INSTRUMENT_INTEGRITY_SECRET and x-instrument-integrity-secret header in production.',
      errorCode: ERROR_CODES.SYSTEM_ERROR,
      requestId,
    });
  }

  const repoRoot = path.join(__dirname, '..', '..');
  const report = buildInstrumentIntegrityReport(repoRoot, registry, getWatchlistPayload);

  if (!report.registryConsistency?.ok) {
    recordIntegrityCheckFailed();
  }

  return res.status(200).json({
    success: true,
    requestId,
    serverMetricsSnapshot: getSnapshot(),
    ...report,
  });
};
