import { roundToStep } from './utils';
import { getRiskAmountUsd, convertUsdPnLToAccount } from './accountCurrency';

/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateIndexCfd(input, spec) {
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
  const pointSize = spec.pointSize ?? 1;
  const valuePerPoint = spec.valuePerPointPerLot ?? 1;
  const stopPoints = stopDistancePrice / pointSize;
  const riskPerLot = stopPoints * valuePerPoint;
  const lots = (riskUsd != null ? riskUsd : 0) / riskPerLot;
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

  const takeProfitPoints = takeProfitDistancePrice / pointSize;
  const potentialLossUsd = positionSize * riskPerLot;
  const potentialProfitUsd = positionSize * takeProfitPoints * valuePerPoint;
  const { potentialProfit, potentialLoss } = convertUsdPnLToAccount(potentialProfitUsd, potentialLossUsd, input);
  const rMultiple = riskReward;

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
