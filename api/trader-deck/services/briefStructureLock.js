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
    global_macro: {
      market_context: 'Cross-asset macro state: growth, inflation, liquidity, CB guidance.',
      cross_asset_flow: 'Indices, yields, FX, commodities — leadership and spillovers.',
      key_drivers: 'Top-tier prints, speeches, surprises in the calendar pack.',
      market_behaviour: 'Trend vs chop across benchmarks; liquidity tone.',
      what_matters_next: 'Next catalysts affecting the macro spine.',
      trader_takeaway: 'Macro skew and what would invalidate the read.',
      weekly_overview: 'Week’s macro repricing vs prior baseline.',
      macro_theme: 'Dominant macro narrative for the week.',
      cross_asset_breakdown: 'Cross-asset transmission into indices and rates.',
      structural_shift: 'Regime vs prior week on growth/inflation.',
      key_events_recap: 'Data and CB moments that moved markets.',
      forward_outlook: 'Scheduled risk into next week.',
      strategic_takeaway: 'Strategic macro stance.',
    },
    stocks: {
      market_context: 'Tape, breadth, and single-name leadership.',
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
    etfs: {
      market_context: 'Sector and factor ETF leadership vs benchmark.',
      cross_asset_flow: 'Rates, USD, credit, and commodity tilt vs ETF complexes.',
      key_drivers: 'Flows, rotation, macro beta to yields.',
      market_behaviour: 'Trend vs chop in sector sleeves.',
      what_matters_next: 'Macro prints and flows into liquid ETFs.',
      trader_takeaway: 'Factor and sector skew from evidence.',
      weekly_overview: 'Weekly ETF regime.',
      macro_theme: 'Liquidity and leadership.',
      cross_asset_breakdown: 'SPY/QQQ/IWM vs sector ETFs.',
      structural_shift: 'Rotation breaks.',
      key_events_recap: 'What moved ETF tape.',
      forward_outlook: 'Next week.',
      strategic_takeaway: 'ETF stance.',
    },
    indices: {
      market_context: 'Benchmark tape and breadth.',
      cross_asset_flow: 'Rates, USD, vol vs indices.',
      key_drivers: 'Macro prints, liquidity, positioning.',
      market_behaviour: 'Trend vs range in cash and futures proxies.',
      what_matters_next: 'Scheduled catalysts.',
      trader_takeaway: 'Index risk skew.',
      weekly_overview: 'Weekly benchmark regime.',
      macro_theme: 'Growth and liquidity.',
      cross_asset_breakdown: 'Cross-index leadership.',
      structural_shift: 'Breadth or vol regime breaks.',
      key_events_recap: 'Drivers of the week.',
      forward_outlook: 'Next week.',
      strategic_takeaway: 'Index mindset.',
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
    futures: {
      market_context: 'Futures-linked benchmarks vs macro.',
      cross_asset_flow: 'Index and commodity futures vs USD and yields.',
      key_drivers: 'Curve, energy, liquidity.',
      market_behaviour: 'Trend and range in futures complexes.',
      what_matters_next: 'Macro and supply windows.',
      trader_takeaway: 'Futures risk stance.',
      weekly_overview: 'Weekly futures regime.',
      macro_theme: 'Policy and growth.',
      cross_asset_breakdown: 'Cross-market transmission.',
      structural_shift: 'Regime breaks.',
      key_events_recap: 'Week’s drivers.',
      forward_outlook: 'Next week.',
      strategic_takeaway: 'Positioning mindset.',
    },
    geopolitics: {
      market_context: 'Geopolitical catalysts and risk transmission.',
      cross_asset_flow: 'Energy, FX haven flows, indices, gold.',
      key_drivers: 'Conflict, sanctions, trade, supply shocks.',
      market_behaviour: 'Risk premium on/off and correlation breaks.',
      what_matters_next: 'Scheduled geopolitical or policy windows.',
      trader_takeaway: 'Transmission and hedges implied by facts.',
      weekly_overview: 'Week’s geopolitical repricing.',
      macro_theme: 'Politics vs economics.',
      cross_asset_breakdown: 'Cross-market stress paths.',
      structural_shift: 'Persistent vs fading premium.',
      key_events_recap: 'Headlines that moved markets.',
      forward_outlook: 'Known catalysts ahead.',
      strategic_takeaway: 'Risk stance.',
    },
    market_sentiment: {
      market_context: 'Risk appetite, breadth, factor tone.',
      cross_asset_flow: 'Credit, duration, mega-cap vs rest.',
      key_drivers: 'Flows, positioning proxies, macro surprises.',
      market_behaviour: 'Risk-on/off and chop regimes.',
      what_matters_next: 'Events that flip sentiment.',
      trader_takeaway: 'Sentiment skew from evidence.',
      weekly_overview: 'Weekly risk tone.',
      macro_theme: 'Liquidity and fear/greed.',
      cross_asset_breakdown: 'ETFs, credit, equity beta.',
      structural_shift: 'Breadth or correlation breaks.',
      key_events_recap: 'What shifted tone.',
      forward_outlook: 'Next week’s sentiment drivers.',
      strategic_takeaway: 'Positioning mindset.',
    },
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
