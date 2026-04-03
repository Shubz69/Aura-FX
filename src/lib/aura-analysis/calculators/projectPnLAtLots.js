/**
 * P/L for a fixed position size (lots/units/contracts) from entry/stop/TP distances.
 * Used when auto-sized position is 0 (blocked calc, missing pip USD, etc.) but the user entered a size.
 */
import { getInstrumentForWatchlistSymbol } from '../instruments';
import { getForexPipValueUsdPerLot } from './forexPipValueUsd';
import { convertUsdPnLToAccount } from './accountCurrency';

/**
 * @param {string} symbol
 * @param {import('./types').CalculatorInput} input
 * @param {number} positionSize - lots / units / contracts depending on instrument
 * @param {object} [calcOptions]
 * @returns {{ potentialProfit: number, potentialLoss: number } | null}
 */
export function projectPnLAtLots(symbol, input, positionSize, calcOptions = {}) {
  const lots = Number(positionSize);
  if (!Number.isFinite(lots) || lots <= 0) return null;
  const entry = Number(input.entry);
  const stop = Number(input.stop);
  const tp = Number(input.takeProfit);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(tp)) return null;
  const stopDistance = Math.abs(entry - stop);
  const tpDistance = Math.abs(tp - entry);
  if (stopDistance <= 0) return null;

  const spec = getInstrumentForWatchlistSymbol(symbol, calcOptions);
  if (!spec) return null;

  const mode = spec.calculationMode;
  let profitUsd;
  let lossUsd;

  switch (mode) {
    case 'forex': {
      const pipSize = spec.pipSize ?? 0.0001;
      const stopPips = stopDistance / pipSize;
      const tpPips = tpDistance / pipSize;
      const pipInfo = getForexPipValueUsdPerLot(spec, entry, {
        usdJpy: input.usdJpy,
        fxRates: input.fxRates || {},
      });
      const pipUsd = pipInfo.usdPerPipPerLot;
      if (pipUsd == null || !Number.isFinite(pipUsd) || pipUsd <= 0) return null;
      lossUsd = lots * pipUsd * stopPips;
      profitUsd = lots * pipUsd * tpPips;
      break;
    }
    case 'commodity': {
      const cs = spec.contractSize ?? 100;
      lossUsd = lots * stopDistance * cs;
      profitUsd = lots * tpDistance * cs;
      break;
    }
    case 'index_cfd': {
      const pointSize = spec.pointSize ?? 1;
      const valuePerPoint = spec.valuePerPointPerLot ?? 1;
      const stopPoints = stopDistance / pointSize;
      const tpPoints = tpDistance / pointSize;
      lossUsd = lots * stopPoints * valuePerPoint;
      profitUsd = lots * tpPoints * valuePerPoint;
      break;
    }
    case 'stock_share': {
      lossUsd = lots * stopDistance;
      profitUsd = lots * tpDistance;
      break;
    }
    case 'future_contract': {
      const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.25;
      const tickValue = spec.tickValuePerLot ?? 10;
      const stopTicks = stopDistance / tickSize;
      const tpTicks = tpDistance / tickSize;
      lossUsd = lots * stopTicks * tickValue;
      profitUsd = lots * tpTicks * tickValue;
      break;
    }
    case 'crypto_units':
    case 'crypto_lot': {
      const cs =
        spec.contractSize != null && Number(spec.contractSize) > 0 ? Number(spec.contractSize) : 1;
      lossUsd = lots * stopDistance * cs;
      profitUsd = lots * tpDistance * cs;
      break;
    }
    default: {
      const pipSize = spec.pipSize ?? 0.0001;
      const stopPips = stopDistance / pipSize;
      const tpPips = tpDistance / pipSize;
      const pipInfo = getForexPipValueUsdPerLot(spec, entry, {
        usdJpy: input.usdJpy,
        fxRates: input.fxRates || {},
      });
      const pipUsd = pipInfo.usdPerPipPerLot;
      if (pipUsd == null || !Number.isFinite(pipUsd) || pipUsd <= 0) return null;
      lossUsd = lots * pipUsd * stopPips;
      profitUsd = lots * pipUsd * tpPips;
    }
  }

  return convertUsdPnLToAccount(profitUsd, lossUsd, input);
}
