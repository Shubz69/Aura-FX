/**
 * Single source of truth: allowed instruments per automated brief category.
 * Prevents cross-asset contamination (e.g. FX tickers inside a stocks brief).
 */

const { fetchWithTimeout } = require('./fetchWithTimeout');
const { getConfig } = require('../config');
const { getQuote } = require('./finnhubService');
const {
  DESK_AUTOMATION_CATEGORY_KINDS,
  canonicalDeskCategoryKind,
  isDeskAutomationCategoryKind,
  isInstitutionalBriefKind,
} = require('../deskBriefKinds');

const BRIEF_KIND_ORDER = [...DESK_AUTOMATION_CATEGORY_KINDS];

/** Strict universe per category — only these may appear as top-5 or in model-facing instrument lists. */
const INSTRUMENT_UNIVERSE_BY_KIND = {
  global_macro: [
    'US500', 'NAS100', 'US30', 'GER40', 'UK100',
    'US10Y', 'US02Y', 'DE10Y', 'EURUSD', 'XAUUSD',
  ],
  equities: [
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'NFLX', 'JPM', 'BAC', 'XOM',
    'UNH', 'LLY', 'AVGO', 'COST', 'DIS', 'INTC', 'CRM', 'ORCL', 'WMT', 'MA', 'V', 'PG', 'KO', 'PEP',
  ],
  forex: [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP',
    'AUDJPY', 'EURAUD', 'EURCHF', 'GBPCHF', 'CADJPY', 'NZDJPY',
  ],
  commodities: ['XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'XNGUSD', 'XCUUSD', 'XPTUSD', 'XPDUSD'],
  fixed_income: ['US02Y', 'US05Y', 'US10Y', 'US30Y', 'DE10Y', 'UK10Y', 'JP10Y', 'IT10Y'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'AVAXUSD', 'DOTUSD', 'LINKUSD', 'LTCUSD'],
  geopolitics: ['US500', 'XAUUSD', 'USOIL', 'EURUSD', 'US10Y', 'NAS100'],
  market_sentiment: ['SPY', 'QQQ', 'IWM', 'HYG', 'TLT', 'US500', 'NAS100'],
  /** Weekly WFA sleeves (distinct from legacy desk `equities` single-name list). */
  indices: ['US500', 'NAS100', 'US30', 'GER40', 'UK100'],
  stocks: [
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'NFLX', 'JPM', 'BAC', 'XOM',
  ],
  equities_basket: ['SPY', 'QQQ', 'IWM', 'SMH', 'XLF', 'XLE', 'DIA'],
};

/** Deterministic fallback top-5 when quotes/scoring unavailable (subset of universe, category-pure). */
const FALLBACK_TOP5_BY_KIND = {
  global_macro: ['US500', 'NAS100', 'US10Y', 'EURUSD', 'XAUUSD'],
  equities: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'],
  commodities: ['XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'XNGUSD'],
  fixed_income: ['US02Y', 'US10Y', 'US30Y', 'DE10Y', 'UK10Y'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD'],
  geopolitics: ['US500', 'XAUUSD', 'USOIL', 'EURUSD', 'US10Y'],
  market_sentiment: ['SPY', 'QQQ', 'IWM', 'HYG', 'TLT'],
  indices: ['US500', 'NAS100', 'US30', 'GER40', 'UK100'],
  stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
  equities_basket: ['SPY', 'QQQ', 'IWM', 'SMH', 'XLF'],
};

const KIND_HEADLINE_KEYWORDS = {
  global_macro:
    /\b(macro|gdp|cpi|pce|pmi|fed|ecb|boe|boj|growth|inflation|recession|liquidity|policy|yield\s*curve|s&p|nasdaq|dax|yield)\b/i,
  equities:
    /\b(stock|equity|equities|earnings|eps|guidance|nasdaq|nyse|s&p|apple|microsoft|nvidia|tesla|amazon|meta|split|buyback|dividend|ipo|sec)\b/i,
  forex: /\b(forex|fx|eur|gbp|jpy|chf|aud|nzd|cad|dollar|yen|euro|cable|fed|ecb|boe|boj|cpi|nfp|rate\s+decision|currency)\b/i,
  commodities: /\b(oil|wti|brent|gold|silver|copper|gas|lng|opec|inventory|xau|xag|commodit)\b/i,
  fixed_income: /\b(bond|yield|treasury|t\-bill|duration|curve|auction|10y|2y|30y|rates|gilts|bund)\b/i,
  crypto: /\b(bitcoin|btc|ethereum|eth|crypto|defi|stablecoin|etf\s+crypto|blockchain|solana|xrp|binance|perp|funding)\b/i,
  geopolitics:
    /\b(war|sanction|nato|opec|conflict|geopol|iran|israel|ukraine|taiwan|middle\s*east|trade\s*war|tariff|election|terror|embargo)\b/i,
  market_sentiment:
    /\b(vix|sentiment|breadth|put\s*call|fear|greed|risk\s*on|risk\s*off|etf\s*flow|advance|decline|mag\s*seven)\b/i,
  indices: /\b(index|s&p|nasdaq|dow|dax|ftse|ndx|futures|cash\s*open|breadth)\b/i,
  stocks: /\b(stock|equity|earnings|eps|guidance|split|buyback|sec|upgrade|downgrade)\b/i,
  equities_basket: /\b(etf|sector|spy|qqq|iwm|breadth|leadership|rotation)\b/i,
};

/** Headline → symbol relevance (first match wins per line). */
const INSTRUMENT_HEADLINE_HINTS = {
  EURUSD: /\b(euro|eur\/usd|eurusd|ecb|lagarde|eurozone|bund)\b/i,
  GBPUSD: /\b(sterling|cable|gbp\/usd|gbpusd|boe|bailey|uk\s*gdp)\b/i,
  USDJPY: /\b(yen|usd\/jpy|usdjpy|boj|ueda|jgb)\b/i,
  AUDUSD: /\b(aussie|aud\/usd|audusd|rba)\b/i,
  USDCAD: /\b(usdcad|loonie|boc|bank\s*of\s*canada)\b/i,
  NZDUSD: /\b(kiwi|nzd|rbnz)\b/i,
  USDCHF: /\b(franc|usd\/chf|usdchf|snb)\b/i,
  EURJPY: /\b(eurjpy|euro\s*yen)\b/i,
  GBPJPY: /\b(gbpjpy|cable\s*yen|sterling\s*yen)\b/i,
  XAUUSD: /\b(gold|xau|bullion|precious\s*metal)\b/i,
  XAGUSD: /\b(silver|xag)\b/i,
  US500: /\b(s&p|spx|s\s*p\s*500|us\s*500|index\s*futures\s*es)\b/i,
  NAS100: /\b(nasdaq|ndx|qqq|mag\s*seven|tech\s*heavy)\b/i,
  US30: /\b(dow|djia|us\s*30)\b/i,
  US2000: /\b(russell\s*2000|small\s*cap|iwm)\b/i,
  GER40: /\b(dax|germany|ecb\s*impact)\b/i,
  UK100: /\b(ftse|uk\s*100)\b/i,
  JP225: /\b(nikkei|japan\s*equit|topix)\b/i,
  HK50: /\b(hang\s*seng|hong\s*kong\s*index)\b/i,
  STOXX50: /\b(euro\s*stoxx|stoxx\s*50|sx5e)\b/i,
  CAC40: /\b(cac\s*40|paris\s*index|france\s*40)\b/i,
  BTCUSD: /\b(bitcoin|btc|etf\s*bitcoin)\b/i,
  ETHUSD: /\b(ethereum|eth\s)\b/i,
  SOLUSD: /\b(solana|sol\s)\b/i,
  XRPUSD: /\b(ripple|xrp)\b/i,
  ADAUSD: /\b(cardano|ada\s)\b/i,
  DOGEUSD: /\b(dogecoin|doge)\b/i,
  AVAXUSD: /\b(avalanche|avax)\b/i,
  DOTUSD: /\b(polkadot|dot\s)\b/i,
  LINKUSD: /\b(chainlink|link\s)\b/i,
  LTCUSD: /\b(litecoin|ltc\s)\b/i,
  US10Y: /\b(10y|10\-year|treasury|yields?|bonds?|rates)\b/i,
  US02Y: /\b(2y|2\-year|bill|front\s*end)\b/i,
  US05Y: /\b(5y|5\-year)\b/i,
  US30Y: /\b(30y|30\-year|long\s*end)\b/i,
  DE10Y: /\b(bund|german\s*yield|euro\s*rates)\b/i,
  UK10Y: /\b(gilt|uk\s*10y|uk\s*yield)\b/i,
  JP10Y: /\b(jgb|japan\s*10y)\b/i,
  IT10Y: /\b(btp|italy\s*bond|italian\s*yield)\b/i,
  WTI: /\b(wti|crude|oil|opec)\b/i,
  BRENT: /\b(brent|north\s*sea)\b/i,
  NATGAS: /\b(natural\s*gas|henry\s*hub|lng)\b/i,
  COPPER: /\b(copper|hg\s*futures|dr\s*copper)\b/i,
  XPTUSD: /\b(platinum|xpt)\b/i,
  XPDUSD: /\b(palladium|xpd)\b/i,
  'ES1!': /\b(es\s|e\-mini\s*s&p|spx\s*futures)\b/i,
  'NQ1!': /\b(nq\s|nasdaq\s*futures)\b/i,
  'RTY1!': /\b(rty|russell\s*futures)\b/i,
  'CL1!': /\b(crude|wti|oil\s*futures)\b/i,
  'GC1!': /\b(gold\s*futures|comex\s*gold)\b/i,
  'SI1!': /\b(silver\s*futures)\b/i,
  'NG1!': /\b(nat\s*gas\s*futures|henry\s*hub)\b/i,
  'ZN1!': /\b(10y\s*futures|treasury\s*futures|zn\s)\b/i,
  'ZB1!': /\b(30y\s*bond\s*futures|ultra\s*bond)\b/i,
  '6E1!': /\b(euro\s*futures|6e)\b/i,
  '6B1!': /\b(sterling\s*futures|6b)\b/i,
  '6J1!': /\b(yen\s*futures|6j)\b/i,
  AAPL: /\b(apple|aapl|iphone|ios)\b/i,
  MSFT: /\b(microsoft|msft|azure|windows)\b/i,
  NVDA: /\b(nvidia|nvda|gpu|cuda|blackwell)\b/i,
  TSLA: /\b(tesla|tsla|musk|ev\s)\b/i,
  AMZN: /\b(amazon|amzn|aws)\b/i,
  META: /\b(meta|facebook|fb\s|instagram|threads)\b/i,
  GOOGL: /\b(google|googl|alphabet|gemini)\b/i,
  AMD: /\b(advanced\s*micro|amd\s)\b/i,
  NFLX: /\b(netflix|nflx)\b/i,
  JPM: /\b(jpmorgan|jpm\s)\b/i,
  BAC: /\b(bank\s*of\s*america|bac\s)\b/i,
  XOM: /\b(exxon|xom\s)\b/i,
  UNH: /\b(unitedhealth|unh\s)\b/i,
  LLY: /\b(lilly|lly\s|zepbound|mounjaro)\b/i,
  AVGO: /\b(broadcom|avgo)\b/i,
  COST: /\b(costco|cost\s)\b/i,
  DIS: /\b(disney|dis\s)\b/i,
  INTC: /\b(intel|intc)\b/i,
  CRM: /\b(salesforce|crm\s)\b/i,
  ORCL: /\b(oracle|orcl)\b/i,
  WMT: /\b(walmart|wmt\s)\b/i,
  MA: /\b(mastercard|ma\s)\b/i,
  V: /\b(visa|visa\s+inc|v\s+stock)\b/i,
  PG: /\b(procter|p&g|pg\s)\b/i,
  KO: /\b(coca\-cola|ko\s)\b/i,
  PEP: /\b(pepsico|pep\s)\b/i,
  SPY: /\b(spy|s&p\s*etf)\b/i,
  QQQ: /\b(qqq|nasdaq\s*etf)\b/i,
  IWM: /\b(russell|iwm|small\s*cap)\b/i,
  DIA: /\b(dia|dow\s*etf)\b/i,
  GLD: /\b(gld|gold\s*etf)\b/i,
  SLV: /\b(slv|silver\s*etf)\b/i,
  TLT: /\b(tlt|long\s*treasury\s*etf|duration)\b/i,
  HYG: /\b(high\s*yield|hyg|junk\s*bond)\b/i,
  LQD: /\b(investment\s*grade|lqd)\b/i,
  XLE: /\b(xle|energy\s*sector)\b/i,
  XLK: /\b(xlk|tech\s*sector)\b/i,
  SMH: /\b(smh|semiconductor\s*etf)\b/i,
  XLV: /\b(xlv|healthcare\s*sector)\b/i,
  XLF: /\b(xlf|financial\s*sector)\b/i,
  XLI: /\b(xli|industrial\s*sector)\b/i,
  EEM: /\b(emerging\s*market|eem)\b/i,
  VNQ: /\b(reit|vnq|real\s*estate\s*etf)\b/i,
  USO: /\b(uso|oil\s*etf)\b/i,
  UNG: /\b(ung|gas\s*etf)\b/i,
};

const BANNED_PHRASES = [
  'scenario 1 defines',
  'scenario 2 defines',
  'scenario 3 defines',
  'scenario 1',
  'scenario 2',
  'scenario 3',
  'daily scenario',
  'base and surprise pathways',
  'base and surprise',
  'position-sizing discipline tied to liquidity',
  'position sizing discipline tied to liquidity',
  'position sizing discipline',
  'position sizing',
  'check calendar',
  'catalyst trigger',
  'directional invalidation',
  'volatility-adjusted risk',
  'invalidation from other symbols in the set',
  'separate invalidation from other symbols',
  'it is important to note',
  'in conclusion',
  'moving forward',
  'leverage appropriate',
  'stay nimble',
  'remain cautious',
];

/** Generic checklist / risk filler — reject in validation (body + notes). */
const GENERIC_BOILERPLATE_FRAGMENTS = [
  'watch bond yields',
  'watch yields for equity',
  'avoid new positions immediately ahead of high-impact',
  'avoid overtrading into major releases',
  'reduce risk when releases cluster',
  'reduce position size',
  'trade defensive until',
  'weekly scenario tree',
  'confirmation remained essential',
  'no dominant narrative: confirmation',
  'prioritize confirmation-based entries over predictive',
  'scale only on confirmation',
  'protect downside first',
  'maintain a bias only when momentum',
];

const GENERIC_BOILERPLATE_RE = new RegExp(
  GENERIC_BOILERPLATE_FRAGMENTS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

const BANNED_PHRASES_RE = new RegExp(
  BANNED_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

const CATEGORY_INTELLIGENCE_DIRECTIVES = {
  global_macro:
    'GLOBAL MACRO DESK: Cross-asset macro spine — growth, inflation, CB path, liquidity, indices vs rates transmission. Ground every level in the pack.',
  equities:
    'EQUITIES DESK: Macro-first tape — breadth, sector rotation, earnings/macro beta. Mention single names only when headlines or relative strength justify it.',
  forex:
    'FX DESK: Rates, USD, and CB path as the spine; session liquidity and event vol. Pairs only when they clarify transmission.',
  commodities:
    'COMMODITIES DESK: USD, growth, and supply/demand themes; energy vs metals when the pack differentiates them.',
  fixed_income:
    'FIXED INCOME DESK: Curve shape, policy path, real yields, auctions — yields only when backed by pack data.',
  crypto:
    'CRYPTO DESK: Liquidity, majors vs alts, ETF/regulatory headlines from the pack — no invented on-chain detail.',
  geopolitics:
    'GEOPOLITICS DESK: Conflict, sanctions, trade, energy security transmission into indices, FX, commodities, rates — cite headlines/calendar only.',
  market_sentiment:
    'MARKET SENTIMENT DESK: Risk appetite, breadth, factor/credit proxies (equities + HYG + duration) — flows and positioning tone from facts.',
  aura_institutional_daily:
    'INSTITUTIONAL DAILY: Cross-asset house note — leadership, liquidity, scheduled risk; grounded in the instrument pack.',
  aura_institutional_weekly:
    'INSTITUTIONAL WEEKLY: Week-in-review and forward structural read across the house universe; no single-sleeve monologue.',
  aura_institutional_weekly_forex:
    'WEEKLY WFA FOREX: G10 and key crosses; USD funding and curve as spine; event risk from calendar.',
  aura_institutional_weekly_crypto:
    'WEEKLY WFA CRYPTO: Majors liquidity beta; ETF and policy headlines; rates and dollar as upstream drivers.',
  aura_institutional_weekly_commodities:
    'WEEKLY WFA COMMODITIES: Energy and metals vs USD and growth; inventories and geopolitical supply risk.',
  aura_institutional_weekly_fixed_income:
    'WEEKLY WFA FIXED INCOME: Curve and real yields; auctions and CB path; spillover to risk assets.',
  aura_institutional_weekly_equities:
    'WEEKLY WFA EQUITIES: ETF and broad equity beta; sector rotation vs rates and earnings.',
  aura_institutional_weekly_indices:
    'WEEKLY WFA INDICES: Benchmark tape; breadth and leadership vs volatility and liquidity.',
  aura_institutional_weekly_stocks:
    'WEEKLY WFA STOCKS: Single-name idiosyncrasy vs macro; earnings and guidance as first-class drivers.',
  aura_institutional_daily_forex:
    'DAILY BRIEF FOREX: Session map and rate spreads; USD path via yields; calendar-backed catalysts only.',
  aura_institutional_daily_crypto:
    'DAILY BRIEF CRYPTO: Liquidity beta vs dollar and rates; majors; headlines from pack only.',
  aura_institutional_daily_commodities:
    'DAILY BRIEF COMMODITIES: Energy and metals vs USD and growth; factPack quotes only.',
  aura_institutional_daily_fixed_income:
    'DAILY BRIEF FIXED INCOME: Curve and real yields; auctions and CB path when in calendar.',
  aura_institutional_daily_equities:
    'DAILY BRIEF EQUITIES: ETF and basket beta vs yields; sector tone from drivers when present.',
  aura_institutional_daily_indices:
    'DAILY BRIEF INDICES: Benchmark tape vs vol and liquidity; breadth only when inferable.',
  aura_institutional_daily_stocks:
    'DAILY BRIEF STOCKS: Single names vs macro; earnings headlines from pack only.',
  aura_sunday_market_open:
    'SUNDAY MARKET OPEN: Week-ahead regime lens; oil, yields, gold, USD transmission; highest-impact events only from fact pack.',
};

const CALENDAR_HIGH_IMPACT = /\b(high|red)\b/i;

const INSTITUTIONAL_CATEGORY_TAIL_TO_SCORE = Object.freeze({
  forex: 'forex',
  crypto: 'crypto',
  commodities: 'commodities',
  fixed_income: 'fixed_income',
  equities: 'equities_basket',
  indices: 'indices',
  stocks: 'stocks',
});

/** Maps institutional weekly WFA brief_kind to scoring universe key (NOT a DB category slug). */
function weeklyInstitutionalKindToScoreKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  if (!k.startsWith('aura_institutional_weekly_')) return null;
  const tail = k.slice('aura_institutional_weekly_'.length);
  return INSTITUTIONAL_CATEGORY_TAIL_TO_SCORE[tail] || null;
}

/** Maps institutional daily PDF brief_kind to scoring universe key. */
function dailyInstitutionalKindToScoreKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  if (!k.startsWith('aura_institutional_daily_')) return null;
  const tail = k.slice('aura_institutional_daily_'.length);
  if (tail === 'daily' || tail === 'weekly') return null;
  return INSTITUTIONAL_CATEGORY_TAIL_TO_SCORE[tail] || null;
}

function normalizeBriefKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  if (k === 'aura_sunday_market_open') return k;
  if (
    /^aura_institutional_daily_(forex|crypto|commodities|fixed_income|equities|indices|stocks)$/.test(k)
  ) {
    return k;
  }
  if (
    /^aura_institutional_weekly_(forex|crypto|commodities|fixed_income|equities|indices|stocks)$/.test(k)
  ) {
    return k;
  }
  if (k === 'aura_institutional_daily' || k === 'aura_institutional_weekly') return k;
  const canon = canonicalDeskCategoryKind(k);
  if (isDeskAutomationCategoryKind(canon)) return canon;
  return 'equities';
}

/** Maps weekly WFA slugs and legacy kinds to instrument-scoring universe keys (forex, indices, …). */
function resolveScoringUniverseKey(kind) {
  const k = String(kind || '').toLowerCase().trim();
  if (k === 'aura_sunday_market_open') return 'global_macro';
  const w = weeklyInstitutionalKindToScoreKind(k);
  if (w) return w;
  const d = dailyInstitutionalKindToScoreKind(k);
  if (d) return d;
  return normalizeBriefKind(kind);
}

function getUniverseSymbols(kind) {
  const k = resolveScoringUniverseKey(kind);
  return [...(INSTRUMENT_UNIVERSE_BY_KIND[k] || INSTRUMENT_UNIVERSE_BY_KIND.equities)];
}

function fallbackTop5ForKind(kind) {
  const k = resolveScoringUniverseKey(kind);
  return [...(FALLBACK_TOP5_BY_KIND[k] || FALLBACK_TOP5_BY_KIND.equities)].slice(0, 5);
}

function isSymbolAllowedForKind(symbol, kind) {
  const sym = String(symbol || '').toUpperCase().trim();
  const set = new Set(getUniverseSymbols(kind).map((s) => String(s).toUpperCase()));
  return set.has(sym);
}

function validateTopInstrumentsForKind(symbols, kind) {
  const k = resolveScoringUniverseKey(kind);
  const list = Array.isArray(symbols) ? symbols.map((s) => String(s).toUpperCase().trim()) : [];
  const uniq = [...new Set(list)];
  const bad = uniq.filter((s) => !isSymbolAllowedForKind(s, k));
  const lenOk = uniq.length >= 3 && uniq.length <= 5;
  return { ok: bad.length === 0 && uniq.length === list.length && lenOk, bad, uniq };
}

function collectAllAutomationUniverseSymbols() {
  const out = new Set();
  for (const k of BRIEF_KIND_ORDER) {
    getUniverseSymbols(k).forEach((s) => out.add(String(s).toUpperCase()));
  }
  return [...out];
}

function filterHeadlinesForBriefKind(headlines, briefKind) {
  const list = Array.isArray(headlines) ? headlines.map((h) => String(h || '').trim()).filter(Boolean) : [];
  if (list.length === 0) return [];
  const k = resolveScoringUniverseKey(briefKind);
  const re = KIND_HEADLINE_KEYWORDS[k];
  if (!re) return list.slice(0, 14);
  const matched = list.filter((h) => re.test(h));
  const rest = list.filter((h) => !re.test(h));
  return [...matched, ...rest].slice(0, 14);
}

function headlinesForSymbol(symbol, pool) {
  const sym = String(symbol || '').toUpperCase();
  const re = INSTRUMENT_HEADLINE_HINTS[sym];
  const list = Array.isArray(pool) ? pool : [];
  if (!re) return list.slice(0, 4);
  const hit = list.filter((h) => re.test(h));
  const rest = list.filter((h) => !re.test(h));
  return [...hit, ...rest].slice(0, 4);
}

function buildSymbolHeadlineMap(symbols, headlines) {
  const out = {};
  for (const sym of symbols || []) {
    out[String(sym).toUpperCase()] = headlinesForSymbol(sym, headlines);
  }
  return out;
}

function headlineHitsForSymbol(symbol, headlines) {
  const lines = headlinesForSymbol(symbol, headlines);
  return lines.length;
}

/** Calendar rows relevant to category (no fabricated events). */
function filterCalendarForBriefKind(events, briefKind) {
  const rows = Array.isArray(events) ? events : [];
  const k = resolveScoringUniverseKey(briefKind);
  const hi = rows.filter((e) => CALENDAR_HIGH_IMPACT.test(String(e.impact || '')));
  const base = hi.length >= 4 ? hi : rows;

  const currencyOf = (e) => String(e.currency || e.country || '').toUpperCase();

  if (k === 'forex') {
    const fxCcy = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']);
    return base.filter((e) => fxCcy.has(currencyOf(e)) || /\b(rate|cpi|gdp|employment|pmi|retail|trade)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'equities' || k === 'market_sentiment' || k === 'stocks' || k === 'equities_basket') {
    return base
      .filter(
        (e) =>
          currencyOf(e) === 'USD' ||
          /\b(fed|cpi|pce|gdp|employment|nfp|ism|earnings|retail|pmi|consumer|industrial)\b/i.test(String(e.event || ''))
      )
      .slice(0, 14);
  }
  if (k === 'indices') {
    return base
      .filter(
        (e) =>
          /\b(fed|cpi|pce|gdp|employment|nfp|ism|pmi|gdp|liquidity)\b/i.test(String(e.event || '')) ||
          ['USD', 'EUR', 'GBP', 'JPY'].includes(currencyOf(e))
      )
      .slice(0, 14);
  }
  if (k === 'global_macro') {
    return base
      .filter(
        (e) =>
          /\b(fed|ecb|boe|boj|cpi|pce|gdp|employment|nfp|ism|pmi|retail|trade|inflation|rate\s*decision)\b/i.test(String(e.event || '')) ||
          ['USD', 'EUR', 'GBP', 'JPY'].includes(currencyOf(e))
      )
      .slice(0, 14);
  }
  if (k === 'fixed_income') {
    return base.filter((e) => /\b(auction|yield|cpi|pce|gdp|employment|fed|ecb|boe|boj|rate\s*decision|pmi)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'commodities') {
    return base.filter((e) => /\b(oil|opec|inventor|cpi|pmi|china|usd|dollar|growth|gdp)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'crypto') {
    return base.filter((e) => /\b(fed|cpi|pce|regulat|sec|etf|inflation|liquidity|dollar|employment)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'geopolitics') {
    return base
      .filter(
        (e) =>
          /\b(war|sanction|nato|opec|geopol|conflict|trade|tariff|energy|defence|election)\b/i.test(String(e.event || '')) ||
          currencyOf(e) === 'USD'
      )
      .slice(0, 14);
  }
  return base.slice(0, 14);
}

function crossAssetSymbolsForContaminationCheck(kind) {
  const k = resolveScoringUniverseKey(kind);
  const out = new Set();
  for (const cat of BRIEF_KIND_ORDER) {
    if (cat === k) continue;
    getUniverseSymbols(cat).forEach((s) => out.add(String(s).toUpperCase()));
  }
  return out;
}

/** If non-allowed ticker tokens appear as whole words in prose, flag contamination. */
function detectCrossAssetContamination(text, briefKind) {
  const k = resolveScoringUniverseKey(briefKind);
  if (!isDeskAutomationCategoryKind(k)) return { contaminated: false, hits: [] };
  const forbidden = crossAssetSymbolsForContaminationCheck(briefKind);
  const body = String(text || '');
  const hits = [];
  for (const sym of forbidden) {
    if (!sym || sym.length < 3) continue;
    const re = new RegExp(`\\b${sym.replace(/[!]/g, '\\!')}\\b`, 'i');
    if (re.test(body)) hits.push(sym);
  }
  return { contaminated: hits.length > 0, hits: [...new Set(hits)].slice(0, 12) };
}

function packDriverLine(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d.trim();
  if (typeof d === 'object') {
    const parts = [d.name, d.biasLabel || d.direction, d.value, d.effect].filter(Boolean).map(String);
    return parts.join(' — ').trim();
  }
  return String(d);
}

function buildMacroSummaryLines(market, briefKind, period = 'daily') {
  return buildDeskContextLines(market, briefKind, period === 'weekly' ? 'weekly' : 'daily');
}

/** What changed / what matters now — leads with tape + drivers, not a vague regime label. */
function buildDeskContextLines(market, briefKind, period = 'daily') {
  const k = normalizeBriefKind(briefKind);
  const lines = [];
  if (period === 'weekly') {
    lines.push('Horizon: WEEKLY — structural repricing, persistence, and next-week catalysts; not a session scalping note.');
  } else {
    lines.push('Horizon: DAILY / next session — tactical tape, immediate data, and liquidity.');
  }
  const changes = (market?.marketChangesToday || [])
    .map((x) => (typeof x === 'string' ? x : x?.title))
    .filter(Boolean)
    .slice(0, 5);
  if (changes.length) {
    lines.push(`${period === 'weekly' ? 'Week context (engine)' : 'What moved narrative (engine)'}: ${changes.join(' · ')}`);
  }
  const drivers = (market?.keyDrivers || []).slice(0, 5).map(packDriverLine).filter(Boolean);
  if (drivers.length) {
    lines.push(`Quantified drivers (must cite where relevant): ${drivers.join(' | ')}`);
  }
  const sigs = (market?.crossAssetSignals || []).slice(0, 6);
  for (const s of sigs) {
    const line =
      typeof s === 'string'
        ? s
        : [s.asset, s.signal, s.direction && s.direction !== 'neutral' ? `dir:${s.direction}` : null]
            .filter(Boolean)
            .join(' — ');
    if (line) lines.push(`Cross-asset: ${line}`);
  }
  const regime = market?.marketRegime && typeof market.marketRegime === 'object' ? market.marketRegime : {};
  const pulse = market?.marketPulse && typeof market.marketPulse === 'object' ? market.marketPulse : {};
  lines.push(
    `Snapshot: ${regime.currentRegime || 'mixed'} regime, ${pulse.label || 'MIXED'} pulse (${pulse.score != null ? pulse.score : '—'}/100).`
  );
  const boundaryKey = resolveScoringUniverseKey(briefKind);
  if (isDeskAutomationCategoryKind(boundaryKey)) {
    lines.push(`BOUNDARY: ${boundaryKey} only — no tickers outside instrumentIntelligence[].instrument.`);
  }
  return lines;
}

function categoryWritingMandate(briefKind, period) {
  const slug = normalizeBriefKind(briefKind);
  const scoreK = resolveScoringUniverseKey(briefKind);
  const p = period === 'weekly' ? 'weekly' : 'daily';
  const depth = p === 'weekly' ? 'structural and strategic: week-to-date repricing, persistence of trends, sector/index leadership rotation, forward path for rates/liquidity.' : 'tactical: next session catalysts, tape/vol behaviour, immediate event risk, how to lean without over-committing.';
  const map = {
    global_macro: `Global macro desk note. ${depth} Indices, yields, FX and gold as transmission; leadership and liquidity vs scheduled macro.`,
    equities: `Equities desk note. ${depth} Earnings/guidance, revisions, sector RS, breadth vs index, flow into mega-cap vs rest.`,
    forex: `G10 FX desk note. ${depth} Rate spreads, CB guidance, risk beta, session liquidity (Asia/London/NY), data surprises.`,
    commodities: `Commodities desk note. ${depth} Inventories, USD pass-through, geopolitical supply risk, energy vs metals.`,
    fixed_income: `Fixed income desk note. ${depth} Curve shape, real yields, auctions, CB path repricing, growth/inflation transmission.`,
    crypto: `Digital assets desk note. ${depth} Liquidity, ETF/regulatory headlines, majors vs alts, macro correlation from the pack.`,
    geopolitics: `Geopolitics desk note. ${depth} Transmission into risk assets, energy, FX and rates — headline and calendar grounded only.`,
    market_sentiment: `Market sentiment desk note. ${depth} Risk appetite, credit/duration proxies, breadth and factor tone vs macro prints.`,
    aura_institutional_daily: `Institutional daily house note. ${depth} Cross-asset leadership, liquidity, and scheduled risk across the published instrument set.`,
    aura_institutional_weekly: `Institutional weekly house note. ${depth} Structural repricing, persistence, and next-week catalysts across the house universe.`,
  };
  return map[slug] || map[scoreK] || map.equities;
}

/** Full Twelve Data quote for brief intelligence (volume etc.) — via marketDataLayer. */
async function fetchTwelveDataQuoteExtended(symbol) {
  const sym = String(symbol || '').trim();
  if (!sym) return null;
  try {
    const { toCanonical, usesForexSessionContext } = require('../../ai/utils/symbol-registry');
    const { fetchQuoteDto } = require('../../market-data/marketDataLayer');
    const { changeVsPreviousClose, changeVsPreviousCloseOnly } = require('../../market-data/priceMath');
    const canonical = toCanonical(sym);
    const bFeat = usesForexSessionContext(canonical) ? 'fx-brief-quote' : 'brief';
    const dto = await fetchQuoteDto(canonical, { feature: bFeat });
    if (!dto || dto.last == null || !Number.isFinite(dto.last) || dto.last <= 0) return null;
    const c = dto.last;
    const vs = changeVsPreviousClose(dto);
    const vsOnly = changeVsPreviousCloseOnly(dto);
    let pc;
    let d;
    let dp;
    if (usesForexSessionContext(canonical)) {
      pc = dto.prevClose != null && Number.isFinite(dto.prevClose) ? dto.prevClose : null;
      if (vsOnly.change != null && vsOnly.changePct != null) {
        d = vsOnly.change;
        dp = vsOnly.changePct;
      } else if (dto.open != null && Number.isFinite(dto.open)) {
        d = c - dto.open;
        dp = null;
      } else {
        return null;
      }
    } else {
      pc = dto.prevClose;
      if (pc == null || !Number.isFinite(pc)) pc = dto.open;
      if (pc == null || !Number.isFinite(pc)) return null;
      d = c - pc;
      dp = vs.changePct != null && Number.isFinite(vs.changePct) ? vs.changePct : pc !== 0 ? (d / Math.abs(pc)) * 100 : 0;
    }
    return {
      c,
      pc,
      d,
      dp,
      volume: dto.volume != null && Number.isFinite(dto.volume) ? dto.volume : null,
      averageVolume: dto.averageVolume != null && Number.isFinite(dto.averageVolume) ? dto.averageVolume : null,
    };
  } catch (_) {
    return null;
  }
}

/** Finnhub symbols for automation universe tickers (Twelve Data / FMP use plain tickers). */
const FINNHUB_AUTOMATION_SYMBOL = {
  US500: '^GSPC',
  NAS100: '^IXIC',
  US30: '^DJI',
  US2000: '^RUT',
  GER40: 'DAX',
  UK100: '^FTSE',
  JP225: '^N225',
  HK50: '^HSI',
  STOXX50: '^STOXX50E',
  CAC40: '^FCHI',
  XAUUSD: 'OANDA:XAU_USD',
  XAGUSD: 'OANDA:XAG_USD',
  XPTUSD: 'OANDA:XPT_USD',
  XPDUSD: 'OANDA:XPD_USD',
  WTI: 'OANDA:USOIL_USD',
  BRENT: 'OANDA:BRENT_USD',
  US10Y: '^TNX',
  US02Y: '^IRX',
  US05Y: '^FVX',
  US30Y: '^TYX',
  BTCUSD: 'BINANCE:BTCUSDT',
  ETHUSD: 'BINANCE:ETHUSDT',
  SOLUSD: 'BINANCE:SOLUSDT',
  XRPUSD: 'BINANCE:XRPUSDT',
  ADAUSD: 'BINANCE:ADAUSDT',
  DOGEUSD: 'BINANCE:DOGEUSDT',
  AVAXUSD: 'BINANCE:AVAXUSDT',
  DOTUSD: 'BINANCE:DOTUSDT',
  LINKUSD: 'BINANCE:LINKUSDT',
  LTCUSD: 'BINANCE:LTCUSDT',
  NATGAS: 'OANDA:NATGAS_USD',
  COPPER: 'OANDA:COPPER_USD',
};

function finnhubAutomationRouting(symbol) {
  const u = String(symbol || '').toUpperCase().trim();
  if (FINNHUB_AUTOMATION_SYMBOL[u]) return FINNHUB_AUTOMATION_SYMBOL[u];
  if (/^[A-Z]{6}$/.test(u)) {
    const base = u.slice(0, 3);
    const quote = u.slice(3);
    return `OANDA:${base}_${quote}`;
  }
  return u;
}

async function fetchFmpQuoteAutomation(symbol) {
  const { fmpApiKey } = getConfig();
  if (!fmpApiKey) return null;
  const sym = String(symbol || '').trim();
  if (!sym) return null;
  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(sym)}?apikey=${encodeURIComponent(fmpApiKey)}`;
    const res = await fetchWithTimeout(url, {}, 7000);
    if (!res.ok) return null;
    const arr = await res.json();
    const row = Array.isArray(arr) ? arr[0] : arr;
    if (!row || row.price == null) return null;
    const c = Number(row.price);
    const pc = row.previousClose != null ? Number(row.previousClose) : c;
    const d = c - pc;
    const dp = pc && pc !== 0 ? (d / Math.abs(pc)) * 100 : 0;
    const volume = row.volume != null ? parseFloat(row.volume) : null;
    const averageVolume = row.avgVolume != null ? parseFloat(row.avgVolume) : null;
    return {
      c,
      pc,
      d,
      dp,
      volume: Number.isFinite(volume) ? volume : null,
      averageVolume: Number.isFinite(averageVolume) ? averageVolume : null,
    };
  } catch (_) {
    return null;
  }
}

async function fetchFinnhubQuoteAutomation(symbol) {
  const fhSym = finnhubAutomationRouting(symbol);
  const q = await getQuote(fhSym);
  if (!q.ok || !q.data || q.data.c == null) return null;
  const c = Number(q.data.c);
  if (!Number.isFinite(c) || c <= 0) return null;
  let pc = c;
  if (q.data.d != null && Number.isFinite(Number(q.data.d))) {
    pc = c - Number(q.data.d);
  } else if (q.data.dp != null && Number.isFinite(Number(q.data.dp))) {
    const pdp = Number(q.data.dp);
    pc = c / (1 + pdp / 100);
  }
  const dp =
    q.data.dp != null && Number.isFinite(Number(q.data.dp))
      ? Number(q.data.dp)
      : pc && Math.abs(pc) > 1e-8
        ? ((c - pc) / Math.abs(pc)) * 100
        : 0;
  return {
    c,
    pc,
    d: c - pc,
    dp,
    volume: null,
    averageVolume: null,
  };
}

/**
 * Twelve Data → FMP → Finnhub so auto-brief quote cache survives single-provider 403/missing keys.
 */
async function fetchAutomationQuoteWithFallback(symbol) {
  const td = await fetchTwelveDataQuoteExtended(symbol);
  if (td) return td;
  const fmp = await fetchFmpQuoteAutomation(symbol);
  if (fmp) return fmp;
  return fetchFinnhubQuoteAutomation(symbol);
}

function calendarRelevantToSymbol(symU, cal, k) {
  return (cal || []).some((e) => {
    const ev = String(e.event || '').toLowerCase();
    const hint = INSTRUMENT_HEADLINE_HINTS[symU];
    if (hint && hint.test(ev)) return true;
    if (k === 'forex' && /USD/.test(symU) && /\b(usd|fed|dollar|nfp|cpi)\b/i.test(ev)) return true;
    if (
      (k === 'equities' ||
        k === 'global_macro' ||
        k === 'market_sentiment' ||
        k === 'indices' ||
        k === 'stocks' ||
        k === 'equities_basket') &&
      /US500|NAS100|US30|SPY|QQQ|IWM/.test(symU) &&
      /\b(s&p|nasdaq|dow|index|fed|cpi)\b/i.test(ev)
    ) {
      return true;
    }
    return false;
  });
}

function evidenceCountForSymbol(symU, quote, filteredHeadlines, cal, k, breakdown) {
  let n = 0;
  if (quote && typeof quote.dp === 'number' && Number.isFinite(quote.dp)) n += 1;
  if (headlineHitsForSymbol(symU, filteredHeadlines) > 0) n += 1;
  if (calendarRelevantToSymbol(symU, cal, k)) n += 1;
  if (breakdown && (breakdown.weeklyMoveScore > 0 || (breakdown.weekApproxPct != null && Number.isFinite(breakdown.weekApproxPct)))) {
    n += 1;
  }
  return n;
}

function volumeSpikeLabel(volume, avg) {
  if (volume == null || avg == null || !Number.isFinite(volume) || !Number.isFinite(avg) || avg <= 0) return null;
  const r = volume / avg;
  if (r >= 1.45) return `heavy_vs_avg_${r.toFixed(2)}x`;
  if (r <= 0.55) return 'light_vs_avg';
  return 'near_avg_volume';
}

function classifyVolatilityShift(dp) {
  if (dp == null || !Number.isFinite(dp)) return null;
  const a = Math.abs(dp);
  if (a >= 1.8) return 'expanded_move';
  if (a <= 0.06) return 'compressed_session';
  return 'normal_band';
}

function inferTechnicalState(dp) {
  if (dp == null || !Number.isFinite(dp)) return 'insufficient_price_data';
  if (dp > 0.4) return 'session_bid';
  if (dp < -0.4) return 'session_offer';
  if (Math.abs(dp) < 0.09) return 'session_compression';
  return 'session_drift';
}

function pickMacroLinkForSymbol(symU, market, briefKind) {
  const k = resolveScoringUniverseKey(briefKind);
  const drivers = (market?.keyDrivers || []).map(packDriverLine).join(' ').toLowerCase();
  const parts = [];
  if (
    /\b(yield|treasury|rate|bond)\b/i.test(drivers) &&
    (k === 'fixed_income' ||
      k === 'equities' ||
      k === 'global_macro' ||
      k === 'market_sentiment' ||
      k === 'indices' ||
      k === 'stocks' ||
      k === 'equities_basket')
  ) {
    parts.push((market.keyDrivers || []).find((d) => /yield|treasury|bond|rate/i.test(packDriverLine(d))));
  }
  if (/\b(dollar|usd|eur|fx)\b/i.test(drivers) && (k === 'forex' || k === 'commodities' || k === 'crypto')) {
    parts.push((market.keyDrivers || []).find((d) => /dollar|usd|eur/i.test(packDriverLine(d))));
  }
  if (/\b(oil|crude)\b/i.test(drivers) && (k === 'commodities' || k === 'geopolitics')) {
    parts.push((market.keyDrivers || []).find((d) => /oil|crude/i.test(packDriverLine(d))));
  }
  const packed = parts.filter(Boolean).map(packDriverLine).filter(Boolean);
  return packed[0] || null;
}

function nextCalendarLineForSymbol(symU, cal, k) {
  const rows = Array.isArray(cal) ? cal : [];
  for (const e of rows) {
    const ev = `${e.event || ''} ${e.currency || ''}`;
    if (calendarRelevantToSymbol(symU, [e], k)) {
      return `${e.event || ''} (${e.currency || '—'})`.trim();
    }
    if (k === 'forex' && /USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD/.test(symU) && /\b(cpi|gdp|employment|pmi|rate|retail)\b/i.test(ev)) {
      return `${e.event || ''} (${e.currency || '—'})`.trim();
    }
  }
  return rows[0] ? `${rows[0].event || ''} (${rows[0].currency || '—'})`.trim() : null;
}

/**
 * Per-instrument structured intelligence — only fields grounded in quoteCache / headlines / calendar / market.
 */
function buildInstrumentIntelligence({
  symbols,
  period,
  quoteCache,
  headlines,
  calendarRows,
  market,
  briefKind,
  scoreRows,
}) {
  const k = resolveScoringUniverseKey(briefKind);
  const filteredHeadlines = filterHeadlinesForBriefKind(headlines, briefKind);
  const cal = filterCalendarForBriefKind(calendarRows, briefKind);
  const benchDp = quoteCache?.get?.('US500')?.dp;
  const list = Array.isArray(symbols) ? symbols : [];
  return list.map((sym) => {
    const symU = String(sym).toUpperCase();
    const q = quoteCache?.get ? quoteCache.get(symU) : null;
    const sh = headlinesForSymbol(symU, filteredHeadlines);
    const sr = (scoreRows || []).find((r) => r.symbol === symU);
    const dp = q?.dp != null && Number.isFinite(q.dp) ? Math.round(q.dp * 100) / 100 : null;
    const intel = {
      instrument: symU,
      dailyChangePct: dp,
      last: q?.c != null && Number.isFinite(q.c) ? Math.round(q.c * 1e6) / 1e6 : null,
      volumeSpike: volumeSpikeLabel(q?.volume, q?.averageVolume),
      volatilityShift: classifyVolatilityShift(q?.dp),
      technicalState: inferTechnicalState(q?.dp),
      catalyst: sh[0] || null,
      catalystSecondary: sh[1] || null,
      macroLink: pickMacroLinkForSymbol(symU, market, k),
      relativeStrengthVsUS500:
        (k === 'equities' ||
          k === 'market_sentiment' ||
          k === 'indices' ||
          k === 'stocks' ||
          k === 'equities_basket') &&
        dp != null &&
        benchDp != null &&
        Number.isFinite(benchDp)
          ? Math.round((dp - benchDp) * 100) / 100
          : null,
      nextCatalyst: nextCalendarLineForSymbol(symU, cal, k),
      selectionScore: sr?.score != null ? sr.score : null,
      scoreBreakdown: sr?.breakdown || null,
      period: period === 'weekly' ? 'weekly' : 'daily',
    };
    intel.dataQuality =
      [intel.dailyChangePct != null, !!intel.catalyst, !!intel.macroLink, !!intel.nextCatalyst].filter(Boolean).length;
    return intel;
  });
}

function noteAnchoredToIntelligence(note, intel) {
  const t = String(note || '');
  if (t.length < 40) return false;
  if (intel.dailyChangePct != null) {
    const s1 = String(intel.dailyChangePct);
    const s2 = s1.replace('-', '−');
    if (t.includes(s1) || t.includes(s2)) return true;
    const rounded = intel.dailyChangePct.toFixed(2);
    if (t.includes(rounded)) return true;
  }
  if (intel.catalyst && intel.catalyst.length > 8) {
    const frag = intel.catalyst.slice(0, 14).toLowerCase();
    if (frag.length > 6 && t.toLowerCase().includes(frag)) return true;
  }
  if (intel.macroLink && intel.macroLink.length > 12) {
    const mf = intel.macroLink.slice(0, 18).toLowerCase();
    if (t.toLowerCase().includes(mf)) return true;
  }
  if (intel.nextCatalyst && intel.nextCatalyst.length > 10) {
    const nf = intel.nextCatalyst.slice(0, 16).toLowerCase();
    if (t.toLowerCase().includes(nf)) return true;
  }
  if (intel.relativeStrengthVsUS500 != null && t.includes(String(intel.relativeStrengthVsUS500))) return true;
  return false;
}

async function fetchWeeklyApproxPctChange(symbol) {
  try {
    const { toCanonical, usesForexSessionContext, getAssetClass } = require('../../ai/utils/symbol-registry');
    const { fetchTimeSeriesDto } = require('../../market-data/marketDataLayer');
    const canonical = toCanonical(String(symbol).trim());
    const sFeat = usesForexSessionContext(canonical)
      ? 'fx-brief-weekly'
      : getAssetClass(canonical) === 'crypto'
        ? 'crypto-brief-weekly'
        : 'brief-weekly';
    const series = await fetchTimeSeriesDto(canonical, '1day', 'out8', { outputsize: 8 }, sFeat);
    if (!series || !series.bars || series.bars.length < 5) return null;
    const bars = series.bars;
    const last = bars[bars.length - 1].c;
    const old = bars[bars.length - 5].c;
    if (!Number.isFinite(last) || !Number.isFinite(old) || old === 0) return null;
    return ((last - old) / Math.abs(old)) * 100;
  } catch (_) {
    return null;
  }
}

/**
 * Score instruments in-category; pick top 5. Uses quote cache + headlines + calendar + optional weekly window move.
 */
async function scoreAndSelectTopInstruments({
  briefKind,
  period,
  quoteCache,
  headlines,
  calendarRows,
  market,
  logPrefix = '[brief-gen]',
}) {
  const k = resolveScoringUniverseKey(briefKind);
  const universe = getUniverseSymbols(briefKind);
  const p = period === 'weekly' ? 'weekly' : 'daily';
  const filteredHeadlines = filterHeadlinesForBriefKind(headlines, briefKind);
  const cal = filterCalendarForBriefKind(calendarRows, briefKind);

  const scored = [];
  for (const symbol of universe) {
    const symU = String(symbol).toUpperCase();
    const quote = quoteCache?.get ? quoteCache.get(symU) : quoteCache?.[symU];
    const breakdown = {};
    let score = 0;

    if (quote && typeof quote.dp === 'number' && Number.isFinite(quote.dp)) {
      breakdown.dailyMove = Math.min(35, Math.abs(quote.dp) * (p === 'weekly' ? 1.4 : 2.2));
      score += breakdown.dailyMove;
    } else {
      breakdown.dailyMove = 0;
    }

    const nh = headlineHitsForSymbol(symU, filteredHeadlines);
    breakdown.news = Math.min(28, nh * 7);
    score += breakdown.news;

    const calBoost = cal.some((e) => {
      const ev = String(e.event || '').toLowerCase();
      const hint = INSTRUMENT_HEADLINE_HINTS[symU];
      if (hint && hint.test(ev)) return true;
      if (k === 'forex' && /USD/.test(symU) && /\b(usd|fed|dollar|nfp|cpi)\b/i.test(ev)) return true;
      if (
        (k === 'equities' ||
          k === 'global_macro' ||
          k === 'market_sentiment' ||
          k === 'indices' ||
          k === 'stocks' ||
          k === 'equities_basket') &&
        /US500|NAS100|US30|SPY|QQQ|IWM/.test(symU) &&
        /\b(s&p|nasdaq|dow|index|fed|cpi)\b/i.test(ev)
      )
        return true;
      return false;
    });
    breakdown.calendar = calBoost ? 12 : 0;
    score += breakdown.calendar;

    const cross = (market?.crossAssetSignals || []).map((s) => String(typeof s === 'string' ? s : s.label || s.title || '').toUpperCase());
    const driverBlob = (market?.keyDrivers || []).map(packDriverLine).join(' ').toUpperCase();
    if (cross.some((t) => t.includes(symU)) || driverBlob.includes(symU)) {
      breakdown.macroContext = 10;
      score += breakdown.macroContext;
    } else {
      breakdown.macroContext = 0;
    }

    scored.push({ symbol: symU, score: Math.round(score * 10) / 10, breakdown });
  }

  scored.sort((a, b) => b.score - a.score);

  let ranked = scored;
  if (p === 'weekly' && process.env.TWELVE_DATA_API_KEY) {
    const topN = scored.slice(0, 10);
    const rest = scored.slice(10);
    const enriched = [];
    for (const row of topN) {
      // eslint-disable-next-line no-await-in-loop
      const wk = await fetchWeeklyApproxPctChange(row.symbol);
      const b = { ...row.breakdown, weekApproxPct: wk };
      let s = row.score;
      if (wk != null && Number.isFinite(wk)) {
        const add = Math.min(22, Math.abs(wk) * 1.1);
        b.weeklyMoveScore = add;
        s += add;
      } else {
        b.weeklyMoveScore = 0;
      }
      enriched.push({ ...row, score: Math.round(s * 10) / 10, breakdown: b });
    }
    enriched.sort((a, b) => b.score - a.score);
    ranked = [...enriched, ...rest].sort((a, b) => b.score - a.score);
  }

  const minScoreFloor = 4;
  const qualified = ranked.filter((r) => r.score >= minScoreFloor);
  const pool = qualified.length >= 5 ? qualified : ranked;

  const selected = [];
  const seen = new Set();

  const qualifiesEvidence = (row) => {
    const symU = row.symbol;
    const quote = quoteCache?.get ? quoteCache.get(symU) : null;
    const ev = evidenceCountForSymbol(symU, quote, filteredHeadlines, cal, k, row.breakdown);
    const strongMove = row.score >= 12;
    return ev >= 2 || strongMove;
  };

  for (const row of pool) {
    if (selected.length >= 5) break;
    if (seen.has(row.symbol)) continue;
    if (!qualifiesEvidence(row)) continue;
    seen.add(row.symbol);
    selected.push(row);
  }
  if (selected.length < 5) {
    for (const row of pool) {
      if (selected.length >= 5) break;
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      selected.push(row);
    }
  }

  if (selected.length < 5) {
    for (const sym of fallbackTop5ForKind(k)) {
      if (selected.length >= 5) break;
      if (seen.has(sym)) continue;
      seen.add(sym);
      selected.push({
        symbol: sym,
        score: 0,
        breakdown: { fallback: true },
      });
    }
  }

  const dropped = ranked.filter((r) => !seen.has(r.symbol)).slice(0, 15);

  console.info(`${logPrefix} selection`, {
    category: k,
    period: p,
    universeSize: universe.length,
    candidateScores: ranked.slice(0, 12).map((r) => ({ symbol: r.symbol, score: r.score, breakdown: r.breakdown })),
    top5: selected.map((r) => r.symbol),
    droppedSample: dropped.slice(0, 8).map((d) => ({ symbol: d.symbol, score: d.score, reason: 'not_in_top5' })),
  });

  return {
    top5: selected.map((r) => r.symbol),
    scoreRows: selected,
    allRanked: ranked,
  };
}

async function buildQuoteCacheForSymbols(symbols, getQuoteFn) {
  const map = new Map();
  const unique = [...new Set((symbols || []).map((s) => String(s).toUpperCase()))];
  const chunkSize = 12;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    // eslint-disable-next-line no-await-in-loop
    const rows = await Promise.all(chunk.map((s) => getQuoteFn(s)));
    chunk.forEach((s, j) => {
      if (rows[j]) map.set(s, rows[j]);
    });
  }
  return map;
}

module.exports = {
  BRIEF_KIND_ORDER,
  INSTRUMENT_UNIVERSE_BY_KIND,
  BANNED_PHRASES,
  BANNED_PHRASES_RE,
  GENERIC_BOILERPLATE_FRAGMENTS,
  GENERIC_BOILERPLATE_RE,
  CATEGORY_INTELLIGENCE_DIRECTIVES,
  INSTRUMENT_HEADLINE_HINTS,
  KIND_HEADLINE_KEYWORDS,
  normalizeBriefKind,
  resolveScoringUniverseKey,
  getUniverseSymbols,
  fallbackTop5ForKind,
  isSymbolAllowedForKind,
  validateTopInstrumentsForKind,
  collectAllAutomationUniverseSymbols,
  filterHeadlinesForBriefKind,
  headlinesForSymbol,
  buildSymbolHeadlineMap,
  filterCalendarForBriefKind,
  detectCrossAssetContamination,
  buildMacroSummaryLines,
  buildDeskContextLines,
  categoryWritingMandate,
  scoreAndSelectTopInstruments,
  buildQuoteCacheForSymbols,
  fetchTwelveDataQuoteExtended,
  fetchAutomationQuoteWithFallback,
  buildInstrumentIntelligence,
  noteAnchoredToIntelligence,
  packDriverLine,
};
