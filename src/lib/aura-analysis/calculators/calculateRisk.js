/**
 * Main dispatcher: select calculator by instrument calculationMode and return normalized result.
 */
import {
  getInstrumentForWatchlistSymbol,
  getInstrumentResolutionDebugTrace,
} from '../instruments';
import { isInstrumentStrictMode, isInstrumentDebugEnabled } from '../instrumentEnv';
import {
  buildBlockedCalculationResult,
  collectPreCalculationSanityErrors,
  collectResultSanityErrors,
} from './calculationSanity';
import { sanitizeCalculatorInput, sanitizeInstrumentSpecForDebug } from './calculationDebug';
import { logInfo } from '../../../utils/systemLogger';
import { generateRequestId } from '../../../utils/requestCorrelation';
import { recordCalculationOutcome } from '../../../utils/systemMetrics';
import * as ErrorCodes from '../../../utils/errorCodes';
import { calculateForex } from './forexCalculator';
import { calculateCommodity } from './commodityCalculator';
import { calculateIndexCfd } from './indexCalculator';
import { calculateStockShare } from './stockCalculator';
import { calculateFutureContract } from './futuresCalculator';
import { calculateCryptoUnits } from './cryptoCalculator';
import { getForexPipValueUsdPerLot } from './forexPipValueUsd';
import { getRiskAmountUsd } from './accountCurrency';

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
 * @param {import('./types').CalculatorResult} result
 * @param {object} ctx
 * @returns {import('./types').CalculatorResult}
 */
function attachCalculationDebug(result, ctx) {
  if (!isInstrumentDebugEnabled()) return result;
  return {
    ...result,
    _debugCalculation: {
      inputs: sanitizeCalculatorInput(ctx.input),
      normalizedInputs: sanitizeCalculatorInput(ctx.input),
      instrumentSpecUsed: sanitizeInstrumentSpecForDebug(ctx.spec),
      resolutionTrace: ctx.resolutionTrace,
      overridesApplied: Boolean(ctx.spec?._brokerOverridesApplied),
      sanityChecksPassed: ctx.sanityChecksPassed,
      blockedReason: ctx.blockedReason ?? null,
    },
  };
}

function withRequestMeta(result, requestId) {
  if (!requestId) return result;
  return { ...result, requestId };
}

function finishCalc(result, blocked, requestId) {
  recordCalculationOutcome(blocked);
  return withRequestMeta(result, requestId);
}

/**
 * @param {string} symbol
 * @param {import('./types').CalculatorInput} input
 * @param {{ brokerOverrides?: object, mt5Overrides?: object, requestId?: string }} [calcOptions]
 * @returns {import('./types').CalculatorResult}
 */
export function calculateRisk(symbol, input, calcOptions = {}) {
  const requestId = calcOptions.requestId || generateRequestId();
  const log = (payload) => ({ ...payload, requestId });

  const resolutionTrace = getInstrumentResolutionDebugTrace(symbol, calcOptions);
  const spec = getInstrumentForWatchlistSymbol(symbol, calcOptions);
  const debugCtxBase = {
    symbol,
    input,
    calcOptions,
    spec,
    resolutionTrace,
  };

  if (!spec) {
    const msg = isInstrumentStrictMode()
      ? 'Calculator: instrument is not registered for this symbol (strict mode).'
      : 'Calculator: could not resolve instrument specification.';
    const code = isInstrumentStrictMode() ? ErrorCodes.INVALID_SYMBOL : ErrorCodes.SYSTEM_ERROR;
    logInfo('calculator', 'risk_blocked', log({ symbol, reason: 'no_spec', strictMode: isInstrumentStrictMode(), code }));
    return finishCalc(
      attachCalculationDebug(buildBlockedCalculationResult(input, [msg], code), {
        ...debugCtxBase,
        sanityChecksPassed: false,
        blockedReason: 'no_spec',
      }),
      true,
      requestId
    );
  }
  const mode = spec.calculationMode;

  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    logInfo('calculator', 'risk_blocked', log({ symbol, reason: 'validation', mode, code: ErrorCodes.CALCULATION_BLOCKED }));
    return finishCalc(
      attachCalculationDebug(
        {
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
          errorCode: ErrorCodes.CALCULATION_BLOCKED,
        },
        { ...debugCtxBase, sanityChecksPassed: false, blockedReason: 'validation' }
      ),
      true,
      requestId
    );
  }

  const sanityErrors = collectPreCalculationSanityErrors(spec, input);
  if (sanityErrors.length > 0) {
    logInfo('calculator', 'risk_blocked', log({ symbol, reason: 'sanity_pre', mode, code: ErrorCodes.CALCULATION_BLOCKED }));
    return finishCalc(
      attachCalculationDebug(buildBlockedCalculationResult(input, sanityErrors, ErrorCodes.CALCULATION_BLOCKED), {
        ...debugCtxBase,
        sanityChecksPassed: false,
        blockedReason: 'sanity_pre',
      }),
      true,
      requestId
    );
  }

  let result;
  switch (mode) {
    case 'forex':
      result = calculateForex(input, spec);
      break;
    case 'commodity':
      result = calculateCommodity(input, spec);
      break;
    case 'index_cfd':
      result = calculateIndexCfd(input, spec);
      break;
    case 'stock_share':
      result = calculateStockShare(input, spec);
      break;
    case 'future_contract':
      result = calculateFutureContract(input, spec);
      break;
    case 'crypto_units':
    case 'crypto_lot':
      result = calculateCryptoUnits(input, spec);
      break;
    default:
      result = calculateForex(input, spec);
      break;
  }

  const postErrors = collectResultSanityErrors(result);
  if (postErrors.length > 0) {
    logInfo('calculator', 'risk_blocked', log({ symbol, reason: 'sanity_post', mode, code: ErrorCodes.CALCULATION_BLOCKED }));
    return finishCalc(
      attachCalculationDebug(buildBlockedCalculationResult(input, postErrors, ErrorCodes.CALCULATION_BLOCKED), {
        ...debugCtxBase,
        sanityChecksPassed: false,
        blockedReason: 'sanity_post',
      }),
      true,
      requestId
    );
  }

  logInfo('calculator', 'risk_calculated', log({
    symbol,
    mode,
    positionSize: result.positionSize,
    positionUnitLabel: result.positionUnitLabel,
  }));

  return finishCalc(
    attachCalculationDebug(result, {
      ...debugCtxBase,
      sanityChecksPassed: true,
      blockedReason: null,
    }),
    false,
    requestId
  );
}

