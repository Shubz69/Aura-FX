/**
 * Shared types for the instrument-aware risk calculator.
 */

/** @typedef {'lots' | 'shares' | 'contracts' | 'units'} PositionUnitLabel */
/** @typedef {'pips' | 'points' | 'ticks'} AltUnitLabel */

/**
 * @typedef {Object} CalculatorInput
 * @property {number} accountBalance
 * @property {number} riskPercent
 * @property {number} entry
 * @property {number} stop
 * @property {number} takeProfit
 * @property {'buy' | 'sell'} direction
 * @property {string} [accountCurrency] - ISO code; balance and risk amount interpreted in this currency (default USD)
 * @property {Record<string, number>} [fxRates] - hub pairs from snapshot, e.g. EURUSD, GBPUSD, USDJPY (USD per unit of base where applicable)
 * @property {number} [usdJpy] - USD/JPY rate; required for JPY crosses (EURJPY, GBPJPY) for USD pip value when not in snapshot
 */

/**
 * @typedef {Object} CalculatorResult
 * @property {number} riskAmount
 * @property {number} stopDistancePrice
 * @property {number} takeProfitDistancePrice
 * @property {number} [stopDistanceAlt]
 * @property {number} [takeProfitDistanceAlt]
 * @property {AltUnitLabel} [altUnitLabel]
 * @property {number} riskReward
 * @property {number} positionSize
 * @property {PositionUnitLabel} positionUnitLabel
 * @property {number} potentialProfit
 * @property {number} potentialLoss
 * @property {number} rMultiple
 * @property {string[]} warnings
 */

export const CALCULATOR_TYPES = Object.freeze({});
