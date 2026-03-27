const { executeQuery, addColumnIfNotExists } = require('../../db');
const { runEngine, getTwelveDataQuote } = require('../marketIntelligenceEngine');
const { getTemplate, normalizePeriod, parseTemplateFromText } = require('./briefTemplateService');
const { getOpenAIModelForChat } = require('../../ai/openai-config');
const { fetchWithTimeout } = require('./fetchWithTimeout');
const { enrichTraderDeckPayload } = require('../openaiTraderInsights');

const SOURCE_MARKER_RE = /(https?:\/\/|www\.|source\s*:|sources\s*:|according to|reuters|bloomberg|fmp|finnhub|forex factory|trading economics)/i;
const BRIEF_KIND_ORDER = ['general', 'stocks', 'indices', 'futures', 'forex', 'crypto', 'commodities', 'bonds', 'etfs'];
const BRIEF_KIND_LABELS = {
  general: 'General Market Brief',
  stocks: 'Stocks Brief',
  indices: 'Indices Brief',
  futures: 'Futures Brief',
  forex: 'Forex Brief',
  crypto: 'Crypto Brief',
  commodities: 'Commodities Brief',
  bonds: 'Bonds Brief',
  etfs: 'ETFs Brief',
};
const BRIEF_KIND_TOP5 = {
  general: ['EURUSD', 'XAUUSD', 'US500', 'BTCUSD', 'US10Y'],
  stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
  indices: ['US500', 'NAS100', 'US30', 'GER40', 'UK100'],
  futures: ['ES1!', 'NQ1!', 'CL1!', 'GC1!', 'ZN1!'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'],
  commodities: ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'NATGAS'],
  bonds: ['US02Y', 'US05Y', 'US10Y', 'US30Y', 'DE10Y'],
  etfs: ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'],
};
const BOILERPLATE_PHRASES = [
  'Maintain a bias only when momentum aligns with session flow',
  'Bias follows macro direction and intraday confirmation',
  'Protect downside first',
  'Scale only on confirmation',
  'Avoid overtrading into major releases',
];
const CATEGORY_FRAMEWORKS = {
  daily: {
    general: ['Market Context', 'Instrument Outlook', 'Session Focus', 'Risk Radar', 'Execution Notes'],
    stocks: ['Equity Tape Structure', 'Top Stock Catalysts', 'Sector Rotation and Breadth', 'Execution Map', 'Stock Risk Controls'],
    indices: ['Index Regime Snapshot', 'Breadth and Dispersion', 'Macro Trigger Ladder', 'Intraday Playbook', 'Index Risk Controls'],
    futures: ['Curve and Carry Context', 'Order-Flow Windows', 'Contract-Specific Setups', 'Execution Checklist', 'Futures Risk Controls'],
    forex: ['Rate Differential Pulse', 'Session Flow Map', 'Top Pair Tactical Plans', 'Event-Driven Triggers', 'FX Risk Controls'],
    crypto: ['On-Chain and Flow Snapshot', 'Perp Basis and Funding', 'Top Coin Trade Scenarios', 'Volatility Regime Plan', 'Crypto Risk Controls'],
    commodities: ['Physical and Macro Drivers', 'Top Commodity Setups', 'Inventory and Flow Signals', 'Execution Triggers', 'Commodities Risk Controls'],
    bonds: ['Yield Curve Diagnostics', 'Duration and Convexity Bias', 'Top Bond Trade Maps', 'Auction/Data Sensitivity', 'Rates Risk Controls'],
    etfs: ['ETF Flow and Positioning', 'Top ETF Tactical Setups', 'Underlying Breadth Confirmation', 'Execution Plan', 'ETF Risk Controls'],
  },
  weekly: {
    general: ['Weekly Macro Theme', 'Cross-Asset Leadership', 'Event Map', 'Scenario Tree', 'Weekly Playbook'],
    stocks: ['Weekly Equity Regime', 'Earnings and Guidance Matrix', 'Sector Leadership Outlook', 'Weekly Stock Playbook', 'Equity Risk Calendar'],
    indices: ['Weekly Index Structure', 'Global Correlation Matrix', 'Policy and Data Path', 'Weekly Index Playbook', 'Index Portfolio Hedges'],
    futures: ['Weekly Futures Macro Drivers', 'Curve Structure Outlook', 'Contract Rotation Plan', 'Weekly Execution Framework', 'Futures Risk Grid'],
    forex: ['Weekly FX Macro Hierarchy', 'Central-Bank Path Matrix', 'Pair-Level Scenario Plans', 'Weekly FX Execution Framework', 'FX Risk Grid'],
    crypto: ['Weekly Crypto Liquidity Regime', 'Narrative and Rotation Scorecard', 'Coin-Level Scenario Tree', 'Weekly Crypto Playbook', 'Crypto Drawdown Controls'],
    commodities: ['Weekly Commodity Regime', 'Supply/Demand Inflection Map', 'Cross-Commodity Relative Value', 'Weekly Commodity Playbook', 'Commodities Risk Grid'],
    bonds: ['Weekly Rates and Curve Outlook', 'Policy Path Sensitivity', 'Tenor-Level Trade Matrix', 'Weekly Bond Playbook', 'Rates Hedging Map'],
    etfs: ['Weekly ETF Flow Regime', 'Cross-Asset ETF Rotation', 'Theme and Factor Matrix', 'Weekly ETF Playbook', 'ETF Risk and Hedge Grid'],
  },
};
/** Headlines scored toward each brief category so 9 briefs are not fed identical news context. */
/** Map instrument tickers to headline filters so each symbol gets distinct news context in the fact pack. */
const INSTRUMENT_HEADLINE_HINTS = {
  EURUSD: /\b(euro|eur\/usd|eurusd|ecb|lagarde|eurozone|bund)\b/i,
  GBPUSD: /\b(sterling|cable|gbp\/usd|gbpusd|boe|bailey|uk\s*gdp)\b/i,
  USDJPY: /\b(yen|usd\/jpy|usdjpy|boj|ueda|jgb)\b/i,
  AUDUSD: /\b(aussie|aud\/usd|audusd|rba)\b/i,
  USDCHF: /\b(franc|usd\/chf|usdchf|snb)\b/i,
  XAUUSD: /\b(gold|xau|bullion|precious\s*metal)\b/i,
  XAGUSD: /\b(silver|xag)\b/i,
  US500: /\b(s&p|spx|s\s*p\s*500|us\s*500|index\s*futures\s*es)\b/i,
  NAS100: /\b(nasdaq|ndx|qqq|mag\s*seven|tech\s*heavy)\b/i,
  US30: /\b(dow|djia|us\s*30)\b/i,
  GER40: /\b(dax|germany|ecb\s*impact)\b/i,
  UK100: /\b(ftse|uk\s*100)\b/i,
  BTCUSD: /\b(bitcoin|btc|etf\s*bitcoin)\b/i,
  ETHUSD: /\b(ethereum|eth\s)\b/i,
  SOLUSD: /\b(solana|sol\s)\b/i,
  XRPUSD: /\b(ripple|xrp)\b/i,
  BNBUSD: /\b(binance|bnb)\b/i,
  US10Y: /\b(10y|10\-year|treasury|yields?|bonds?|rates)\b/i,
  US02Y: /\b(2y|2\-year|bill|front\s*end)\b/i,
  US05Y: /\b(5y|5\-year)\b/i,
  US30Y: /\b(30y|30\-year|long\s*end)\b/i,
  DE10Y: /\b(bund|german\s*yield|euro\s*rates)\b/i,
  WTI: /\b(wti|crude|oil|opec)\b/i,
  BRENT: /\b(brent|north\s*sea)\b/i,
  NATGAS: /\b(natural\s*gas|henry\s*hub|lng)\b/i,
  'ES1!': /\b(es\s|e\-mini\s*s&p|spx\s*futures)\b/i,
  'NQ1!': /\b(nq\s|nasdaq\s*futures)\b/i,
  'CL1!': /\b(crude|wti|oil\s*futures)\b/i,
  'GC1!': /\b(gold\s*futures|comex\s*gold)\b/i,
  'ZN1!': /\b(10y\s*futures|treasury\s*futures|zn\s)\b/i,
  AAPL: /\b(apple|aapl|iphone|ios)\b/i,
  MSFT: /\b(microsoft|msft|azure|windows)\b/i,
  NVDA: /\b(nvidia|nvda|gpu|cuda|blackwell)\b/i,
  TSLA: /\b(tesla|tsla|musk|ev\s)\b/i,
  AMZN: /\b(amazon|amzn|aws)\b/i,
  SPY: /\b(spy|s&p\s*etf)\b/i,
  QQQ: /\b(qqq|nasdaq\s*etf)\b/i,
  IWM: /\b(russell|iwm|small\s*cap)\b/i,
  GLD: /\b(gld|gold\s*etf)\b/i,
  TLT: /\b(tlt|long\s*treasury\s*etf|duration)\b/i,
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

function filterHeadlinesForBriefKind(headlines, briefKind) {
  const list = Array.isArray(headlines) ? headlines.map((h) => String(h || '').trim()).filter(Boolean) : [];
  if (list.length === 0) return [];
  const k = normalizeBriefKind(briefKind);
  const re = KIND_HEADLINE_KEYWORDS[k];
  if (!re || k === 'general') return list.slice(0, 12);
  const matched = list.filter((h) => re.test(h));
  const rest = list.filter((h) => !re.test(h));
  const merged = [...matched, ...rest];
  return merged.slice(0, 12);
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

async function fetchLiveQuotesForSymbols(symbols) {
  const syms = Array.isArray(symbols) ? symbols.slice(0, 5) : [];
  if (syms.length === 0) return [];
  const rows = await Promise.all(
    syms.map(async (symbol) => {
      try {
        const q = await getTwelveDataQuote(symbol);
        if (!q || q.c == null) return null;
        return {
          symbol: String(symbol).toUpperCase(),
          last: q.c,
          changePct: typeof q.dp === 'number' ? Math.round(q.dp * 100) / 100 : null,
        };
      } catch (_) {
        return null;
      }
    })
  );
  return rows.filter(Boolean);
}

const CATEGORY_LOGIC_RULES = {
  stocks: 'Focus on earnings revisions, sector breadth, options positioning and stock-specific catalyst windows.',
  indices: 'Focus on index breadth, correlation shifts, dispersion, volatility term structure and macro beta.',
  futures: 'Focus on contract structure, carry/roll dynamics, session liquidity pockets and macro release reaction plans.',
  forex: 'Focus on relative-rate spreads, central-bank divergence, session behavior and event-volatility execution.',
  crypto: 'Focus on funding/basis, on-chain flow, exchange liquidity, correlation to risk assets and event shock handling.',
  commodities: 'Focus on supply-demand balances, inventory dynamics, seasonality and geopolitical transmission into price.',
  bonds: 'Focus on curve shape, duration sensitivity, policy path repricing and auction/data calendar transmission.',
  etfs: 'Focus on ETF flow momentum, creation/redemption pressure, factor rotation and underlying liquidity confirmation.',
  general: 'Blend cross-asset macro leadership, risk sentiment, liquidity regime and event sequencing.',
};

function toYmdInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getWeekEndingSunday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return dateStr;
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDay();
  const add = day === 0 ? 0 : (7 - day);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function normalizeOutlookDate(period, dateStr) {
  return period === 'weekly' ? getWeekEndingSunday(dateStr) : dateStr;
}

function weekdayName(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(date);
}

function dateLong(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

function weekRange(date, timeZone) {
  const nowYmd = toYmdInTz(date, timeZone);
  const base = new Date(`${nowYmd}T12:00:00Z`);
  const day = base.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + mondayOffset);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone });
  return `${fmt.format(monday)} to ${fmt.format(friday)}`;
}

