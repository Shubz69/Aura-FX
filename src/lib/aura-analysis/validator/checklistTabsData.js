/**
 * Trade Validator – Checklist tabs: Scalp, Intra Day, Swing.
 * 3 cards per tab, 5 rules per card, 15 unique items per tab.
 */

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

/** Checklist cards and items per tab. Item id must be unique across the app for scoring. */
export const CHECKLIST_BY_TAB = {
  scalp: [
    {
      id: 'scalp-card-1',
      cardTitle: 'Market Context',
      items: [
        { id: 'scalp-1', label: 'Session is active', points: 6 },
        { id: 'scalp-2', label: 'Spread is acceptable', points: 5 },
        { id: 'scalp-3', label: 'No major news nearby', points: 6 },
        { id: 'scalp-4', label: 'Market is moving cleanly', points: 5 },
        { id: 'scalp-5', label: 'HTF bias is clear', points: 5 },
      ],
    },
    {
      id: 'scalp-card-2',
      cardTitle: 'Entry Quality',
      items: [
        { id: 'scalp-6', label: 'Key level is marked', points: 6 },
        { id: 'scalp-7', label: 'Liquidity has been taken', points: 6 },
        { id: 'scalp-8', label: 'Structure shift confirmed', points: 6 },
        { id: 'scalp-9', label: 'Entry is not mid-range', points: 5 },
        { id: 'scalp-10', label: 'Momentum confirms entry', points: 5 },
      ],
    },
    {
      id: 'scalp-card-3',
      cardTitle: 'Risk & Execution',
      items: [
        { id: 'scalp-11', label: 'Stop is logically placed', points: 6 },
        { id: 'scalp-12', label: 'Target is clearly mapped', points: 5 },
        { id: 'scalp-13', label: 'RR meets minimum', points: 6 },
        { id: 'scalp-14', label: 'Size matches risk plan', points: 5 },
        { id: 'scalp-15', label: 'No emotional entry', points: 5 },
      ],
    },
  ],
  intraDay: [
    {
      id: 'intra-card-1',
      cardTitle: 'Bias & Structure',
      items: [
        { id: 'intra-1', label: 'Daily bias is clear', points: 6 },
        { id: 'intra-2', label: 'HTF structure is aligned', points: 6 },
        { id: 'intra-3', label: 'Price is at key zone', points: 6 },
        { id: 'intra-4', label: 'Session direction is clear', points: 5 },
        { id: 'intra-5', label: 'Market is not choppy', points: 5 },
      ],
    },
    {
      id: 'intra-card-2',
      cardTitle: 'Confirmation',
      items: [
        { id: 'intra-6', label: 'Key level is respected', points: 6 },
        { id: 'intra-7', label: 'Liquidity has been taken', points: 6 },
        { id: 'intra-8', label: 'Confirmation pattern formed', points: 6 },
        { id: 'intra-9', label: 'Momentum supports trade', points: 5 },
        { id: 'intra-10', label: 'Entry is well timed', points: 5 },
      ],
    },
    {
      id: 'intra-card-3',
      cardTitle: 'Risk & Management',
      items: [
        { id: 'intra-11', label: 'Stop is beyond invalidation', points: 6 },
        { id: 'intra-12', label: 'Target is realistic', points: 5 },
        { id: 'intra-13', label: 'RR meets minimum', points: 6 },
        { id: 'intra-14', label: 'Correlation does not conflict', points: 5 },
        { id: 'intra-15', label: 'Trade fits the model', points: 5 },
      ],
    },
  ],
  swing: [
    {
      id: 'swing-card-1',
      cardTitle: 'Higher Timeframe',
      items: [
        { id: 'swing-1', label: 'Weekly trend is clear', points: 6 },
        { id: 'swing-2', label: 'Daily trend is aligned', points: 6 },
        { id: 'swing-3', label: 'Major zone is marked', points: 6 },
        { id: 'swing-4', label: 'Structure supports direction', points: 5 },
        { id: 'swing-5', label: 'Market has room to move', points: 5 },
      ],
    },
    {
      id: 'swing-card-2',
      cardTitle: 'Setup Quality',
      items: [
        { id: 'swing-6', label: 'Entry is at value area', points: 6 },
        { id: 'swing-7', label: 'Rejection is confirmed', points: 6 },
        { id: 'swing-8', label: 'Setup is not late', points: 5 },
        { id: 'swing-9', label: 'Invalidation is clear', points: 5 },
        { id: 'swing-10', label: 'Target is HTF based', points: 6 },
      ],
    },
    {
      id: 'swing-card-3',
      cardTitle: 'Position Logic',
      items: [
        { id: 'swing-11', label: 'Thesis survives noise', points: 6 },
        { id: 'swing-12', label: 'Risk suits wider stop', points: 5 },
        { id: 'swing-13', label: 'News does not break thesis', points: 5 },
        { id: 'swing-14', label: 'Trader can hold patiently', points: 5 },
        { id: 'swing-15', label: 'Trade is rule based', points: 6 },
      ],
    },
  ],
};

/** Max points per tab (sum of all item points). */
export function getMaxPointsForTab(tabId) {
  const cards = CHECKLIST_BY_TAB[tabId];
  if (!cards) return 0;
  return cards.reduce((sum, card) => sum + card.items.reduce((s, i) => s + i.points, 0), 0);
}
