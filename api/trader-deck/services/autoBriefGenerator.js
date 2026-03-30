const { executeQuery, addColumnIfNotExists } = require('../../db');
const { runEngine, getTwelveDataQuote } = require('../marketIntelligenceEngine');
const { getTemplate, normalizePeriod, parseTemplateFromText } = require('./briefTemplateService');
const { getOpenAIModelForChat } = require('../../ai/openai-config');
const { fetchWithTimeout } = require('./fetchWithTimeout');
const { enrichTraderDeckPayload } = require('../openaiTraderInsights');
const briefUniverse = require('./briefInstrumentUniverse');
const briefStructure = require('./briefStructureLock');
const institutionalAuraBrief = require('./institutionalAuraBrief');
const {
  SECTION_HEADINGS,
  SECTION_RULES,
  getStructureKeys,
  structureToSections,
  categoryAngleForSection,
} = briefStructure;

const SOURCE_MARKER_RE = /(https?:\/\/|www\.|source\s*:|sources\s*:|according to|reuters|bloomberg|fmp|finnhub|forex factory|trading economics)/i;
const {
  BRIEF_KIND_ORDER,
  BANNED_PHRASES,
  BANNED_PHRASES_RE,
  GENERIC_BOILERPLATE_RE,
  CATEGORY_INTELLIGENCE_DIRECTIVES,
  fetchTwelveDataQuoteExtended,
  fetchAutomationQuoteWithFallback,
} = briefUniverse;
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
  aura_institutional_daily: 'Aura FX Institutional — Daily',
  aura_institutional_weekly: 'Aura FX Institutional — Weekly',
};
const {
  filterHeadlinesForBriefKind,
  buildSymbolHeadlineMap,
  filterCalendarForBriefKind,
  buildMacroSummaryLines,
  categoryWritingMandate,
  validateTopInstrumentsForKind,
  detectCrossAssetContamination,
  scoreAndSelectTopInstruments,
  buildQuoteCacheForSymbols,
  collectAllAutomationUniverseSymbols,
  fallbackTop5ForKind,
} = briefUniverse;

function normalizeBriefKind(kind) {
  return briefUniverse.normalizeBriefKind(kind);
}

