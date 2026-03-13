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
      cardTitle: 'Session & Context',
      items: [
        { id: 'scalp-1', label: 'Trading during valid session volatility window', points: 10 },
        { id: 'scalp-2', label: 'Spread is acceptable for scalp conditions', points: 8 },
        { id: 'scalp-3', label: 'No major red-folder news within execution window', points: 10 },
        { id: 'scalp-4', label: 'Market is not stuck in low-volume chop', points: 7 },
        { id: 'scalp-5', label: 'Pair/instrument is moving cleanly today', points: 5 },
      ],
    },
    {
      id: 'scalp-card-2',
      cardTitle: 'Entry Quality',
      items: [
        { id: 'scalp-6', label: 'Entry aligns with 1m–5m structure shift', points: 10 },
        { id: 'scalp-7', label: 'Clear liquidity sweep or stop run confirmed', points: 9 },
        { id: 'scalp-8', label: 'Rejection/displacement candle shows intent', points: 8 },
        { id: 'scalp-9', label: 'Entry is not taken mid-range', points: 7 },
        { id: 'scalp-10', label: 'Stop loss placed beyond logical invalidation', points: 6 },
      ],
    },
    {
      id: 'scalp-card-3',
      cardTitle: 'Trade Management',
      items: [
        { id: 'scalp-11', label: 'Minimum RR meets scalp plan requirement', points: 10 },
        { id: 'scalp-12', label: 'Position size matches risk model exactly', points: 9 },
        { id: 'scalp-13', label: 'TP is placed at realistic liquidity/structure target', points: 7 },
        { id: 'scalp-14', label: 'Trade was not entered from impulse/FOMO', points: 8 },
        { id: 'scalp-15', label: 'Execution follows pre-defined scalp rules only', points: 6 },
      ],
    },
  ],
  intraDay: [
    {
      id: 'intra-card-1',
      cardTitle: 'Bias & Structure',
      items: [
        { id: 'intra-1', label: 'Daily bias is clearly defined before entry', points: 10 },
        { id: 'intra-2', label: '4H / 1H structure supports trade direction', points: 10 },
        { id: 'intra-3', label: 'Price is positioned correctly relative to key HTF zone', points: 8 },
        { id: 'intra-4', label: 'Market is not fighting strong opposing structure', points: 7 },
        { id: 'intra-5', label: 'Direction is aligned with current session flow', points: 5 },
      ],
    },
    {
      id: 'intra-card-2',
      cardTitle: 'Confirmation Layer',
      items: [
        { id: 'intra-6', label: 'Key intraday level has been tapped or respected', points: 10 },
        { id: 'intra-7', label: 'Liquidity has been taken before execution', points: 9 },
        { id: 'intra-8', label: 'Break and retest / confirmation pattern is visible', points: 8 },
        { id: 'intra-9', label: 'Entry is supported by momentum, not hesitation', points: 7 },
        { id: 'intra-10', label: 'Trade is not being forced after missed move', points: 6 },
      ],
    },
    {
      id: 'intra-card-3',
      cardTitle: 'Risk & Execution',
      items: [
        { id: 'intra-11', label: 'Stop loss is beyond meaningful intraday invalidation', points: 10 },
        { id: 'intra-12', label: 'TP is mapped to clean intraday objective', points: 8 },
        { id: 'intra-13', label: 'RR meets intraday minimum standard', points: 9 },
        { id: 'intra-14', label: 'Correlated markets do not strongly conflict', points: 7 },
        { id: 'intra-15', label: 'Trade fully matches intraday playbook model', points: 6 },
      ],
    },
  ],
  swing: [
    {
      id: 'swing-card-1',
      cardTitle: 'Macro Structure',
      items: [
        { id: 'swing-1', label: 'Weekly/Daily trend direction is clearly established', points: 10 },
        { id: 'swing-2', label: 'Trade aligns with major HTF market structure', points: 10 },
        { id: 'swing-3', label: 'Price is reacting from meaningful swing zone', points: 9 },
        { id: 'swing-4', label: 'No major HTF barrier sits directly into target path', points: 7 },
        { id: 'swing-5', label: 'Market has room to expand over multiple sessions', points: 6 },
      ],
    },
    {
      id: 'swing-card-2',
      cardTitle: 'Position Quality',
      items: [
        { id: 'swing-6', label: 'Entry is taken at premium/discount logic area', points: 9 },
        { id: 'swing-7', label: 'Strong HTF rejection or continuation evidence exists', points: 8 },
        { id: 'swing-8', label: 'Setup is not late in the move', points: 8 },
        { id: 'swing-9', label: 'Invalidation level is technically sound', points: 7 },
        { id: 'swing-10', label: 'Swing target is based on real structure/liquidity objective', points: 8 },
      ],
    },
    {
      id: 'swing-card-3',
      cardTitle: 'Patience & Risk',
      items: [
        { id: 'swing-11', label: 'Trade thesis remains valid beyond intraday noise', points: 10 },
        { id: 'swing-12', label: 'Position size suits wider stop and swing hold', points: 9 },
        { id: 'swing-13', label: 'Upcoming news/events do not destroy the thesis', points: 7 },
        { id: 'swing-14', label: 'Trader is prepared to hold through normal pullbacks', points: 6 },
        { id: 'swing-15', label: 'Trade matches defined swing model, not emotion', points: 8 },
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