function stripSources(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !SOURCE_MARKER_RE.test(line));
  return lines.join('\n');
}

function sanitizeSentence(text) {
  return String(text || '')
    .replace(/\b(according to|reported by|via)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBriefKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  return BRIEF_KIND_ORDER.includes(k) ? k : 'general';
}

function top5ForBriefKind(kind) {
  const normalized = normalizeBriefKind(kind);
  return (BRIEF_KIND_TOP5[normalized] || BRIEF_KIND_TOP5.general).slice(0, 5);
}

function orderedBriefKinds() {
  return [...BRIEF_KIND_ORDER];
}

function frameworkHeadings(period, briefKind, fallbackSections = []) {
  const p = period === 'weekly' ? 'weekly' : 'daily';
  const k = normalizeBriefKind(briefKind);
  const list = CATEGORY_FRAMEWORKS?.[p]?.[k] || [];
  if (Array.isArray(list) && list.length >= 5) {
    return list.map((heading, idx) => ({ key: `framework_${idx + 1}`, heading }));
  }
  return Array.isArray(fallbackSections) ? fallbackSections : [];
}

function tokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && w.length > 2)
  );
}

function similarityScore(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.max(A.size, B.size);
}

function containsBoilerplate(text) {
  const s = String(text || '');
  return BOILERPLATE_PHRASES.some((p) => s.includes(p));
}

function diversifyBody(body, { briefKind, period, topInstruments = [] }) {
  const logic = CATEGORY_LOGIC_RULES[normalizeBriefKind(briefKind)] || CATEGORY_LOGIC_RULES.general;
  const topLine = (topInstruments || []).slice(0, 5).join(', ');
  const extra = [
    '',
    'Uniqueness Guardrails',
    `- Category logic: ${logic}`,
    `- Distinct top set: ${topLine}`,
    `- ${period === 'weekly' ? 'Weekly horizon: scenario sequencing and carry path.' : 'Daily horizon: tactical trigger timing and session execution.'}`,
  ].join('\n');
  return String(body || '').replace(/\n{3,}/g, '\n\n').trim() + '\n' + extra + '\n';
}

function assertNoSources(text) {
  if (SOURCE_MARKER_RE.test(String(text || ''))) {
    throw new Error('Brief contains source markers and was blocked');
  }
}

function sanitizeOutlookPayload(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return sanitizeSentence(stripSources(value));
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => sanitizeOutlookPayload(v))
      .filter((v) => v !== '' && v != null);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeOutlookPayload(v);
    }
    return out;
  }
  return value;
}

function validateOutlookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Outlook payload is invalid');
  }
  if (!payload.marketRegime || !payload.marketPulse) {
    throw new Error('Outlook payload missing regime/pulse');
  }
  const requiredArrays = ['keyDrivers', 'crossAssetSignals', 'marketChangesToday', 'traderFocus', 'riskRadar'];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key]) || payload[key].length === 0) {
      throw new Error(`Outlook payload missing ${key}`);
    }
  }
}

function normaliseArray(v) {
  return Array.isArray(v) ? v.filter(Boolean).map((x) => String(x).trim()).filter(Boolean) : [];
}

function normalizeCalendarValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function getAutomationModel() {
  return String(
    process.env.OPENAI_AUTOMATION_MODEL
    || process.env.OPENAI_CHAT_MODEL
    || process.env.OPENAI_MODEL
    || getOpenAIModelForChat()
  ).trim();
}

function assertAutomationModelConfigured() {
  if (!String(process.env.OPENAI_AUTOMATION_MODEL || '').trim()) {
    throw new Error('OPENAI_AUTOMATION_MODEL is required for automated Trader Desk runs');
  }
}

async function fetchNewsSample() {
  const url = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,GC=F,EURUSD=X&region=US&lang=en-US';
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return [];
    const text = await res.text();
    const items = [];
    const re = /<title><!\[CDATA\[(.*?)\]\]><\/title>/g;
    let m;
    let idx = 0;
    while ((m = re.exec(text)) !== null) {
      if (idx++ === 0) continue;
      const headline = (m[1] || '').trim();
      if (headline) items.push(headline);
      if (items.length >= 8) break;
    }
    return items;
  } catch (_) {
    return [];
  }
}

async function fetchUnifiedNewsSample() {
  try {
    const newsHandler = require('../news');
    let payload = null;
    const req = {
      method: 'GET',
      headers: {},
      query: { refresh: '1' },
      url: 'http://localhost/api/trader-deck/news?refresh=1',
    };
    const res = {
      setHeader: () => {},
      status: () => res,
      json: (p) => { payload = p; return p; },
      end: () => {},
    };
    await newsHandler(req, res);
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    const headlines = rows
      .map((r) => String(r?.headline || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (headlines.length > 0) return headlines;
  } catch (_) {
    // fallback below
  }
  return fetchNewsSample();
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

function packSignalLine(s) {
  if (s == null) return '';
  if (typeof s === 'string') return s.trim();
  if (typeof s === 'object') {
    const parts = [s.label, s.reading, s.detail, s.title].filter(Boolean).map(String);
    return parts.join(' — ').trim();
  }
  return String(s);
}

function buildFactPack({ period, template, market, econ, news, briefKind = 'general', topInstruments = [], liveQuotes = [] }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const selectedTop = Array.isArray(topInstruments) && topInstruments.length > 0
    ? topInstruments.slice(0, 5)
    : top5ForBriefKind(normalizedKind);
  const filteredNews = filterHeadlinesForBriefKind(news, normalizedKind);
  return {
    period,
    briefKind: normalizedKind,
    briefKindLabel: BRIEF_KIND_LABELS[normalizedKind] || BRIEF_KIND_LABELS.general,
    topInstruments: selectedTop,
    instruments: selectedTop.length > 0 ? selectedTop : (template.instruments || []),
    sections: frameworkHeadings(period, normalizedKind, template.sections || []),
    marketRegime: market.marketRegime || null,
    marketPulse: market.marketPulse || null,
    keyDrivers: (market.keyDrivers || []).slice(0, 8),
    crossAssetSignals: (market.crossAssetSignals || []).slice(0, 8),
    traderFocus: (market.traderFocus || []).slice(0, 8),
    riskRadar: (market.riskRadar || []).slice(0, 8).map((r) => (typeof r === 'string' ? r : r.title || r.event || '')),
    calendar: (econ || []).slice(0, period === 'weekly' ? 16 : 8).map((e) => ({
      currency: e.currency || '',
      event: e.event || '',
      impact: e.impact || '',
      time: e.time || '',
      actual: normalizeCalendarValue(e.actual),
      forecast: normalizeCalendarValue(e.forecast),
      previous: normalizeCalendarValue(e.previous),
    })),
    headlines: filteredNews.slice(0, 10),
    symbolHeadlines: buildSymbolHeadlineMap(selectedTop, filteredNews),
    liveQuotes: Array.isArray(liveQuotes) ? liveQuotes.slice(0, 5) : [],
    updatedAt: new Date().toISOString(),
  };
}

/** Lazy model templates users see when the model copies one scaffold across all names. */
const GENERIC_INSTRUMENT_SCAFFOLD_RE = /scenario\s*\d+\s+defines|catalyst trigger|directional invalidation|position-?sizing discipline|daily scenario\s*\d+\s+should define|base and surprise pathways|volatility-?adjusted risk/i;

function maxPairwiseInstrumentSimilarity(notes) {
  const list = Array.isArray(notes) ? notes.map((n) => String(n?.note || '').trim()).filter(Boolean) : [];
  let maxSim = 0;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      maxSim = Math.max(maxSim, similarityScore(list[i], list[j]));
    }
  }
  return maxSim;
}

function instrumentLayerNeedsRefresh(instrumentNotes, outlookBody) {
  const notes = Array.isArray(instrumentNotes) ? instrumentNotes : [];
  if (notes.length < 2) return false;
  if (maxPairwiseInstrumentSimilarity(notes) >= 0.5) return true;
  const scaffoldHits = notes.filter((n) => GENERIC_INSTRUMENT_SCAFFOLD_RE.test(String(n?.note || ''))).length;
  if (scaffoldHits >= 2) return true;
  const ob = String(outlookBody || '');
  if (ob && GENERIC_INSTRUMENT_SCAFFOLD_RE.test(ob)) {
    const chunks = ob.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
    if (chunks.length >= 2) {
      let maxC = 0;
      for (let i = 0; i < chunks.length; i += 1) {
        for (let j = i + 1; j < chunks.length; j += 1) {
          maxC = Math.max(maxC, similarityScore(chunks[i], chunks[j]));
        }
      }
      if (maxC >= 0.45) return true;
    }
  }
  return false;
}

function findInstrumentOutlookSectionIndex(sections) {
  const list = Array.isArray(sections) ? sections : [];
  const preferIdx = list.findIndex((s) => {
    const h = String(s?.heading || '').toLowerCase();
    return (h.includes('instrument') && h.includes('outlook'))
      || /catalyst|setups|scenarios|tactical plans|trade maps|commodity setups|pair tactical|coin|contract-specific|etf tactical/i.test(h);
  });
  if (preferIdx >= 0) return preferIdx;
  return list.length > 1 ? 1 : 0;
}

function applyInstrumentLayerPatch(generated, { instrumentOutlookBody, instrumentNotes }) {
  if (!generated || typeof generated !== 'object') return generated;
  let next = { ...generated };
  if (Array.isArray(instrumentNotes) && instrumentNotes.length > 0) {
    next = { ...next, instrumentNotes };
  }
  if (instrumentOutlookBody && String(instrumentOutlookBody).trim() && Array.isArray(next.sections)) {
    const idx = findInstrumentOutlookSectionIndex(next.sections);
    const sections = next.sections.map((s, i) => (i === idx ? { ...s, body: String(instrumentOutlookBody).trim() } : s));
    next = { ...next, sections };
  }
  return next;
}

function addDaysYmd(ymdStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymdStr || ''))) return ymdStr;
  const d = new Date(`${ymdStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymdStr;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function tomorrowYmdInTz(now, timeZone) {
  return addDaysYmd(toYmdInTz(now, timeZone), 1);
}

async function generateWithOpenAi(factPack, template, options = {}) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  const {
    existingExcerpts = [],
    uniquenessRetry = false,
  } = options;
  const catLabel = factPack.briefKindLabel || BRIEF_KIND_LABELS[factPack.briefKind] || 'Market';
  const excerptBlock = Array.isArray(existingExcerpts) && existingExcerpts.length > 0
    ? existingExcerpts
        .map((ex, i) => `--- Other category brief #${i + 1} (do not copy phrasing; write a distinct narrative) ---\n${String(ex || '').slice(0, 520)}`)
        .join('\n\n')
    : '(no prior briefs in this run yet)';
  const prompt = {
    template,
    factPack,
    priorBriefExcerptsForDedup: excerptBlock,
    requirements: {
      strictFactsOnly: true,
      noSourcesEver: true,
      noMarkdownBullets: false,
      tone: template?.style?.tone || 'institutional concise',
      minimumDepth: 'high-detail longform',
      mustCoverTopInstruments: factPack.topInstruments || [],
      uniquenessMode: 'absolute-distinct-per-category',
      categoryLogicRule: CATEGORY_LOGIC_RULES[factPack.briefKind] || CATEGORY_LOGIC_RULES.general,
      mandate: `You are writing ONLY the "${catLabel}" brief. Lead with ${factPack.briefKind === 'general' ? 'cross-asset' : factPack.briefKind + ' asset-class'} mechanics. Other eight briefs on the same day cover other categories — duplicate or paraphrased bodies are forbidden.`,
      useLiveQuotes: 'Weave liveQuotes (last, changePct) into instrumentNotes where present; if empty, rely on factPack only.',
      perInstrumentHeadlines: 'factPack.symbolHeadlines maps each ticker to headline lines — use those lines to differentiate narratives; do not reuse the same sentence skeleton across instruments.',
      antiScaffold: 'FORBIDDEN for any two instruments: the same opening clause, parallel "Scenario N defines…" / "Daily scenario N should define…" templates, or copy-pasted catalyst/invalidation wording. Each name needs its own drivers, levels logic, and session hook.',
      uniquenessRetryNote: uniquenessRetry
        ? 'REWRITE: prior draft was too similar to another category. Change structure, opening hooks, and examples; keep same JSON schema.'
        : null,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 26000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: uniquenessRetry ? 0.42 : 0.22,
        max_tokens: 3800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a senior multi-asset strategist. Return valid JSON only: {"title":"string","sections":[{"heading":"string","body":"string"}],"instrumentNotes":[{"instrument":"string","note":"string"}],"riskRadar":["string"],"playbook":["string"]}. '
              + 'Each section body must be substantive and specific to the briefKind in factPack — not a generic macro essay. '
              + 'Section headings in the JSON must match factPack.sections[].heading in order. '
              + 'You must include every instrument in factPack.topInstruments inside instrumentNotes with differentiated notes. '
              + 'The Instrument Outlook (or category-equivalent) section body must treat each ticker as its own mini-brief: distinct paragraph per instrument with different structure and vocabulary — never numbered scenario boilerplate repeated across names. '
              + 'Combine factPack (regime, pulse, drivers, cross-asset, calendar, headlines, symbolHeadlines, liveQuotes) with professional judgment; do not invent prices or events not implied by the pack. '
              + 'Never include source names, URLs, or citation phrasing. '
              + 'If priorBriefExcerptsForDedup contains text, your output must be materially different in wording and emphasis from those excerpts.',
          },
          { role: 'user', content: JSON.stringify(prompt) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    return JSON.parse(cleaned);
  } catch (_) {
    clearTimeout(timeout);
    return null;
  }
}

function getInstrumentOutlookBodyFromGenerated(generated) {
  if (!generated || !Array.isArray(generated.sections)) return '';
  const idx = findInstrumentOutlookSectionIndex(generated.sections);
  const s = generated.sections[idx];
  return String(s?.body || '').trim();
}

async function generateInstrumentLayerOpenAI(factPack, options = {}) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  const { mode = 'refine', priorNotes = [], priorOutlookBody = '' } = options;
  const top = (factPack.topInstruments || []).map((s) => String(s).toUpperCase());
  if (top.length === 0) return null;

  const slimPack = {
    briefKind: factPack.briefKind,
    briefKindLabel: factPack.briefKindLabel,
    period: factPack.period,
    topInstruments: top,
    marketRegime: factPack.marketRegime,
    marketPulse: factPack.marketPulse,
    keyDrivers: (factPack.keyDrivers || []).slice(0, 6),
    crossAssetSignals: (factPack.crossAssetSignals || []).slice(0, 4),
    calendar: (factPack.calendar || []).slice(0, 8),
    headlines: (factPack.headlines || []).slice(0, 10),
    symbolHeadlines: factPack.symbolHeadlines || {},
    liveQuotes: (factPack.liveQuotes || []).slice(0, 5),
    instrumentSectionHeading: (factPack.sections || [])[findInstrumentOutlookSectionIndex(factPack.sections || [])]?.heading || 'Instrument Outlook',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 32000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: mode === 'prefetch' ? 0.35 : 0.45,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return JSON only: {"instrumentOutlookBody":"string","instrumentNotes":[{"instrument":"string","note":"string"}]}. '
              + 'instrumentOutlookBody must be one paragraph block per instrument in topInstruments (same order), separated by a blank line between instruments. '
              + 'Start each paragraph with the ticker in bold is NOT allowed — plain text only. Start each paragraph with the ticker as plain uppercase (e.g. EURUSD: ...). '
              + 'Each paragraph and each instrumentNotes[].note must be fully unique: different structure, verbs, and tactical angle. '
              + 'Use symbolHeadlines for that ticker when provided; integrate calendar and liveQuotes where relevant. '
              + 'Do not use templates like "Scenario N defines" or "Daily scenario N should define". '
              + 'No source names, URLs, or citations. Do not invent specific numbers not in the pack.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: mode === 'prefetch' ? 'overnight_prefetch' : 'dedupe_refine',
              slimPack,
              rejectSimilarTo: mode === 'refine' ? { priorNotes, priorOutlookBody: String(priorOutlookBody || '').slice(0, 1200) } : null,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const rawNotes = Array.isArray(parsed.instrumentNotes) ? parsed.instrumentNotes : [];
    const bySym = new Map(rawNotes.map((r) => [String(r?.instrument || '').toUpperCase(), String(r?.note || '').trim()]));
    const instrumentNotes = top.map((sym) => ({
      instrument: sym,
      note: bySym.get(sym) || `${sym}: Session-specific read using ${slimPack.briefKindLabel} drivers and calendar — differentiate execution from other names in the set.`,
    }));
    const instrumentOutlookBody = String(parsed.instrumentOutlookBody || '').trim();
    return { instrumentNotes, instrumentOutlookBody };
  } catch (_) {
    clearTimeout(timeout);
    return null;
  }
}

