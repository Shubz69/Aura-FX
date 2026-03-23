import { roundToStep } from './utils';
import { getForexPipValueUsdPerLot } from './forexPipValueUsd';

/**
 * @param {import('./types').CalculatorInput} input
 * @param {import('../instruments').InstrumentSpec} spec
 * @returns {import('./types').CalculatorResult}
 */
export function calculateForex(input, spec) {
  const warnings = [];
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const stopDistancePrice = Math.abs(input.entry - input.stop);
  const takeProfitDistancePrice = Math.abs(input.takeProfit - input.entry);
  if (stopDistancePrice === 0) {
    return buildNoRiskResult(input.accountBalance, input.riskPercent, 'Stop equals entry');
  }
  const riskReward = takeProfitDistancePrice / stopDistancePrice;
  const pipSize = spec.pipSize ?? 0.0001;
  const stopPips = stopDistancePrice / pipSize;
  const takeProfitPips = takeProfitDistancePrice / pipSize;

  const pipInfo = getForexPipValueUsdPerLot(spec, input.entry, { usdJpy: input.usdJpy });
  if (pipInfo.missingUsdJpy) {
    warnings.push(
      'Enter USD/JPY (yen per US dollar) to convert pip value to USD for this JPY cross pair.'
    );
  }
  if (pipInfo.invalidEntry) {
    warnings.push('Enter a valid entry price to compute pip value in USD.');
  }
  if (pipInfo.missingConversion) {
    warnings.push(
      'This pair needs an extra FX rate to express pip value in USD; calculator cannot size it yet.'
    );
  }

  const pipValuePerLot = pipInfo.usdPerPipPerLot;
  if (pipValuePerLot == null || !Number.isFinite(pipValuePerLot) || pipValuePerLot <= 0) {
    return {
      riskAmount,
      stopDistancePrice,
      takeProfitDistancePrice,
      stopDistanceAlt: Math.round(stopPips * 100) / 100,
      takeProfitDistanceAlt: Math.round(takeProfitPips * 100) / 100,
      altUnitLabel: 'pips',
      riskReward,
      positionSize: 0,
      positionUnitLabel: 'lots',
      potentialProfit: 0,
      potentialLoss: 0,
      rMultiple: riskReward,
      warnings,
    };
  }

  const positionSizeLots = riskAmount / (stopPips * pipValuePerLot);
  const lotStep = spec.lotStep ?? 0.01;
  let positionSize = Math.max(0, roundToStep(positionSizeLots, lotStep));

  if (spec.minLot != null) {
    if (positionSizeLots > 0 && positionSizeLots < spec.minLot) {
      warnings.push('Trade size below minimum lot size for this instrument');
      if (positionSize === 0) positionSize = positionSizeLots;
    } else if (positionSize > 0 && positionSize < spec.minLot) {
      warnings.push('Trade size below minimum lot size for this instrument');
    }
  }
  if (spec.maxLot != null && positionSize > spec.maxLot) {
    warnings.push(`Position size ${positionSize} exceeds maximum ${spec.maxLot} lots.`);
  }

  const potentialLoss = positionSize * pipValuePerLot * stopPips;
  const potentialProfit = positionSize * pipValuePerLot * takeProfitPips;
  const rMultiple = riskReward;

  return {
    riskAmount,
    stopDistancePrice,
    takeProfitDistancePrice,
    stopDistanceAlt: Math.round(stopPips * 100) / 100,
    takeProfitDistanceAlt: Math.round(takeProfitPips * 100) / 100,
    altUnitLabel: 'pips',
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
