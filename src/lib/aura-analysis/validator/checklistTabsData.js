/**
 * The Operator – Scalp / Intra Day / Swing. Each tab sums to exactly 100 points.
 *
 * Optional on any item: exampleImageSrc — public URL, e.g.
 *   '/assets/trade-validator/checklist-examples/scalp-1.png'
 * (Put files in public/assets/trade-validator/checklist-examples/)
 * When set, a small thumbnail appears left of the points; click opens a larger preview.
 */

import { sumCheckedPoints } from './checklistAllocate';

export const CHECKLIST_TABS = [
  { id: 'scalp', label: 'Scalp' },
  { id: 'intraDay', label: 'Intra Day' },
  { id: 'swing', label: 'Swing' },
];

export const CHECKLIST_TAB_META = {
  scalp: {
    title: 'SCALP EXECUTION CHECKLIST',
    subtitle: 'Fast execution, precision entry and session control.',
  },
  intraDay: {
    title: 'INTRA DAY EXECUTION CHECKLIST',
    subtitle: 'Structured intraday bias, confirmations and clean execution.',
  },
  swing: {
    title: 'SWING EXECUTION CHECKLIST',
    subtitle: 'Higher-timeframe structure, patience and position quality.',
  },
};

const W33 = [7, 7, 7, 6, 6];
const W34 = [7, 7, 7, 7, 6];

function makeCard(cardId, title, idPrefix, idOffset, labels, weights, exampleSrcByIndex) {
  return {
    id: cardId,
    cardTitle: title,
    items: labels.map((label, i) => {
      const src = exampleSrcByIndex && exampleSrcByIndex[i];
      return {
        id: `${idPrefix}${idOffset + i}`,
        label,
        points: weights[i],
        ...(src ? { exampleImageSrc: src } : {}),
      };
    }),
  };
}

export const CHECKLIST_BY_TAB = {
  scalp: [
    makeCard('scalp-card-1', 'Market Context', 'scalp-', 1, [
      'Session is active',
      'Spread is acceptable',
      'No major news nearby',
      'Market is moving cleanly',
      'HTF bias is clear',
    ], W33),
    makeCard('scalp-card-2', 'Entry Quality', 'scalp-', 6, [
      'Key level is marked',
      'Liquidity has been taken',
      'Structure shift confirmed',
      'Entry is not mid-range',
      'Momentum confirms entry',
    ], W33),
    makeCard('scalp-card-3', 'Risk & Execution', 'scalp-', 11, [
      'Stop is logically placed',
      'Target is clearly mapped',
      'RR meets minimum',
      'Size matches risk plan',
      'No emotional entry',
    ], W34),
  ],
  intraDay: [
    makeCard('intra-card-1', 'Bias & Structure', 'intra-', 1, [
      'Daily bias is clear',
      'HTF structure is aligned',
      'Price is at key zone',
      'Session direction is clear',
      'Market is not choppy',
    ], W33),
    makeCard('intra-card-2', 'Confirmation', 'intra-', 6, [
      'Key level is respected',
      'Liquidity has been taken',
      'Confirmation pattern formed',
      'Momentum supports trade',
      'Entry is well timed',
    ], W33),
    makeCard('intra-card-3', 'Risk & Management', 'intra-', 11, [
      'Stop is beyond invalidation',
      'Target is realistic',
      'RR meets minimum',
      'Correlation does not conflict',
      'Trade fits the model',
    ], W34),
  ],
  swing: [
    makeCard('swing-card-1', 'Higher Timeframe', 'swing-', 1, [
      'Weekly trend is clear',
      'Daily trend is aligned',
      'Major zone is marked',
      'Structure supports direction',
      'Market has room to move',
    ], W33),
    makeCard('swing-card-2', 'Setup Quality', 'swing-', 6, [
      'Entry is at value area',
      'Rejection is confirmed',
      'Setup is not late',
      'Invalidation is clear',
      'Target is HTF based',
    ], W33),
    makeCard('swing-card-3', 'Position Logic', 'swing-', 11, [
      'Thesis survives noise',
      'Risk suits wider stop',
      'News does not break thesis',
      'Trader can hold patiently',
      'Trade is rule based',
    ], W34),
  ],
};

/** Max points for a tab when every section has at least one line (template budget totals 100 per tab). */
export function getMaxPointsForTab(tabId) {
  const cards = CHECKLIST_BY_TAB[tabId];
  if (!cards) return 0;
  return cards.reduce((sum, card) => sum + card.items.reduce((s, i) => s + i.points, 0), 0);
}

/**
 * Execution tab max for the lines the user actually added (only sections with items count).
 */
export function getExecutionTabMaxForUserItems(tabId, itemsByTab) {
  const cards = CHECKLIST_BY_TAB[tabId];
  if (!cards) return 0;
  const state = itemsByTab[tabId] || {};
  let sum = 0;
  for (const card of cards) {
    const list = state[card.id];
    if (list && list.length > 0) {
      sum += card.items.reduce((s, i) => s + i.points, 0);
    }
  }
  return sum;
}

export function getExecutionTabEarnedScore(tabId, itemsByTab, checkedSet) {
  const cards = CHECKLIST_BY_TAB[tabId];
  if (!cards) return 0;
  const state = itemsByTab[tabId] || {};
  let total = 0;
  for (const card of cards) {
    const list = state[card.id];
    if (!list || list.length === 0) continue;
    const budget = card.items.reduce((s, i) => s + i.points, 0);
    total += sumCheckedPoints(list, checkedSet, budget);
  }
  return total;
}
