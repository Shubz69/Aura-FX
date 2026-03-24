import { getRiskAmountUsd, convertUsdPnLToAccount } from './accountCurrency';

/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateStockShare(input, spec) {
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
  const shares = (riskUsd != null ? riskUsd : 0) / stopDistancePrice;
  const positionSize = Math.max(0, Math.floor(shares));

  const potentialLossUsd = positionSize * stopDistancePrice;
  const potentialProfitUsd = positionSize * takeProfitDistancePrice;
  const { potentialProfit, potentialLoss } = convertUsdPnLToAccount(potentialProfitUsd, potentialLossUsd, input);
  const rMultiple = riskReward;

  if (positionSize > 0 && potentialLoss > riskAmount * 1.01) {
    warnings.push('Rounded share count may slightly exceed risk amount.');
  }

  return {
    riskAmount,
    stopDistancePrice,
    takeProfitDistancePrice,
    riskReward,
    positionSize,
    positionUnitLabel: 'shares',
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
    positionUnitLabel: 'shares',
    potentialProfit: 0,
    potentialLoss: riskAmount,
    rMultiple: 0,
    warnings: [reason],
  };
}