async function loadInstrumentResearch(briefDate, period, briefKind) {
  try {
    const [rows] = await executeQuery(
      'SELECT payload FROM trader_deck_brief_instrument_research WHERE brief_date = ? AND period = ? AND brief_kind = ? LIMIT 1',
      [briefDate, period, normalizeBriefKind(briefKind)]
    );
    const raw = rows?.[0]?.payload;
    if (raw == null) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return typeof raw === 'object' ? raw : null;
  } catch (_) {
    return null;
  }
}

async function saveInstrumentResearch(briefDate, period, briefKind, payload) {
  const kind = normalizeBriefKind(briefKind);
  const body = JSON.stringify(payload || {});
  await executeQuery(
    `INSERT INTO trader_deck_brief_instrument_research (brief_date, period, brief_kind, payload)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
    [briefDate, period, kind, body]
  );
}

/** Force section headings to match CATEGORY_FRAMEWORKS so each briefKind renders distinct structure. */
function alignGeneratedSectionsToFramework(generated, factPack) {
  if (!generated || !Array.isArray(generated.sections)) return generated;
  const fw = factPack.sections || [];
  if (!fw.length) return generated;
  const gens = generated.sections;
  const label = factPack.briefKindLabel || 'This category';
  const next = fw.map((f, idx) => {
    const body = String(gens[idx]?.body || '').trim();
    return {
      heading: f.heading,
      body: body || `${label} — ${f.heading}: use regime, calendar, headlines, and liveQuotes from the fact pack for this asset class only; avoid generic cross-category copy.`,
    };
  });
  return { ...generated, sections: next };
}

function fallbackGenerated(factPack, template, now, timeZone) {
  const kind = factPack.briefKind || 'general';
  const label = factPack.briefKindLabel || BRIEF_KIND_LABELS[kind] || 'Market';
  const top = factPack.topInstruments || [];
  const mk = factPack.marketRegime && typeof factPack.marketRegime === 'object' ? factPack.marketRegime : {};
  const pulseObj = factPack.marketPulse && typeof factPack.marketPulse === 'object' ? factPack.marketPulse : {};
  const regimeLabel = typeof factPack.marketRegime === 'string' ? factPack.marketRegime : (mk.currentRegime || 'mixed');
  const pulseLabel = pulseObj.label || (typeof factPack.marketPulse === 'string' ? factPack.marketPulse : 'NEUTRAL');
  const pulseScore = pulseObj.score != null ? pulseObj.score : 50;
  const drivers = (factPack.keyDrivers || []).slice(0, 6).map(packDriverLine).filter(Boolean);
  const cross = (factPack.crossAssetSignals || []).slice(0, 4).map(packSignalLine).filter(Boolean);
  const focus = normaliseArray((factPack.traderFocus || []).map((x) => (typeof x === 'string' ? x : x.title || x.label || ''))).slice(0, 5);
  const risk = normaliseArray(factPack.riskRadar).slice(0, 6);
  const cal = (factPack.calendar || []).slice(0, 6);
  const headlines = (factPack.headlines || []).slice(0, 4);
  const quotes = (factPack.liveQuotes || []).slice(0, 5);
  const period = factPack.period === 'weekly' ? 'weekly' : 'daily';
  const logicRule = CATEGORY_LOGIC_RULES[factPack.briefKind] || CATEGORY_LOGIC_RULES.general;

  const frameworkSections = Array.isArray(factPack.sections) && factPack.sections.length > 0
    ? factPack.sections
    : frameworkHeadings(factPack.period, kind, template.sections || []);

  const quoteLine = () => {
    if (!quotes.length) return '';
    return quotes.map((q) => `${q.symbol}: ${q.last != null ? q.last : '—'}${q.changePct != null ? ` (${Number(q.changePct) >= 0 ? '+' : ''}${q.changePct}%)` : ''}`).join(' · ');
  };

  const sectionBody = (heading) => {
    const h = String(heading || '').toLowerCase();
    const ql = quoteLine();
    if (h.includes('executive') || h.includes('market context') || h.includes('macro theme') || h.includes('regime snapshot')) {
      return `${label}: regime ${regimeLabel}, pulse ${pulseLabel} (${pulseScore}/100). Primary driver lens: ${mk.primaryDriver || 'macro data'}. ${drivers.length ? `Drivers: ${drivers.join(' · ')}.` : ''} ${headlines.length ? `${label} headlines: ${headlines.join(' · ')}.` : ''} ${ql ? `Live quotes: ${ql}.` : ''} ${logicRule}`;
    }
    if (h.includes('macro') || h.includes('cross-asset') || h.includes('leadership') || h.includes('hierarchy') || h.includes('theme')) {
      return `${label} macro read: ${drivers.length ? drivers.join(' · ') : 'Track growth, inflation, and policy path for this sleeve.'} Cross-asset: ${cross.length ? cross.join(' · ') : 'Use rates, USD, and volatility as context.'} Calendar: ${cal.map((c) => `${c.event} (${c.currency || '—'})`).join(' · ') || 'Lighter data window — trade structure and flow.'}`;
    }
    if (h.includes('flow') || h.includes('positioning') || h.includes('etf flow') || h.includes('on-chain') || h.includes('perp') || h.includes('breadth') || h.includes('dispersion') || h.includes('curve and carry') || h.includes('order-flow')) {
      return `${label} flow/positioning: ${focus.length ? focus.join(' · ') : 'Two-way liquidity; fade stretched moves into events.'} Anchor to ${top.slice(0, 3).join(', ') || 'key benchmarks'}${ql ? `; spot: ${ql}` : ''}.`;
    }
    if (h.includes('technical') || h.includes('levels') || h.includes('setup') || h.includes('scenario') || h.includes('pair') || h.includes('coin') || h.includes('commodity') || h.includes('stock catalyst') || h.includes('tactical') || h.includes('etf tactical')) {
      return `${label} setups: prioritize ${top.slice(0, 3).join(', ') || 'lead symbols'} with session anchors (VWAP/POC) and vol-adjusted stops${ql ? `; ${ql}` : ''}. ${period === 'weekly' ? 'Swing: map base vs surprise paths into next week.' : 'Intraday: trigger-only adds after confirmation.'}`;
    }
    if (h.includes('risk')) {
      return `${label} risk radar: ${risk.length ? risk.join(' · ') : 'Event, gap, and liquidity risk'} — size down into prints; respect opens and gaps.`;
    }
    if (h.includes('playbook') || h.includes('execution') || h.includes('controls') || h.includes('calendar') || h.includes('event map') || h.includes('matrix') || h.includes('checklist') || h.includes('framework') || h.includes('grid')) {
      const tail = kind === 'crypto' ? 'Watch funding, basis, and BTC/ETH beta.' : kind === 'forex' ? 'Watch rate spreads and USD path.' : kind === 'commodities' ? 'Watch USD and inventory surprises.' : kind === 'bonds' ? 'Watch curve pivots and auction tails.' : kind === 'etfs' ? 'Confirm with underlying breadth and flows.' : kind === 'futures' ? 'Mind roll windows and curve shape.' : 'Confirm with index leadership and breadth.';
      return `${label} ${period === 'weekly' ? 'weekly' : 'session'} playbook: tier risk; ${tail} ${ql ? `Live: ${ql}.` : ''}`;
    }
    if (h.includes('outlook') || h.includes('instrument')) {
      const sh = factPack.symbolHeadlines || {};
      return top
        .map((sym) => {
          const symU = String(sym).toUpperCase();
          const lines = (sh[symU] || []).slice(0, 2).filter(Boolean);
          const hook = lines.length ? lines.join(' · ') : `${pulseLabel} tape and ${regimeLabel} regime context`;
          return `${symU}: ${hook} — session plan: lean on drivers/calendar for this name only; separate invalidation from other symbols in the set.${ql ? ` Quote context: ${ql}.` : ''}`;
        })
        .join('\n\n');
    }
    return `${label} — ${heading}: ${drivers.slice(0, 2).join(' · ') || `${pulseLabel} conditions`}; stay disciplined on ${top[0] || 'core names'}.${ql ? ` ${ql}` : ''}`;
  };

  const renderedSections = frameworkSections.map((s) => ({
    heading: s.heading,
    body: sectionBody(s.heading),
  }));

  const shMap = factPack.symbolHeadlines || {};
  const instrumentNotes = top.map((sym, idx) => {
    const symU = String(sym).toUpperCase();
    const q = quotes.find((x) => String(x.symbol || '').toUpperCase() === symU);
    const qbit = q && (q.last != null || q.changePct != null)
      ? ` Last ${q.last != null ? q.last : '—'}${q.changePct != null ? ` (${Number(q.changePct) >= 0 ? '+' : ''}${q.changePct}%)` : ''}.`
      : '';
    const kindHint = kind === 'forex' ? 'Rate spreads and event vol.' : kind === 'crypto' ? 'Funding and liquidity.' : kind === 'commodities' ? 'USD and inventories.' : kind === 'bonds' ? 'Curve and auctions.' : kind === 'etfs' ? 'Flows vs NAV.' : 'Cross-asset confirmation.';
    const symNews = (shMap[symU] || []).slice(0, 2).join(' · ');
    const angle = idx % 3 === 0 ? 'Priority session triggers' : idx % 3 === 1 ? 'Volatility and gap risk' : 'Trend vs mean-reversion bias';
    return {
      instrument: sym,
      note: `${symU} (${label}): ${angle} — ${symNews ? `Watch: ${symNews}. ` : ''}${pulseLabel} backdrop; size vs liquidity into data.${qbit} ${kindHint}`,
    };
  });

  const baseTitle = template.titlePattern
    .replace('{weekday}', weekdayName(now, timeZone))
    .replace('{dateLong}', dateLong(now, timeZone))
    .replace('{weekRange}', weekRange(now, timeZone));
  return {
    title: baseTitle,
    sections: renderedSections,
    instrumentNotes: instrumentNotes.length > 0 ? instrumentNotes : (template.instruments || []).slice(0, 5).map((instrument, idx) => ({
      instrument,
      note: `${instrument}: ${label} coverage ${idx + 1} — define catalyst, invalidation, and size vs vol.`,
    })),
    riskRadar: risk,
    playbook: [
      `${label} bias: ${regimeLabel} regime, ${pulseLabel} pulse — express only within this category.`,
      'Cut size into high-impact prints; control gap risk at opens.',
      'Do not recycle wording from other category briefs in the same run.',
    ],
  };
}

function renderBriefText({ title, period, date, generated, template, briefKind = 'general', topInstruments = [] }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const lines = [];
  lines.push(title);
  lines.push('');
  lines.push(`Period: ${period}`);
  lines.push(`Date: ${date}`);
  lines.push(`Category: ${BRIEF_KIND_LABELS[normalizedKind] || BRIEF_KIND_LABELS.general}`);
  lines.push('');

  const sections = Array.isArray(generated.sections) ? generated.sections : [];
  for (const sec of sections) {
    lines.push(sec.heading || 'Section');
    lines.push(stripSources(sec.body || ''));
    lines.push('');
  }

  const instrumentNotes = Array.isArray(generated.instrumentNotes) ? generated.instrumentNotes : [];
  if (instrumentNotes.length > 0) {
    lines.push('Top 5 Instruments');
    for (const row of instrumentNotes) {
      if (!row) continue;
      const instrument = String(row.instrument || '').trim();
      if (!instrument) continue;
      lines.push(`- ${instrument}: ${stripSources(row.note || '')}`);
    }
    lines.push('');
  }
  if (Array.isArray(topInstruments) && topInstruments.length > 0) {
    const listed = new Set(instrumentNotes.map((r) => String(r?.instrument || '').trim().toUpperCase()).filter(Boolean));
    const missing = topInstruments.filter((i) => !listed.has(String(i).toUpperCase()));
    if (missing.length > 0) {
      lines.push('Additional Coverage');
      missing.forEach((instrument) => {
        lines.push(`- ${instrument}: Monitor trend strength, key support/resistance, catalyst risk, and cross-asset confirmation before execution.`);
      });
      lines.push('');
    }
  }

  const riskRadar = normaliseArray(generated.riskRadar);
  if (riskRadar.length > 0) {
    lines.push('Risk Radar');
    riskRadar.slice(0, 8).forEach((r) => lines.push(`- ${stripSources(r)}`));
    lines.push('');
  }

  const playbook = normaliseArray(generated.playbook);
  if (playbook.length > 0) {
    lines.push('Playbook');
    playbook.slice(0, 8).forEach((p) => lines.push(`- ${stripSources(p)}`));
    lines.push('');
  }

  const body = stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
  assertNoSources(body);
  return body;
}

async function ensureAutomationTables() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_brief_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      run_key VARCHAR(120) NOT NULL,
      period VARCHAR(20) NOT NULL,
      brief_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL,
      brief_id INT NULL,
      error_message VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_run_key (run_key),
      KEY idx_period_date (period, brief_date)
    )
  `);
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_outlook (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      payload JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_date_period (date, period),
      INDEX idx_tdo_date (date)
    )
  `);
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_briefs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      file_url VARCHAR(512) DEFAULT NULL,
      mime_type VARCHAR(128) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tdb_date_period (date, period)
    )
  `);
  await addColumnIfNotExists('trader_deck_briefs', 'file_data', 'LONGBLOB DEFAULT NULL');
  await addColumnIfNotExists('trader_deck_briefs', 'brief_kind', "VARCHAR(40) NOT NULL DEFAULT 'general'");
  await addColumnIfNotExists('trader_deck_briefs', 'brief_version', 'INT NOT NULL DEFAULT 1');
  try {
    await executeQuery('CREATE INDEX idx_tdb_date_period_kind_created ON trader_deck_briefs (date, period, brief_kind, created_at)');
  } catch (_) {
    // ignore duplicate-index errors across deployments
  }
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_deck_brief_instrument_research (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brief_date DATE NOT NULL,
      period VARCHAR(20) NOT NULL,
      brief_kind VARCHAR(40) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tdbr (brief_date, period, brief_kind),
      KEY idx_tdbr_date (brief_date)
    )
  `);
}

async function fetchEconomicCalendar() {
  try {
    const [mod] = await Promise.all([require('../economic-calendar')]);
    const req = {
      method: 'GET',
      headers: { 'x-vercel-ip-timezone': 'Europe/London' },
      query: { refresh: '1' },
      url: 'http://localhost/api/trader-deck/economic-calendar?refresh=1',
    };
    let response = null;
    const res = {
      setHeader: () => {},
      status: () => res,
      json: (payload) => { response = payload; return payload; },
      end: () => {},
    };
    await mod(req, res);
    return Array.isArray(response?.events) ? response.events : [];
  } catch (_) {
    return [];
  }
}

async function reserveRun(runKey, period, date) {
  try {
    await executeQuery(
      `INSERT INTO trader_deck_brief_runs (run_key, period, brief_date, status)
       VALUES (?, ?, ?, 'started')`,
      [runKey, period, date]
    );
    return true;
  } catch (err) {
    // If already exists, allow retry only when previous run failed.
    try {
      const [rows] = await executeQuery(
        'SELECT status FROM trader_deck_brief_runs WHERE run_key = ? LIMIT 1',
        [runKey]
      );
      const status = String(rows?.[0]?.status || '').toLowerCase();
      if (status === 'failed') {
        await executeQuery(
          `UPDATE trader_deck_brief_runs
           SET status = 'started', error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE run_key = ?`,
          [runKey]
        );
        return true;
      }
    } catch (_) {
      // fall through
    }
    return false;
  }
}

async function finalizeRun(runKey, status, briefId, errorMessage) {
  await executeQuery(
    `UPDATE trader_deck_brief_runs
     SET status = ?, brief_id = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE run_key = ?`,
    [status, briefId || null, errorMessage || null, runKey]
  );
}

async function saveOutlookSnapshot({ period, date, payload }) {
  const [rows] = await executeQuery(
    'SELECT payload FROM trader_deck_outlook WHERE date = ? AND period = ? LIMIT 1',
    [date, period]
  );
  const existingRaw = rows && rows[0] ? rows[0].payload : null;
  let existing = null;
  if (typeof existingRaw === 'string') {
    try { existing = JSON.parse(existingRaw); } catch { existing = null; }
  } else if (existingRaw && typeof existingRaw === 'object') {
    existing = existingRaw;
  }
  const manualOverrides = existing && typeof existing.manualOverrides === 'object' ? existing.manualOverrides : null;
  const manualOverrideKeys = Array.isArray(existing?.manualOverrideKeys) ? existing.manualOverrideKeys : [];
  const nextPayload = manualOverrides
    ? {
        botPayload: payload,
        manualOverrides,
        manualOverrideKeys,
        updatedAt: new Date().toISOString(),
      }
    : payload;
  await executeQuery(
    `INSERT INTO trader_deck_outlook (date, period, payload)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       payload = VALUES(payload),
       updated_at = CURRENT_TIMESTAMP`,
    [date, period, JSON.stringify(nextPayload)]
  );
}

async function getNextBriefVersion({ period, date, briefKind }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const [rows] = await executeQuery(
    `SELECT COALESCE(MAX(brief_version), 0) AS maxVersion
     FROM trader_deck_briefs
     WHERE date = ? AND period = ? AND brief_kind = ?`,
    [date, period, normalizedKind]
  );
  const maxVersion = Number(rows?.[0]?.maxVersion || 0);
  return maxVersion + 1;
}

async function publishAutoBrief({ period, date, title, body, briefKind = 'general' }) {
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  const normalizedKind = normalizeBriefKind(briefKind);
  const briefVersion = await getNextBriefVersion({ period, date, briefKind: normalizedKind });
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, ?, ?)`,
    [date, period, safeTitle, Buffer.from(body, 'utf8'), normalizedKind, briefVersion]
  );
  return { insertId: result.insertId, briefVersion };
}

