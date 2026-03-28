/**
 * Single source of truth: allowed instruments per automated brief category.
 * Prevents cross-asset contamination (e.g. FX tickers inside a stocks brief).
 */

const { fetchWithTimeout } = require('./fetchWithTimeout');

const BRIEF_KIND_ORDER = ['general', 'stocks', 'indices', 'futures', 'forex', 'crypto', 'commodities', 'bonds', 'etfs'];

/** Strict universe per category — only these may appear as top-5 or in model-facing instrument lists. */
const INSTRUMENT_UNIVERSE_BY_KIND = {
  /** House / cross-asset — only category where mixed sleeves are allowed. */
  general: ['EURUSD', 'XAUUSD', 'US500', 'BTCUSD', 'US10Y', 'GBPUSD', 'USDJPY', 'NAS100'],
  stocks: [
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'NFLX', 'JPM', 'BAC', 'XOM',
    'UNH', 'LLY', 'AVGO', 'COST', 'DIS', 'INTC', 'CRM', 'ORCL', 'WMT', 'MA', 'V', 'PG', 'KO', 'PEP',
  ],
  indices: ['US500', 'NAS100', 'US30', 'US2000', 'GER40', 'UK100', 'JP225', 'HK50', 'STOXX50', 'CAC40'],
  futures: ['ES1!', 'NQ1!', 'RTY1!', 'CL1!', 'GC1!', 'SI1!', 'NG1!', 'ZN1!', 'ZB1!', '6E1!', '6B1!', '6J1!'],
  forex: [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP',
    'AUDJPY', 'EURAUD', 'EURCHF', 'GBPCHF', 'CADJPY', 'NZDJPY',
  ],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'AVAXUSD', 'DOTUSD', 'LINKUSD', 'LTCUSD'],
  commodities: ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'NATGAS', 'COPPER', 'XPTUSD', 'XPDUSD'],
  bonds: ['US02Y', 'US05Y', 'US10Y', 'US30Y', 'DE10Y', 'UK10Y', 'JP10Y', 'IT10Y'],
  etfs: ['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'HYG', 'LQD', 'XLE', 'XLK', 'SMH', 'XLV', 'XLF', 'XLI', 'EEM', 'VNQ', 'USO', 'UNG'],
};

/** Deterministic fallback top-5 when quotes/scoring unavailable (subset of universe, category-pure). */
const FALLBACK_TOP5_BY_KIND = {
  general: ['EURUSD', 'XAUUSD', 'US500', 'BTCUSD', 'US10Y'],
  stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
  indices: ['US500', 'NAS100', 'US30', 'GER40', 'UK100'],
  futures: ['ES1!', 'NQ1!', 'CL1!', 'GC1!', 'ZN1!'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD'],
  commodities: ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'NATGAS'],
  bonds: ['US02Y', 'US10Y', 'US30Y', 'DE10Y', 'UK10Y'],
  etfs: ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'],
};

