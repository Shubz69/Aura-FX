import { roundToStep } from './utils';

/**
 * Unit-based crypto (spot style): units = riskAmount / stopDistancePrice.
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateCryptoUnits(input, spec) {
  const warnings = [];
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const stopDistancePrice = Math.abs(input.entry - input.stop);
  const takeProfitDistancePrice = Math.abs(input.takeProfit - input.entry);
  if (stopDistancePrice === 0) {
    return buildNoRiskResult(input.accountBalance, input.riskPercent, 'Stop equals entry');
  }
  const riskReward = takeProfitDistancePrice / stopDistancePrice;
  const units = riskAmount / stopDistancePrice;
  const precision = spec.pricePrecision ?? 4;
  const step = Math.pow(10, -precision);
  const positionSize = Math.max(0, roundToStep(units, step));

  const potentialLoss = positionSize * stopDistancePrice;
  const potentialProfit = positionSize * takeProfitDistancePrice;
  const rMultiple = riskReward;

  return {
    riskAmount,
    stopDistancePrice,
    takeProfitDistancePrice,
    riskReward,
    positionSize,
    positionUnitLabel: 'units',
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
    positionUnitLabel: 'units',
    potentialProfit: 0,
    potentialLoss: riskAmount,
    rMultiple: 0,
    warnings: [reason],
  };
}
