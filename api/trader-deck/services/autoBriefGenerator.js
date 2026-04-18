const {
  recordOutboundRequest,
  resetProviderRequestMeter,
  logProviderRequestMeter,
} = require('../../utils/providerRequestMeter');
const { executeQuery, addColumnIfNotExists } = require('../../db');
const { runEngine, getTwelveDataQuote } = require('../marketIntelligenceEngine');
const { getTemplate, normalizePeriod, parseTemplateFromText } = require('./briefTemplateService');
const { getPerplexityAutomationModel } = require('../../ai/perplexity-config');
const { fetchWithTimeout } = require('./fetchWithTimeout');
const { polishBriefMarkdown } = require('../../../src/utils/briefPresentationSanitize');
const { enrichTraderDeckPayload } = require('../perplexityTraderInsights');
const { getStoredBriefInputs } = require('../../market-data/pipeline-service');
const briefUniverse = require('./briefInstrumentUniverse');
const briefStructure = require('./briefStructureLock');
const institutionalAuraBrief = require('./institutionalAuraBrief');
const { PERPLEXITY_API_URL } = require('../../ai/perplexity-client');
const {
  SECTION_HEADINGS,
  SECTION_RULES,
  getStructureKeys,
  structureToSections,
  categoryAngleForSection,
} = briefStructure;

const SOURCE_MARKER_RE = /(https?:\/\/|www\.|source\s*:|sources\s*:|according to|reuters|bloomberg|fmp|finnhub|forex factory|trading economics)/i;
const { DateTime } = require('luxon');
const { getWeekEndingSundayUtcYmd } = require('../deskDates');
const { DESK_AUTOMATION_CATEGORY_KINDS, expectedIntelAutomationRowCount } = require('../deskBriefKinds');
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

async function getSharedBriefInputs(normalizedPeriod, date) {
  try {
    const stored = await getStoredBriefInputs({ timeframe: normalizedPeriod, date });
    if (stored?.market && Array.isArray(stored.headlines) && stored.headlines.length > 0 && Array.isArray(stored.calendar) && stored.calendar.length > 0) {
      return {
        market: stored.market,
        econ: stored.calendar,
        news: stored.headlines,
        sourceOfTruth: 'mysql-pipeline',
      };
    }
  } catch (error) {
    console.warn('[brief-gen] stored brief inputs unavailable:', error.message || error);
  }

  const [market, econ, news] = await Promise.all([
    runEngine({ timeframe: normalizedPeriod, date }),
    fetchEconomicCalendar(),
    fetchUnifiedNewsSample(),
  ]);

  return {
    market,
    econ,
    news,
    sourceOfTruth: 'live-fallback',
  };
}

/** When quote/calendar/news feeds are thin (e.g. FMP 429), add one Perplexity JSON supplement per brief-set run. */
function needsLlmDataSupplement(quoteCache, econ, news) {
  const qSize = quoteCache && typeof quoteCache.size === 'number' ? quoteCache.size : 0;
  const econN = Array.isArray(econ) ? econ.length : 0;
  const newsN = Array.isArray(news) ? news.length : 0;
  return qSize < 8 || econN < 3 || newsN < 3;
}

function sanitizeLlmDataSupplement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clean = (s) => stripSources(String(s || '').trim()).slice(0, 2400);
  const themes = Array.isArray(raw.headlineThemes)
    ? raw.headlineThemes
    : Array.isArray(raw.themes)
      ? raw.themes
      : [];
  const macro = Array.isArray(raw.upcomingMacro) ? raw.upcomingMacro : [];
  const assets = Array.isArray(raw.assetSnapshot) ? raw.assetSnapshot : [];
  const out = {
    regime: clean(raw.regime),
    pulse: clean(raw.pulse),
    headlineThemes: themes.map((x) => clean(x)).filter(Boolean).slice(0, 14),
    upcomingMacro: macro.slice(0, 8).map((e) => ({
      label: clean(e?.label || e?.event || ''),
      window: clean(e?.window || e?.approxTimeWindow || ''),
    })).filter((e) => e.label),
    assetSnapshot: assets.slice(0, 20).map((a) => {
      const sym = String(a?.symbol || '').toUpperCase().replace(/[^A-Z0-9._]/g, '').slice(0, 24);
      const pct = a?.changePctDayApprox;
      const pNum = pct != null && Number.isFinite(Number(pct)) ? Math.round(Number(pct) * 10) / 10 : null;
      return {
        symbol: sym,
        changePctDayApprox: pNum,
        levelOrRangeHint: clean(a?.levelOrRangeHint || '').slice(0, 160),
        note: clean(a?.note || '').slice(0, 500),
      };
    }).filter((a) => a.symbol),
    caveat: clean(raw.caveat || 'Approximate desk synthesis when live price feeds were thin.'),
  };
  if (!out.regime && !out.pulse && out.headlineThemes.length === 0 && out.assetSnapshot.length === 0) return null;
  return out;
}

async function fetchLlmBriefDataSupplementGlobal({
  period,
  dateStr,
  timeZone,
  market,
  econ,
  news,
  symbolSample,
}) {
  if (!isTraderDeskAutomationConfigured()) return null;
  const systemPrompt =
    'You fill gaps for an automated trading desk when live REST market APIs are missing, rate-limited, or empty.\n'
    + 'Return a single JSON object only (no markdown). Fields:\n'
    + '- regime: string, one sentence cross-asset regime for that calendar date.\n'
    + '- pulse: string, one sentence risk tone / liquidity read.\n'
    + '- headlineThemes: string array, up to 12 short theme lines (no URLs, no publisher names).\n'
    + '- upcomingMacro: array of up to 8 { "label": string, "window": string } macro events relevant to the desk date (approx timing OK).\n'
    + '- assetSnapshot: array of up to 18 { "symbol": string, "changePctDayApprox": number or null, "levelOrRangeHint": string or null, "note": string or null } covering the watchSymbols list — best-effort public session context for that date; round % to one decimal.\n'
    + '- caveat: string, one line that figures are approximate synthesis.\n'
    + 'Rules: no URLs, no citations, no "according to". If unsure, use qualitative wording and null numbers.\n'
    + 'Never present approximate or model-filled numbers as exchange-verified facts; when numbers are non-null, they are desk estimates only and must stay aligned with caveat.';

  const userPayload = {
    period: String(period || 'daily'),
    deskDate: String(dateStr || '').slice(0, 10),
    timeZone: String(timeZone || 'Europe/London'),
    watchSymbols: (Array.isArray(symbolSample) ? symbolSample : []).map((s) => String(s).toUpperCase().trim()).filter(Boolean).slice(0, 20),
    partialFeeds: {
      marketRegime: market?.marketRegime ?? null,
      marketPulse: market?.marketPulse ?? null,
      headlineSample: Array.isArray(market?.headlineSample) ? market.headlineSample.slice(0, 10) : [],
      economicEventsSample: Array.isArray(econ)
        ? econ.slice(0, 6).map((e) => ({
            event: e?.event || e?.title,
            time: e?.time,
            currency: e?.currency,
          }))
        : [],
      newsHeadlinesSample: Array.isArray(news) ? news.slice(0, 8) : [],
    },
  };

  const res = await callPerplexityJson(systemPrompt, userPayload, {
    maxTokens: 3200,
    temperature: 0.28,
    timeoutMs: 75000,
  });
  if (!res.ok || !res.parsed) {
    console.warn('[brief-gen] LLM data supplement failed:', res.error || 'unknown');
    return null;
  }
  return sanitizeLlmDataSupplement(res.parsed);
}

/** Injected into Perplexity system/user payloads so prose never front-runs missing Twelve Data / pack fields. */
const STRUCTURED_DATA_FIRST_RULE =
  'STRUCTURED DATA FIRST: liveQuotes, calendar rows, symbolHeadlines, headlines, macroSummary, keyDrivers, and crossAssetSignals are the only authoritative market facts. '
  + 'If a symbol or field is missing, empty, or null, do not invent prices, percentages, OHLC, volumes, positioning, or event outcomes—say the pack is thin in one clause and stay qualitative. '
  + 'Do not use outside or "typical" levels unless they appear explicitly in the JSON.';

const CATEGORY_LOGIC_RULES = {
  stocks: 'Focus on earnings revisions, sector breadth, options positioning and stock-specific catalyst windows.',
  indices: 'Focus on index breadth, correlation shifts, dispersion, volatility term structure and macro beta.',
  futures: 'Focus on contract structure, carry/roll dynamics, session liquidity pockets and macro release reaction plans.',
  forex: 'Focus on relative-rate spreads, central-bank divergence, session behavior and event-volatility execution.',
  crypto: 'Focus on funding/basis, on-chain flow, exchange liquidity, correlation to risk assets and event shock handling.',
  commodities: 'Focus on supply-demand balances, inventory dynamics, seasonality and geopolitical transmission into price.',
  bonds: 'Focus on curve shape, duration sensitivity, policy path repricing and auction/data calendar transmission.',
  etfs: 'Focus on ETF flow momentum, creation/redemption pressure, factor rotation and underlying liquidity confirmation.',
};

function toYmdInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeOutlookDate(period, dateStr) {
  return period === 'weekly' ? getWeekEndingSundayUtcYmd(dateStr) : dateStr;
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

/** Calendar date without weekday — use with `{weekday}` in the same title to avoid “Monday Monday”. */
function dateLongNoWeekday(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/** JS Date at local noon on desk YMD — stable title tokens vs UTC parsing bugs. */
function jsDateFromDeskYmd(deskYmd, timeZone) {
  const dt = DateTime.fromISO(`${String(deskYmd || '').slice(0, 10)}T12:00:00`, { zone: timeZone });
  return dt.isValid ? dt.toJSDate() : new Date();
}

/** Mon–Fri window for the ISO week containing `deskYmd` in `timeZone` (matches UK desk week). */
function deskWeekMonFriRangeLabel(deskYmd, timeZone = 'Europe/London') {
  const anchor = DateTime.fromISO(`${String(deskYmd || '').slice(0, 10)}T12:00:00`, { zone: timeZone });
  if (!anchor.isValid) return '';
  const mon = anchor.set({ weekday: 1 });
  const fri = mon.plus({ days: 4 });
  const fmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone });
  return `${fmt.format(mon.toJSDate())} to ${fmt.format(fri.toJSDate())}`;
}

function stripSources(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim());
  return lines
    .filter((line) => line.length === 0 || !SOURCE_MARKER_RE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function orderedAutomatedCategoryKinds() {
  return [...DESK_AUTOMATION_CATEGORY_KINDS];
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

function removeDashSeparators(text) {
  return String(text || '')
    // Remove Markdown horizontal rules / separators
    .replace(/^[ \t]*(-\s*){3,}[ \t]*$/gm, '')
    // Remove leaked prompt markers like "--- part 1 ---"
    .replace(/^[ \t]*---[ \t]*.*[ \t]*---[ \t]*$/gm, '');
}

/** Light structural tidy only — do not append meta filler (handled via regeneration). */
function diversifyBody(body) {
  return removeDashSeparators(body)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    process.env.PERPLEXITY_AUTOMATION_MODEL
    || process.env.PERPLEXITY_CHAT_MODEL
    || process.env.PERPLEXITY_MODEL
    || getPerplexityAutomationModel()
  ).trim();
}

function isTraderDeskAutomationConfigured() {
  return Boolean(String(process.env.PERPLEXITY_API_KEY || '').trim());
}

function assertAutomationModelConfigured() {
  if (!isTraderDeskAutomationConfigured()) {
    throw new Error('PERPLEXITY_API_KEY is required for automated Trader Desk runs');
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
    return parts.join(', ').trim();
  }
  return String(d);
}

function packSignalLine(s) {
  if (s == null) return '';
  if (typeof s === 'string') return s.trim();
  if (typeof s === 'object') {
    const parts = [s.label, s.reading, s.detail, s.title].filter(Boolean).map(String);
    return parts.join(', ').trim();
  }
  return String(s);
}

function buildFactPack({
  period,
  template,
  market,
  econ,
  news,
  briefKind = 'stocks',
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
  const quotePrimed =
    quoteCache && typeof quoteCache.size === 'number' ? quoteCache.size : null;
  return {
    period,
    briefKind: normalizedKind,
    briefKindLabel: BRIEF_KIND_LABELS[normalizedKind] || BRIEF_KIND_LABELS.stocks,
    contextQuality: {
      headlineCount: filteredNews.length,
      calendarCount: calSlice.length,
      quoteCacheSymbols: quotePrimed,
    },
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
    categoryIntelligenceDirective: CATEGORY_INTELLIGENCE_DIRECTIVES[normalizedKind] || CATEGORY_INTELLIGENCE_DIRECTIVES.stocks,
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

function ordinalDayNumber(n) {
  const v = Number(n);
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

function formatDailySampleTitle(deskYmd, timeZone) {
  const mid = jsDateFromDeskYmd(deskYmd, timeZone);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(mid);
  const day = ordinalDayNumber(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(mid));
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(mid);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(mid);
  return `Daily Brief - ${weekday} ${day} ${month} ${year}`;
}

function formatWeeklySampleTitle(deskYmd, timeZone) {
  const mon = DateTime.fromISO(`${String(deskYmd || '').slice(0, 10)}T12:00:00`, { zone: timeZone }).set({ weekday: 1 });
  const fri = mon.plus({ days: 4 });
  if (!mon.isValid) return 'WEEKLY FUNDAMENTAL ANALYSIS';
  const mDay = ordinalDayNumber(mon.toFormat('d'));
  const fDay = ordinalDayNumber(fri.toFormat('d'));
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(fri.toJSDate());
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(fri.toJSDate());
  return `WEEKLY FUNDAMENTAL ANALYSIS - (${mDay} - ${fDay} ${month} ${year})`;
}

async function getLatestWeeklyBriefExcerpt(briefKind, beforeDate) {
  try {
    const [rows] = await executeQuery(
      `SELECT file_data, title, date
       FROM trader_deck_briefs
       WHERE period = 'weekly' AND brief_kind = ? AND date <= ?
       ORDER BY date DESC, created_at DESC
       LIMIT 1`,
      [briefKind, beforeDate]
    );
    const raw = rows?.[0]?.file_data;
    if (!raw) return null;
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    return {
      title: String(rows[0].title || '').trim(),
      date: String(rows[0].date || '').slice(0, 10),
      excerpt: text.slice(0, 3500),
    };
  } catch (_) {
    return null;
  }
}

async function callPerplexityJson(systemPrompt, userPayload, options = {}) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'missing_perplexity_key' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 90000);
  try {
    const requestBody = {
      model: getAutomationModel(),
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens ?? 6000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    };
    if (options.jsonSchema) {
      requestBody.response_format = {
        type: 'json_schema',
        json_schema: options.jsonSchema,
      };
    }
    try {
      recordOutboundRequest(PERPLEXITY_API_URL, 1);
    } catch (_) {}
    const res = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `http_${res.status}:${errText.slice(0, 500)}` };
    }
    const json = await res.json();
    const text = String(json.choices?.[0]?.message?.content || '').trim();
    if (!text) return { ok: false, error: 'empty_response' };
    let parsed;
    try {
      parsed = parseModelJson(text);
    } catch (parseErr) {
      const repaired = await repairModelJson(text, options.timeoutMs || 90000);
      if (!repaired.ok) return { ok: false, error: parseErr.message || 'invalid_json' };
      parsed = repaired.parsed;
    }
    return { ok: true, parsed };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e.message || 'perplexity_error' };
  }
}

async function repairModelJson(rawText, timeoutMs) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'missing_perplexity_key' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs || 90000, 45000));
  try {
    try {
      recordOutboundRequest(PERPLEXITY_API_URL, 1);
    } catch (_) {}
    const res = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: 0,
        max_tokens: 6000,
        messages: [
          {
            role: 'system',
            content:
              'Repair malformed JSON. Return valid JSON only. Preserve the original data and field names as closely as possible. Do not add commentary.',
          },
          {
            role: 'user',
            content: rawText,
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const json = await res.json();
    const text = String(json.choices?.[0]?.message?.content || '').trim();
    if (!text) return { ok: false, error: 'empty_repair_response' };
    return { ok: true, parsed: parseModelJson(text) };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.message || 'repair_failed' };
  }
}

function parseModelJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*|\s*```$/g, '').trim();
  const extractBalancedObject = (input) => {
    const start = input.indexOf('{');
    if (start < 0) return input;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return input.slice(start, i + 1);
      }
    }
    return input;
  };
  const attempts = [
    cleaned,
    cleaned.replace(/,\s*([}\]])/g, '$1'),
    extractBalancedObject(cleaned),
    extractBalancedObject(cleaned).replace(/,\s*([}\]])/g, '$1'),
  ];
  let lastError = null;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('invalid_json');
}

function renderCategoryDailyBrief({ title, parsed, runDate, timeZone }) {
  const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(runDate);
  const lines = [];
  lines.push(String(title || '').trim());
  lines.push('');
  lines.push(String(dayLabel || '').trim());
  lines.push('');
  lines.push(String(parsed.opening || '').trim());
  lines.push('');
  lines.push('GLOBAL GEOPOLITICAL ENVIRONMENT');
  lines.push('');
  lines.push(String(parsed.globalGeopoliticalEnvironment || '').trim());
  lines.push('');
  lines.push(`MACRO BACKDROP GOING INTO ${dayLabel.toUpperCase()}`);
  lines.push('');
  lines.push(String(parsed.macroBackdrop || '').trim());
  lines.push('');
  lines.push('MARKET THEMES DOMINATING TODAY');
  lines.push('');
  lines.push(String(parsed.marketThemes || '').trim());
  lines.push('');
  const assets = Array.isArray(parsed.assetAnalyses) ? parsed.assetAnalyses : [];
  for (const asset of assets) {
    lines.push(`${String(asset.heading || asset.label || asset.symbol || 'ASSET').trim().toUpperCase()} ANALYSIS`);
    lines.push('');
    lines.push(String(asset.fundamentalView || '').trim());
    lines.push('');
    lines.push(String(asset.technicalView || '').trim());
    lines.push('');
    lines.push('Key technical observations:');
    const observations = Array.isArray(asset.keyTechnicalObservations) ? asset.keyTechnicalObservations : [];
    observations.forEach((item) => lines.push(String(item || '').trim()));
    lines.push('');
    lines.push('Session bias:');
    lines.push(`Asia: ${String(asset.sessionBias?.asia || '').trim()}`);
    lines.push(`London: ${String(asset.sessionBias?.london || '').trim()}`);
    lines.push(`New York: ${String(asset.sessionBias?.newYork || '').trim()}`);
    lines.push(`Overall bias: ${String(asset.overallBias || '').trim()}`);
    lines.push('');
  }
  lines.push('OVERALL DAILY STRUCTURE');
  lines.push('');
  lines.push(String(parsed.overallDailyStructure || '').trim());
  lines.push('');
  lines.push('By AURA TERMINAL');
  return stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
}

function renderCategoryWeeklyBrief({ title, parsed }) {
  const lines = [];
  lines.push(String(title || '').trim());
  lines.push('');
  lines.push('Overview');
  lines.push('');
  lines.push(String(parsed.overview || '').trim());
  lines.push('');
  lines.push(`SUMMARY FOR LAST WEEK (${String(parsed.previousWeekLabel || '').trim()})`);
  lines.push('');
  lines.push(String(parsed.summaryForLastWeek || '').trim());
  lines.push('');
  const howAssets = Array.isArray(parsed.assetPerformance) ? parsed.assetPerformance : [];
  for (const asset of howAssets) {
    lines.push(`HOW ${String(asset.heading || asset.label || asset.symbol || 'ASSET').trim().toUpperCase()} PERFORMED & WHY`);
    lines.push('');
    lines.push(String(asset.body || '').trim());
    lines.push('');
  }
  lines.push('WHAT MATTERS THIS WEEK STRUCTURALLY');
  lines.push('');
  lines.push(String(parsed.structuralWeeklyDrivers || '').trim());
  lines.push('');
  lines.push('MONDAY & TUESDAY');
  lines.push('');
  lines.push(String(parsed.mondayTuesdayFocus || '').trim());
  lines.push('');
  lines.push('WEDNESDAY');
  lines.push('');
  lines.push(String(parsed.wednesdayFocus || '').trim());
  lines.push('');
  lines.push('THURSDAY & FRIDAY');
  lines.push('');
  lines.push(String(parsed.thursdayFridayFocus || '').trim());
  lines.push('');
  const outlooks = Array.isArray(parsed.assetOutlooks) ? parsed.assetOutlooks : [];
  for (const asset of outlooks) {
    lines.push(`${String(asset.heading || asset.label || asset.symbol || 'ASSET').trim().toUpperCase()} OUTLOOK THIS WEEK`);
    lines.push('');
    lines.push(String(asset.body || '').trim());
    lines.push('');
  }
  lines.push('WEEK CONCLUSION');
  lines.push('');
  lines.push(String(parsed.weekConclusion || '').trim());
  lines.push('');
  lines.push('SESSION-BY-SESSION WATCH');
  lines.push('');
  lines.push(`Asia: ${String(parsed.sessionWatch?.asia || '').trim()}`);
  lines.push(`London: ${String(parsed.sessionWatch?.london || '').trim()}`);
  lines.push(`New York: ${String(parsed.sessionWatch?.newYork || '').trim()}`);
  lines.push('');
  lines.push('KEY SCENARIOS');
  lines.push('');
  const scenarios = Array.isArray(parsed.keyScenarios) ? parsed.keyScenarios : [];
  scenarios.forEach((s) => lines.push(String(s || '').trim()));
  lines.push('');
  lines.push('By AURA TERMINAL');
  return stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
}

function buildDailySampleJsonSchema() {
  return {
    schema: {
      type: 'object',
      properties: {
        opening: { type: 'string' },
        globalGeopoliticalEnvironment: { type: 'string' },
        macroBackdrop: { type: 'string' },
        marketThemes: {
          anyOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
        assetAnalyses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              instrument: { type: 'string' },
              heading: { type: 'string' },
              label: { type: 'string' },
              fundamentalView: { type: 'string' },
              fundamentalMacro: { type: 'string' },
              macroView: { type: 'string' },
              technicalView: { type: 'string' },
              technicalStructure: { type: 'string' },
              keyTechnicalObservations: { type: 'array', items: { type: 'string' } },
              sessionBias: {
                anyOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    properties: {
                      asia: { type: 'string' },
                      london: { type: 'string' },
                      newYork: { type: 'string' },
                    },
                  },
                ],
              },
              overallBias: { type: 'string' },
            },
            required: ['heading', 'overallBias'],
          },
        },
        overallDailyStructure: { type: 'string' },
      },
      required: [
        'opening',
        'globalGeopoliticalEnvironment',
        'macroBackdrop',
        'marketThemes',
        'assetAnalyses',
        'overallDailyStructure',
      ],
    },
  };
}

function buildWeeklySampleJsonSchema() {
  return {
    schema: {
      type: 'object',
      properties: {
        overview: { type: 'string' },
        previousWeekLabel: { type: 'string' },
        summaryForLastWeek: { type: 'string' },
        assetPerformance: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              instrument: { type: 'string' },
              heading: { type: 'string' },
              label: { type: 'string' },
              body: { type: 'string' },
              summary: { type: 'string' },
              analysis: { type: 'string' },
            },
            required: ['heading'],
          },
        },
        structuralWeeklyDrivers: { type: 'string' },
        mondayTuesdayFocus: { type: 'string' },
        wednesdayFocus: { type: 'string' },
        thursdayFridayFocus: { type: 'string' },
        assetOutlooks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              instrument: { type: 'string' },
              heading: { type: 'string' },
              label: { type: 'string' },
              body: { type: 'string' },
              summary: { type: 'string' },
              analysis: { type: 'string' },
            },
            required: ['heading'],
          },
        },
        weekConclusion: { type: 'string' },
        sessionWatch: {
          anyOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                asia: { type: 'string' },
                london: { type: 'string' },
                newYork: { type: 'string' },
              },
            },
          ],
        },
        keyScenarios: {
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  label: { type: 'string' },
                  name: { type: 'string' },
                  condition: { type: 'string' },
                  outcome: { type: 'string' },
                  implication: { type: 'string' },
                },
              },
            ],
          },
        },
      },
      required: [
        'overview',
        'previousWeekLabel',
        'summaryForLastWeek',
        'assetPerformance',
        'structuralWeeklyDrivers',
        'mondayTuesdayFocus',
        'wednesdayFocus',
        'thursdayFridayFocus',
        'assetOutlooks',
        'weekConclusion',
        'sessionWatch',
        'keyScenarios',
      ],
    },
  };
}

function cleanInlineFormatting(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseSessionBias(value) {
  if (value && typeof value === 'object') {
    return {
      asia: cleanInlineFormatting(value.asia || ''),
      london: cleanInlineFormatting(value.london || ''),
      newYork: cleanInlineFormatting(value.newYork || value.newyork || ''),
    };
  }
  const text = cleanInlineFormatting(value || '');
  const pick = (label, fallback = '') => {
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(?:Asia|London|New York)\\s*:|$)`, 'i');
    const match = text.match(re);
    return cleanInlineFormatting(match?.[1] || fallback);
  };
  return {
    asia: pick('Asia'),
    london: pick('London'),
    newYork: pick('New York'),
  };
}

function deriveObservationBullets(asset) {
  const source = [
    cleanInlineFormatting(asset?.technicalView || asset?.technicalStructure || ''),
    cleanInlineFormatting(asset?.fundamentalView || asset?.fundamentalMacro || ''),
  ].filter(Boolean).join(' ');
  return source
    .split(/(?<=[.!?])\s+/)
    .map((x) => cleanInlineFormatting(x))
    .filter((x) => x.length >= 35)
    .slice(0, 4);
}