async function publishManualBrief({ period, date, title, body }) {
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const safeDate = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('Valid date (YYYY-MM-DD) is required');
  }
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  assertNoSources(safeTitle);
  assertNoSources(body);
  const briefVersion = await getNextBriefVersion({ period: normalizedPeriod, date: safeDate, briefKind: 'general' });
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, 'general', ?)`,
    [safeDate, normalizedPeriod, safeTitle, Buffer.from(String(body || ''), 'utf8'), briefVersion]
  );
  return result.insertId;
}

function computeTitle(template, now, timeZone) {
  const pattern = String(template?.titlePattern || '').trim() || 'Market Brief - {dateLong}';
  return pattern
    .replace('{weekday}', weekdayName(now, timeZone))
    .replace('{dateLong}', dateLong(now, timeZone))
    .replace('{weekRange}', weekRange(now, timeZone));
}

async function generateAndStoreBrief({
  period,
  briefKind = 'general',
  timeZone = 'Europe/London',
  runDate = new Date(),
  generationContext = null,
  sharedMarket = null,
  sharedEcon = null,
  sharedNews = null,
}) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const normalizedKind = normalizeBriefKind(briefKind);
  const selectedTop5 = top5ForBriefKind(normalizedKind);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const runKey = `auto-brief:${normalizedPeriod}:${date}:${normalizedKind}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date, briefKind: normalizedKind };
  }

  try {
    const template = await getTemplate(normalizedPeriod);
    let market = sharedMarket;
    let econ = sharedEcon;
    let news = sharedNews;
    if (!market || !Array.isArray(econ) || !Array.isArray(news)) {
      const [m, e, n] = await Promise.all([
        market ? Promise.resolve(market) : runEngine({ timeframe: normalizedPeriod, date }),
        Array.isArray(econ) ? Promise.resolve(econ) : fetchEconomicCalendar(),
        Array.isArray(news) ? Promise.resolve(news) : fetchUnifiedNewsSample(),
      ]);
      market = m;
      econ = e;
      news = n;
    }
    const liveQuotes = await fetchLiveQuotesForSymbols(selectedTop5);
    const factPack = buildFactPack({
      period: normalizedPeriod,
      template,
      market,
      econ,
      news,
      briefKind: normalizedKind,
      topInstruments: selectedTop5,
      liveQuotes,
    });
    const existingExcerpts = Array.isArray(generationContext?.existingExcerpts)
      ? generationContext.existingExcerpts
      : [];
    const contextBodies = Array.isArray(generationContext?.existingBodies) ? generationContext.existingBodies : [];

    let generated = await generateWithOpenAi(factPack, template, { existingExcerpts, uniquenessRetry: false });
    if (generated) {
      generated = alignGeneratedSectionsToFramework(generated, factPack);
      const sectionBlob = (generated.sections || []).map((s) => stripSources(s.body || '')).join('\n');
      const maxOverlapSections = contextBodies.reduce((m, prev) => Math.max(m, similarityScore(sectionBlob, prev)), 0);
      if (maxOverlapSections >= 0.58) {
        const regen = await generateWithOpenAi(factPack, template, { existingExcerpts, uniquenessRetry: true });
        if (regen) generated = alignGeneratedSectionsToFramework(regen, factPack);
      }
    }
    if (!generated) {
      generated = fallbackGenerated(factPack, template, runDate, timeZone);
    }
    if (generated) {
      const cachedLayer = await loadInstrumentResearch(date, normalizedPeriod, normalizedKind);
      let layered = generated;
      if (cachedLayer?.instrumentNotes?.length && cachedLayer?.instrumentOutlookBody) {
        layered = applyInstrumentLayerPatch(layered, {
          instrumentOutlookBody: cachedLayer.instrumentOutlookBody,
          instrumentNotes: cachedLayer.instrumentNotes,
        });
      }
      const outlookBody = getInstrumentOutlookBodyFromGenerated(layered);
      if (instrumentLayerNeedsRefresh(layered.instrumentNotes, outlookBody)) {
        const refined = await generateInstrumentLayerOpenAI(factPack, {
          mode: 'refine',
          priorNotes: layered.instrumentNotes,
          priorOutlookBody: outlookBody,
        });
        if (refined?.instrumentNotes?.length) {
          layered = applyInstrumentLayerPatch(layered, refined);
        }
      }
      generated = layered;
    }
    const titleBase = stripSources(computeTitle(template, runDate, timeZone));
    const title = normalizedKind === 'general'
      ? titleBase
      : `${BRIEF_KIND_LABELS[normalizedKind]} - ${titleBase}`;
    let body = renderBriefText({
      title,
      period: normalizedPeriod,
      date,
      generated,
      template,
      briefKind: normalizedKind,
      topInstruments: selectedTop5,
    });
    const maxOverlap = contextBodies.reduce((m, prev) => Math.max(m, similarityScore(body, prev)), 0);
    if (containsBoilerplate(body) || maxOverlap >= 0.66) {
      body = diversifyBody(body, {
        briefKind: normalizedKind,
        period: normalizedPeriod,
        topInstruments: selectedTop5,
      });
    }
    const saved = await publishAutoBrief({ period: normalizedPeriod, date, title, body, briefKind: normalizedKind });
    const briefId = saved.insertId;
    await finalizeRun(runKey, 'success', briefId, null);
    return { success: true, briefId, runKey, date, period: normalizedPeriod, briefKind: normalizedKind, briefVersion: saved.briefVersion, topInstruments: selectedTop5 };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'generation failed').slice(0, 255));
    return { success: false, runKey, date, period: normalizedPeriod, briefKind: normalizedKind, error: err.message || 'generation failed' };
  }
}

