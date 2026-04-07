/**
 * Trade Validator – Two-layer checklist sections.
 * Layer 1: Core Confluence Checklist
 * Layer 2: Setup Formation Checklist
 *
 * Optional on any item: exampleImageSrc (public URL) for setup-formation rows —
 * same thumbnail + lightbox behaviour as execution checklist (TradeValidatorView).
 */

const BASE_IMAGE = '/assets/trading-checklist';

export const CHECKLIST_SECTIONS = [
  // LAYER 1: CORE CONFLUENCE CHECKLIST
  {
    id: 'htf-bias',
    layer: 'core',
    title: 'Higher Timeframe Bias',
    timeframeLabel: 'Weekly + Daily',
    maxPoints: 40,
    items: [
      { id: 'htf-1', label: 'Weekly trend direction identified', points: 10 },
      { id: 'htf-2', label: 'Daily trend aligned with weekly bias', points: 10 },
      { id: 'htf-3', label: 'Price trading above/below major HTF structure', points: 8 },
      { id: 'htf-4', label: 'Clear higher highs / lower lows on HTF', points: 6 },
      { id: 'htf-5', label: 'No major HTF barrier directly ahead', points: 6 },
    ],
  },
  {
    id: 'key-location',
    layer: 'core',
    title: 'Key Location',
    timeframeLabel: 'Daily + 4H',
    maxPoints: 35,
    items: [
      { id: 'kl-1', label: 'Price reacting at supply / demand zone', points: 10 },
      { id: 'kl-2', label: 'Previous support/resistance respected', points: 8 },
      { id: 'kl-3', label: 'Psychological level nearby (00 / 50 levels)', points: 6 },
      { id: 'kl-4', label: 'Premium / discount zone within range', points: 5 },
      { id: 'kl-5', label: 'HTF liquidity pool nearby', points: 6 },
    ],
  },
  {
    id: 'liquidity-intent',
    layer: 'core',
    title: 'Liquidity & Market Intent',
    timeframeLabel: '4H + 1H',
    maxPoints: 30,
    items: [
      { id: 'liq-1', label: 'Equal highs / equal lows present', points: 6 },
      { id: 'liq-2', label: 'Liquidity sweep occurred', points: 8 },
      { id: 'liq-3', label: 'Stop hunt / false breakout visible', points: 6 },
      { id: 'liq-4', label: 'Strong rejection after sweep', points: 5 },
      { id: 'liq-5', label: 'Displacement move after liquidity grab', points: 5 },
    ],
  },
  {
    id: 'market-structure',
    layer: 'core',
    title: 'Market Structure',
    timeframeLabel: '1H + 30m',
    maxPoints: 30,
    items: [
      { id: 'ms-1', label: 'Break of structure (BOS)', points: 8 },
      { id: 'ms-2', label: 'Change of character (CHOCH)', points: 7 },
      { id: 'ms-3', label: 'Momentum candle break', points: 6 },
      { id: 'ms-4', label: 'Market compression before breakout', points: 4 },
      { id: 'ms-5', label: 'Clear continuation structure', points: 5 },
    ],
  },
  {
    id: 'entry-confirmation',
    layer: 'core',
    title: 'Entry Confirmation',
    timeframeLabel: '15m + 5m + 1m',
    maxPoints: 20,
    items: [
      { id: 'ec-1', label: 'Engulfing candle', points: 5 },
      { id: 'ec-2', label: 'Strong rejection wick', points: 4 },
      { id: 'ec-3', label: 'Momentum candle', points: 4 },
      { id: 'ec-4', label: 'Volume expansion', points: 4 },
      { id: 'ec-5', label: 'Entry within active session (London / NY)', points: 3 },
    ],
  },
  {
    id: 'risk-management',
    layer: 'core',
    title: 'Risk Management',
    timeframeLabel: 'Execution / Trade Plan',
    maxPoints: 15,
    items: [
      { id: 'rm-1', label: 'Minimum risk reward 1:3', points: 4 },
      { id: 'rm-2', label: 'Stop loss placed at logical structure', points: 3 },
      { id: 'rm-3', label: 'Trade aligns with higher timeframe bias', points: 3 },
      { id: 'rm-4', label: 'Position size calculated correctly', points: 3 },
      { id: 'rm-5', label: 'Clear invalidation level defined', points: 2 },
    ],
  },
  // LAYER 2: SETUP FORMATION CHECKLIST
  {
    id: 'setup-formation',
    layer: 'formation',
    title: 'Setup Formation',
    timeframeLabel: 'Depends on setup / pattern',
    imagePath: `${BASE_IMAGE}/falling-wedge.png`,
    maxPoints: 100,
    subPatterns: [
      {
        id: 'pattern-br',
        title: 'Break and Retest',
        items: [
          { id: 'form-br1', label: 'Price returns to broken structure', points: 10 },
          { id: 'form-br2', label: 'Level flips support/resistance', points: 10 },
        ],
      },
      {
        id: 'pattern-sd',
        title: 'Supply / Demand Reaction',
        items: [
          { id: 'form-sd1', label: 'Strong impulsive move from zone', points: 10 },
          { id: 'form-sd2', label: 'Reaction inside zone', points: 10 },
        ],
      },
      {
        id: 'pattern-trendline',
        title: 'Trendline Break',
        items: [
          { id: 'form-tl1', label: 'Trendline cleanly broken', points: 10 },
          { id: 'form-tl2', label: 'Retest of broken trendline', points: 10 },
        ],
      },
      {
        id: 'pattern-wedge',
        title: 'Wedge / Triangle',
        items: [
          { id: 'form-w1', label: 'Converging trendlines formed', points: 10 },
          { id: 'form-w2', label: 'Breakout confirmed', points: 10 },
        ],
      },
      {
        id: 'pattern-elliott',
        title: 'Elliott Wave',
        items: [
          { id: 'form-ew1', label: 'Clear wave structure visible', points: 10 },
          { id: 'form-ew2', label: 'Correct wave count', points: 10 },
        ],
      },
    ],
  },
];