/**
 * Derive stop loss price so that risk (balance × risk %) is preserved for a given position size.
 * @param {string} symbol
 * @param {{ accountBalance: number, riskPercent: number, entry: number, direction: 'buy'|'sell', positionSize: number, usdJpy?: number }} input
 * @returns {number|null} Stop loss price, or null if invalid (e.g. positionSize <= 0 or entry <= 0).
 */
export function deriveStopLossFromRiskAndPositionSize(symbol, input) {
  const { riskUsd, riskAccount } = getRiskAmountUsd(input);
  const riskForSizing = riskUsd != null ? riskUsd : 0;
  const { entry, direction, positionSize } = input;
  if (!entry || positionSize <= 0 || riskAccount <= 0) return null;

  const spec = getInstrumentForWatchlistSymbol(symbol);
  if (!spec) return null;
  const mode = spec.calculationMode;
  let stopDistancePrice = 0;

  switch (mode) {
    case 'forex': {
      const pipSize = spec.pipSize ?? 0.0001;
      const pipInfo = getForexPipValueUsdPerLot(spec, entry, {
        usdJpy: input.usdJpy,
        fxRates: input.fxRates || {},
      });
      const pipValuePerLot = pipInfo.usdPerPipPerLot;
      if (pipValuePerLot == null || !Number.isFinite(pipValuePerLot) || pipValuePerLot <= 0) return null;
      const stopPips = riskForSizing / (positionSize * pipValuePerLot);
      stopDistancePrice = stopPips * pipSize;
      break;
    }
    case 'commodity': {
      const contractSize = spec.contractSize ?? 100;
      if (contractSize <= 0) return null;
      stopDistancePrice = riskForSizing / (positionSize * contractSize);
      break;
    }
    case 'index_cfd': {
      const pointSize = spec.pointSize ?? 1;
      const valuePerPoint = spec.valuePerPointPerLot ?? 1;
      if (valuePerPoint <= 0) return null;
      const stopPoints = riskForSizing / (positionSize * valuePerPoint);
      stopDistancePrice = stopPoints * pointSize;
      break;
    }
    case 'stock_share':
      stopDistancePrice = riskForSizing / positionSize;
      break;
    case 'future_contract': {
      const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.25;
      const tickValue = spec.tickValuePerLot ?? 10;
      if (tickValue <= 0) return null;
      const stopTicks = riskForSizing / (positionSize * tickValue);
      stopDistancePrice = stopTicks * tickSize;
      break;
    }
    case 'crypto_units':
    case 'crypto_lot':
      stopDistancePrice = riskForSizing / positionSize;
      break;
    default:
      return null;
  }

  if (stopDistancePrice <= 0) return null;
  return direction === 'buy' ? entry - stopDistancePrice : entry + stopDistancePrice;
}