async function generateAndStoreBriefSet({ period, timeZone = 'Europe/London', runDate = new Date() }) {
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const [sharedMarket, sharedEcon, sharedNews] = await Promise.all([
    runEngine({ timeframe: normalizedPeriod, date }),
    fetchEconomicCalendar(),
    fetchUnifiedNewsSample(),
  ]);
  const results = [];
  const existingBodies = [];
  const existingExcerpts = [];
  for (const briefKind of orderedBriefKinds()) {
    // Keep category generations isolated so one failure does not block all.
    // eslint-disable-next-line no-await-in-loop
    const row = await generateAndStoreBrief({
      period,
      briefKind,
      timeZone,
      runDate,
      sharedMarket,
      sharedEcon,
      sharedNews,
      generationContext: { existingBodies, existingExcerpts },
    });
    if (row && row.success && row.briefId) {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await executeQuery(
        'SELECT file_data FROM trader_deck_briefs WHERE id = ? LIMIT 1',
        [row.briefId]
      );
      const raw = rows?.[0]?.file_data;
      if (raw) {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        existingBodies.push(text);
        existingExcerpts.push(text.slice(0, 520));
      }
    }
    results.push(row);
  }
  return { success: results.some((r) => r && r.success), period: normalizedPeriod, results };
}

async function generateAndStoreOutlook({ period, timeZone = 'Europe/London', runDate = new Date() }) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const date = toYmdInTz(runDate, timeZone);
  const runKey = `auto-outlook:${normalizedPeriod}:${date}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date };
  }

  try {
    const raw = await runEngine({ timeframe: normalizedPeriod, date });
    let enriched = null;
    try {
      enriched = await enrichTraderDeckPayload(raw);
    } catch (_) {
      enriched = null;
    }
    const full = {
      ...raw,
      ...(enriched || {}),
    };
    const sanitized = sanitizeOutlookPayload(full);
    validateOutlookPayload(sanitized);
    assertNoSources(JSON.stringify(sanitized));
    await saveOutlookSnapshot({
      period: normalizedPeriod,
      date,
      payload: {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      },
    });
    await finalizeRun(runKey, 'success', null, null);
    return { success: true, runKey, date, period: normalizedPeriod };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'outlook generation failed').slice(0, 255));
    return { success: false, runKey, date, period: normalizedPeriod, error: err.message || 'outlook generation failed' };
  }
}

async function generatePreviewBrief({
  period,
  timeZone = 'Europe/London',
  runDate = new Date(),
  templateText = '',
}) {
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const template = templateText
    ? parseTemplateFromText(templateText, normalizedPeriod)
    : await getTemplate(normalizedPeriod);
  const [market, econ, news] = await Promise.all([
    runEngine({ timeframe: normalizedPeriod, date }),
    fetchEconomicCalendar(),
    fetchUnifiedNewsSample(),
  ]);
  const previewTop = top5ForBriefKind('general');
  const liveQuotes = await fetchLiveQuotesForSymbols(previewTop);
  const factPack = buildFactPack({
    period: normalizedPeriod,
    template,
    market,
    econ,
    news,
    briefKind: 'general',
    topInstruments: previewTop,
    liveQuotes,
  });
  let generated = await generateWithOpenAi(factPack, template, { existingExcerpts: [], uniquenessRetry: false });
  if (!generated) {
    generated = fallbackGenerated(factPack, template, runDate, timeZone);
  }
  const title = stripSources(computeTitle(template, runDate, timeZone));
  const body = renderBriefText({
    title,
    period: normalizedPeriod,
    date,
    generated,
    template,
    briefKind: 'general',
    topInstruments: previewTop,
  });
  return {
    success: true,
    period: normalizedPeriod,
    date,
    title,
    body,
    template,
  };
}

function shouldPrefetchInstrumentResearchWindow({ now = new Date(), period, timeZone = 'Europe/London' }) {
  if (normalizePeriod(period) !== 'daily') return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hh = Number(map.hour);
  const mm = Number(map.minute);
  /** ~UK cash equity close: prefetch research for the next calendar session’s brief (stored under tomorrow’s date). */
  return hh === 22 && mm < 20;
}

function shouldRunWindow({ now = new Date(), period, timeZone = 'Europe/London' }) {
  const normalizedPeriod = normalizePeriod(period);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hh = Number(map.hour);
  const mm = Number(map.minute);
  const wd = String(map.weekday || '').toLowerCase();
  /** Daily briefs publish just after midnight UK so the run date matches the new session day. */
  if (normalizedPeriod === 'daily') return hh === 0 && mm < 20;
  return wd.startsWith('sun') && hh === 18 && mm < 15;
}

async function prefetchInstrumentResearchForDaily({ timeZone = 'Europe/London', runDate = new Date() } = {}) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = 'daily';
  const targetDate = tomorrowYmdInTz(runDate, timeZone);
  const [sharedMarket, sharedEcon, sharedNews] = await Promise.all([
    runEngine({ timeframe: normalizedPeriod, date: targetDate }),
    fetchEconomicCalendar(),
    fetchUnifiedNewsSample(),
  ]);
  const template = await getTemplate(normalizedPeriod);
  const results = [];
  const kinds = orderedBriefKinds();
  const batchSize = 3;
  for (let i = 0; i < kinds.length; i += batchSize) {
    const slice = kinds.slice(i, i + batchSize);
    // eslint-disable-next-line no-await-in-loop
    const batchOut = await Promise.all(
      slice.map(async (briefKind) => {
        const normalizedKind = normalizeBriefKind(briefKind);
        const selectedTop5 = top5ForBriefKind(normalizedKind);
        const liveQuotes = await fetchLiveQuotesForSymbols(selectedTop5);
        const factPack = buildFactPack({
          period: normalizedPeriod,
          template,
          market: sharedMarket,
          econ: sharedEcon,
          news: sharedNews,
          briefKind: normalizedKind,
          topInstruments: selectedTop5,
          liveQuotes,
        });
        const layer = await generateInstrumentLayerOpenAI(factPack, { mode: 'prefetch' });
        if (layer?.instrumentNotes?.length && layer?.instrumentOutlookBody) {
          await saveInstrumentResearch(targetDate, normalizedPeriod, normalizedKind, layer);
          return { briefKind: normalizedKind, ok: true };
        }
        return { briefKind: normalizedKind, ok: false };
      })
    );
    results.push(...batchOut);
  }
  return { success: results.some((r) => r.ok), targetDate, period: normalizedPeriod, results };
}

module.exports = {
  generateAndStoreOutlook,
  generateAndStoreBrief,
  generateAndStoreBriefSet,
  generatePreviewBrief,
  publishManualBrief,
  prefetchInstrumentResearchForDaily,
  shouldRunWindow,
  shouldPrefetchInstrumentResearchWindow,
  stripSources,
  assertNoSources,
  _test: {
    shouldRunWindow,
    shouldPrefetchInstrumentResearchWindow,
    instrumentLayerNeedsRefresh,
    maxPairwiseInstrumentSimilarity,
    stripSources,
    assertNoSources,
    sanitizeOutlookPayload,
    validateOutlookPayload,
    normalizeBriefKind,
    top5ForBriefKind,
    orderedBriefKinds,
    BRIEF_KIND_ORDER,
    frameworkHeadings,
    similarityScore,
    containsBoilerplate,
    diversifyBody,
  },
};