export const TOTAL_POINTS = CHECKLIST_SECTIONS.reduce((acc, section) => acc + section.maxPoints, 0);

export function isPatternSection(section) {
  return section.subPatterns && Array.isArray(section.subPatterns);
}

export function getPointsByItemId() {
  const map = {};
  CHECKLIST_SECTIONS.forEach((section) => {
    if (isPatternSection(section)) {
      section.subPatterns.forEach((sub) => {
        sub.items.forEach((item) => {
          map[item.id] = item.points;
        });
      });
    } else {
      section.items.forEach((item) => {
        map[item.id] = item.points;
      });
    }
  });
  return map;
}

export function getSectionScore(section, checked) {
  let score = 0;
  if (isPatternSection(section)) {
    section.subPatterns.forEach((sub) => {
      sub.items.forEach((item) => {
        if (checked.has(item.id)) score += item.points;
      });
    });
  } else {
    section.items.forEach((item) => {
      if (checked.has(item.id)) score += item.points;
    });
  }
  return Math.min(score, section.maxPoints);
}

export function getChecklistItemLabel(id) {
  for (const section of CHECKLIST_SECTIONS) {
    if (isPatternSection(section)) {
      for (const sub of section.subPatterns) {
        const found = sub.items.find((item) => item.id === id);
        if (found) return found.label;
      }
    } else {
      const found = section.items.find((item) => item.id === id);
      if (found) return found.label;
    }
  }
  return null;
}

/** Sub-sections under setup-formation for template picker + budgets. */
export function getSetupFormationSubTemplates() {
  const sec = CHECKLIST_SECTIONS.find((s) => s.id === 'setup-formation');
  if (!sec?.subPatterns) return [];
  return sec.subPatterns.map((sub) => ({
    id: sub.id,
    title: sub.title,
    budget: sub.items.reduce((s, it) => s + it.points, 0),
    templateItems: sub.items.map((it) => ({
      label: it.label,
      ...(it.exampleImageSrc ? { exampleImageSrc: it.exampleImageSrc } : {}),
    })),
  }));
}