async function fetchLiveQuotesForSymbols(symbols) {
  const syms = Array.isArray(symbols) ? symbols.slice(0, 5) : [];
  if (syms.length === 0) return [];
  const rows = await Promise.all(
    syms.map(async (symbol) => {
      try {
        const q = (await fetchAutomationQuoteWithFallback(symbol)) || (await getTwelveDataQuote(symbol));
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

function top5ForBriefKind(kind) {
  return fallbackTop5ForKind(normalizeBriefKind(kind));
}

function orderedBriefKinds() {
  return [...BRIEF_KIND_ORDER];
}

function frameworkHeadings(period, briefKind, fallbackSections = []) {
  const list = structureToSections(period);
  if (Array.isArray(list) && list.length > 0) return list;
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
  const s = String(text || '').toLowerCase();
  if (BANNED_PHRASES_RE.test(String(text || ''))) return true;
  return BANNED_PHRASES.some((p) => s.includes(String(p).toLowerCase()));
}

/** Light structural tidy only — do not append meta filler (handled via regeneration). */
function diversifyBody(body) {
  return String(body || '').replace(/\n{3,}/g, '\n\n').trim();
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

function buildFactPack({
  period,
  template,
  market,
  econ,
  news,
  briefKind = 'general',
  topInstruments = [],
  liveQuotes = [],
  instrumentScoreRows = [],
  quoteCache = null,
}) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const selectedTop = Array.isArray(topInstruments) && topInstruments.length > 0
    ? topInstruments.slice(0, 5)
    : top5ForBriefKind(normalizedKind);
  const filteredNews = filterHeadlinesForBriefKind(news, normalizedKind);
  const calFiltered = filterCalendarForBriefKind(econ, normalizedKind);
  const calSlice = calFiltered.slice(0, period === 'weekly' ? 16 : 10).map((e) => ({
    currency: e.currency || '',
    event: e.event || '',
    impact: e.impact || '',
    time: e.time || '',
    actual: normalizeCalendarValue(e.actual),
    forecast: normalizeCalendarValue(e.forecast),
    previous: normalizeCalendarValue(e.previous),
  }));
  const macroSummary = buildMacroSummaryLines(market, normalizedKind, period);
  const categoryRiskMap = (market.riskRadar || [])
    .slice(0, 8)
    .map((r) => (typeof r === 'string' ? r : r.title || r.event || ''))
    .filter(Boolean);
  const periodMandate =
    period === 'weekly'
      ? 'WEEKLY: Summarise what repriced over the week, what persisted, leadership vs laggards in THIS category only, and what matters going into next week. Do not rewrite a daily session note.'
      : 'DAILY: Focus on the next session / upcoming catalysts, tape and liquidity for THIS category only. Do not write a multi-week strategic essay.';
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
    riskRadar: categoryRiskMap,
    calendar: calSlice,
    categoryEventMap: calSlice,
    categoryRiskMap,
    macroSummary,
    periodMandate,
    categoryWritingMandate: categoryWritingMandate(normalizedKind, period),
    categoryIntelligenceDirective: CATEGORY_INTELLIGENCE_DIRECTIVES[normalizedKind] || CATEGORY_INTELLIGENCE_DIRECTIVES.general,
    instrumentScores: Array.isArray(instrumentScoreRows)
      ? instrumentScoreRows.map((r) => ({
          instrument: r.symbol,
          score: r.score,
          breakdown: r.breakdown || {},
        }))
      : [],
    headlines: filteredNews.slice(0, 12),
    symbolHeadlines: buildSymbolHeadlineMap(selectedTop, filteredNews),
    liveQuotes: Array.isArray(liveQuotes) ? liveQuotes.slice(0, 5) : [],
    bannedPhrases: BANNED_PHRASES,
    updatedAt: new Date().toISOString(),
  };
}

/** Banned playbook / template scaffolding (body + per-section validation). */
const GENERIC_INSTRUMENT_SCAFFOLD_RE = /scenario\s*\d+\s+defines|catalyst trigger|directional invalidation|\binvalidation\b|invalidation level|position-?sizing|position\s*sizing\s*discipline|daily scenario\s*\d+\s+should define|base and surprise pathways|volatility-?adjusted risk|priority session triggers|trend vs mean-reversion bias|volatility and gap risk|\bpathway\s*[12]\b|\bscenario\s*(?:1|2|3)\b/i;
const NUMBERED_SCENARIO_RE = /\bscenario\s*(?:1|2|3)\b|\bscenario\s+(?:one|two|three)\b/i;

function repeatedOpeningPenalty(text) {
  const paras = String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
  const openings = paras.map((p) => p.split(/[.!?:]/)[0].slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim());
  const counts = new Map();
  for (const o of openings) counts.set(o, (counts.get(o) || 0) + 1);
  let max = 0;
  for (const c of counts.values()) max = Math.max(max, c);
  return max;
}

function duplicateSentenceRatio(text) {
  const sentences = String(text || '')
    .split(/[.!?]+\s+/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((s) => s.length > 28);
  if (sentences.length < 4) return 0;
  const counts = new Map();
  for (const s of sentences) counts.set(s, (counts.get(s) || 0) + 1);
  let dups = 0;
  for (const c of counts.values()) if (c > 1) dups += c - 1;
  return dups / sentences.length;
}

function validateOneSectionBody(sectionKey, bodyText) {
  const b = String(bodyText || '').trim();
  if (b.length < 72) return { ok: false, reason: 'thin' };
  if (BANNED_PHRASES_RE.test(b)) return { ok: false, reason: 'banned' };
  if (GENERIC_INSTRUMENT_SCAFFOLD_RE.test(b)) return { ok: false, reason: 'scaffold' };
  if (NUMBERED_SCENARIO_RE.test(b)) return { ok: false, reason: 'scenario_framing' };
  if (GENERIC_BOILERPLATE_RE.test(b)) return { ok: false, reason: 'boilerplate' };
  return { ok: true };
}

function validateBriefBeforeSave({ body, generated, factPack, priorBodies = [] }) {
  const reasons = [];
  const kind = factPack.briefKind;
  const inv = validateTopInstrumentsForKind(factPack.topInstruments, kind);
  if (!inv.ok) reasons.push(`instrument_universe:${(inv.bad || []).join(',')}`);

  const minBody = kind === 'general' ? 400 : 350;
  if (!body || String(body).trim().length < minBody) reasons.push('body_too_short');

  if (BANNED_PHRASES_RE.test(body)) reasons.push('banned_phrase_in_body');
  if (GENERIC_BOILERPLATE_RE.test(body)) reasons.push('generic_boilerplate_body');
  if (GENERIC_INSTRUMENT_SCAFFOLD_RE.test(body)) reasons.push('instrument_scaffold_body');
  if (NUMBERED_SCENARIO_RE.test(body)) reasons.push('numbered_scenario_framing');

  const contam = detectCrossAssetContamination(body, kind);
  if (contam.contaminated) reasons.push(`cross_asset:${contam.hits.join(',')}`);

  const required = getStructureKeys(factPack.period);
  const sections = Array.isArray(generated?.sections) ? generated.sections : [];
  if (sections.length !== required.length) {
    reasons.push(`section_count:${sections.length}_expected_${required.length}`);
  }
  for (let i = 0; i < required.length; i += 1) {
    const sk = required[i];
    const sec = sections[i];
    if (!sec) {
      reasons.push(`missing_section_index:${i}`);
      continue;
    }
    if (sec.key !== sk) reasons.push(`section_key_mismatch:${i}:${sec.key || 'none'}_expected_${sk}`);
    const b = String(sec.body || '').trim();
    const one = validateOneSectionBody(sk, b);
    if (!one.ok) reasons.push(`section_${one.reason}:${sk}`);
  }

  if (repeatedOpeningPenalty(body) >= 3) reasons.push('repeated_openings');
  if (duplicateSentenceRatio(body) > 0.12) reasons.push('duplicate_sentences');

  for (let i = 0; i < sections.length - 1; i += 1) {
    const a = String(sections[i]?.body || '');
    const c = String(sections[i + 1]?.body || '');
    if (a.length > 120 && c.length > 120 && similarityScore(a, c) >= 0.55) {
      reasons.push(`adjacent_sections_similar:${sections[i]?.key || i}`);
      break;
    }
  }

  for (const prev of priorBodies) {
    if (prev && similarityScore(body, prev) >= 0.6) reasons.push('similar_to_prior_category');
  }

  return { ok: reasons.length === 0, reasons };
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

function slimFactPackForSections(factPack) {
  return {
    period: factPack.period,
    briefKind: factPack.briefKind,
    briefKindLabel: factPack.briefKindLabel,
    periodMandate: factPack.periodMandate,
    categoryWritingMandate: factPack.categoryWritingMandate,
    categoryIntelligenceDirective: factPack.categoryIntelligenceDirective || '',
    macroSummary: factPack.macroSummary || [],
    keyDrivers: factPack.keyDrivers || [],
    crossAssetSignals: factPack.crossAssetSignals || [],
    traderFocus: factPack.traderFocus || [],
    riskRadar: factPack.riskRadar || [],
    calendar: factPack.calendar || [],
    headlines: factPack.headlines || [],
    liveQuotes: (factPack.liveQuotes || []).slice(0, 5),
    marketRegime: factPack.marketRegime,
    marketPulse: factPack.marketPulse,
    bannedPhrases: factPack.bannedPhrases || BANNED_PHRASES,
    categoryLogicRule: CATEGORY_LOGIC_RULES[factPack.briefKind] || CATEGORY_LOGIC_RULES.general,
    narrativeInstrumentRule:
      'Macro-first narrative: mention tickers or spot levels only when they clarify cross-asset or macro transmission (e.g. US10Y dragging risk, DXY skew). '
      + 'Do not enumerate a watchlist, do not use one-paragraph-per-symbol structure, do not fabricate parallel “templates” across names.',
  };
}

function fallbackSectionBodyByKey(sectionKey, heading, factPack) {
  const label = factPack.briefKindLabel || 'Desk';
  const drivers = (factPack.keyDrivers || []).slice(0, 5).map(packDriverLine).filter(Boolean).join(' · ');
  const cross = (factPack.crossAssetSignals || []).slice(0, 4).map(packSignalLine).filter(Boolean).join(' · ');
  const quotes = (factPack.liveQuotes || [])
    .map((q) => `${q.symbol}${q.last != null ? ` ${q.last}` : ''}${q.changePct != null ? ` (${q.changePct}%)` : ''}`)
    .join(' · ');
  const cal = (factPack.calendar || [])
    .slice(0, 4)
    .map((c) => c.event)
    .filter(Boolean)
    .join(' · ');
  const pulse =
    factPack.marketPulse && typeof factPack.marketPulse === 'object'
      ? factPack.marketPulse.label || ''
      : String(factPack.marketPulse || '');
  const regime =
    factPack.marketRegime && typeof factPack.marketRegime === 'object'
      ? factPack.marketRegime.currentRegime || ''
      : String(factPack.marketRegime || '');
  const baseCtx = `${label}. Regime: ${regime || 'mixed'}. Pulse: ${pulse || 'n/a'}.`;
  const map = {
    market_context: `${baseCtx} ${drivers ? `Drivers: ${drivers}.` : ''} ${quotes ? `Spot: ${quotes}.` : ''}`,
    cross_asset_flow: `${label} cross-asset: ${cross || 'Rates, USD, risk and commodities frame the tape.'} ${drivers ? `Linked drivers: ${drivers.slice(0, 220)}.` : ''}`,
    key_drivers: `${label} — real drivers this window: ${drivers || 'Monitor calendar and flow; avoid generic lists.'}`,
    market_behaviour: `${label} tape: ${pulse ? `${pulse} tone.` : 'Two-way liquidity.'} ${factPack.traderFocus?.length ? `Focus: ${normaliseArray(factPack.traderFocus.map((x) => (typeof x === 'string' ? x : x.title || ''))).slice(0, 3).join(' · ')}.` : ''}`,
    what_matters_next: `${label} — next catalysts: ${cal || 'Use calendar rows in the pack for timing; name specific releases.'} ${quotes ? `Context: ${quotes.slice(0, 180)}.` : ''}`,
    trader_takeaway: `${label} takeaway: lean with ${drivers ? drivers.split(' · ')[0] : 'the dominant macro pulse'}; reassess if the tape contradicts that read. ${quotes ? `Lead context: ${quotes.split(' · ')[0] || 'from spot snapshot'}.` : ''}`,
    weekly_overview: `Weekly ${label}: ${drivers ? drivers.slice(0, 280) : baseCtx} ${cross ? `Cross-asset: ${cross.slice(0, 200)}.` : ''}`,
    macro_theme: `Macro theme for ${label}: ${drivers || cross || 'Policy, growth, and inflation path.'}`,
    cross_asset_breakdown: `${label} weekly cross-asset: ${cross || 'Leadership vs laggards across linked markets.'}`,
    structural_shift: `${label} structure: ${pulse || 'No single dominant break'}; ${drivers ? `Watch ${drivers.slice(0, 200)}` : 'track breadth and correlation.'}.`,
    key_events_recap: `Week in ${label}: ${cal || 'Key prints in calendar above.'} ${drivers ? `Drivers: ${drivers.slice(0, 240)}.` : ''}`,
    forward_outlook: `Forward for ${label}: ${cal ? `Next focus: ${cal}.` : 'Event path from calendar.'} ${cross ? cross.slice(0, 200) : ''}`,
    strategic_takeaway: `Strategic stance — ${label}: ${drivers ? drivers.split(' · ')[0] : 'Stay with confirmed macro'}; risk scales with event density.`,
  };
  return String(map[sectionKey] || `${label} — ${heading}: ${drivers || pulse || quotes || 'Desk context from fact pack.'}`).trim();
}

async function generateSingleSectionOpenAI(sectionKey, heading, factPack, priorSectionBodies, options = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  const { uniquenessRetry = false, validationFix = false, existingExcerpts = [] } = options;
  const rules = SECTION_RULES[sectionKey] || { purpose: 'Write this section.', rules: [] };
  const angle = categoryAngleForSection(sectionKey, factPack.briefKind);
  const excerptBlock =
    Array.isArray(existingExcerpts) && existingExcerpts.length > 0
      ? existingExcerpts
          .map((ex, i) => `--- Other category brief #${i + 1} (do not copy phrasing) ---\n${String(ex || '').slice(0, 400)}`)
          .join('\n\n')
      : '';
  const priorHint =
    priorSectionBodies.length > 0
      ? `Already written earlier in THIS brief (do not repeat sentences; advance the narrative):\n${priorSectionBodies.map((p, i) => `--- part ${i + 1} ---\n${p.slice(0, 500)}`).join('\n')}`
      : '';

  const userPayload = {
    sectionKey,
    displayHeading: heading,
    sectionPurpose: rules.purpose,
    sectionRules: rules.rules,
    categoryAngle: angle,
    factPack: slimFactPackForSections(factPack),
    priorSectionsInThisBrief: priorHint,
    otherCategoriesThisRun: excerptBlock,
    outputContract: 'Return JSON only: {"body":"string"} — one prose section, 2–5 short paragraphs max, plain text, no markdown headings inside body.',
    bannedSubstrings: factPack.bannedPhrases || BANNED_PHRASES,
    rewriteNote:
      uniquenessRetry || validationFix
        ? 'Prior attempt failed validation: change wording and openings; keep facts from factPack only.'
        : null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 24000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: uniquenessRetry || validationFix ? 0.42 : 0.22,
        max_tokens: 1400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write ONE section of a fixed-structure institutional market brief. '
              + 'You do NOT choose section titles or order. '
              + 'Tone: clean, sharp, narrative flow like a professional desk note — no checklist voice, no filler, no symmetrical bullet patterns. '
              + 'FORBIDDEN anywhere in body: numbered scenarios (Scenario 1/2/3), pathway labels, "catalyst trigger", "invalidation", "position sizing", '
              + '"base and surprise", playbook templates, or one-paragraph-per-ticker blocks. '
              + 'No sources, URLs, or citations. '
              + 'Obey bannedSubstrings exactly (no substring matches in body). '
              + 'Return valid JSON: {"body":"..."} only.',
          },
          { role: 'user', content: JSON.stringify(userPayload) },
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
    const body = stripSources(String(parsed.body || '').trim());
    return { body };
  } catch (_) {
    clearTimeout(timeout);
    return null;
  }
}

async function regenerateSectionOpenAI(sectionKey, heading, factPack, priorBodies, options) {
  const isolated = await generateSingleSectionOpenAI(sectionKey, heading, factPack, priorBodies, {
    ...options,
    uniquenessRetry: true,
    validationFix: true,
  });
  if (isolated?.body) return stripSources(isolated.body);
  return fallbackSectionBodyByKey(sectionKey, heading, factPack);
}

async function generateBriefBySections(factPack, template, options = {}) {
  const keys = getStructureKeys(factPack.period);
  const sections = [];
  const bodiesSoFar = [];
  const { existingExcerpts = [], uniquenessRetry = false, validationFix = false } = options;

  for (const sectionKey of keys) {
    const heading = SECTION_HEADINGS[sectionKey] || sectionKey;
    let body = '';
    let attempts = 0;
    while (attempts < 3) {
      const res = await generateSingleSectionOpenAI(sectionKey, heading, factPack, bodiesSoFar, {
        existingExcerpts,
        uniquenessRetry: uniquenessRetry || attempts > 0,
        validationFix: validationFix || attempts > 0,
      });
      body = stripSources(String(res?.body || '').trim());
      const v = validateOneSectionBody(sectionKey, body);
      if (v.ok) break;
      attempts += 1;
    }
    if (!body || !validateOneSectionBody(sectionKey, body).ok) {
      body = fallbackSectionBodyByKey(sectionKey, heading, factPack);
    }
    sections.push({ key: sectionKey, heading, body });
    bodiesSoFar.push(body);
  }

  return {
    title: null,
    sections,
    instrumentNotes: [],
    riskRadar: [],
    playbook: [],
  };
}

async function refineFailedSections(generated, factPack, validation, options = {}) {
  if (!generated || !Array.isArray(generated.sections) || !validation?.reasons?.length) return generated;
  const required = getStructureKeys(factPack.period);
  const needKeys = new Set();
  for (const r of validation.reasons) {
    const m = r.match(/^section_(thin|banned|scaffold|boilerplate|scenario_framing):(.+)$/);
    if (m) needKeys.add(m[2]);
    const adj = r.match(/^adjacent_sections_similar:(.+)$/);
    if (adj) needKeys.add(adj[1]);
  }
  if (needKeys.size === 0) return generated;

  let next = generated.sections.map((sec) => ({ ...sec }));
  for (let i = 0; i < next.length; i += 1) {
    const sk = required[i];
    if (!sk || !needKeys.has(sk)) continue;
    const heading = next[i].heading || SECTION_HEADINGS[sk];
    const priorBodies = next.slice(0, i).map((s) => String(s.body || ''));
    const newBody = await regenerateSectionOpenAI(sk, heading, factPack, priorBodies, options);
    next[i] = { ...next[i], key: sk, heading, body: newBody };
  }
  return { ...generated, sections: next };
}

function fallbackGenerated(factPack, template, now, timeZone) {
  const keys = getStructureKeys(factPack.period);
  const renderedSections = keys.map((key) => ({
    key,
    heading: SECTION_HEADINGS[key] || key,
    body: fallbackSectionBodyByKey(key, SECTION_HEADINGS[key], factPack),
  }));
  const baseTitle = template.titlePattern
    .replace('{weekday}', weekdayName(now, timeZone))
    .replace('{dateLong}', dateLong(now, timeZone))
    .replace('{weekRange}', weekRange(now, timeZone));
  return {
    title: baseTitle,
    sections: renderedSections,
    instrumentNotes: [],
    riskRadar: [],
    playbook: [],
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

function toSqlDateYmd(date) {
  if (date == null) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const s = String(date).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s.slice(0, 10);
}

/**
 * Avoid INSERT duplicate-key noise: SELECT first, INSERT with explicit 4 params, catch race-only duplicates.
 */
async function reserveRun(runKey, period, date) {
  const briefDate = toSqlDateYmd(date);
  if (!briefDate) return false;

  try {
    const [existing] = await executeQuery(
      'SELECT status FROM trader_deck_brief_runs WHERE run_key = ? LIMIT 1',
      [runKey]
    );
    if (existing && existing[0]) {
      const status = String(existing[0].status || '').toLowerCase();
      if (status === 'failed') {
        await executeQuery(
          `UPDATE trader_deck_brief_runs
           SET status = 'started', error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE run_key = ?`,
          [runKey]
        );
        return true;
      }
      return false;
    }
  } catch (e) {
    console.warn('[brief-gen] reserveRun lookup failed:', e.message || e);
    return false;
  }

  try {
    await executeQuery(
      `INSERT INTO trader_deck_brief_runs (run_key, period, brief_date, status)
       VALUES (?, ?, ?, ?)`,
      [runKey, period, briefDate, 'started']
    );
    return true;
  } catch (err) {
    const dup = err && (err.code === 'ER_DUP_ENTRY' || Number(err.errno) === 1062);
    if (!dup) {
      console.warn('[brief-gen] reserveRun insert failed:', err.message || err);
      throw err;
    }
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
      /* ignore */
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

async function publishAutoBrief({ period, date, title, body, briefKind = 'general', generationMeta = null }) {
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  const normalizedKind = normalizeBriefKind(briefKind);
  await addColumnIfNotExists('trader_deck_briefs', 'generation_meta', 'JSON NULL');
  const metaJson = generationMeta == null ? null : JSON.stringify(generationMeta);
  const [existing] = await executeQuery(
    `SELECT id, brief_version FROM trader_deck_briefs
     WHERE date = ? AND period = ? AND brief_kind = ?
     ORDER BY brief_version DESC, id DESC LIMIT 1`,
    [date, period, normalizedKind]
  );
  const row = existing && existing[0];
  if (row && row.id) {
    const nextV = Number(row.brief_version || 0) + 1;
    await executeQuery(
      `UPDATE trader_deck_briefs
       SET title = ?, file_data = ?, mime_type = 'text/plain; charset=utf-8', brief_version = ?, generation_meta = ?
       WHERE id = ?`,
      [safeTitle, Buffer.from(body, 'utf8'), nextV, metaJson, row.id]
    );
    return { insertId: row.id, briefVersion: nextV };
  }
  const briefVersion = 1;
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version, generation_meta)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, ?, ?, ?)`,
    [date, period, safeTitle, Buffer.from(body, 'utf8'), normalizedKind, briefVersion, metaJson]
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
  sharedQuoteCache = null,
}) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const normalizedKind = normalizeBriefKind(briefKind);
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

    let quoteCache = sharedQuoteCache;
    if (!quoteCache || typeof quoteCache.get !== 'function') {
      quoteCache = await buildQuoteCacheForSymbols(
        collectAllAutomationUniverseSymbols(),
        fetchAutomationQuoteWithFallback
      );
    }

    const selection = await scoreAndSelectTopInstruments({
      briefKind: normalizedKind,
      period: normalizedPeriod,
      quoteCache,
      headlines: news,
      calendarRows: econ,
      market,
      logPrefix: '[brief-gen]',
    });
    const selectedTop5 = selection.top5;
    const partialDataMode =
      quoteCache.size < 8 ||
      !Array.isArray(econ) ||
      econ.length < 3 ||
      !Array.isArray(news) ||
      news.length < 3;

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
      instrumentScoreRows: selection.scoreRows,
      quoteCache,
    });
    const existingExcerpts = Array.isArray(generationContext?.existingExcerpts)
      ? generationContext.existingExcerpts
      : [];
    const contextBodies = Array.isArray(generationContext?.existingBodies) ? generationContext.existingBodies : [];

    let generated = await generateBriefBySections(factPack, template, {
      existingExcerpts,
      uniquenessRetry: false,
    });
    if (generated) {
      const sectionBlob = (generated.sections || []).map((s) => stripSources(s.body || '')).join('\n');
      const maxOverlapSections = contextBodies.reduce((m, prev) => Math.max(m, similarityScore(sectionBlob, prev)), 0);
      if (maxOverlapSections >= 0.55) {
        const regen = await generateBriefBySections(factPack, template, {
          existingExcerpts,
          uniquenessRetry: true,
        });
        if (regen) generated = regen;
      }
    }
    if (!generated) {
      generated = fallbackGenerated(factPack, template, runDate, timeZone);
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
    let validation = validateBriefBeforeSave({
      body,
      generated,
      factPack,
      priorBodies: contextBodies,
    });
    const maxOverlap = contextBodies.reduce((m, prev) => Math.max(m, similarityScore(body, prev)), 0);
    if (!validation.ok) {
      const sectionFixable = validation.reasons.some(
        (r) =>
          /^section_(thin|banned|scaffold|boilerplate|scenario_framing):/.test(r)
          || /^adjacent_sections_similar:/.test(r),
      );
      if (sectionFixable) {
        generated = await refineFailedSections(generated, factPack, validation, { existingExcerpts });
        body = renderBriefText({
          title,
          period: normalizedPeriod,
          date,
          generated,
          template,
          briefKind: normalizedKind,
          topInstruments: selectedTop5,
        });
        validation = validateBriefBeforeSave({ body, generated, factPack, priorBodies: contextBodies });
      }
    }
    if (!validation.ok || containsBoilerplate(body) || maxOverlap >= 0.62) {
      console.warn('[brief-gen] validation/overlap — full section regen', {
        category: normalizedKind,
        date,
        reasons: validation.reasons,
        maxOverlap,
      });
      const regen = await generateBriefBySections(factPack, template, {
        existingExcerpts,
        uniquenessRetry: true,
        validationFix: true,
      });
      if (regen) {
        generated = regen;
        body = renderBriefText({
          title,
          period: normalizedPeriod,
          date,
          generated,
          template,
          briefKind: normalizedKind,
          topInstruments: selectedTop5,
        });
        validation = validateBriefBeforeSave({ body, generated, factPack, priorBodies: contextBodies });
      }
    }
    body = diversifyBody(body);
    const generationMeta = {
      generatedAt: new Date().toISOString(),
      topInstruments: selectedTop5,
      instrumentScores: (selection.scoreRows || []).map((r) => ({ symbol: r.symbol, score: r.score, breakdown: r.breakdown })),
      partialDataMode,
      validationOk: validation.ok,
      validationReasons: validation.ok ? [] : validation.reasons,
    };
    if (!validation.ok) {
      console.warn('[brief-gen] saved with validation warnings', { category: normalizedKind, reasons: validation.reasons });
    }
    const saved = await publishAutoBrief({
      period: normalizedPeriod,
      date,
      title,
      body,
      briefKind: normalizedKind,
      generationMeta,
    });
    const briefId = saved.insertId;
    await finalizeRun(runKey, 'success', briefId, null);
    console.info('[brief-gen] saved', {
      category: normalizedKind,
      period: normalizedPeriod,
      date,
      briefId,
      top5: selectedTop5,
      validationOk: validation.ok,
    });
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
  const sharedQuoteCache = await buildQuoteCacheForSymbols(
    collectAllAutomationUniverseSymbols(),
    fetchAutomationQuoteWithFallback
  );
  console.info('[brief-gen] quote cache built', { symbols: sharedQuoteCache.size, period: normalizedPeriod, date });
  if (sharedQuoteCache.size === 0) {
    console.warn(
      '[brief-gen] quote cache is empty — configure TWELVE_DATA_API_KEY and/or valid FMP_API_KEY and FINNHUB_API_KEY (403 usually means invalid key or plan).'
    );
  }
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
      sharedQuoteCache,
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
  const qc = await buildQuoteCacheForSymbols(
    collectAllAutomationUniverseSymbols(),
    fetchAutomationQuoteWithFallback
  );
  const sel = await scoreAndSelectTopInstruments({
    briefKind: 'general',
    period: normalizedPeriod,
    quoteCache: qc,
    headlines: news,
    calendarRows: econ,
    market,
    logPrefix: '[brief-preview]',
  });
  const previewTop = sel.top5;
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
    instrumentScoreRows: sel.scoreRows,
    quoteCache: qc,
  });
  let generated = await generateBriefBySections(factPack, template, {
    existingExcerpts: [],
    uniquenessRetry: false,
  });
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
  /** Daily institutional brief: 06:00 UK (London open prep). */
  if (normalizedPeriod === 'daily') return hh === 6 && mm < 20;
  /** Weekly: Sunday 10:00 UK. */
  return wd.startsWith('sun') && hh === 10 && mm < 20;
}

function getInstitutionalBriefDeps() {
  return {
    assertAutomationModelConfigured,
    ensureAutomationTables,
    reserveRun,
    finalizeRun,
    publishAutoBrief,
    toYmdInTz,
    normalizeOutlookDate,
    normalizePeriod,
    runEngine,
    fetchUnifiedNewsSample,
    buildQuoteCacheForSymbols,
    fetchAutomationQuoteWithFallback,
    stripSources,
    assertNoSources,
    getAutomationModel,
  };
}

async function generateAndStoreInstitutionalBriefOnly(opts) {
  return institutionalAuraBrief.generateAndStoreInstitutionalBrief(getInstitutionalBriefDeps(), opts);
}

/** Legacy cron hook: per-instrument OpenAI layer removed — briefs are narrative sections only. */
async function prefetchInstrumentResearchForDaily({ timeZone = 'Europe/London', runDate = new Date() } = {}) {
  const targetDate = tomorrowYmdInTz(runDate, timeZone);
  return {
    success: true,
    skipped: true,
    reason: 'instrument_layer_removed',
    targetDate,
    period: 'daily',
    results: [],
  };
}

module.exports = {
  generateAndStoreOutlook,
  generateAndStoreBrief,
  generateAndStoreBriefSet,
  generateAndStoreInstitutionalBriefOnly,
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