const KIND_HEADLINE_KEYWORDS = {
  general: null,
  stocks: /\b(stock|equity|equities|earnings|eps|guidance|nasdaq|nyse|s&p|apple|microsoft|nvidia|tesla|amazon|meta|split|buyback|dividend|ipo|sec)\b/i,
  indices: /\b(index|indices|s&p\s*500|nasdaq|dow|dax|ftse|nikkei|hang\s*seng|vix|breadth|advance|decline|futures\s+on\s+index)\b/i,
  futures: /\b(futures|es\s|nq\s|cl\s|gc\s|zb\s|zn\s|roll|curve|contango|backwardation|open\s+interest|cme)\b/i,
  forex: /\b(forex|fx|eur|gbp|jpy|chf|aud|nzd|cad|dollar|yen|euro|cable|fed|ecb|boe|boj|cpi|nfp|rate\s+decision|currency)\b/i,
  crypto: /\b(bitcoin|btc|ethereum|eth|crypto|defi|stablecoin|etf\s+crypto|blockchain|solana|xrp|binance|perp|funding)\b/i,
  commodities: /\b(oil|wti|brent|gold|silver|copper|gas|lng|opec|inventory|xau|xag|commodit)\b/i,
  bonds: /\b(bond|yield|treasury|t\-bill|duration|curve|auction|10y|2y|30y|rates|gilts|bund)\b/i,
  etfs: /\b(etf|etn|flow|creation|redemption|spy|qqq|iwm|gld|tlt|ark|factor|passive)\b/i,
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
  stocks:
    'STOCKS DESK: Macro-first tape — breadth, sector rotation, earnings/macro beta. Mention single names only when headlines or relative strength in the pack justify it; never a forced per-ticker rundown.',
  forex:
    'FX DESK: Rates, USD, and CB path as the spine; session liquidity and event vol. Weave pairs only when they clarify the macro transmission — not a pair-by-pair template.',
  indices:
    'INDICES DESK: Benchmark regime, breadth, and vol from drivers; rates linkage. Continuation vs chop as environment — not a stock-picker list.',
  futures:
    'FUTURES DESK: Complex vs macro (oil, rates, index beta) in prose; roll/liquidity only when data supports it.',
  crypto:
    'CRYPTO DESK: Risk proxy, liquidity, majors vs alts from tape and headlines in the pack — no invented on-chain detail.',
  commodities:
    'COMMODITIES DESK: USD, growth, and supply/demand themes; oil vs metals only when the pack differentiates them.',
  bonds:
    'RATES DESK: Curve and policy path from calendar and drivers; yield language only when backed by pack data.',
  etfs:
    'ETF DESK: Factor/flow tone vs underlying macro; no mechanical vehicle-by-vehicle blocks.',
  general:
    'HOUSE BRIEF: Cross-asset leadership and what repriced; scheduled risk in narrative form — not parallel sleeves as copy-paste paragraphs.',
};

const CALENDAR_HIGH_IMPACT = /\b(high|red)\b/i;

function normalizeBriefKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  return BRIEF_KIND_ORDER.includes(k) ? k : 'general';
}

function getUniverseSymbols(kind) {
  const k = normalizeBriefKind(kind);
  return [...(INSTRUMENT_UNIVERSE_BY_KIND[k] || INSTRUMENT_UNIVERSE_BY_KIND.general)];
}

function fallbackTop5ForKind(kind) {
  const k = normalizeBriefKind(kind);
  return [...(FALLBACK_TOP5_BY_KIND[k] || FALLBACK_TOP5_BY_KIND.general)].slice(0, 5);
}

function isSymbolAllowedForKind(symbol, kind) {
  const sym = String(symbol || '').toUpperCase().trim();
  const k = normalizeBriefKind(kind);
  const set = new Set(getUniverseSymbols(k).map((s) => String(s).toUpperCase()));
  return set.has(sym);
}

