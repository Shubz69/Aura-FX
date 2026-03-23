/**
 * Main dispatcher: select calculator by instrument calculationMode and return normalized result.
 */
import { getInstrumentOrFallback } from '../instruments';
import { calculateForex } from './forexCalculator';
import { calculateCommodity } from './commodityCalculator';
import { calculateIndexCfd } from './indexCalculator';
import { calculateStockShare } from './stockCalculator';
import { calculateFutureContract } from './futuresCalculator';
import { calculateCryptoUnits } from './cryptoCalculator';
import { getForexPipValueUsdPerLot } from './forexPipValueUsd';

export {
  getClosedTradeResult,
  calcRMultiple,
  calcClosedTradePnL,
  calcClosedTradePnLAndR,
} from './closedTradePnL';

/**
 * @param {import('./types').CalculatorInput} input
 * @returns {string[]}
 */
export function validateInput(input) {
  const errors = [];
  if (input.accountBalance <= 0) errors.push('Account balance must be greater than 0.');
  if (input.riskPercent <= 0) errors.push('Risk % must be greater than 0.');
  if (input.entry === input.stop) errors.push('Entry must not equal stop.');
  if (input.takeProfit === input.entry) errors.push('Take profit must not equal entry.');
  if (input.direction === 'buy') {
    if (input.stop >= input.entry) errors.push('For BUY, stop must be below entry.');
    if (input.takeProfit <= input.entry) errors.push('For BUY, take profit must be above entry.');
  } else {
    if (input.stop <= input.entry) errors.push('For SELL, stop must be above entry.');
    if (input.takeProfit >= input.entry) errors.push('For SELL, take profit must be below entry.');
  }
  return errors;
}

/**
 * @param {string} symbol
 * @param {import('./types').CalculatorInput} input
 * @returns {import('./types').CalculatorResult}
 */
export function calculateRisk(symbol, input) {
  const spec = getInstrumentOrFallback(symbol);
  const mode = spec.calculationMode;

  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    return {
      riskAmount: (input.accountBalance * input.riskPercent) / 100,
      stopDistancePrice: Math.abs(input.entry - input.stop),
      takeProfitDistancePrice: Math.abs(input.takeProfit - input.entry),
      riskReward:
        Math.abs(input.entry - input.stop) > 0
          ? Math.abs(input.takeProfit - input.entry) / Math.abs(input.entry - input.stop)
          : 0,
      positionSize: 0,
      positionUnitLabel: 'lots',
      potentialProfit: 0,
      potentialLoss: (input.accountBalance * input.riskPercent) / 100,
      rMultiple: 0,
      warnings: validationErrors,
    };
  }

  switch (mode) {
    case 'forex':
      return calculateForex(input, spec);
    case 'commodity':
      return calculateCommodity(input, spec);
    case 'index_cfd':
      return calculateIndexCfd(input, spec);
    case 'stock_share':
      return calculateStockShare(input, spec);
    case 'future_contract':
      return calculateFutureContract(input, spec);
    case 'crypto_units':
    case 'crypto_lot':
      return calculateCryptoUnits(input, spec);
    default:
      return calculateForex(input, spec);
  }
}

/**
 * Derive stop loss price so that risk (balance × risk %) is preserved for a given position size.
 * When user enters position size manually, call this to get the SL that keeps risk constant.
 * @param {string} symbol
 * @param {{ accountBalance: number, riskPercent: number, entry: number, direction: 'buy'|'sell', positionSize: number, usdJpy?: number }} input
 * @returns {number|null} Stop loss price, or null if invalid (e.g. positionSize <= 0 or entry <= 0).
 */
export function deriveStopLossFromRiskAndPositionSize(symbol, input) {
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const { entry, direction, positionSize } = input;
  if (!entry || positionSize <= 0 || riskAmount <= 0) return null;

  const spec = getInstrumentOrFallback(symbol);
  const mode = spec.calculationMode;
  let stopDistancePrice = 0;

  switch (mode) {
    case 'forex': {
      const pipSize = spec.pipSize ?? 0.0001;
      const pipInfo = getForexPipValueUsdPerLot(spec, entry, { usdJpy: input.usdJpy });
      const pipValuePerLot = pipInfo.usdPerPipPerLot;
      if (pipValuePerLot == null || !Number.isFinite(pipValuePerLot) || pipValuePerLot <= 0) return null;
      const stopPips = riskAmount / (positionSize * pipValuePerLot);
      stopDistancePrice = stopPips * pipSize;
      break;
    }
    case 'commodity': {
      const contractSize = spec.contractSize ?? 100;
      if (contractSize <= 0) return null;
      stopDistancePrice = riskAmount / (positionSize * contractSize);
      break;
    }
    case 'index_cfd': {
      const pointSize = spec.pointSize ?? 1;
      const valuePerPoint = spec.valuePerPointPerLot ?? 1;
      if (valuePerPoint <= 0) return null;
      const stopPoints = riskAmount / (positionSize * valuePerPoint);
      stopDistancePrice = stopPoints * pointSize;
      break;
    }
    case 'stock_share':
      stopDistancePrice = riskAmount / positionSize;
      break;
    case 'future_contract': {
      const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.25;
      const tickValue = spec.tickValuePerLot ?? 10;
      if (tickValue <= 0) return null;
      const stopTicks = riskAmount / (positionSize * tickValue);
      stopDistancePrice = stopTicks * tickSize;
      break;
    }
    case 'crypto_units':
    case 'crypto_lot':
      stopDistancePrice = riskAmount / positionSize;
      break;
    default:
      return null;
  }

  if (stopDistancePrice <= 0) return null;
  return direction === 'buy' ? entry - stopDistancePrice : entry + stopDistancePrice;
}
