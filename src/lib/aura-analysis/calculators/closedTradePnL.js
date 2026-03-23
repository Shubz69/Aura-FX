import { getInstrumentOrFallback } from '../instruments';
import { getForexPipValueUsdPerLot } from './forexPipValueUsd';

export function getClosedTradeResult(entry, exit, direction) {
  if (exit === entry) return 'breakeven';
  if (direction === 'buy') return exit > entry ? 'win' : 'loss';
  return exit < entry ? 'win' : 'loss';
}

export function calcRMultiple(riskAmount, pnl) {
  if (riskAmount <= 0) return 0;
  return pnl / riskAmount;
}

/**
 * @param {string} symbol
 * @param {number} entry
 * @param {number} exit
 * @param {number} positionSize
 * @param {'buy'|'sell'} direction
 * @param {{ usdJpy?: number }} [options]
 */
export function calcClosedTradePnL(symbol, entry, exit, positionSize, direction, options = {}) {
  if (positionSize <= 0) return 0;
  const spec = getInstrumentOrFallback(symbol);
  const priceDiff = direction === 'buy' ? exit - entry : entry - exit;
  const mode = spec.calculationMode;

  switch (mode) {
    case 'forex': {
      const pipSize = spec.pipSize ?? 0.0001;
      const pips = priceDiff / pipSize;
      const pipInfo = getForexPipValueUsdPerLot(spec, entry, { usdJpy: options.usdJpy });
      const pipValuePerLot = pipInfo.usdPerPipPerLot;
      if (pipValuePerLot == null || !Number.isFinite(pipValuePerLot)) return 0;
      return pips * pipValuePerLot * positionSize;
    }
    case 'commodity': {
      const contractSize = spec.contractSize ?? 100;
      return priceDiff * contractSize * positionSize;
    }
    case 'index_cfd': {
      const pointSize = spec.pointSize ?? 1;
      const valuePerPoint = spec.valuePerPointPerLot ?? 1;
      const points = priceDiff / pointSize;
      return points * valuePerPoint * positionSize;
    }
    case 'stock_share':
      return priceDiff * positionSize;
    case 'future_contract': {
      const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.25;
      const tickValue = spec.tickValuePerLot ?? 10;
      const ticks = priceDiff / tickSize;
      return ticks * tickValue * positionSize;
    }
    case 'crypto_units':
    case 'crypto_lot':
      return priceDiff * positionSize;
    default:
      return priceDiff * (spec.contractSize ?? 100_000) * (spec.pipSize ?? 0.0001) * positionSize;
  }
}

export function calcClosedTradePnLAndR(entry, exit, positionSize, riskAmount, direction, symbol, options = {}) {
  const pnl = calcClosedTradePnL(symbol, entry, exit, positionSize, direction, options);
  const rMultiple = calcRMultiple(riskAmount, pnl);
  const result = getClosedTradeResult(entry, exit, direction);
  return { pnl, rMultiple, result };
}
