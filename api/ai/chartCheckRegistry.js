/**
 * Chart Check — canonical instrument universe + intelligence for AI prompts.
 *
 * BASE: `api/market/defaultWatchlist.js` GROUPS (same symbols as All Markets / ticker).
 * EXTENDED: majors, common crosses, futures-style roots, bonds/yields, vol — merged without removing Aura symbols.
 *
 * Used only server-side for /api/ai/chart-check prompts and post-processing enrichment.
 */

const { GROUPS } = require('../market/defaultWatchlist');
const { normalizeMarketSymbol, getSymbolAliases } = require('../market/instrumentRegistry');

const CATEGORY_INTELLIGENCE = {
  crypto: {
    volatilityProfile: 'high',
    sessionSensitivity: '24/7; weekend gap risk; funding/perp basis on derivatives',
    structureBehavior: 'Trend spikes, liquidity grabs, range compression around events; correlation with BTC often dominates alts',
    spreadSlippage: 'Wide spreads on thin alts; slippage spikes on volatility; use limit discipline',
    cautionNotes: 'Whiplash on leverage; false breakouts on low timeframes; exchange outage risk',
    analysisHints: 'Weight wick structure and volume/tick volume if visible; de-emphasize tight forex-style spread assumptions',
  },
  forex: {
    volatilityProfile: 'medium (majors lower, exotics higher)',
    sessionSensitivity: 'Liquid London/NY; Asia varies by pair (JPY/aud/nzd more active in Tokyo)',
    structureBehavior: 'Mean reversion in ranges; trend legs often session-linked; correlation clusters (USD, JPY)',
    spreadSlippage: 'Spread widens off-session; news spikes',
    cautionNotes: 'Rollover; event risk on CB prints',
    analysisHints: 'Use pip-appropriate structure; respect HTF USD/JPY or EUR context when crosses',
  },
  commodities: {
    volatilityProfile: 'high (energy), medium-high (metals), agricultural seasonality',
    sessionSensitivity: 'Cash and futures pits overlap; inventory/report calendars',
    structureBehavior: 'Gap risk vs stocks; strong mean-revert around inventory surprises on energy',
    spreadSlippage: 'Wider on thin CFD contracts',
    cautionNotes: 'Contract roll marks; different quote scale (oz vs barrel vs bushel)',
    analysisHints: 'Do not assume FX pip math; comment on volatility regime visible on chart',
  },
  indices: {
    volatilityProfile: 'medium-high',
    sessionSensitivity: 'Cash hours dominate; gap opens; macro tape',
    structureBehavior: 'Trend + pullback common; correlation to rates/dollar',
    spreadSlippage: 'Moderate on liquid CFD; spikes into cash open',
    cautionNotes: 'Gap risk versus prior close; event baskets',
    analysisHints: 'Points not pips; respect cash session markers if visible',
  },
  futures: {
    volatilityProfile: 'contract-dependent (equity index / rates / commodities differ)',
    sessionSensitivity: 'Session times for underlying; roll weeks',
    structureBehavior: 'Strong trends around macro; gap vs spot where applicable',
    spreadSlippage: 'Tick size and value matter; slippage into inventories on commodities',
    cautionNotes: 'Contract month, tick value, and session template may differ from spot CFD',
    analysisHints: 'If symbol looks like a root future (ES, NQ, CL), reason in points/ticks not forex pips unless chart is FX',
  },
  stocks: {
    volatilityProfile: 'equity-specific (mega-cap lower, small-cap higher)',
    sessionSensitivity: 'Regular session most liquid; pre/post thinner',
    structureBehavior: 'Levels, gaps, earnings drift; sector beta',
    spreadSlippage: 'Widens outside RTH',
    cautionNotes: 'Gap on news; halts; dividends',
    analysisHints: 'Single-name catalyst risk; use R-multiples relative to visible structure',
  },
  etfs: {
    volatilityProfile: 'basket-dependent (broad index lower, sector higher)',
    sessionSensitivity: 'Follows underlying cash hours',
    structureBehavior: 'Tracks index/sector; occasional premium/discount',
    spreadSlippage: 'Generally moderate',
    cautionNotes: 'Rebalance flows; dividend drag on some ETFs',
    analysisHints: 'Infer macro/sector context from ticker if recognizable',
  },
  macro: {
    volatilityProfile: 'instrument-specific (VIX high gamma; yields trend)',
    sessionSensitivity: 'Macro calendars (FOMC, CPI)',
    structureBehavior: 'Rates trend; DXY bundles; VIX mean reversion tendencies',
    spreadSlippage: 'Varies',
    cautionNotes: 'Different axis units (yield %, index level)',
    analysisHints: 'Label axes if visible; avoid confusing yield chart with price chart',
  },
  unknown: {
    volatilityProfile: 'unknown — infer only from chart behavior',
    sessionSensitivity: 'unknown',
    structureBehavior: 'Use visible price action only',
    spreadSlippage: 'Assume unknown; mention if quote type unclear',
    cautionNotes: 'Symbol/category not confirmed in Aura registry — structural analysis still valid',
    analysisHints: 'Do not invent symbol-specific fundamentals; stay visual',
  },
};

