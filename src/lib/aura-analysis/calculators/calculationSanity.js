/**
 * Pre- and post-checks so the calculator never returns nonsensical position sizes or NaNs.
 */

/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {string[]}
 */
export function collectPreCalculationSanityErrors(spec, input) {
  const errs = [];
  const { entry, stop, takeProfit } = input;
  if (!Number.isFinite(entry) || entry <= 0) errs.push('Entry price must be a positive number.');
  if (!Number.isFinite(stop) || !Number.isFinite(takeProfit)) errs.push('Stop and take-profit must be valid numbers.');
  const stopDist = Math.abs(entry - stop);
  if (!Number.isFinite(stopDist) || stopDist <= 0) errs.push('Stop distance is invalid or zero.');
  const mode = spec.calculationMode;
  if (mode === 'forex') {
    const pip = spec.pipSize ?? 0.0001;
    if (!Number.isFinite(pip) || pip <= 0) errs.push('Instrument pip size is invalid.');
  }
  if (mode === 'commodity' || mode === 'future_contract') {
    const cs = spec.contractSize ?? 0;
    if (!Number.isFinite(cs) || cs <= 0) errs.push('Instrument contract size is invalid.');
  }
  if (mode === 'index_cfd') {
    const v = spec.valuePerPointPerLot ?? 0;
    if (!Number.isFinite(v) || v <= 0) errs.push('Instrument value-per-point is invalid.');
  }
  if (mode === 'crypto_units' || mode === 'crypto_lot') {
    if (spec.contractSize != null) {
      const cs = Number(spec.contractSize);
      if (!Number.isFinite(cs) || cs <= 0) errs.push('Instrument contract size is invalid.');
    }
  }
  if (spec._brokerOverridesApplied) {
    const cap = 1e15;
    for (const k of [
      'contractSize',
      'tickSize',
      'valuePerPointPerLot',
      'tickValuePerLot',
      'pipSize',
      'pointSize',
      'minLot',
      'maxLot',
    ]) {
      const v = spec[k];
      if (v == null) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) errs.push(`Override field ${k} is not a finite number.`);
      else if (n < 0) errs.push(`Override field ${k} cannot be negative.`);
      else if (Math.abs(n) > cap) errs.push(`Override field ${k} exceeds safe magnitude.`);
    }
  }
  return errs;
}

/**
 * @param {import('./types').CalculatorResult} res
 * @returns {string[]}
 */
export function collectResultSanityErrors(res) {
  const e = [];
  if (!Number.isFinite(res.positionSize) || res.positionSize < 0 || res.positionSize > 1e15) {
    e.push('Computed position size is invalid.');
  }
  if (!Number.isFinite(res.riskAmount) || !Number.isFinite(res.stopDistancePrice)) {
    e.push('Risk calculation produced non-finite values.');
  }
  if (!Number.isFinite(res.potentialProfit) || !Number.isFinite(res.potentialLoss)) {
    e.push('Profit/loss projection is invalid.');
  }
  return e;
}

/**
 * Non-blocking hint when entry is outside typical quote range (still calculate P/L).
 * @param {import('../instruments').InstrumentSpec} spec
 * @param {import('./types').CalculatorInput} input
 * @returns {string[]}
 */
export function getEntryPriceRangeWarnings(spec, input) {
  const entry = input.entry;
  if (!Number.isFinite(entry) || entry <= 0) return [];
  const minP = spec.minReasonablePrice;
  const maxP = spec.maxReasonablePrice;
  if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP) return [];
  const span = maxP - minP;
  const pad = Math.max(span * 0.05, Math.abs(entry) * 1e-6, 1e-9);
  if (entry < minP - pad || entry > maxP + pad) {
    return [
      `Entry price looks outside the typical range for this instrument (${minP}–${maxP}). Check symbol and price.`,
    ];
  }
  return [];
}

/**
 * @param {import('./types').CalculatorInput} input
 * @param {string[]} warnings
 * @param {string} [errorCode]
 * @returns {import('./types').CalculatorResult}
 */
export function buildBlockedCalculationResult(input, warnings, errorCode) {
  const rd = Math.abs(input.entry - input.stop);
  const td = Math.abs(input.takeProfit - input.entry);
  return {
    riskAmount: (input.accountBalance * input.riskPercent) / 100,
    stopDistancePrice: Number.isFinite(rd) ? rd : 0,
    takeProfitDistancePrice: Number.isFinite(td) ? td : 0,
    riskReward: rd > 0 && Number.isFinite(td) ? td / rd : 0,
    positionSize: 0,
    positionUnitLabel: 'lots',
    potentialProfit: 0,
    potentialLoss: (input.accountBalance * input.riskPercent) / 100,
    rMultiple: 0,
    warnings,
    calculationBlocked: true,
    ...(errorCode ? { errorCode } : {}),
  };
}
