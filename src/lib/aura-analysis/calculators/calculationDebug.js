/**
 * Safe snapshots for _debugCalculation (no secrets, bounded size).
 */

/**
 * @param {import('./types').CalculatorInput|null|undefined} input
 * @returns {Record<string, unknown>}
 */
export function sanitizeCalculatorInput(input) {
  if (!input || typeof input !== 'object') return {};
  const o = /** @type {Record<string, unknown>} */ (input);
  return {
    accountBalance: o.accountBalance,
    riskPercent: o.riskPercent,
    entry: o.entry,
    stop: o.stop,
    takeProfit: o.takeProfit,
    direction: o.direction,
    accountCurrency: o.accountCurrency,
    usdJpy: o.usdJpy,
    fxRateKeys:
      o.fxRates && typeof o.fxRates === 'object'
        ? Object.keys(/** @type {object} */ (o.fxRates)).slice(0, 32)
        : undefined,
  };
}

/**
 * @param {import('../instruments').InstrumentSpec|null} spec
 * @returns {Record<string, unknown>|null}
 */
export function sanitizeInstrumentSpecForDebug(spec) {
  if (!spec || typeof spec !== 'object') return null;
  return {
    symbol: spec.symbol,
    displayName: spec.displayName,
    assetClass: spec.assetClass,
    calculationMode: spec.calculationMode,
    contractSize: spec.contractSize,
    tickSize: spec.tickSize,
    pipSize: spec.pipSize,
    pointSize: spec.pointSize,
    valuePerPointPerLot: spec.valuePerPointPerLot,
    pricePrecision: spec.pricePrecision,
    quoteCurrency: spec.quoteCurrency,
    minReasonablePrice: spec.minReasonablePrice,
    maxReasonablePrice: spec.maxReasonablePrice,
    overridesApplied: spec._brokerOverridesApplied,
    overrideLog: spec._instrumentOverrideLog,
    registryFallback: spec._registryFallback,
    debugTrace: spec._debugTrace,
  };
}
