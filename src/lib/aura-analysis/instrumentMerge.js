/**
 * Merges src/data/instrumentRegistry.json commodityCalculationSpecs over instrumentsCommodities.js.
 * Single logical registry: JSON overrides JS for any field present.
 * Optional broker/MT5 overrides applied via applyInstrumentOverrides (future hook).
 */

import registry from '../../data/instrumentRegistry.json';
import { COMMODITY_INSTRUMENTS } from './instrumentsCommodities';
import { shouldLogInstrumentOverridesToConsole } from './instrumentEnv';
import { logInfo } from '../../utils/systemLogger';

/**
 * @param {Record<string, unknown>|null|undefined} base
 * @param {Record<string, unknown>|null|undefined} overlay
 */
function shallowMergeDefined(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) continue;
    if (v === null && k !== 'examplePrices') continue;
    out[k] = v;
  }
  return out;
}

/** @type {import('./instruments').InstrumentSpec[]|null} */
let mergedCommodityCache = null;

/**
 * Commodity rows for calculator: COMMODITY_INSTRUMENTS with JSON overlays.
 * @returns {import('./instruments').InstrumentSpec[]}
 */
export function buildMergedCommodityInstruments() {
  if (mergedCommodityCache) return mergedCommodityCache;
  const specs = registry.commodityCalculationSpecs || {};
  mergedCommodityCache = COMMODITY_INSTRUMENTS.map((row) => {
    const overlay = specs[row.symbol];
    if (!overlay) return { ...row };
    return shallowMergeDefined(row, overlay);
  });
  return mergedCommodityCache;
}

/**
 * Future MT5 / broker bridge: merge contractSize, tickSize, valuePerPointPerLot, tickValuePerLot, pipSize, pointSize.
 * @param {object} spec - instrument spec clone
 * @param {object} overrides
 * @param {{ requestId?: string }} [ctx]
 */
export function applyInstrumentOverrides(spec, overrides, ctx = {}) {
  if (!spec || !overrides || typeof overrides !== 'object') return spec;
  const out = { ...spec };
  const pick = [
    'contractSize',
    'tickSize',
    'pointSize',
    'pipSize',
    'valuePerPointPerLot',
    'tickValuePerLot',
    'lotStep',
    'minLot',
    'maxLot',
    'pricePrecision',
  ];
  const fields = [];
  /** @type {Record<string, { from: number|null, to: number }>} */
  const values = {};
  for (const k of pick) {
    if (overrides[k] != null && Number.isFinite(Number(overrides[k]))) {
      const next = Number(overrides[k]);
      const prevRaw = out[k];
      const prevNum = Number(prevRaw);
      const hadPrev = prevRaw != null && Number.isFinite(prevNum);
      if (!hadPrev || prevNum !== next) {
        fields.push(k);
        values[k] = { from: hadPrev ? prevNum : null, to: next };
      }
      out[k] = next;
    }
  }
  if (fields.length) {
    out._brokerOverridesApplied = true;
    out._instrumentOverrideLog = {
      symbol: String(out.symbol || ''),
      source: 'brokerOrMt5',
      fields,
      values,
      timestamp: new Date().toISOString(),
    };
    logInfo('instrument', 'overrides_applied', {
      symbol: out.symbol,
      fields,
      valueTos: Object.fromEntries(fields.map((k) => [k, values[k]?.to])),
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    });
    if (shouldLogInstrumentOverridesToConsole()) {
      console.info('[instrumentOverrides]', JSON.stringify(out._instrumentOverrideLog));
    }
  }
  return out;
}

/** Allowed override fields (documented for MT5 integration). */
export const BROKER_OVERRIDE_FIELDS = [
  'contractSize',
  'tickSize',
  'valuePerPointPerLot',
  'tickValuePerLot',
  'pointSize',
  'pipSize',
];
