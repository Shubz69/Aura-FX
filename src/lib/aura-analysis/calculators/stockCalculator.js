/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateStockShare(input, spec) {
  const warnings = [];
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const stopDistancePrice = Math.abs(input.entry - input.stop);
  const takeProfitDistancePrice = Math.abs(input.takeProfit - input.entry);
  if (stopDistancePrice === 0) {
    return buildNoRiskResult(input.accountBalance, input.riskPercent, 'Stop equals entry');
  }
  const riskReward = takeProfitDistancePrice / stopDistancePrice;
  const shares = riskAmount / stopDistancePrice;
  const positionSize = Math.max(0, Math.floor(shares));

  const potentialLoss = positionSize * stopDistancePrice;
  const potentialProfit = positionSize * takeProfitDistancePrice;
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