function validateTopInstrumentsForKind(symbols, kind) {
  const k = normalizeBriefKind(kind);
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
  const k = normalizeBriefKind(briefKind);
  const re = KIND_HEADLINE_KEYWORDS[k];
  if (!re || k === 'general') return list.slice(0, 14);
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
  const k = normalizeBriefKind(briefKind);
  const hi = rows.filter((e) => CALENDAR_HIGH_IMPACT.test(String(e.impact || '')));
  const base = hi.length >= 4 ? hi : rows;

  const currencyOf = (e) => String(e.currency || e.country || '').toUpperCase();

  if (k === 'forex') {
    const fxCcy = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']);
    return base.filter((e) => fxCcy.has(currencyOf(e)) || /\b(rate|cpi|gdp|employment|pmi|retail|trade)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'stocks' || k === 'indices' || k === 'etfs') {
    return base
      .filter(
        (e) =>
          currencyOf(e) === 'USD' ||
          /\b(fed|cpi|pce|gdp|employment|nfp|ism|earnings|retail|pmi|consumer|industrial)\b/i.test(String(e.event || ''))
      )
      .slice(0, 14);
  }
  if (k === 'bonds') {
    return base.filter((e) => /\b(auction|yield|cpi|pce|gdp|employment|fed|ecb|boe|boj|rate\s*decision|pmi)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'commodities') {
    return base.filter((e) => /\b(oil|opec|inventor|cpi|pmi|china|usd|dollar|growth|gdp)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'crypto') {
    return base.filter((e) => /\b(fed|cpi|pce|regulat|sec|etf|inflation|liquidity|dollar|employment)\b/i.test(String(e.event || ''))).slice(0, 14);
  }
  if (k === 'futures') {
    return base.slice(0, 14);
  }
  return base.slice(0, 14);
}

function crossAssetSymbolsForContaminationCheck(kind) {
  const k = normalizeBriefKind(kind);
  const out = new Set();
  for (const cat of BRIEF_KIND_ORDER) {
    if (cat === k) continue;
    if (k === 'general') continue;
    getUniverseSymbols(cat).forEach((s) => out.add(String(s).toUpperCase()));
  }
  if (k !== 'general') {
    getUniverseSymbols('general').forEach((s) => out.add(String(s).toUpperCase()));
  }
  return out;
}

/** If non-allowed ticker tokens appear as whole words in prose, flag contamination. */
function detectCrossAssetContamination(text, briefKind) {
  const k = normalizeBriefKind(briefKind);
  if (k === 'general') return { contaminated: false, hits: [] };
  const forbidden = crossAssetSymbolsForContaminationCheck(k);
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
  if (k !== 'general') {
    lines.push(`BOUNDARY: ${k} only — no tickers outside instrumentIntelligence[].instrument.`);
  }
  return lines;
}

function categoryWritingMandate(briefKind, period) {
  const k = normalizeBriefKind(briefKind);
  const p = period === 'weekly' ? 'weekly' : 'daily';
  const depth = p === 'weekly' ? 'structural and strategic: week-to-date repricing, persistence of trends, sector/index leadership rotation, forward path for rates/liquidity.' : 'tactical: next session catalysts, tape/vol behaviour, immediate event risk, how to lean without over-committing.';
  const map = {
    stocks: `Equities desk note. ${depth} Emphasize earnings/guidance, revisions, sector RS, breadth vs index, flow into mega-cap vs rest, single-name catalyst windows.`,
    indices: `Index futures / cash benchmark desk note. ${depth} Emphasize breadth, VIX term structure if inferable from context, rate sensitivity, sector weight transmission, positioning tone vs macro prints.`,
    futures: `Listed derivatives desk note. ${depth} Emphasize contract liquidity, roll windows, curve/carry context, session gaps vs cash, macro release beta per product.`,
    forex: `G10 FX desk note. ${depth} Emphasize rate spreads, CB guidance, risk beta, session liquidity (Asia/London/NY), data surprises as vol engines.`,
    crypto: `Digital assets desk note. ${depth} Emphasize liquidity, funding/basis only if inferable from pack, ETF/regulatory headlines, majors vs alts leadership, macro risk correlation.`,
    commodities: `Commodities desk note. ${depth} Emphasize inventories, USD pass-through, geopolitical supply risk, China demand proxies, energy vs metals divergence.`,
    bonds: `Rates desk note. ${depth} Emphasize curve shape, real yield narrative, auction demand, CB path repricing, growth/inflation surprise transmission.`,
    etfs: `ETF sleeve note. ${depth} Emphasize flow/creation narrative, factor and sector ETFs, confirmation from underlying breadth, hedging with rates/vol products.`,
    general: `House cross-asset note. ${depth} Tie leadership, liquidity, and scheduled risk across sleeves without drifting into a single-asset monologue.`,
  };
  return map[k] || map.general;
}

/** Full Twelve Data quote for brief intelligence (volume etc.) — no fabrication. */
async function fetchTwelveDataQuoteExtended(symbol) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  const sym = String(symbol || '').trim();
  if (!sym) return null;
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 7000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.code || data.close == null) return null;
    const close = parseFloat(data.close);
    const prev = parseFloat(data.previous_close);
    if (Number.isNaN(close) || close <= 0) return null;
    const d = Number.isNaN(prev) ? 0 : close - prev;
    const dp = Number.isNaN(prev) || prev === 0 ? 0 : (d / prev) * 100;
    const volume = data.volume != null ? parseFloat(data.volume) : null;
    const averageVolume = data.average_volume != null ? parseFloat(data.average_volume) : null;
    return {
      c: close,
      pc: prev,
      d,
      dp,
      volume: Number.isFinite(volume) ? volume : null,
      averageVolume: Number.isFinite(averageVolume) ? averageVolume : null,
    };
  } catch (_) {
    return null;
  }
}

