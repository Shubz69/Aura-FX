/**
 * Unique "Why it matters" lines for Market Change Today / timeline rows (by session order).
 * Rotates for list length > 4 so copy never defaults to one generic string.
 */
export const MARKET_CHANGE_WHY_BY_INDEX = [
  'USD rebalancing resets short-term positioning → FX pairs lose directional clarity until a new driver emerges.',
  'Gold reacting to real yields signals macro sensitivity remains intact → not an isolated move, but part of rate-driven repricing.',
  'Oil influencing inflation expectations feeds directly into rates → creates second-order impact across FX and equities.',
  'Geopolitical premium lifts volatility across assets → reduces correlation stability and increases false directional moves.',
];

export function sessionWhyItMatters(index) {
  const i = Math.max(0, Number(index) || 0);
  return MARKET_CHANGE_WHY_BY_INDEX[i % MARKET_CHANGE_WHY_BY_INDEX.length];
}