function normalizeDailyStructuredParsed(parsed) {
  const assets = Array.isArray(parsed?.assetAnalyses) ? parsed.assetAnalyses : [];
  return {
    opening: cleanInlineFormatting(parsed?.opening || ''),
    globalGeopoliticalEnvironment: cleanInlineFormatting(parsed?.globalGeopoliticalEnvironment || ''),
    macroBackdrop: cleanInlineFormatting(parsed?.macroBackdrop || ''),
    marketThemes: Array.isArray(parsed?.marketThemes)
      ? parsed.marketThemes.map((x) => cleanInlineFormatting(x)).filter(Boolean)
      : cleanInlineFormatting(parsed?.marketThemes || ''),
    assetAnalyses: assets.map((asset) => {
      const normalized = {
        symbol: cleanInlineFormatting(asset?.symbol || asset?.instrument || asset?.label || ''),
        heading: cleanInlineFormatting(asset?.heading || asset?.symbol || asset?.instrument || asset?.label || ''),
        fundamentalView: cleanInlineFormatting(asset?.fundamentalView || asset?.fundamentalMacro || asset?.macroView || ''),
        technicalView: cleanInlineFormatting(asset?.technicalView || asset?.technicalStructure || ''),
        keyTechnicalObservations: Array.isArray(asset?.keyTechnicalObservations)
          ? asset.keyTechnicalObservations.map((x) => cleanInlineFormatting(x)).filter(Boolean)
          : [],
        sessionBias: parseSessionBias(asset?.sessionBias),
        overallBias: cleanInlineFormatting(asset?.overallBias || ''),
      };
      if (normalized.keyTechnicalObservations.length === 0) {
        normalized.keyTechnicalObservations = deriveObservationBullets({
          technicalView: normalized.technicalView,
          fundamentalView: normalized.fundamentalView,
        });
      }
      return normalized;
    }),
    overallDailyStructure: cleanInlineFormatting(parsed?.overallDailyStructure || ''),
  };
}

function normalizeWeeklyStructuredParsed(parsed) {
  const normalizeScenario = (scenario) => {
    if (typeof scenario === 'string') return cleanInlineFormatting(scenario);
    if (scenario && typeof scenario === 'object') {
      return [
        scenario.title || scenario.label || scenario.name,
        scenario.condition ? `Condition: ${scenario.condition}` : '',
        scenario.outcome ? `Outcome: ${scenario.outcome}` : '',
        scenario.implication ? `Implication: ${scenario.implication}` : '',
      ].filter(Boolean).map(cleanInlineFormatting).join(' - ');
    }
    return '';
  };
  const normalizeAssetBlock = (asset) => ({
    symbol: cleanInlineFormatting(asset?.symbol || asset?.instrument || asset?.label || ''),
    heading: cleanInlineFormatting(asset?.heading || asset?.symbol || asset?.instrument || asset?.label || ''),
    body: cleanInlineFormatting(asset?.body || asset?.summary || asset?.analysis || ''),
  });
  return {
    overview: cleanInlineFormatting(parsed?.overview || ''),
    previousWeekLabel: cleanInlineFormatting(parsed?.previousWeekLabel || ''),
    summaryForLastWeek: cleanInlineFormatting(parsed?.summaryForLastWeek || ''),
    assetPerformance: (Array.isArray(parsed?.assetPerformance) ? parsed.assetPerformance : []).map(normalizeAssetBlock),
    structuralWeeklyDrivers: cleanInlineFormatting(parsed?.structuralWeeklyDrivers || ''),
    mondayTuesdayFocus: cleanInlineFormatting(parsed?.mondayTuesdayFocus || ''),
    wednesdayFocus: cleanInlineFormatting(parsed?.wednesdayFocus || ''),
    thursdayFridayFocus: cleanInlineFormatting(parsed?.thursdayFridayFocus || ''),
    assetOutlooks: (Array.isArray(parsed?.assetOutlooks) ? parsed.assetOutlooks : []).map(normalizeAssetBlock),
    weekConclusion: cleanInlineFormatting(parsed?.weekConclusion || ''),
    sessionWatch: parseSessionBias(parsed?.sessionWatch),
    keyScenarios: Array.isArray(parsed?.keyScenarios)
      ? parsed.keyScenarios.map((x) => normalizeScenario(x)).filter(Boolean)
      : [],
  };
}

function validateSampleStructuredBrief(period, parsed, expectedAssets = []) {
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['missing_parsed'] };
  if (period === 'daily') {
    if (String(parsed.opening || '').trim().length < 250) reasons.push('daily_opening_thin');
    if (String(parsed.globalGeopoliticalEnvironment || '').trim().length < 180) reasons.push('daily_geo_thin');
    if (String(parsed.macroBackdrop || '').trim().length < 160) reasons.push('daily_macro_thin');
    if (String(parsed.marketThemes || '').trim().length < 160) reasons.push('daily_themes_thin');
    if (String(parsed.overallDailyStructure || '').trim().length < 180) reasons.push('daily_conclusion_thin');
    const assets = Array.isArray(parsed.assetAnalyses) ? parsed.assetAnalyses : [];
    if (assets.length < Math.min(4, expectedAssets.length)) reasons.push(`daily_assets_${assets.length}`);
    for (const asset of assets) {
      if (String(asset.fundamentalView || '').trim().length < 120) reasons.push(`daily_asset_fundamental_${asset.symbol || 'x'}`);
      if (String(asset.technicalView || '').trim().length < 100) reasons.push(`daily_asset_technical_${asset.symbol || 'x'}`);
      if (!Array.isArray(asset.keyTechnicalObservations) || asset.keyTechnicalObservations.length < 3) reasons.push(`daily_asset_obs_${asset.symbol || 'x'}`);
      if (!asset.sessionBias || !asset.sessionBias.asia || !asset.sessionBias.london || !asset.sessionBias.newYork) reasons.push(`daily_asset_sessions_${asset.symbol || 'x'}`);
    }
  } else {
    if (String(parsed.overview || '').trim().length < 220) reasons.push('weekly_overview_thin');
    if (String(parsed.summaryForLastWeek || '').trim().length < 220) reasons.push('weekly_summary_thin');
    if (String(parsed.structuralWeeklyDrivers || '').trim().length < 180) reasons.push('weekly_structural_thin');
    if (String(parsed.mondayTuesdayFocus || '').trim().length < 120) reasons.push('weekly_mon_tue_thin');
    if (String(parsed.wednesdayFocus || '').trim().length < 100) reasons.push('weekly_wed_thin');
    if (String(parsed.thursdayFridayFocus || '').trim().length < 120) reasons.push('weekly_thu_fri_thin');
    if (String(parsed.weekConclusion || '').trim().length < 220) reasons.push('weekly_conclusion_thin');
    const assets1 = Array.isArray(parsed.assetPerformance) ? parsed.assetPerformance : [];
    const assets2 = Array.isArray(parsed.assetOutlooks) ? parsed.assetOutlooks : [];
    if (assets1.length < Math.min(4, expectedAssets.length)) reasons.push(`weekly_perf_assets_${assets1.length}`);
    if (assets2.length < Math.min(4, expectedAssets.length)) reasons.push(`weekly_outlook_assets_${assets2.length}`);
    if (!parsed.sessionWatch?.asia || !parsed.sessionWatch?.london || !parsed.sessionWatch?.newYork) reasons.push('weekly_session_watch_missing');
    if (!Array.isArray(parsed.keyScenarios) || parsed.keyScenarios.length < 2) reasons.push('weekly_scenarios_missing');
  }
  return { ok: reasons.length === 0, reasons };
}

