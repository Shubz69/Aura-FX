/**
 * Default TTL when a dataset definition omits ttlMs — by DATASET_KIND.
 * Equity datasets in twelveDataEquityCapabilities.js set explicit ttlMs; this
 * mainly supports new categories and future datasets.
 */

const {
  QUOTE_TTL_MS,
  SERIES_TTL_MS,
  EARLIEST_TTL_MS,
  FX_MARKET_STATE_TTL_MS,
} = require('../cachePolicy');
const { DATASET_KIND } = require('./datasetKinds');

const DAY = 86400000;

const DEFAULT_TTL_MS = {
  [DATASET_KIND.CORE]: Math.max(
    QUOTE_TTL_MS,
    parseInt(process.env.MD_TD_KIND_CORE_TTL_MS || String(QUOTE_TTL_MS), 10) || QUOTE_TTL_MS
  ),
  [DATASET_KIND.REFERENCE]: Math.max(
    6 * 3600000,
    parseInt(process.env.MD_TD_KIND_REFERENCE_TTL_MS || String(7 * DAY), 10) || 7 * DAY
  ),
  [DATASET_KIND.FUNDAMENTALS]: Math.max(
    DAY,
    parseInt(process.env.MD_TD_KIND_FUNDAMENTALS_TTL_MS || String(7 * DAY), 10) || 7 * DAY
  ),
  [DATASET_KIND.ANALYSIS]: Math.max(
    6 * 3600000,
    parseInt(process.env.MD_TD_KIND_ANALYSIS_TTL_MS || String(DAY), 10) || DAY
  ),
  [DATASET_KIND.REGULATORY]: Math.max(
    DAY,
    parseInt(process.env.MD_TD_KIND_REGULATORY_TTL_MS || String(7 * DAY), 10) || 7 * DAY
  ),
  [DATASET_KIND.CALENDAR]: Math.max(
    2 * 3600000,
    parseInt(process.env.MD_TD_KIND_CALENDAR_TTL_MS || String(12 * 3600000), 10) || 12 * 3600000
  ),
};

/** Short TTL for live FX session-style reference calls (market_state on FX). */
function referenceTtlForKey(datasetKey) {
  if (datasetKey === 'market_state') {
    return Math.max(FX_MARKET_STATE_TTL_MS, parseInt(process.env.MD_TD_FX_REF_MARKET_STATE_TTL_MS || '0', 10) || FX_MARKET_STATE_TTL_MS);
  }
  return DEFAULT_TTL_MS[DATASET_KIND.REFERENCE];
}

/**
 * @param {{ ttlMs?: number, datasetKind?: string }} def
 * @param {string} [datasetKey]
 */
function effectiveTtlMs(def, datasetKey = '') {
  if (def && Number(def.ttlMs) > 0) return Number(def.ttlMs);
  const kind = def && def.datasetKind;
  if (kind === DATASET_KIND.CORE) return DEFAULT_TTL_MS[kind];
  if (kind === DATASET_KIND.REFERENCE && datasetKey) return referenceTtlForKey(datasetKey);
  if (kind && DEFAULT_TTL_MS[kind]) return DEFAULT_TTL_MS[kind];
  return SERIES_TTL_MS;
}

module.exports = {
  DEFAULT_TTL_MS,
  effectiveTtlMs,
  /** Re-export for diagnostics */
  SERIES_TTL_MS,
  EARLIEST_TTL_MS,
};
