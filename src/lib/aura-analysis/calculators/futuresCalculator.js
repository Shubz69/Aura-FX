import { getRiskAmountUsd, convertUsdPnLToAccount } from './accountCurrency';

/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateFutureContract(input, spec) {
  const warnings = [];
  const { riskUsd, riskAccount } = getRiskAmountUsd(input);
  const riskAmount = riskAccount;
  if (riskUsd == null) warnings.push('Load FX rates or use USD account currency to size this trade.');
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
  let contracts = (riskUsd != null ? riskUsd : 0) / riskPerContract;
  if (spec.wholeContractsOnly) contracts = Math.floor(contracts);
  const positionSize = Math.max(0, contracts);

  const tpTicks = takeProfitDistancePrice / tickSize;
  const potentialLossUsd = positionSize * riskPerContract;
  const potentialProfitUsd = positionSize * tpTicks * tickValue;
  const { potentialProfit, potentialLoss } = convertUsdPnLToAccount(potentialProfitUsd, potentialLossUsd, input);
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
