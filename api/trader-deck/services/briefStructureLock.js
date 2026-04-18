/**
 * Single source of truth for automated brief structure.
 * The model fills content only; it does not choose section order or names.
 */

const DAILY_STRUCTURE = [
  'market_context',
  'cross_asset_flow',
  'key_drivers',
  'market_behaviour',
  'what_matters_next',
  'trader_takeaway',
];

const WEEKLY_STRUCTURE = [
  'weekly_overview',
  'macro_theme',
  'cross_asset_breakdown',
  'structural_shift',
  'key_events_recap',
  'forward_outlook',
  'strategic_takeaway',
];

/** Display headings in final brief (exact order = structure order). */
const SECTION_HEADINGS = {
  market_context: 'Market Context',
  cross_asset_flow: 'Cross-Asset Flow',
  key_drivers: 'Key Drivers',
  market_behaviour: 'Market Behaviour Insight',
  what_matters_next: 'What Matters Next',
  trader_takeaway: 'Trader Takeaway',
  weekly_overview: 'Weekly Overview',
  macro_theme: 'Macro Theme',
  cross_asset_breakdown: 'Cross-Asset Breakdown',
  structural_shift: 'Structural Shift',
  key_events_recap: 'Key Events Recap',
  forward_outlook: 'Forward Outlook',
  strategic_takeaway: 'Strategic Takeaway',
};

/** Purpose + rules per section (structure-agnostic; category angle added separately). */
const SECTION_RULES = {
  market_context: {
    purpose: 'What is happening now, what changed versus the prior session, and what the market is actively reacting to.',
    rules: [
      'Lead with the live situation, not a definition.',
      'No numbered scenarios or pathway labels.',
      'Do not list instruments one-by-one; mention only if they clarify the macro picture.',
    ],
  },
  cross_asset_flow: {
    purpose: 'How risk, rates, FX, commodities and (if relevant) crypto interact for this period.',
    rules: [
      'Explain relationships and leadership/laggards, not tick lists.',
      'Tie flows to the drivers you will expand in Key Drivers where it helps.',
    ],
  },
  key_drivers: {
    purpose: 'The real movers — policy, data surprises, positioning, liquidity — not generic filler.',
    rules: [
      'Be specific to the fact pack; if data is thin, say what is missing instead of inventing.',
      'Avoid repeating the opening sentences of Market Context.',
    ],
  },
  market_behaviour: {
    purpose:
      'Whether the move is continuation, exhaustion, repricing, or a positioning unwind — what kind of environment this is (liquidity, vol, two-way vs one-way tape).',
    rules: [
      'Desk tone: observational and concise.',
      'No "Scenario 1/2" framing.',
      'No playbook labels (catalyst trigger, invalidation, position sizing).',
    ],
  },
  what_matters_next: {
    purpose: 'Events, windows, and catalysts that actually change the thesis — with timing where the calendar allows.',
    rules: [
      'Connect to the category (e.g. FX → rates/CB; stocks → earnings/macro beta).',
    ],
  },
  trader_takeaway: {
    purpose: 'What traders should actually be weighing — where caution sits versus where the skew in risk/reward is.',
    rules: [
      'Short paragraphs, no checklist tone, no "it is important to note".',
      'No copy-paste risk bullets; integrate risk into the takeaway.',
      'No invalidation triggers, position-sizing lectures, or scenario trees.',
    ],
  },
  weekly_overview: {
    purpose: 'What repriced this week, what held, and the one-line state of play for this category.',
    rules: ['Weekly lens only — not a daily session note.', 'No scenario scaffolding.'],
  },
  macro_theme: {
    purpose: 'Dominant macro narrative for the week as it applies to this category.',
    rules: ['Name the transmission channel (growth, inflation, liquidity, policy).'],
  },
  cross_asset_breakdown: {
    purpose:
      'Cross-asset week: equities, bonds/yields, FX, commodities — how they traded together and where stress showed. Mention specific markets only when they carried the story.',
    rules: ['Avoid repeating Weekly Overview opening.', 'No forced line-up of tickers; narrative flow only.'],
  },
  structural_shift: {
    purpose: 'What structurally shifted vs the prior week (regime, breadth, curve, FX skew).',
    rules: ['If nothing major shifted, say so briefly — do not invent a fake shift.'],
  },
  key_events_recap: {
    purpose: 'What actually mattered from data and events in the fact pack this week.',
    rules: ['No generic event boilerplate.'],
  },
  forward_outlook: {
    purpose: 'What matters going into next week for this category.',
    rules: ['Anchor to calendar and themes from the pack.'],
  },
  strategic_takeaway: {
    purpose: 'Strategic positioning mindset for the week ahead — not a tick list of trades.',
    rules: ['No "base and surprise" language.', 'Tight, institutional tone.'],
  },
};

