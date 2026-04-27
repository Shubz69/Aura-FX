/**
 * Unique "Why it matters" lines for Market Change Today / timeline rows (by session order).
 * Rotates for list length > 4 so copy never defaults to one generic string.
 */
import i18n from '../../i18n/config';

const WHY_KEYS = [
  'traderDeck.outlook.why0',
  'traderDeck.outlook.why1',
  'traderDeck.outlook.why2',
  'traderDeck.outlook.why3',
];

export function sessionWhyItMatters(index) {
  const i = Math.max(0, Number(index) || 0);
  return i18n.t(WHY_KEYS[i % WHY_KEYS.length]);
}