function validateRenderedSampleBody(body, period, expectedAssets = []) {
  const reasons = [];
  const text = String(body || '');
  const headingChecks = period === 'daily'
    ? [
      /^## GLOBAL GEOPOLITICAL ENVIRONMENT$/m,
      /^## MARKET THEMES DOMINATING TODAY$/m,
      /^## OVERALL DAILY STRUCTURE$/m,
    ]
    : [
      /^## Overview$/m,
      /^## WHAT MATTERS THIS WEEK STRUCTURALLY$/m,
      /^## WEEK CONCLUSION$/m,
      /^## KEY SCENARIOS$/m,
    ];
  headingChecks.forEach((re, idx) => {
    if (!re.test(text)) reasons.push(`missing_heading_${period}_${idx + 1}`);
  });
  const assetHeadingCount = (text.match(/^## .*?(ANALYSIS|OUTLOOK THIS WEEK|PERFORMED & WHY)$/gm) || []).length;
  if (assetHeadingCount < Math.min(4, expectedAssets.length)) {
    reasons.push(`asset_heading_count_${assetHeadingCount}`);
  }
  return { ok: reasons.length === 0, reasons };
}

async function generateSampleMatchedCategoryBrief({
  period,
  factPack,
  briefKind,
  runDate,
  timeZone,
  priorBodies = [],
  existingExcerpts = [],
  weeklyReference = null,
}) {
  const normalizedPeriod = normalizePeriod(period);
  const normalizedKind = normalizeBriefKind(briefKind);
  const expectedAssets = Array.isArray(factPack.topInstruments) ? factPack.topInstruments.slice(0, 5) : [];
  const dayName = weekdayName(runDate, timeZone);
  const dataContextRule = factPack.llmDataSupplement
    ? `${STRUCTURED_DATA_FIRST_RULE} llmDataSupplement is approximate backup when REST feeds were thin—prefer agreement with liveQuotes/headlines; never override missing pack fields with invented figures. No URLs or citations.`
    : `${STRUCTURED_DATA_FIRST_RULE} No URLs or citations.`;
  const deskDateYmd = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const basePayload = {
    briefKind: normalizedKind,
    briefKindLabel: factPack.briefKindLabel,
    period: normalizedPeriod,
    deskDate: deskDateYmd,
    contextQuality: factPack.contextQuality || null,
    periodMandate: factPack.periodMandate,
    categoryLogicRule: CATEGORY_LOGIC_RULES[normalizedKind] || CATEGORY_LOGIC_RULES.stocks,
    instrumentScores: Array.isArray(factPack.instrumentScores) ? factPack.instrumentScores.slice(0, 5) : [],
    dayName,
    topInstruments: expectedAssets,
    factPack: {
      marketRegime: factPack.marketRegime,
      marketPulse: factPack.marketPulse,
      macroSummary: factPack.macroSummary,
      keyDrivers: factPack.keyDrivers,
      crossAssetSignals: factPack.crossAssetSignals,
      traderFocus: factPack.traderFocus,
      riskRadar: factPack.riskRadar,
      headlines: factPack.headlines,
      calendar: factPack.calendar,
      liveQuotes: factPack.liveQuotes,
      symbolHeadlines: factPack.symbolHeadlines,
      categoryWritingMandate: factPack.categoryWritingMandate,
      categoryIntelligenceDirective: factPack.categoryIntelligenceDirective,
      llmDataSupplement: factPack.llmDataSupplement || null,
    },
    weeklyReference,
    priorCategoryExcerpts: existingExcerpts.slice(0, 8),
    priorCategoryBodies: priorBodies.slice(0, 4).map((x) => String(x).slice(0, 1200)),
    rules: {
      noDuplicatePhrasingAcrossBriefs: true,
      noCopyPasteAcrossCategories: true,
      keepInstitutionalTone: true,
      retailFriendlyClarity: true,
      alignWithWeeklyThesisUnlessMajorNewsOverrides: true,
      explainWeeklyOverrideIfNeeded: true,
    },
  };

  const systemPrompt = normalizedPeriod === 'daily'
    ? `You are an institutional cross-asset strategist writing a DAILY BRIEF for one trading category only.
Match this exact shape and density:
1. Day opening
2. GLOBAL GEOPOLITICAL ENVIRONMENT
3. MACRO BACKDROP GOING INTO ${dayName.toUpperCase()}
4. MARKET THEMES DOMINATING TODAY
5. repeated [ASSET] ANALYSIS sections
6. OVERALL DAILY STRUCTURE

Each asset section must include:
- a fundamental/macro explanation
- a technical structure paragraph
- key technical observations as short lines
- session bias for Asia, London, New York
- one overall bias

Hard rules:
- ${dataContextRule}
- Do not copy phrases from priorCategoryExcerpts.
- The thesis for this category must be distinct from the other category briefs.
- Keep the style like a professional trader note that an informed retail trader can follow.
- Each assetAnalyses item MUST include non-empty keys: symbol, heading, fundamentalView, technicalView, keyTechnicalObservations (3-6 items), sessionBias {asia,london,newYork}, overallBias.
- Do not leave any asset field blank.
- Return JSON only with keys: opening, globalGeopoliticalEnvironment, macroBackdrop, marketThemes, assetAnalyses, overallDailyStructure.`
    : `You are an institutional cross-asset strategist writing a WEEKLY FUNDAMENTAL ANALYSIS for one trading category only.
Match this exact shape and density:
1. Overview
2. Summary for last week
3. repeated HOW [ASSET] PERFORMED & WHY sections
4. What matters this week structurally
5. Monday & Tuesday
6. Wednesday
7. Thursday & Friday
8. repeated [ASSET] Outlook This Week sections
9. Week Conclusion
10. Session-by-Session Watch
11. Key Scenarios

Hard rules:
- Analyze the NEW week, not the previous template.
- ${dataContextRule}
- Use weeklyReference only as alignment context, not as text to paraphrase.
- No duplicated phrasing from priorCategoryExcerpts.
- Each category must have its own thesis and transmission channel.
- Every asset block must include non-empty heading/body fields.
- Return JSON only with keys: overview, previousWeekLabel, summaryForLastWeek, assetPerformance, structuralWeeklyDrivers, mondayTuesdayFocus, wednesdayFocus, thursdayFridayFocus, assetOutlooks, weekConclusion, sessionWatch, keyScenarios.`;

  const fetchStructured = async (payload) => callPerplexityJson(systemPrompt, payload, {
    maxTokens: normalizedPeriod === 'daily' ? 7000 : 7500,
    temperature: 0.42,
    timeoutMs: normalizedPeriod === 'daily' ? 90000 : 180000,
    jsonSchema: normalizedPeriod === 'daily' ? buildDailySampleJsonSchema() : buildWeeklySampleJsonSchema(),
  });
  let ai = await fetchStructured(basePayload);
  if (!ai.ok || !ai.parsed) return { ok: false, error: ai.error || 'generation_failed' };
  const normalizedParsed = normalizedPeriod === 'daily'
    ? normalizeDailyStructuredParsed(ai.parsed)
    : normalizeWeeklyStructuredParsed(ai.parsed);
  let validation = validateSampleStructuredBrief(normalizedPeriod, normalizedParsed, expectedAssets);
  let parsedForUse = normalizedParsed;
  if (!validation.ok) {
    const retryPayload = {
      ...basePayload,
      validationFeedback: validation.reasons,
      previousAttempt: parsedForUse,
      rewriteInstruction:
        'Rewrite the same brief structure, but fix every missing or thin field called out in validationFeedback. Keep the same market facts from the pack, but make each asset block complete and non-empty. Do not invent prices, levels, or percentages not present in liveQuotes, symbolHeadlines, headlines, or llmDataSupplement.',
    };
    const retry = await fetchStructured(retryPayload);
    if (retry.ok && retry.parsed) {
      parsedForUse = normalizedPeriod === 'daily'
        ? normalizeDailyStructuredParsed(retry.parsed)
        : normalizeWeeklyStructuredParsed(retry.parsed);
      validation = validateSampleStructuredBrief(normalizedPeriod, parsedForUse, expectedAssets);
    }
  }
  if (!validation.ok) return { ok: false, error: validation.reasons.join(','), parsed: parsedForUse };
  const title = normalizedPeriod === 'daily'
    ? formatDailySampleTitle(deskDateYmd, timeZone)
    : formatWeeklySampleTitle(deskDateYmd, timeZone);
  const body = normalizedPeriod === 'daily'
    ? renderCategoryDailyBrief({ title, parsed: parsedForUse, runDate, timeZone })
    : renderCategoryWeeklyBrief({ title, parsed: parsedForUse });
  const renderedValidation = validateRenderedSampleBody(body, normalizedPeriod, expectedAssets);
  if (!renderedValidation.ok) return { ok: false, error: renderedValidation.reasons.join(','), parsed: parsedForUse, body };
  return {
    ok: true,
    title: `${BRIEF_KIND_LABELS[normalizedKind]} - ${title}`,
    body,
    parsed: parsedForUse,
    validation: {
      ok: true,
      reasons: [],
      structured: validation,
      rendered: renderedValidation,
    },
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

  const minBody = 350;
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
    contextQuality: factPack.contextQuality || null,
    macroSummary: factPack.macroSummary || [],
    keyDrivers: factPack.keyDrivers || [],
    crossAssetSignals: factPack.crossAssetSignals || [],
    traderFocus: factPack.traderFocus || [],
    riskRadar: factPack.riskRadar || [],
    calendar: factPack.calendar || [],
    headlines: factPack.headlines || [],
    liveQuotes: (factPack.liveQuotes || []).slice(0, 5),
    symbolHeadlines: factPack.symbolHeadlines && typeof factPack.symbolHeadlines === 'object' ? factPack.symbolHeadlines : {},
    instrumentScores: Array.isArray(factPack.instrumentScores) ? factPack.instrumentScores.slice(0, 5) : [],
    marketRegime: factPack.marketRegime,
    marketPulse: factPack.marketPulse,
    bannedPhrases: factPack.bannedPhrases || BANNED_PHRASES,
    categoryLogicRule: CATEGORY_LOGIC_RULES[factPack.briefKind] || CATEGORY_LOGIC_RULES.stocks,
    llmDataSupplement: factPack.llmDataSupplement || null,
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
    key_drivers: `${label}: real drivers this window: ${drivers || 'Monitor calendar and flow; avoid generic lists.'}`,
    market_behaviour: `${label} tape: ${pulse ? `${pulse} tone.` : 'Two-way liquidity.'} ${factPack.traderFocus?.length ? `Focus: ${normaliseArray(factPack.traderFocus.map((x) => (typeof x === 'string' ? x : x.title || ''))).slice(0, 3).join(' · ')}.` : ''}`,
    what_matters_next: `${label}: next catalysts: ${cal || 'Use calendar rows in the pack for timing; name specific releases.'} ${quotes ? `Context: ${quotes.slice(0, 180)}.` : ''}`,
    trader_takeaway: `${label} takeaway: lean with ${drivers ? drivers.split(' · ')[0] : 'the dominant macro pulse'}; reassess if the tape contradicts that read. ${quotes ? `Lead context: ${quotes.split(' · ')[0] || 'from spot snapshot'}.` : ''}`,
    weekly_overview: `Weekly ${label}: ${drivers ? drivers.slice(0, 280) : baseCtx} ${cross ? `Cross-asset: ${cross.slice(0, 200)}.` : ''}`,
    macro_theme: `Macro theme for ${label}: ${drivers || cross || 'Policy, growth, and inflation path.'}`,
    cross_asset_breakdown: `${label} weekly cross-asset: ${cross || 'Leadership vs laggards across linked markets.'}`,
    structural_shift: `${label} structure: ${pulse || 'No single dominant break'}; ${drivers ? `Watch ${drivers.slice(0, 200)}` : 'track breadth and correlation.'}.`,
    key_events_recap: `Week in ${label}: ${cal || 'Key prints in calendar above.'} ${drivers ? `Drivers: ${drivers.slice(0, 240)}.` : ''}`,
    forward_outlook: `Forward for ${label}: ${cal ? `Next focus: ${cal}.` : 'Event path from calendar.'} ${cross ? cross.slice(0, 200) : ''}`,
    strategic_takeaway: `Strategic stance for ${label}: ${drivers ? drivers.split(' · ')[0] : 'Stay with confirmed macro'}; risk scales with event density.`,
  };
  return String(map[sectionKey] || `${label}: ${heading}: ${drivers || pulse || quotes || 'Desk context from fact pack.'}`).trim();
}

async function generateSingleSectionOpenAI(sectionKey, heading, factPack, priorSectionBodies, options = {}) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
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

  const hasLlmSup = Boolean(factPack.llmDataSupplement);
  const userPayload = {
    sectionKey,
    displayHeading: heading,
    sectionPurpose: rules.purpose,
    sectionRules: rules.rules,
    categoryAngle: angle,
    factPack: slimFactPackForSections(factPack),
    priorSectionsInThisBrief: priorHint,
    otherCategoriesThisRun: excerptBlock,
    outputContract:
      'Return JSON only: {"body":"string"} — one prose section, 2–5 short paragraphs max, plain prose only. '
      + 'Inside body: use sentence case (never ALL CAPS). No asterisks, no hyphen bullets, no em/en dashes as separators (use commas and periods). '
      + 'No markdown headings inside body.',
    bannedSubstrings: factPack.bannedPhrases || BANNED_PHRASES,
    rewriteNote:
      uniquenessRetry || validationFix
        ? hasLlmSup
          ? 'Prior attempt failed validation: change wording; use factPack plus llmDataSupplement when needed — still no URLs.'
          : 'Prior attempt failed validation: change wording and openings; keep facts from factPack only.'
        : null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    try {
      recordOutboundRequest(PERPLEXITY_API_URL, 1);
    } catch (_) {}
    const res = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: uniquenessRetry || validationFix ? 0.42 : 0.22,
        max_tokens: 1400,
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
              + STRUCTURED_DATA_FIRST_RULE
              + ' If factPack.llmDataSupplement is non-null, it is backup desk synthesis when live price feeds were thin — use it only together with factPack; prefer agreement with liveQuotes/headlines when both exist. '
              + 'Obey bannedSubstrings exactly (no substring matches in body). '
              + 'Typography: sentence case only in body; never ALL CAPS blocks. Do not use *, -, —, or – as punctuation or bullets; use commas and full stops. '
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

function fallbackGenerated(factPack, template, deskYmd, timeZone) {
  const keys = getStructureKeys(factPack.period);
  const renderedSections = keys.map((key) => ({
    key,
    heading: SECTION_HEADINGS[key] || key,
    body: fallbackSectionBodyByKey(key, SECTION_HEADINGS[key], factPack),
  }));
  const baseTitle = computeTitle(template, deskYmd, timeZone);
  return {
    title: baseTitle,
    sections: renderedSections,
    instrumentNotes: [],
    riskRadar: [],
    playbook: [],
  };
}

function renderBriefText({ title, period, date, generated, template, briefKind = 'stocks', topInstruments = [] }) {
  const normalizedKind = normalizeBriefKind(briefKind);
  const label = BRIEF_KIND_LABELS[normalizedKind] || BRIEF_KIND_LABELS.stocks;
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(
    `Desk period ${period}, calendar date ${date}. Category focus: ${label}.`
  );
  lines.push('');

  const sections = Array.isArray(generated.sections) ? generated.sections : [];
  for (const sec of sections) {
    const heading = String(sec.heading || 'Section').trim() || 'Section';
    lines.push(`## ${heading.toUpperCase()}`);
    lines.push('');
    lines.push(stripSources(sec.body || ''));
    lines.push('');
  }

  const riskRadar = normaliseArray(generated.riskRadar);
  if (riskRadar.length > 0) {
    lines.push('## RISK RADAR');
    lines.push('');
    riskRadar.slice(0, 8).forEach((r, idx) => {
      lines.push(`${idx + 1}. ${stripSources(r)}`);
    });
    lines.push('');
  }

  const playbook = normaliseArray(generated.playbook);
  if (playbook.length > 0) {
    lines.push('## PLAYBOOK');
    lines.push('');
    playbook.slice(0, 8).forEach((p, idx) => {
      lines.push(`${idx + 1}. ${stripSources(p)}`);
    });
    lines.push('');
  }

  let body = stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
  body = polishBriefMarkdown(body);
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
  /** Serverless runs can die mid-category; recover stuck `started` locks sooner than old 45m default. */
  const RUN_STALE_MINUTES = 20;

  try {
    const [existing] = await executeQuery(
      `SELECT status, brief_id, updated_at
       FROM trader_deck_brief_runs
       WHERE run_key = ?
       LIMIT 1`,
      [runKey]
    );
    if (existing && existing[0]) {
      const row = existing[0];
      const status = String(row.status || '').toLowerCase();
      const updatedAtMs = new Date(row.updated_at || 0).getTime();
      const ageMs = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs : Number.POSITIVE_INFINITY;
      const isStaleStarted = status === 'started' && ageMs > RUN_STALE_MINUTES * 60 * 1000;
      const briefId = Number(row.brief_id || 0);

      if (status === 'success' && briefId > 0) {
        // If a "success" lock points to a deleted/missing brief row, allow regeneration.
        const [briefRows] = await executeQuery(
          'SELECT id FROM trader_deck_briefs WHERE id = ? LIMIT 1',
          [briefId]
        );
        if (!briefRows?.[0]?.id) {
          await executeQuery(
            `UPDATE trader_deck_brief_runs
             SET status = 'started', brief_id = NULL, error_message = 'recovered_missing_brief_row', updated_at = CURRENT_TIMESTAMP
             WHERE run_key = ?`,
            [runKey]
          );
          return true;
        }
      }

      if (status === 'failed') {
        await executeQuery(
          `UPDATE trader_deck_brief_runs
           SET status = 'started', error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE run_key = ?`,
          [runKey]
        );
        return true;
      }
      if (isStaleStarted) {
        await executeQuery(
          `UPDATE trader_deck_brief_runs
           SET status = 'started', error_message = 'recovered_stale_started_lock', updated_at = CURRENT_TIMESTAMP
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

async function publishAutoBrief({
  period,
  date,
  title,
  body,
  briefKind = 'stocks',
  generationMeta = null,
  mimeType = 'text/plain; charset=utf-8',
}) {
  const safeTitle = String(title || 'Market Brief').slice(0, 255);
  const normalizedKind = normalizeBriefKind(briefKind);
  const safeMime = String(mimeType || 'text/plain; charset=utf-8').slice(0, 128);
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
       SET title = ?, file_data = ?, mime_type = ?, brief_version = ?, generation_meta = ?
       WHERE id = ?`,
      [safeTitle, Buffer.from(body, 'utf8'), safeMime, nextV, metaJson, row.id]
    );
    return { insertId: row.id, briefVersion: nextV };
  }
  const briefVersion = 1;
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version, generation_meta)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    [date, period, safeTitle, safeMime, Buffer.from(body, 'utf8'), normalizedKind, briefVersion, metaJson]
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
  const briefVersion = await getNextBriefVersion({ period: normalizedPeriod, date: safeDate, briefKind: 'stocks' });
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, 'stocks', ?)`,
    [safeDate, normalizedPeriod, safeTitle, Buffer.from(String(body || ''), 'utf8'), briefVersion]
  );
  return result.insertId;
}

function computeTitle(template, deskYmd, timeZone) {
  const pattern = String(template?.titlePattern || '').trim() || 'Market Brief - {dateLong}';
  const mid = jsDateFromDeskYmd(deskYmd, timeZone);
  const usesWeekday = pattern.includes('{weekday}');
  const dateLongFormatted = usesWeekday ? dateLongNoWeekday(mid, timeZone) : dateLong(mid, timeZone);
  let out = pattern
    .replace('{weekday}', weekdayName(mid, timeZone))
    .replace('{dateLong}', dateLongFormatted)
    .replace('{weekRange}', deskWeekMonFriRangeLabel(deskYmd, timeZone));
  // Legacy DB templates: {dateLong} may still include a weekday, duplicating {weekday} (e.g. "Monday Monday, 13 April…").
  out = out.replace(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\1\b/gi,
    '$1',
  );
  return out;
}

async function generateAndStoreBrief({
  period,
  briefKind = 'stocks',
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

  let reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    try {
      const [be] = await executeQuery(
        `SELECT id FROM trader_deck_briefs WHERE date = ? AND period = ? AND brief_kind = ? LIMIT 1`,
        [date, normalizedPeriod, normalizedKind]
      );
      if (be?.[0]?.id) {
        return {
          success: true,
          skipped: true,
          reason: 'already-generated',
          runKey,
          period: normalizedPeriod,
          date,
          briefKind: normalizedKind,
        };
      }
    } catch (_) {
      /* continue recovery */
    }
    console.warn('[brief-gen] run ledger present but no brief row — resetting lock for retry', {
      runKey,
      briefKind: normalizedKind,
      date,
      period: normalizedPeriod,
    });
    try {
      await executeQuery(
        `UPDATE trader_deck_brief_runs
         SET status = 'failed', brief_id = NULL, error_message = 'reset_missing_brief_row'
         WHERE run_key = ?`,
        [runKey]
      );
    } catch (_) {
      /* ignore */
    }
    reserved = await reserveRun(runKey, normalizedPeriod, date);
    if (!reserved) {
      return {
        success: true,
        skipped: true,
        reason: 'already-generated',
        runKey,
        period: normalizedPeriod,
        date,
        briefKind: normalizedKind,
      };
    }
  }

  try {
    const template = await getTemplate(normalizedPeriod);
    let market = sharedMarket;
    let econ = sharedEcon;
    let news = sharedNews;
    if (!market || !Array.isArray(econ) || !Array.isArray(news)) {
      const shared = await getSharedBriefInputs(normalizedPeriod, date);
      market = market || shared.market;
      econ = Array.isArray(econ) ? econ : shared.econ;
      news = Array.isArray(news) ? news : shared.news;
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
    if (partialDataMode) {
      console.warn('[brief-gen] thin structured inputs before model call', {
        briefKind: normalizedKind,
        date,
        period: normalizedPeriod,
        quoteCacheSize: quoteCache.size,
        econRows: Array.isArray(econ) ? econ.length : 0,
        newsRows: Array.isArray(news) ? news.length : 0,
        contextQuality: factPack.contextQuality,
      });
    }
    let llmSup = null;
    if (generationContext?.briefSetRun) {
      llmSup = generationContext.sharedLlmDataSupplement || null;
    } else if (needsLlmDataSupplement(quoteCache, econ, news) && isTraderDeskAutomationConfigured()) {
      llmSup = await fetchLlmBriefDataSupplementGlobal({
        period: normalizedPeriod,
        dateStr: date,
        timeZone,
        market,
        econ,
        news,
        symbolSample: collectAllAutomationUniverseSymbols(),
      });
    }
    if (llmSup) factPack.llmDataSupplement = llmSup;

    const existingExcerpts = Array.isArray(generationContext?.existingExcerpts)
      ? generationContext.existingExcerpts
      : [];
    const contextBodies = Array.isArray(generationContext?.existingBodies) ? generationContext.existingBodies : [];

    let generated = null;
    let title = '';
    let body = '';
    let validation = { ok: true, reasons: [] };
    const weeklyReference = normalizedPeriod === 'daily'
      ? await getLatestWeeklyBriefExcerpt(normalizedKind, date)
      : null;

    const sampleMatch = await generateSampleMatchedCategoryBrief({
      period: normalizedPeriod,
      factPack,
      briefKind: normalizedKind,
      runDate,
      timeZone,
      priorBodies: contextBodies,
      existingExcerpts,
      weeklyReference,
    });
    if (sampleMatch.ok) {
      title = sampleMatch.title;
      body = sampleMatch.body;
      validation = {
        ok: true,
        reasons: [],
        mode: 'sample-structured',
        structuredValidation: sampleMatch.validation,
      };
    }

    if (!body) {
      generated = await generateBriefBySections(factPack, template, {
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
        generated = fallbackGenerated(factPack, template, date, timeZone);
      }
      const titleBase = stripSources(computeTitle(template, date, timeZone));
      title = `${BRIEF_KIND_LABELS[normalizedKind]} - ${titleBase}`;
      body = renderBriefText({
        title,
        period: normalizedPeriod,
        date,
        generated,
        template,
        briefKind: normalizedKind,
        topInstruments: selectedTop5,
      });
      validation = validateBriefBeforeSave({
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
    }
    const generationMeta = {
      generatedAt: new Date().toISOString(),
      topInstruments: selectedTop5,
      instrumentScores: (selection.scoreRows || []).map((r) => ({ symbol: r.symbol, score: r.score, breakdown: r.breakdown })),
      partialDataMode,
      validationOk: validation.ok,
      validationReasons: validation.ok ? [] : validation.reasons,
      generationMode: validation.mode || 'legacy-sections',
      weeklyReferenceDate: weeklyReference?.date || null,
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
    const msg = (err.message || 'generation failed').slice(0, 255);
    await finalizeRun(runKey, 'failed', null, msg);
    console.error('[brief-gen] category generation failed', {
      briefKind: normalizedKind,
      period: normalizedPeriod,
      date,
      runKey,
      error: msg,
    });
    return { success: false, runKey, date, period: normalizedPeriod, briefKind: normalizedKind, error: err.message || 'generation failed' };
  }
}

async function generateAndStoreBriefSet({
  period,
  timeZone = 'Europe/London',
  runDate = new Date(),
  /** When true (e.g. on-demand from content API), reset meter at start and log+reset at end so logs show this run only. */
  isolateOutboundMeter = false,
} = {}) {
  if (isolateOutboundMeter) resetProviderRequestMeter();
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const { market: sharedMarket, econ: sharedEcon, news: sharedNews } = await getSharedBriefInputs(normalizedPeriod, date);
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
  const thinFeeds = needsLlmDataSupplement(sharedQuoteCache, sharedEcon, sharedNews);
  let sharedLlmDataSupplement = null;
  if (thinFeeds) {
    sharedLlmDataSupplement = await fetchLlmBriefDataSupplementGlobal({
      period: normalizedPeriod,
      dateStr: date,
      timeZone,
      market: sharedMarket,
      econ: sharedEcon,
      news: sharedNews,
      symbolSample: collectAllAutomationUniverseSymbols(),
    });
    if (sharedLlmDataSupplement) {
      console.info('[brief-gen] shared LLM data supplement applied (thin REST feeds)');
    }
  }
  const results = [];
  const existingBodies = [];
  const existingExcerpts = [];
  for (const briefKind of orderedAutomatedCategoryKinds()) {
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
      generationContext: {
        existingBodies,
        existingExcerpts,
        briefSetRun: true,
        sharedLlmDataSupplement,
      },
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
  const hardFails = results.filter((r) => r && !r.success && !r.skipped);
  if (hardFails.length) {
    console.error('[brief-gen] category brief failures in set', {
      date,
      period: normalizedPeriod,
      fails: hardFails.map((r) => ({ kind: r.briefKind, error: r.error || r.message })),
    });
  }
  const payload = { success: results.some((r) => r && r.success), period: normalizedPeriod, results };
  if (isolateOutboundMeter) {
    logProviderRequestMeter('[brief-gen] generateAndStoreBriefSet outbound HTTP (isolated window)', {
      period: normalizedPeriod,
      date,
    });
    resetProviderRequestMeter();
  }
  return payload;
}

/**
 * Idempotent gap-fill: only generates kinds missing from trader_deck_briefs for the desk date.
 * Use after a partial cron run or timeout so all 8 sleeves can eventually land.
 */
async function generateAndStoreMissingCategoryBriefs({
  period,
  timeZone = 'Europe/London',
  runDate = new Date(),
  isolateOutboundMeter = false,
} = {}) {
  if (isolateOutboundMeter) resetProviderRequestMeter();
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const kinds = orderedAutomatedCategoryKinds();
  const missingKinds = [];
  for (const k of kinds) {
    try {
      const [r] = await executeQuery(
        `SELECT id FROM trader_deck_briefs WHERE date = ? AND period = ? AND brief_kind = ? LIMIT 1`,
        [date, normalizedPeriod, k]
      );
      if (!r?.[0]?.id) missingKinds.push(k);
    } catch (_) {
      missingKinds.push(k);
    }
  }
  if (!missingKinds.length) {
    return {
      success: true,
      skipped: true,
      reason: 'all-categories-present',
      date,
      period: normalizedPeriod,
      results: [],
    };
  }
  console.info('[brief-gen] missing category briefs — backfill', {
    date,
    period: normalizedPeriod,
    missingKinds,
    count: missingKinds.length,
  });
  const { market: sharedMarket, econ: sharedEcon, news: sharedNews } = await getSharedBriefInputs(normalizedPeriod, date);
  const sharedQuoteCache = await buildQuoteCacheForSymbols(
    collectAllAutomationUniverseSymbols(),
    fetchAutomationQuoteWithFallback
  );
  const thinFeeds = needsLlmDataSupplement(sharedQuoteCache, sharedEcon, sharedNews);
  let sharedLlmDataSupplement = null;
  if (thinFeeds) {
    sharedLlmDataSupplement = await fetchLlmBriefDataSupplementGlobal({
      period: normalizedPeriod,
      dateStr: date,
      timeZone,
      market: sharedMarket,
      econ: sharedEcon,
      news: sharedNews,
      symbolSample: collectAllAutomationUniverseSymbols(),
    });
  }
  const existingBodies = [];
  const existingExcerpts = [];
  const results = [];
  for (const briefKind of missingKinds) {
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
      generationContext: {
        existingBodies,
        existingExcerpts,
        briefSetRun: true,
        sharedLlmDataSupplement,
      },
    });
    if (row && row.success && row.briefId) {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await executeQuery('SELECT file_data FROM trader_deck_briefs WHERE id = ? LIMIT 1', [row.briefId]);
      const raw = rows?.[0]?.file_data;
      if (raw) {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        existingBodies.push(text);
        existingExcerpts.push(text.slice(0, 520));
      }
    }
    results.push(row);
  }
  const hardFails = results.filter((r) => r && !r.success && !r.skipped);
  if (hardFails.length) {
    console.error('[brief-gen] missing-category backfill failures', {
      date,
      period: normalizedPeriod,
      fails: hardFails.map((r) => ({ kind: r.briefKind, error: r.error })),
    });
  }
  const payload = {
    success: results.some((r) => r && r.success),
    period: normalizedPeriod,
    date,
    missingKinds,
    results,
  };
  if (isolateOutboundMeter) {
    logProviderRequestMeter('[brief-gen] generateAndStoreMissingCategoryBriefs outbound HTTP', {
      period: normalizedPeriod,
      date,
    });
    resetProviderRequestMeter();
  }
  return payload;
}

async function generateAndStoreOutlook({ period, timeZone = 'Europe/London', runDate = new Date() }) {
  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const runKey = `auto-outlook:${normalizedPeriod}:${date}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date };
  }

  try {
    const { market: storedMarket } = await getSharedBriefInputs(normalizedPeriod, date);
    const raw = storedMarket || await runEngine({ timeframe: normalizedPeriod, date });
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
  const { market, econ, news } = await getSharedBriefInputs(normalizedPeriod, date);
  const qc = await buildQuoteCacheForSymbols(
    collectAllAutomationUniverseSymbols(),
    fetchAutomationQuoteWithFallback
  );
  const sel = await scoreAndSelectTopInstruments({
    briefKind: 'stocks',
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
    briefKind: 'stocks',
    topInstruments: previewTop,
    liveQuotes,
    instrumentScoreRows: sel.scoreRows,
    quoteCache: qc,
  });
  if (needsLlmDataSupplement(qc, econ, news) && isTraderDeskAutomationConfigured()) {
    const llmSup = await fetchLlmBriefDataSupplementGlobal({
      period: normalizedPeriod,
      dateStr: date,
      timeZone,
      market,
      econ,
      news,
      symbolSample: collectAllAutomationUniverseSymbols(),
    });
    if (llmSup) factPack.llmDataSupplement = llmSup;
  }
  let generated = await generateBriefBySections(factPack, template, {
    existingExcerpts: [],
    uniquenessRetry: false,
  });
  if (!generated) {
    generated = fallbackGenerated(factPack, template, date, timeZone);
  }
  const title = stripSources(computeTitle(template, date, timeZone));
  const body = renderBriefText({
    title,
    period: normalizedPeriod,
    date,
    generated,
    template,
    briefKind: 'stocks',
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

/**
 * Rows on file for this desk date (excludes legacy `general`). Expect 9 when 8 sleeves + institutional exist.
 */
async function countNonGeneralIntelBriefRows(period, dateYmd) {
  const p = normalizePeriod(period);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || ''))) return 0;
  try {
    const [rows] = await executeQuery(
      `SELECT COUNT(*) AS n FROM trader_deck_briefs
       WHERE date = ? AND period = ? AND COALESCE(LOWER(brief_kind), '') <> 'general'`,
      [dateYmd, p]
    );
    return Number(rows?.[0]?.n || 0);
  } catch (_) {
    return 0;
  }
}

/**
 * Throttled catch-up when the intel pack is still incomplete (missed narrow cron, partial failure, or cold start).
 * Called from cron only — avoids hammering APIs every 5 minutes when healthy.
 */
async function shouldRunIntelPackCatchUp({ now = new Date(), period, timeZone = 'Europe/London' } = {}) {
  if (!isTraderDeskAutomationConfigured()) return false;
  const normalizedPeriod = normalizePeriod(period);
  const deskYmd = normalizeOutlookDate(normalizedPeriod, toYmdInTz(now, timeZone));
  const n = await countNonGeneralIntelBriefRows(normalizedPeriod, deskYmd);
  if (n >= expectedIntelAutomationRowCount()) return false;

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
  /** London: a few fixed slots per day (Vercel cron runs every five minutes). */
  if (normalizedPeriod === 'daily') {
    return (hh === 6 || hh === 12 || hh === 18) && mm < 20;
  }
  /** Weekly: early-week retry for the week-ending key in `deskYmd`. */
  if (normalizedPeriod === 'weekly') {
    return (
      (wd.startsWith('mon') || wd.startsWith('tue') || wd.startsWith('wed') || wd.startsWith('thu')) &&
      hh === 8 &&
      mm < 20
    );
  }
  return false;
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
  const wd = String(map.weekday || '').toLowerCase();
  /**
   * Daily: full midnight hour Europe/London (00:00–00:59). A 10-minute window missed most five-minute cron ticks
   * (e.g. 00:10+ skipped the entire day in production).
   * Weekly: full Sunday 18:00 hour UK (week-ending storage key).
   */
  if (normalizedPeriod === 'daily') {
    return hh === 0;
  }
  return wd.startsWith('sun') && hh === 18;
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
  generateAndStoreMissingCategoryBriefs,
  generateAndStoreInstitutionalBriefOnly,
  generatePreviewBrief,
  publishManualBrief,
  prefetchInstrumentResearchForDaily,
  shouldRunWindow,
  shouldRunIntelPackCatchUp,
  countNonGeneralIntelBriefRows,
  shouldPrefetchInstrumentResearchWindow,
  isTraderDeskAutomationConfigured,
  stripSources,
  assertNoSources,
  _test: {
    shouldRunWindow,
    shouldRunIntelPackCatchUp,
    countNonGeneralIntelBriefRows,
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
    orderedAutomatedCategoryKinds,
    buildFactPack,
    generateSampleMatchedCategoryBrief,
    fetchUnifiedNewsSample,
    fetchEconomicCalendar,
    fetchLiveQuotesForSymbols,
  },
  orderedAutomatedCategoryKinds,
};