/** Category-specific angle injected into each section prompt (same structure, different emphasis). */
function categoryAngleForSection(sectionKey, briefKind) {
  const k = String(briefKind || 'stocks').toLowerCase();
  const angles = {
    forex: {
      market_context: 'Anchor on rates, USD, CB expectations, and session liquidity.',
      cross_asset_flow: 'Focus on yields, DXY, risk proxies, and carry context.',
      key_drivers: 'Prioritise rate differentials, surprise prints, and verbal guidance.',
      market_behaviour: 'Session ranges, event vol, and pair leadership.',
      what_matters_next: 'CB speak, inflation/employment, and local calendars.',
      trader_takeaway: 'Lean versus rate path and spreads; say plainly what would change the read.',
      weekly_overview: 'G10 and key crosses: what repriced on the curve.',
      macro_theme: 'Policy divergence and growth/inflation mix.',
      cross_asset_breakdown: 'USD, yields, equities, commodities as FX inputs.',
      structural_shift: 'Breaks in trend or range regimes on key pairs.',
      key_events_recap: 'Data and CB moments that moved FX.',
      forward_outlook: 'Next week’s rate path and event risk for FX.',
      strategic_takeaway: 'FX risk and reward for the week ahead.',
    },
    stocks: {
      market_context: 'Tape, breadth, and sector leadership.',
      cross_asset_flow: 'Rates, credit, USD, and commodity tilt vs equities.',
      key_drivers: 'Earnings, guidance, macro beta to rates.',
      market_behaviour: 'Trend vs chop, megacap vs rest, vol.',
      what_matters_next: 'Earnings, guidance, macro prints.',
      trader_takeaway: 'How to lean equity risk with clear flip levels.',
      weekly_overview: 'Weekly equity regime and leadership.',
      macro_theme: 'Growth, rates, and liquidity for stocks.',
      cross_asset_breakdown: 'Sector rotation and index vs single-name tension.',
      structural_shift: 'Breadth, factor rotation, or correlation breaks.',
      key_events_recap: 'Earnings and macro that moved the tape.',
      forward_outlook: 'Next week’s catalysts for the sleeve.',
      strategic_takeaway: 'Equity positioning mindset.',
    },
    crypto: {
      market_context: 'Liquidity, risk proxy, and tape.',
      cross_asset_flow: 'BTC/ETH vs risk, USD, rates proxy.',
      key_drivers: 'Flows, funding, narratives, regulatory headlines.',
      market_behaviour: 'Trend, ranges, liquidation pockets.',
      what_matters_next: 'Events and liquidity windows.',
      trader_takeaway: 'Risk-on/off framing without hype.',
      weekly_overview: 'Weekly crypto regime.',
      macro_theme: 'Liquidity and risk linkage.',
      cross_asset_breakdown: 'Majors vs alts, beta to TradFi.',
      structural_shift: 'Regime change in vol or correlation.',
      key_events_recap: 'What moved tape this week.',
      forward_outlook: 'Next week’s drivers.',
      strategic_takeaway: 'Strategic stance.',
    },
    commodities: {
      market_context: 'Supply/demand and macro transmission.',
      cross_asset_flow: 'USD, rates, risk, vs energy/metals.',
      key_drivers: 'Inventories, geopolitics, growth proxy.',
      market_behaviour: 'Trend and range in key complexes.',
      what_matters_next: 'Data and OPEC/EIA-relevant windows.',
      trader_takeaway: 'Lean and risks for the complex.',
      weekly_overview: 'Weekly commodity regime.',
      macro_theme: 'Macro vs physical.',
      cross_asset_breakdown: 'Cross-commodity and USD.',
      structural_shift: 'Breaks in balance narrative.',
      key_events_recap: 'Week’s drivers.',
      forward_outlook: 'Next week.',
      strategic_takeaway: 'Strategic takeaway.',
    },
    bonds: {
      market_context: 'Curve and policy path.',
      cross_asset_flow: 'Equities, FX, vol vs rates.',
      key_drivers: 'Auctions, data, Fed path.',
      market_behaviour: 'Curve bull/bear steepening, vol.',
      what_matters_next: 'Supply and data.',
      trader_takeaway: 'Duration and curve stance.',
      weekly_overview: 'Rates week in review.',
      macro_theme: 'Policy and inflation.',
      cross_asset_breakdown: 'Curve and cross-market.',
      structural_shift: 'Regime in yields.',
      key_events_recap: 'Week’s events.',
      forward_outlook: 'Next week.',
      strategic_takeaway: 'Rates mindset.',
    },
    etfs: {
      market_context: 'Flows and factor tone.',
      cross_asset_flow: 'ETF vs underlying, risk assets.',
      key_drivers: 'Flows, NAV, macro.',
      market_behaviour: 'Leadership ETFs.',
      what_matters_next: 'Events affecting vehicles.',
      trader_takeaway: 'ETF sleeve takeaway.',
      weekly_overview: 'ETF week.',
      macro_theme: 'Factor and flow theme.',
      cross_asset_breakdown: 'Rotation across ETFs.',
      structural_shift: 'Flow regime change.',
      key_events_recap: 'Week recap.',
      forward_outlook: 'Forward.',
      strategic_takeaway: 'Strategic.',
    },
    indices: {
      market_context: 'Index regime and cross-asset leadership.',
      cross_asset_flow: 'Rates, FX, vol vs indices.',
      key_drivers: 'Macro, breadth, dispersion.',
      market_behaviour: 'Trend and range on benchmarks.',
      what_matters_next: 'Data and events.',
      trader_takeaway: 'Index stance.',
      weekly_overview: 'Weekly index structure.',
      macro_theme: 'Macro for indices.',
      cross_asset_breakdown: 'Global indices and correlations.',
      structural_shift: 'Breadth or vol regime.',
      key_events_recap: 'Week events.',
      forward_outlook: 'Next week.',
      strategic_takeaway: 'Strategic.',
    },
    futures: {
      market_context: 'Contract and macro context.',
      cross_asset_flow: 'Cross-asset vs futures complexes.',
      key_drivers: 'Carry, curve, macro.',
      market_behaviour: 'Session behaviour.',
      what_matters_next: 'Events and rolls.',
      trader_takeaway: 'Futures takeaway.',
      weekly_overview: 'Weekly futures.',
      macro_theme: 'Macro for futures.',
      cross_asset_breakdown: 'Complex relationships.',
      structural_shift: 'Structure shift.',
      key_events_recap: 'Recap.',
      forward_outlook: 'Outlook.',
      strategic_takeaway: 'Strategic.',
    },
  };
  const table = angles[k] || angles.stocks;
  return table[sectionKey] || angles.stocks[sectionKey] || 'Apply this category’s lens; stay factual to the pack.';
}

function getStructureKeys(period) {
  const p = period === 'weekly' ? 'weekly' : 'daily';
  return p === 'weekly' ? [...WEEKLY_STRUCTURE] : [...DAILY_STRUCTURE];
}

function structureToSections(period) {
  return getStructureKeys(period).map((key) => ({
    key,
    heading: SECTION_HEADINGS[key] || key,
  }));
}

function validateStructureKeys(period, sectionKeysFound) {
  const required = getStructureKeys(period);
  const set = new Set(sectionKeysFound);
  const missing = required.filter((k) => !set.has(k));
  const extra = sectionKeysFound.filter((k) => !required.includes(k));
  return { ok: missing.length === 0, missing, extra, required };
}

module.exports = {
  DAILY_STRUCTURE,
  WEEKLY_STRUCTURE,
  SECTION_HEADINGS,
  SECTION_RULES,
  getStructureKeys,
  structureToSections,
  categoryAngleForSection,
  validateStructureKeys,
};
