import { roundToStep } from './utils';

/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateCommodity(input, spec) {
  const warnings = [];
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const stopDistancePrice = Math.abs(input.entry - input.stop);
  const takeProfitDistancePrice = Math.abs(input.takeProfit - input.entry);
  if (stopDistancePrice === 0) {
    return buildNoRiskResult(input.accountBalance, input.riskPercent, 'Stop equals entry');
  }
  const riskReward = takeProfitDistancePrice / stopDistancePrice;
  const contractSize = spec.contractSize ?? 100;
  const dollarRiskPerLot = stopDistancePrice * contractSize;
  const lots = riskAmount / dollarRiskPerLot;
  const lotStep = spec.lotStep ?? 0.01;
  let positionSize = Math.max(0, roundToStep(lots, lotStep));

  if (spec.minLot != null) {
    if (lots > 0 && lots < spec.minLot) {
      warnings.push('Trade size below minimum lot size for this instrument');
      if (positionSize === 0) positionSize = lots;
    } else if (positionSize > 0 && positionSize < spec.minLot) {
      warnings.push('Trade size below minimum lot size for this instrument');
    }
  }
  if (spec.maxLot != null && positionSize > spec.maxLot) {
    warnings.push(`Position size ${positionSize} exceeds maximum ${spec.maxLot} lots.`);
  }

  const potentialLoss = positionSize * dollarRiskPerLot;
  const potentialProfit = positionSize * takeProfitDistancePrice * contractSize;
  const rMultiple = riskReward;
  const pointSize = spec.pointSize ?? 1;
  const stopPoints = stopDistancePrice / pointSize;
  const takeProfitPoints = takeProfitDistancePrice / pointSize;

  return {
    riskAmount,
    stopDistancePrice,
    takeProfitDistancePrice,
    stopDistanceAlt: Math.round(stopPoints * 100) / 100,
    takeProfitDistanceAlt: Math.round(takeProfitPoints * 100) / 100,
    altUnitLabel: 'points',
    riskReward,
    positionSize,
    positionUnitLabel: 'lots',
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
    positionUnitLabel: 'lots',
    potentialProfit: 0,
    potentialLoss: riskAmount,
    rMultiple: 0,
    warnings: [reason],
  };
}