function upperSym(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Flatten Aura watchlist GROUPS → Map<normalizedSymbol, { displayName, category }> */
function buildAuraSymbolMap() {
  const map = new Map();
  const order = Object.keys(GROUPS).sort((a, b) => GROUPS[a].order - GROUPS[b].order);
  for (const cat of order) {
    const g = GROUPS[cat];
    const symbols = g.symbols || [];
    for (const row of symbols) {
      const sym = upperSym(row.symbol);
      if (!sym) continue;
      if (!map.has(sym)) {
        map.set(sym, {
          symbol: sym,
          displayName: row.displayName || sym,
          category: cat,
          source: 'aura_watchlist',
        });
      }
    }
  }
  return map;
}

const AURA_SYMBOL_MAP = buildAuraSymbolMap();

/**
 * Extension list: common global symbols not guaranteed in watchlist/instruments frontend merge.
 * format: { symbol, displayName, category }
 */
const EXTENDED_SYMBOLS = [
  { symbol: 'EURUSD', displayName: 'EUR/USD', category: 'forex' },
  { symbol: 'GBPUSD', displayName: 'GBP/USD', category: 'forex' },
  { symbol: 'USDJPY', displayName: 'USD/JPY', category: 'forex' },
  { symbol: 'USDCHF', displayName: 'USD/CHF', category: 'forex' },
  { symbol: 'AUDUSD', displayName: 'AUD/USD', category: 'forex' },
  { symbol: 'USDCAD', displayName: 'USD/CAD', category: 'forex' },
  { symbol: 'NZDUSD', displayName: 'NZD/USD', category: 'forex' },
  { symbol: 'EURGBP', displayName: 'EUR/GBP', category: 'forex' },
  { symbol: 'EURJPY', displayName: 'EUR/JPY', category: 'forex' },
  { symbol: 'GBPJPY', displayName: 'GBP/JPY', category: 'forex' },
  { symbol: 'XAUUSD', displayName: 'Gold', category: 'commodities' },
  { symbol: 'XAGUSD', displayName: 'Silver', category: 'commodities' },
  { symbol: 'USOIL', displayName: 'WTI Oil', category: 'commodities' },
  { symbol: 'UKOIL', displayName: 'Brent', category: 'commodities' },
  { symbol: 'ZN', displayName: '10Y T-Note future', category: 'macro' },
  { symbol: 'ZF', displayName: '5Y T-Note future', category: 'macro' },
  { symbol: 'ZB', displayName: '30Y T-Bond future', category: 'macro' },
  { symbol: 'ES', displayName: 'E-mini S&P', category: 'futures' },
  { symbol: 'NQ', displayName: 'E-mini Nasdaq', category: 'futures' },
  { symbol: 'YM', displayName: 'E-mini Dow', category: 'futures' },
  { symbol: 'RTY', displayName: 'E-mini Russell', category: 'futures' },
  { symbol: 'GC', displayName: 'Gold future', category: 'futures' },
  { symbol: 'SI', displayName: 'Silver future', category: 'futures' },
  { symbol: 'CL', displayName: 'WTI future', category: 'futures' },
];

const EXTENDED_MAP = new Map();
for (const row of EXTENDED_SYMBOLS) {
  const u = upperSym(row.symbol);
  if (!EXTENDED_MAP.has(u)) EXTENDED_MAP.set(u, { ...row, symbol: u, source: 'extended' });
}

function normalizeInputSymbol(raw) {
  const u = upperSym(raw);
  if (!u) return '';
  const canon = normalizeMarketSymbol(u);
  return canon || u;
}

function inferCategoryFromPattern(sym) {
  if (!sym) return 'unknown';
  if (AURA_SYMBOL_MAP.has(sym)) return AURA_SYMBOL_MAP.get(sym).category;
  if (EXTENDED_MAP.has(sym)) return EXTENDED_MAP.get(sym).category;
  if (/^[A-Z]{6}$/.test(sym) && /(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|MXN|ZAR|TRY|PLN|HUF|SEK|NOK|DKK|SGD|HKD|CNH)/.test(sym)) {
    return 'forex';
  }
  if (/^(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|BNB|DOT|MATIC|LTC|SHIB|TRX|LINK)/.test(sym) || /^[A-Z]{2,}(USD|USDT)$/.test(sym)) {
    return 'crypto';
  }
  if (/XAU|XAG|XPT|XPD|XCU|USOIL|UKOIL|XTI|XBR|OIL|XNG|NATGAS|CORN|WHEAT|SOYBEAN|SOY|COFFEE|SUGAR|COCOA/.test(sym)) {
    return 'commodities';
  }
  if (/^(SPX|NDX|DJI|DAX|FTSE|NIKKEI|VIX|DXY|US10Y|US30Y)/i.test(sym)) return sym.includes('Y') || sym === 'DXY' ? 'macro' : 'indices';
  if (/^(ES|NQ|YM|RTY|GC|SI|CL|ZB|ZN|ZF)\b/.test(sym)) return 'futures';
  if (/^[A-Z]{1,5}(-[A-Z])?$/.test(sym) && sym.length <= 6) return 'stocks';
  return 'unknown';
}

/**
 * @returns {{ normalizedSymbol: string, displayName: string, category: string, source: string, intelligence: object, confirmedOnAura: boolean }}
 */
function resolveInstrumentIntelligence(rawPair) {
  const rawNorm = upperSym(rawPair);
  const normalizedSymbol = normalizeInputSymbol(rawPair);
  const intelKeys = new Set([
    'crypto',
    'forex',
    'commodities',
    'indices',
    'stocks',
    'etfs',
    'macro',
    'futures',
    'unknown',
  ]);

  let row = AURA_SYMBOL_MAP.get(normalizedSymbol) || AURA_SYMBOL_MAP.get(rawNorm);
  let source = row ? 'aura_watchlist' : null;
  if (!row && EXTENDED_MAP.has(normalizedSymbol)) {
    row = EXTENDED_MAP.get(normalizedSymbol);
    source = 'extended';
  }
  if (!row && EXTENDED_MAP.has(rawNorm)) {
    row = EXTENDED_MAP.get(rawNorm);
    source = 'extended';
  }

  let category = row?.category || inferCategoryFromPattern(normalizedSymbol || rawNorm);
  if (!intelKeys.has(category)) category = 'unknown';

  const baseIntel = CATEGORY_INTELLIGENCE[category] || CATEGORY_INTELLIGENCE.unknown;

  const onAura = AURA_SYMBOL_MAP.has(normalizedSymbol) || AURA_SYMBOL_MAP.has(rawNorm);

  try {
    const { logInfo } = require('../utils/systemLogger');
    logInfo('chart-check', 'symbol_resolved', {
      category,
      source: source || (normalizedSymbol || rawNorm ? 'inferred' : 'none'),
      confirmedOnAura: onAura,
      symbolLen: String(rawPair || '').length,
    });
  } catch (_) {
    /* optional observability */
  }

  return {
    normalizedSymbol: normalizedSymbol || rawNorm || '',
    displayName: row?.displayName || normalizedSymbol || rawNorm || '',
    category,
    source: source || (normalizedSymbol || rawNorm ? 'inferred' : 'none'),
    confirmedOnAura: onAura,
    intelligence: baseIntel,
  };
}

/**
 * Compact block injected into the chart-check system prompt (keeps token budget reasonable).
 */
function buildInstrumentPromptBlock(pairRaw) {
  const ctx = resolveInstrumentIntelligence(pairRaw);
  if (!ctx.normalizedSymbol && !pairRaw) {
    return `INSTRUMENT CONTEXT:
- User did not select a symbol. Infer symbol ONLY if clearly visible on chart text/watermark; otherwise state "not confirmed".
- Classify by chart quote style if possible (FX decimals, stock dollars, index points, crypto). Still run full structural analysis.`;
  }

  const { intelligence: I } = ctx;
  return `INSTRUMENT CONTEXT (use for reasoning; do not contradict visible chart facts):
- User/symbol field: ${safe(pairRaw || 'not provided')}
- Normalized symbol (Aura registry): ${ctx.normalizedSymbol || 'unresolved'}
- Display name: ${ctx.displayName || 'n/a'}
- Category: ${ctx.category} (${ctx.confirmedOnAura ? 'confirmed on Aura market list' : ctx.source === 'inferred' ? 'inferred from naming/shape — state low confidence' : 'from extended list'})
- Volatility profile: ${I.volatilityProfile}
- Session / liquidity: ${I.sessionSensitivity}
- Structure tendencies (general, not specific to this chart): ${I.structureBehavior}
- Spread / execution: ${I.spreadSlippage}
- Caution: ${I.cautionNotes}
- Analysis hints: ${I.analysisHints}${(() => {
    try {
      const { getInstrumentBehaviourPromptFragment } = require('../market/instrumentBehaviour');
      const extra = getInstrumentBehaviourPromptFragment(pairRaw);
      return extra ? `\n- Unified behaviour registry: ${extra}` : '';
    } catch (_) {
      return '';
    }
  })()}`;
}

function safe(s) {
  return String(s || '').slice(0, 120);
}

/**
 * Deterministic modifiers for chart-check adaptive scoring (weights + small score penalties).
 * Keeps category/session/volatility intelligence in one place for the API layer.
 *
 * @param {ReturnType<typeof resolveInstrumentIntelligence>} ctx
 */
function getInstrumentScoringModifiers(ctx) {
  const category = ctx?.category || 'unknown';
  const sym = String(ctx?.normalizedSymbol || '').toUpperCase();
  const isGold = /^(XAU|GC)/.test(sym) || /GOLD/i.test(sym);
  const isEnergy = /(OIL|WTI|BRENT|XNG|NATGAS|CL\b|UKOIL|USOIL)/i.test(sym);

  const out = {
    weightDelta: { clarity: 0, checklist: 0, bias: 0 },
    scorePenalties: [],
    labels: [],
  };

  switch (category) {
    case 'crypto':
      out.weightDelta.clarity += 0.04;
      out.weightDelta.checklist -= 0.06;
      out.weightDelta.bias += 0.02;
      out.scorePenalties.push({
        reason: 'crypto: elevated stop-run / wick risk on LTF',
        points: 4,
        target: 'checklist',
      });
      out.labels.push('volatility_penalty');
      break;
    case 'forex':
      out.weightDelta.checklist += 0.07;
      out.weightDelta.bias += 0.03;
      out.weightDelta.clarity -= 0.05;
      out.labels.push('session_structure_emphasis');
      break;
    case 'indices':
    case 'etfs':
      out.weightDelta.bias += 0.09;
      out.weightDelta.checklist += 0.03;
      out.weightDelta.clarity -= 0.07;
      out.labels.push('momentum_bias_emphasis');
      break;
    case 'futures':
      out.weightDelta.bias += 0.06;
      out.weightDelta.checklist += 0.04;
      out.weightDelta.clarity -= 0.05;
      out.labels.push('contract_momentum_context');
      break;
    case 'commodities':
      out.weightDelta.checklist += 0.02;
      out.weightDelta.bias -= 0.02;
      if (isEnergy) {
        out.scorePenalties.push({
          reason: 'energy: event/gap volatility vs FX-style structure',
          points: 3,
          target: 'checklist',
        });
      }
      out.labels.push('commodity_volatility');
      break;
    case 'stocks':
      out.weightDelta.checklist += 0.04;
      out.weightDelta.clarity += 0.02;
      out.weightDelta.bias -= 0.03;
      break;
    case 'macro':
      out.weightDelta.clarity += 0.05;
      out.weightDelta.checklist -= 0.03;
      out.weightDelta.bias -= 0.02;
      break;
    default:
      break;
  }

  if (isGold) {
    out.weightDelta.checklist += 0.03;
    out.weightDelta.bias -= 0.04;
    out.scorePenalties.push({
      reason: 'gold: sweep / liquidity engineering common on metals',
      points: 5,
      target: 'bias',
    });
    out.labels.push('manipulation_sweep_sensitivity');
  }

  return out;
}

const INDICATOR_AND_METHOD_RULES = `INDICATORS & MARKUP — OBSERVED VS INFERRED (mandatory):
- OBSERVED: only name an indicator/tool if labels, legend, pane title, or unmistakable visual (e.g. RSI sub-panel 0-100, MACD histogram, Bollinger bands hugging price, VWAP line labeled, Ichimoku cloud colors) are visible.
- INFERRED: you may infer "possible moving-average ribbon" ONLY as inferred/window dressing if lines look like MAs but are not labeled — mark as inferred, not confirmed.
- NOT CONFIRMED: if unsure, say "indicator type not confirmed" and do not invent numeric RSI/MACD readings.
- If user drew trendlines/Fibs/zones and they are visible, describe them as observed geometry; do not fabricate exact ratio levels you cannot read.
- Classify setup style when relevant: scalp / intraday / swing / breakout / reversal / continuation / range / momentum / discretionary confluence — pick what best matches visible structure and checklist mode; can be mixed if chart shows overlap.

SCORING DISCIPLINE:
- Penalize ambiguous multi-timeframe disagreement and poor image quality in chartClarityScore and biasConfidenceScore.
- Penalize overextension if latest impulse is stretched vs visible mean/VWAP/MA without pullback.
- Reward clean HTF+LTF alignment and clear invalidation only when visible.

INTERPRETATION (ONLY IF VISIBLE — describe, do not invent readings):
- RSI: swings/momentum loss vs price; call divergence only when higher highs/lower lows are visually obvious alongside RSI pivot change.
- MACD: histogram expansion/contract or signal cross — only if MACD pane is identifiable.
- VWAP: above/below or reclaim — only if VWAP is labeled or uniquely inferable as anchored VWAP.
- Bollinger: squeeze (bands tight) vs expansion — width change must be visible.
- EMA stack: faster vs slower order and compression — lines must behave like MAs; label if known.

OUTPUT QUALITY:
- In whatAiSees, prefix facts parsed from the image vs inferred where helpful (e.g. "Observed: …" / "Inferred: …").
- In issues, call out hallucination risk if the chart is cluttered or low resolution.`;

module.exports = {
  resolveInstrumentIntelligence,
  buildInstrumentPromptBlock,
  getInstrumentScoringModifiers,
  INDICATOR_AND_METHOD_RULES,
  getSymbolAliases,
  /** Same keys as src/data/instrumentRegistry.json symbolAliases (backward compatible export). */
  SYMBOL_ALIASES: getSymbolAliases(),
  AURA_SYMBOL_COUNT: AURA_SYMBOL_MAP.size,
};
