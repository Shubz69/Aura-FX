/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateFutureContract(input, spec) {
  const warnings = [];
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const stopDistancePrice = Math.abs(input.entry - input.stop);
  const takeProfitDistancePrice = Math.abs(input.takeProfit - input.entry);
  if (stopDistancePrice === 0) {
    return buildNoRiskResult(input.accountBalance, input.riskPercent, 'Stop equals entry');
  }
  const riskReward = takeProfitDistancePrice / stopDistancePrice;
  const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.25;
  const tickValue = spec.tickValuePerLot ?? 10;
  const stopTicks = stopDistancePrice / tickSize;
  const riskPerContract = stopTicks * tickValue;
  let contracts = riskAmount / riskPerContract;
  if (spec.wholeContractsOnly) contracts = Math.floor(contracts);
  const positionSize = Math.max(0, contracts);

  const tpTicks = takeProfitDistancePrice / tickSize;
  const potentialLoss = positionSize * riskPerContract;
  const potentialProfit = positionSize * tpTicks * tickValue;
  const rMultiple = riskReward;

  if (spec.wholeContractsOnly && positionSize > 0 && potentialLoss < riskAmount * 0.5) {
    warnings.push('Whole contracts only; next size may exceed risk.');
  }

  return {
    riskAmount,
    stopDistancePrice,
    takeProfitDistancePrice,
    stopDistanceAlt: Math.round(stopTicks * 100) / 100,
    takeProfitDistanceAlt: Math.round(tpTicks * 100) / 100,
    altUnitLabel: 'ticks',
    riskReward,
    positionSize,
    positionUnitLabel: 'contracts',
    potentialProfit,
    potentialLoss,
    rMultiple,
    warnings,
  };
}

function buildNoRiskResult(balance, riskPercent, reason) {
  const riskAmount = (balance * riskPercent) / 100;
  return {
    riskAmount,
    stopDistancePrice: 0,
    takeProfitDistancePrice: 0,
    riskReward: 0,
    positionSize: 0,
    positionUnitLabel: 'contracts',
    potentialProfit: 0,
    potentialLoss: riskAmount,
    rMultiple: 0,
    warnings: [reason],
  };
}