function calendarRelevantToSymbol(symU, cal, k) {
  return (cal || []).some((e) => {
    const ev = String(e.event || '').toLowerCase();
    const hint = INSTRUMENT_HEADLINE_HINTS[symU];
    if (hint && hint.test(ev)) return true;
    if (k === 'forex' && /USD/.test(symU) && /\b(usd|fed|dollar|nfp|cpi)\b/i.test(ev)) return true;
    if ((k === 'stocks' || k === 'indices') && /US500|NAS100|US30/.test(symU) && /\b(s&p|nasdaq|dow|index|fed|cpi)\b/i.test(ev)) {
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
  const k = normalizeBriefKind(briefKind);
  const drivers = (market?.keyDrivers || []).map(packDriverLine).join(' ').toLowerCase();
  const parts = [];
  if (/\b(yield|treasury|rate|bond)\b/i.test(drivers) && (k === 'bonds' || k === 'stocks' || k === 'indices')) {
    parts.push((market.keyDrivers || []).find((d) => /yield|treasury|bond|rate/i.test(packDriverLine(d))));
  }
  if (/\b(dollar|usd|eur|fx)\b/i.test(drivers) && (k === 'forex' || k === 'commodities' || k === 'crypto')) {
    parts.push((market.keyDrivers || []).find((d) => /dollar|usd|eur/i.test(packDriverLine(d))));
  }
  if (/\b(oil|crude)\b/i.test(drivers) && (k === 'commodities' || k === 'futures')) {
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
  const k = normalizeBriefKind(briefKind);
  const filteredHeadlines = filterHeadlinesForBriefKind(headlines, k);
  const cal = filterCalendarForBriefKind(calendarRows, k);
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
        (k === 'stocks' || k === 'etfs') && dp != null && benchDp != null && Number.isFinite(benchDp)
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
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  const sym = encodeURIComponent(String(symbol).trim());
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${sym}&interval=1day&outputsize=8&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 6500);
    if (!res.ok) return null;
    const data = await res.json();
    const vals = data && Array.isArray(data.values) ? data.values : [];
    if (vals.length < 5) return null;
    const last = parseFloat(vals[0]?.close);
    const old = parseFloat(vals[4]?.close);
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
  const k = normalizeBriefKind(briefKind);
  const universe = getUniverseSymbols(k);
  const p = period === 'weekly' ? 'weekly' : 'daily';
  const filteredHeadlines = filterHeadlinesForBriefKind(headlines, k);
  const cal = filterCalendarForBriefKind(calendarRows, k);

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
      if ((k === 'stocks' || k === 'indices') && /US500|NAS100|US30/.test(symU) && /\b(s&p|nasdaq|dow|index|fed|cpi)\b/i.test(ev)) return true;
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
  buildInstrumentIntelligence,
  noteAnchoredToIntelligence,
  packDriverLine,
};
