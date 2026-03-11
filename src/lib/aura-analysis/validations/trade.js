/**
 * Trade calculator and trade result validation (mirrors Zod schemas from repo).
 */

export function validateTradeCalculatorForm(data) {
  const errors = [];
  if (!data.pair || String(data.pair).trim() === '') errors.push({ field: 'pair', message: 'Pair is required' });
  if (data.direction !== 'buy' && data.direction !== 'sell') errors.push({ field: 'direction', message: 'Direction must be buy or sell' });
  const balance = Number(data.accountBalance);
  if (!Number.isFinite(balance) || balance <= 0) errors.push({ field: 'accountBalance', message: 'Balance must be positive' });
  const risk = Number(data.riskPercent);
  if (!Number.isFinite(risk) || risk < 0.01 || risk > 100) errors.push({ field: 'riskPercent', message: 'Risk must be between 0.01 and 100%' });
  const entry = Number(data.entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) errors.push({ field: 'entryPrice', message: 'Entry must be positive' });
  const stop = Number(data.stopLoss);
  if (!Number.isFinite(stop) || stop <= 0) errors.push({ field: 'stopLoss', message: 'Stop loss must be positive' });
  const tp = Number(data.takeProfit);
  if (!Number.isFinite(tp) || tp <= 0) errors.push({ field: 'takeProfit', message: 'Take profit must be positive' });
  if (Number(stop) === Number(entry)) errors.push({ field: 'stopLoss', message: 'Stop loss cannot equal entry' });
  if (Number(tp) === Number(entry)) errors.push({ field: 'takeProfit', message: 'Take profit cannot equal entry' });
  const pos = Number(data.positionSize);
  if (data.positionSize != null && data.positionSize !== '' && (!Number.isFinite(pos) || pos < 0)) errors.push({ field: 'positionSize', message: 'Position size must be 0 or positive' });
  return errors;
}

export function validateTradeResultForm(data) {
  const errors = [];
  if (!['win', 'loss', 'breakeven'].includes(data.result)) errors.push({ field: 'result', message: 'Result must be win, loss, or breakeven' });
  return errors;
}
