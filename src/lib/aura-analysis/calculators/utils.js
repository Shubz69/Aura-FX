/**
 * Rounding helper for the calculator (position size steps).
 */
export function roundToStep(value, step) {
  if (step <= 0 || !Number.isFinite(step)) return value;
  const rounded = Math.round(value / step) * step;
  const decimals = step >= 1 ? 0 : String(step).split('.')[1]?.length ?? 8;
  return Number(rounded.toFixed(decimals));
}
