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
const sundayMarketOpenBrief = require('./sundayMarketOpenBrief');
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
const {
  DESK_AUTOMATION_CATEGORY_KINDS,
  expectedIntelAutomationRowCount,
  isDeskAutomationCategoryKind,
  isInstitutionalDailyWfaKind,
  isInstitutionalWeeklyWfaKind,
  deskCategoryDisplayName,
  canonicalDeskCategoryKind,
  legacyAliasesForCanonical,
  INSTITUTIONAL_DAILY_WFA_KINDS,
  INSTITUTIONAL_WEEKLY_WFA_KINDS,
} = require('../deskBriefKinds');
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
  forex: 'Forex',
  crypto: 'Crypto',
  commodities: 'Commodities',
  etfs: 'ETFs',
  stocks: 'Stocks',
  indices: 'Indices',
  bonds: 'Bonds',
  futures: 'Futures',
  aura_institutional_daily: 'Aura FX Institutional â€” Daily (legacy)',
  aura_institutional_daily_forex: 'Daily Brief â€” Forex',
  aura_institutional_daily_crypto: 'Daily Brief â€” Crypto',
  aura_institutional_daily_commodities: 'Daily Brief â€” Commodities',
  aura_institutional_daily_etfs: 'Daily Brief â€” ETFs',
  aura_institutional_daily_stocks: 'Daily Brief â€” Stocks',
  aura_institutional_daily_indices: 'Daily Brief â€” Indices',
  aura_institutional_daily_bonds: 'Daily Brief â€” Bonds',
  aura_institutional_daily_futures: 'Daily Brief â€” Futures',
  aura_institutional_weekly: 'Aura FX Institutional â€” Weekly (legacy)',
  aura_institutional_weekly_forex: 'Weekly Fundamental â€” Forex',
  aura_institutional_weekly_crypto: 'Weekly Fundamental â€” Crypto',
  aura_institutional_weekly_commodities: 'Weekly Fundamental â€” Commodities',
  aura_institutional_weekly_etfs: 'Weekly Fundamental â€” ETFs',
  aura_institutional_weekly_stocks: 'Weekly Fundamental â€” Stocks',
  aura_institutional_weekly_indices: 'Weekly Fundamental â€” Indices',
  aura_institutional_weekly_bonds: 'Weekly Fundamental â€” Bonds',
  aura_institutional_weekly_futures: 'Weekly Fundamental â€” Futures',
  aura_sunday_market_open: 'Sunday Market Open Brief',
};
const {
  filterHeadlinesForBriefKind,
  buildSymbolHeadlineMap,
  filterCalendarForBriefKind,
  buildMacroSummaryLines,
  categoryWritingMandate,
  scoreAndSelectTopInstruments,
  buildQuoteCacheForSymbols,
  collectAllAutomationUniverseSymbols,
  getUniverseSymbols,
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
    + '- assetSnapshot: array of up to 18 { "symbol": string, "changePctDayApprox": number or null, "levelOrRangeHint": string or null, "note": string or null } covering the watchSymbols list â€” best-effort public session context for that date; round % to one decimal.\n'
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
  + 'If a symbol or field is missing, empty, or null, do not invent prices, percentages, OHLC, volumes, positioning, or event outcomesâ€”say the pack is thin in one clause and stay qualitative. '
  + 'Do not use outside or "typical" levels unless they appear explicitly in the JSON.';

const CATEGORY_LOGIC_RULES = {
  forex: 'Focus on relative-rate spreads, central-bank divergence, session behaviour and event-volatility.',
  crypto: 'Focus on liquidity, ETF/regulatory headlines, majors vs alts and macro risk correlation.',
  commodities: 'Focus on supply-demand balances, inventories, USD pass-through and geopolitical transmission.',
  etfs: 'Focus on sector/factor ETF leadership, flows, and macro beta versus yields and USD.',
  stocks: 'Focus on earnings revisions, single-name breadth, positioning and idiosyncratic catalysts.',
  indices: 'Focus on benchmark leadership, breadth, futures/cash proxies, vol and liquidity.',
  bonds: 'Focus on curve shape, duration, policy path repricing and auction/data calendar transmission.',
  futures: 'Focus on index and commodity futures transmission versus yields, USD, and energy.',
  global_macro: 'Focus on growth, inflation, liquidity, CB path, and cross-asset leadership (indices, yields, FX, gold).',
};

/** PDF fallback: three observation lines per sleeve so automated scaffolds are not copy-paste across the eight briefs. */
const FALLBACK_KEY_TECH_OBS_BY_KIND = {
  forex: [
    'Relative rates dominate spot â€” surprise is often in the spread, not the headline.',
    'Asia liquidity gaps can fake breakouts before London reprices the narrative.',
    'Positioning extremes tend to mean-revert into major CB windows.',
  ],
  commodities: [
    'Inventories and curve shape beat day-to-day noise for durable trends.',
    'USD pass-through differs by complex â€” energy vs metals often diverge.',
    'Geopolitical premia can decay fast once flows are positioned.',
  ],
  bonds: [
    'Curve shape trades often front-run single-duration directional bets.',
    'Auction tails and dealer positioning matter alongside headline CPI prints.',
    'Real yield narrative can flip even when nominal yields look sticky.',
  ],
  crypto: [
    'Liquidity gaps around headlines can dominate spot trend.',
    'ETF/regulatory headlines can gap majors while alts lag liquidity.',
    'Treat macro correlation as conditional â€” leadership rotates quickly.',
  ],
  etfs: [
    'Sector sleeves often rotate before headline indices confirm the narrative.',
    'Flows into liquid ETFs can front-run single-name earnings windows.',
    'Factor beta to yields shows up in SMH/XLK leadership versus defensives.',
  ],
  stocks: [
    'Sector breadth vs index pin risk â€” avoid treating one mega-cap print as the whole tape.',
    'Guidance beats/misses matter more than headline EPS when multiples are stretched.',
    'Respect earnings blackout windows and flow concentration into liquid single names.',
  ],
  indices: [
    'Benchmark futures often discount macro prints before cash indices catch up.',
    'Breadth divergence warns before headline index breaks range.',
    'Vol compression into major releases is common; expansion follows surprise.',
  ],
  futures: [
    'Index and energy futures often lead spot when liquidity is patchy.',
    'Roll windows can distort apparent trend; respect calendar spreads.',
    'Cross-margin moves link rates and equity index futures in macro shocks.',
  ],
  global_macro: [
    'Cross-asset leadership often shifts before single-market charts confirm.',
    'Liquidity pockets around macro prints can invert short-term correlations.',
    'Curve and FX frequently transmit before equity breadth stabilises.',
  ],
};

function fallbackKeyTechObservationsForKind(briefKind, symbolIndex = 0) {
  const k = normalizeBriefKind(briefKind);
  const pool = FALLBACK_KEY_TECH_OBS_BY_KIND[k] || FALLBACK_KEY_TECH_OBS_BY_KIND.stocks;
  const n = pool.length;
  const i = Number(symbolIndex) || 0;
  return [0, 1, 2].map((j) => pool[(i + j) % n]);
}

function weeklyFallbackScenariosForKind(briefKind) {
  const k = normalizeBriefKind(briefKind);
  const map = {
    forex: [
      'Central-bank divergence: relative hikes or dovish pivots dominate G10 ranking shifts.',
      'Risk-proxy swing: USD weakens on soft-landing hopes; reverses on haven bid.',
    ],
    commodities: [
      'Supply disruption bid: energy and metals resume leadership on inventory shock.',
      'Demand worry: industrial complexes fade as growth data soften.',
    ],
    bonds: [
      'Curve steepener: growth surprises fade; duration catches a bid into data.',
      'Bear flattening: inflation prints keep front-end yields pinned higher.',
    ],
    crypto: [
      'Liquidity-linked calm: majors track risk assets inside a narrowing range.',
      'Liquidity crunch: correlated drawdown across high-beta tokens.',
    ],
    etfs: [
      'Sector rotation lift: cyclical ETFs outperform as rates stabilize.',
      'Defensive bid: staples and low-vol sleeves lead on growth doubt.',
    ],
    stocks: [
      'Soft-landing persistence: earnings beats broaden; cyclicals repair versus defensives.',
      'Growth scare: yields dip; defensives and quality factor lead while high-beta lags.',
    ],
    indices: [
      'Trend persistence: benchmarks grind higher on liquidity and benign data.',
      'Range chop: headline indices stall as breadth narrows.',
    ],
    futures: [
      'Trend continuation: futures maintain leadership versus cash on flows.',
      'Liquidity unwind: leveraged positioning cuts amplify futures ranges.',
    ],
    global_macro: [
      'Coordinated easing narrative: curves bull-steepen; equities and credit tighten together.',
      'Sticky inflation repricing: front-end yields lift; equity multiples compress selectively.',
    ],
  };
  return map[k] || map.stocks;
}

function briefFileDataToUtf8(raw) {
  if (raw == null) return '';
  return Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
}

/**
 * Load already-stored category sleeves for this desk date so gap-fill passes them as priors (dedup context).
 */
async function loadExistingCategoryBodiesForDeskDate(dateYmd, period) {
  const normalizedPeriod = normalizePeriod(period);
  const kinds = orderedAutomatedCategoryKinds();
  const canonSet = new Set(kinds);
  try {
    const [rows] = await executeQuery(
      `SELECT brief_kind, file_data FROM trader_deck_briefs
       WHERE date = ? AND period = ?
       ORDER BY brief_version DESC, id DESC`,
      [dateYmd, normalizedPeriod]
    );
    const picked = new Map();
    for (const r of rows || []) {
      const canon = canonicalDeskCategoryKind(String(r.brief_kind || '').toLowerCase());
      if (!canonSet.has(canon)) continue;
      if (picked.has(canon)) continue;
      const text = briefFileDataToUtf8(r.file_data).trim();
      if (text) picked.set(canon, text);
    }
    const bodies = [];
    const excerpts = [];
    for (const k of kinds) {
      const t = picked.get(k);
      if (t) {
        bodies.push(t);
        excerpts.push(t.slice(0, 520));
      }
    }
    return { bodies, excerpts };
  } catch (_) {
    return { bodies: [], excerpts: [] };
  }
}

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

/** Calendar date without weekday â€” use with `{weekday}` in the same title to avoid â€œMonday Mondayâ€. */
function dateLongNoWeekday(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/** JS Date at local noon on desk YMD â€” stable title tokens vs UTC parsing bugs. */
function jsDateFromDeskYmd(deskYmd, timeZone) {
  const dt = DateTime.fromISO(`${String(deskYmd || '').slice(0, 10)}T12:00:00`, { zone: timeZone });
  return dt.isValid ? dt.toJSDate() : new Date();
}

/** Monâ€“Fri window for the ISO week containing `deskYmd` in `timeZone` (matches UK desk week). */
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

/** Light structural tidy only â€” do not append meta filler (handled via regeneration). */
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
    briefKindLabel:
      BRIEF_KIND_LABELS[normalizedKind] ||
      deskCategoryDisplayName(canonicalDeskCategoryKind(normalizedKind)) ||
      'Desk',
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
    categoryIntelligenceDirective:
      CATEGORY_INTELLIGENCE_DIRECTIVES[normalizedKind] || CATEGORY_INTELLIGENCE_DIRECTIVES.stocks,
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

/** Matches client PDF typography: "Daily Brief â€“ Thursday 5th March 2026" (en dash). */
function formatDailySampleTitle(deskYmd, timeZone) {
  const mid = jsDateFromDeskYmd(deskYmd, timeZone);
  const ND = '\u2013';
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(mid);
  const day = ordinalDayNumber(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(mid));
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(mid);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(mid);
  return `Daily Brief ${ND} ${weekday} ${day} ${month} ${year}`;
}

/** Matches client PDF: "WEEKLY FUNDAMENTAL ANALYSIS â€“ (2nd â€“ 6th March 2026)". */
function formatWeeklySampleTitle(deskYmd, timeZone) {
  const ND = '\u2013';
  const mon = DateTime.fromISO(`${String(deskYmd || '').slice(0, 10)}T12:00:00`, { zone: timeZone }).set({ weekday: 1 });
  const fri = mon.plus({ days: 4 });
  if (!mon.isValid) return `WEEKLY FUNDAMENTAL ANALYSIS ${ND}`;
  const mDay = ordinalDayNumber(mon.toFormat('d'));
  const fDay = ordinalDayNumber(fri.toFormat('d'));
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(fri.toJSDate());
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(fri.toJSDate());
  return `WEEKLY FUNDAMENTAL ANALYSIS ${ND} (${mDay} ${ND} ${fDay} ${month} ${year})`;
}

/** Previous Monâ€“Fri window label for "SUMMARY FOR LAST WEEK (â€¦)" â€” PDF-style range. */
function formatPreviousWeekRangeLabel(deskYmd, timeZone) {
  const anchor = DateTime.fromISO(`${String(deskYmd || '').slice(0, 10)}T12:00:00`, { zone: timeZone });
  if (!anchor.isValid) return '';
  const ND = '\u2013';
  const prevMon = anchor.minus({ weeks: 1 }).set({ weekday: 1 });
  const prevFri = prevMon.plus({ days: 4 });
  const mDay = ordinalDayNumber(Number(prevMon.toFormat('d')));
  const fDay = ordinalDayNumber(Number(prevFri.toFormat('d')));
  const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone }).format(prevFri.toJSDate());
  return `${mDay} ${ND} ${fDay} ${monthYear}`;
}

function stripDeskMarkdownSymbols(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*â€¢]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sentencesFromHeadlines(lines, label) {
  const arr = Array.isArray(lines) ? lines.map((x) => sanitizeSentence(String(x || ''))).filter(Boolean) : [];
  if (!arr.length) return `${label} headline set unavailable in this snapshot; monitor scheduled risk windows.`;
  return arr.slice(0, 8).join(' ');
}

function buildPdfFallbackDailyParsed(factPack, expectedAssets) {
  const kind = normalizeBriefKind(factPack.briefKind || 'stocks');
  const logicAngle = CATEGORY_LOGIC_RULES[kind] || CATEGORY_LOGIC_RULES.stocks;
  const syms = Array.isArray(expectedAssets) && expectedAssets.length
    ? expectedAssets.slice(0, 5)
    : ['EURUSD', 'XAUUSD', 'US500', 'NAS100', 'US10Y'];
  const ms = Array.isArray(factPack.macroSummary) ? factPack.macroSummary.filter(Boolean).slice(0, 8) : [];
  const drivers = Array.isArray(factPack.keyDrivers) ? factPack.keyDrivers.slice(0, 8) : [];
  const headlines = Array.isArray(factPack.headlines) ? factPack.headlines.slice(0, 12) : [];
  const supplement = factPack.llmDataSupplement || {};
  const llmThemes = Array.isArray(supplement.headlineThemes) ? supplement.headlineThemes : [];

  const regime = factPack.marketRegime && typeof factPack.marketRegime === 'object'
    ? factPack.marketRegime.currentRegime || ''
    : String(factPack.marketRegime || '');
  const pulse = factPack.marketPulse && typeof factPack.marketPulse === 'object'
    ? factPack.marketPulse.label || ''
    : String(factPack.marketPulse || '');

  const sleeveLead = `${factPack.briefKindLabel || kind}: ${logicAngle}`;
  const marketContext = [
    sleeveLead,
    regime ? `Regime: ${sanitizeSentence(regime)}.` : '',
    pulse ? `Pulse: ${sanitizeSentence(pulse)}.` : '',
    ms.length ? ms.map((x) => sanitizeSentence(String(x))).join(' ') : '',
  ].filter(Boolean).join(' ')
    || `${sleeveLead} Market context is thin; desk is operating from reduced live inputs until feeds recover.`;

  const driversText = drivers.length
    ? drivers.map((d) => packDriverLine(d)).join(' ')
    : 'Key macro drivers were not fully resolved in the feed snapshot for this run.';

  const cross = Array.isArray(factPack.crossAssetSignals) ? factPack.crossAssetSignals.slice(0, 8) : [];
  const trader = Array.isArray(factPack.traderFocus) ? factPack.traderFocus.slice(0, 8) : [];
  const themeBlob = [...cross.map(packSignalLine), ...trader.map(packSignalLine)].filter(Boolean).join(' ')
    || 'Cross-asset themes will clarify as London and New York print liquidity and leadership.';

  const headlineNarrative = sentencesFromHeadlines(llmThemes.length ? llmThemes : headlines, 'Desk');

  const keyDevelopments = [
    `Macro and policy: ${driversText}`,
    `Tape and positioning: ${themeBlob}`,
    `Headlines: ${headlineNarrative}`,
  ].join('\n\n');

  const risk = Array.isArray(factPack.riskRadar) ? factPack.riskRadar.slice(0, 8) : [];
  const marketImpact = risk.length
    ? risk.map((r) => (typeof r === 'string' ? r : r.title || r.event || '')).filter(Boolean).join(' ')
    : 'Risk radar incomplete; respect known event windows and liquidity gaps until the tape confirms direction.';

  const quotes = Array.isArray(factPack.liveQuotes) ? factPack.liveQuotes : [];
  const symHead = factPack.symbolHeadlines && typeof factPack.symbolHeadlines === 'object' ? factPack.symbolHeadlines : {};
  const levelParts = syms.map((sym) => {
    const q = quotes.find((lq) => String(lq.symbol || lq.instrument || '').toUpperCase() === String(sym).toUpperCase());
    const row = Array.isArray(symHead[sym]) ? symHead[sym] : [];
    const newsLine = row.length ? sanitizeSentence(String(row[0])) : '';
    const px = q && q.last != null ? `${sym} last ${q.last}${q.changePct != null ? ` (${q.changePct}% session)` : ''}` : `${sym} quote snapshot thin in cache`;
    return [px, newsLine].filter(Boolean).join('. ');
  });
  const keyLevelsMetrics = levelParts.join(' ');

  return {
    marketContext,
    keyDevelopments,
    marketImpact,
    keyLevelsMetrics,
  };
}

function buildPdfFallbackWeeklyParsed(factPack, expectedAssets, deskYmd, timeZone) {
  const kind = normalizeBriefKind(factPack.briefKind || 'stocks');
  const logicAngle = CATEGORY_LOGIC_RULES[kind] || CATEGORY_LOGIC_RULES.stocks;
  const syms = Array.isArray(expectedAssets) && expectedAssets.length
    ? expectedAssets.slice(0, 5)
    : ['EURUSD', 'XAUUSD', 'US500'];
  const drivers = Array.isArray(factPack.keyDrivers) ? factPack.keyDrivers.slice(0, 8) : [];
  const cross = Array.isArray(factPack.crossAssetSignals) ? factPack.crossAssetSignals.slice(0, 8) : [];
  const cal = Array.isArray(factPack.calendar) ? factPack.calendar.slice(0, 12) : [];
  const prevLabel = formatPreviousWeekRangeLabel(deskYmd, timeZone) || 'prior week';

  const weeklyOverview = [
    `${factPack.briefKindLabel || kind}: ${logicAngle}`,
    factPack.marketRegime && typeof factPack.marketRegime === 'object'
      ? `Regime: ${sanitizeSentence(String(factPack.marketRegime.currentRegime || ''))}.`
      : '',
    Array.isArray(factPack.macroSummary) && factPack.macroSummary.length
      ? factPack.macroSummary.slice(0, 4).map((x) => sanitizeSentence(String(x))).join(' ')
      : '',
  ].filter(Boolean).join(' ')
    || `${factPack.briefKindLabel || kind}: ${logicAngle} Weekly overview is reduced until full feeds return.`;

  const priorWeekRecap = drivers.length
    ? drivers.map((d) => packDriverLine(d)).join(' ')
    : 'Prior-week driver detail was thin in the captured snapshot.';

  const crossProse = cross.map(packSignalLine).filter(Boolean).join(' ')
    || 'Structural drivers will resolve as the weekâ€™s calendar and flows print.';

  const calHint = cal.map((c) => c.event || c.time || '').filter(Boolean).slice(0, 8).join('. ')
    || 'See economic calendar in the desk feed for timing.';

  const symsSummary = syms.join(', ');

  const detailedAnalysis = [
    `Last weekâ€™s repricing for this sleeve anchored on ${priorWeekRecap}`,
    `Cross-asset linkage: ${crossProse}`,
    `Watch-list symbols for narrative anchoring: ${symsSummary}.`,
  ].join('\n\n');

  const keyDrivers = [
    `Economic data and surprise prints that matter for ${kind}: ${drivers.length ? priorWeekRecap : 'awaiting fuller driver capture.'}`,
    `Central bank and policy tone from calendar context: ${calHint}`,
    `Flows and positioning read through cross-asset signals in the desk pack.`,
  ].join('\n\n');

  const scenarios = weeklyFallbackScenariosForKind(kind);
  const forwardOutlook = [
    `Next week focus from calendar and risk radar: respect clustered releases and liquidity gaps.`,
    `Scenario framing for this sleeve (qualitative, not prescriptive): ${scenarios.join(' ')}`,
    Array.isArray(factPack.riskRadar) && factPack.riskRadar.length
      ? `Risk windows: ${normaliseArray(factPack.riskRadar.map((r) => (typeof r === 'string' ? r : r.title || r.event || ''))).slice(0, 6).join(' ')}`
      : 'Risk radar incomplete; confirm timing on the live desk calendar.',
  ].join('\n\n');

  return {
    weeklyOverview,
    previousWeekLabel: prevLabel,
    detailedAnalysis,
    keyDrivers,
    forwardOutlook,
  };
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

/**
 * PDF-aligned daily body: plain paragraphs only (no markdown symbols). `deskTitle` is e.g. "Daily Brief â€“ Thursday 5th March 2026".
 */
function renderCategoryDailyBrief({ categoryDisplayName, deskTitle, parsed }) {
  const lines = [];
  lines.push(String(categoryDisplayName || '').trim());
  lines.push(String(deskTitle || '').trim());
  lines.push('');
  lines.push('Market Context');
  lines.push(stripDeskMarkdownSymbols(parsed.marketContext || ''));
  lines.push('');
  lines.push('Key Developments');
  lines.push(stripDeskMarkdownSymbols(parsed.keyDevelopments || ''));
  lines.push('');
  lines.push('Market Impact');
  lines.push(stripDeskMarkdownSymbols(parsed.marketImpact || ''));
  lines.push('');
  lines.push('Key Levels and Metrics');
  lines.push(stripDeskMarkdownSymbols(parsed.keyLevelsMetrics || ''));
  lines.push('');
  lines.push('By AURA TERMINAL™');
  return stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
}

function renderCategoryWeeklyBrief({ categoryDisplayName, deskTitle, parsed }) {
  const prevWeek = String(parsed.previousWeekLabel || '').trim();
  const lines = [];
  lines.push(String(categoryDisplayName || '').trim());
  lines.push(String(deskTitle || '').trim());
  lines.push('');
  lines.push('Weekly Overview');
  lines.push(stripDeskMarkdownSymbols(parsed.weeklyOverview || ''));
  lines.push('');
  if (prevWeek) {
    lines.push(`Summary for last week (${prevWeek})`);
    lines.push('');
  }
  lines.push('Detailed Analysis');
  lines.push(stripDeskMarkdownSymbols(parsed.detailedAnalysis || ''));
  lines.push('');
  lines.push('Key Drivers');
  lines.push(stripDeskMarkdownSymbols(parsed.keyDrivers || ''));
  lines.push('');
  lines.push('Forward Outlook');
  lines.push(stripDeskMarkdownSymbols(parsed.forwardOutlook || ''));
  lines.push('');
  lines.push('By AURA TERMINAL™');
  return stripSources(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim();
}

function buildDailySampleJsonSchema() {
  return {
    schema: {
      type: 'object',
      properties: {
        marketContext: { type: 'string' },
        keyDevelopments: { type: 'string' },
        marketImpact: { type: 'string' },
        keyLevelsMetrics: { type: 'string' },
      },
      required: ['marketContext', 'keyDevelopments', 'marketImpact', 'keyLevelsMetrics'],
    },
  };
}

function buildWeeklySampleJsonSchema() {
  return {
    schema: {
      type: 'object',
      properties: {
        weeklyOverview: { type: 'string' },
        previousWeekLabel: { type: 'string' },
        detailedAnalysis: { type: 'string' },
        keyDrivers: { type: 'string' },
        forwardOutlook: { type: 'string' },
      },
      required: ['weeklyOverview', 'previousWeekLabel', 'detailedAnalysis', 'keyDrivers', 'forwardOutlook'],
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

function normalizeDailyStructuredParsed(parsed) {
  const clean = (s) => stripDeskMarkdownSymbols(cleanInlineFormatting(s || ''));
  return {
    marketContext: clean(parsed?.marketContext || parsed?.opening || ''),
    keyDevelopments: clean(parsed?.keyDevelopments || ''),
    marketImpact: clean(parsed?.marketImpact || parsed?.overallDailyStructure || ''),
    keyLevelsMetrics: clean(parsed?.keyLevelsMetrics || ''),
  };
}

function normalizeWeeklyStructuredParsed(parsed) {
  const clean = (s) => stripDeskMarkdownSymbols(cleanInlineFormatting(s || ''));
  return {
    weeklyOverview: clean(parsed?.weeklyOverview || parsed?.overview || ''),
    previousWeekLabel: clean(parsed?.previousWeekLabel || ''),
    detailedAnalysis: clean(parsed?.detailedAnalysis || ''),
    keyDrivers: clean(parsed?.keyDrivers || ''),
    forwardOutlook: clean(parsed?.forwardOutlook || ''),
  };
}

function validateSampleStructuredBrief(period, parsed, expectedAssets = []) {
  void expectedAssets;
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['missing_parsed'] };
  if (period === 'daily') {
    if (String(parsed.marketContext || '').trim().length < 220) reasons.push('daily_market_context_thin');
    if (String(parsed.keyDevelopments || '').trim().length < 280) reasons.push('daily_developments_thin');
    if (String(parsed.marketImpact || '').trim().length < 200) reasons.push('daily_impact_thin');
    if (String(parsed.keyLevelsMetrics || '').trim().length < 120) reasons.push('daily_levels_thin');
  } else {
    if (String(parsed.weeklyOverview || '').trim().length < 220) reasons.push('weekly_overview_thin');
    if (String(parsed.detailedAnalysis || '').trim().length < 320) reasons.push('weekly_detail_thin');
    if (String(parsed.keyDrivers || '').trim().length < 260) reasons.push('weekly_drivers_thin');
    if (String(parsed.forwardOutlook || '').trim().length < 220) reasons.push('weekly_forward_thin');
    if (!String(parsed.previousWeekLabel || '').trim()) reasons.push('weekly_prev_label_missing');
  }
  return { ok: reasons.length === 0, reasons };
}

function validateRenderedSampleBody(body, period, expectedAssets = []) {
  void expectedAssets;
  const reasons = [];
  const text = String(body || '');
  const headingChecks =
    period === 'daily'
      ? [/^Market Context$/m, /^Key Developments$/m, /^Market Impact$/m, /^Key Levels and Metrics$/m]
      : [/^Weekly Overview$/m, /^Detailed Analysis$/m, /^Key Drivers$/m, /^Forward Outlook$/m];
  headingChecks.forEach((re, idx) => {
    if (!re.test(text)) reasons.push(`missing_heading_${period}_${idx + 1}`);
  });
  if (/\*\*|#{1,6}\s|^\s*[-*â€¢]\s+/m.test(text)) reasons.push('forbidden_markdown_leak');
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
    ? `${STRUCTURED_DATA_FIRST_RULE} llmDataSupplement is approximate backup when REST feeds were thinâ€”prefer agreement with liveQuotes/headlines; never override missing pack fields with invented figures. No URLs or citations.`
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
    /** Up to eight previously generated sleeves in this run (or gap-fill), trimmed to control tokens. */
    priorCategoryBodies: priorBodies.slice(-8).map((x) => String(x || '').slice(0, 950)),
    rules: {
      noDuplicatePhrasingAcrossBriefs: true,
      noCopyPasteAcrossCategories: true,
      keepInstitutionalTone: true,
      retailFriendlyClarity: true,
      alignWithWeeklyThesisUnlessMajorNewsOverrides: true,
      explainWeeklyOverrideIfNeeded: true,
      uniqueEightSleeveRule:
        'Eight sleeves (forex, crypto, commodities, etfs, stocks, indices, bonds, futures) share one macro snapshot. '
        + 'Differentiate solely via categoryLogicRule, categoryWritingMandate, and topInstruments â€” never recycle the same opening sentences or headline bundle across sleeves.',
    },
  };

  const ND = '\u2013';
  const systemPrompt = normalizedPeriod === 'daily'
    ? `You are an institutional cross-asset strategist producing one DAILY CATEGORY BRIEF only.
Return JSON ONLY with keys: marketContext, keyDevelopments, marketImpact, keyLevelsMetrics.

Writing structure (fills those keys):
marketContext (short): what happened in roughly the last 24 hours for THIS category; anchor on headline/calendar/liveQuotes data in the payload only.
keyDevelopments: TWO TO THREE SEPARATE PARAGRAPHS (embed as ONE string with blank lines \\n\\n between paragraphs only). Data-backed narrative for THIS asset-class lens ONLY.
marketImpact: why this matters tactically forward; no execution orders; connect rates/flows/liquidity transmission where visible in the pack.
keyLevelsMetrics: prose paragraph(s) quoting levels/percent/yields/prices ONLY from liveQuotes, headlines, macroSummary, keyDrivers, calendar, llmDataSupplement â€” woven into sentences. If sparse, say the pack is thin qualitatively.

Forbidden in ALL string values: hashtags, asterisks, markdown headings, hyphen or asterisk bullets, numbered lists as lines. Plain sentences and paragraph breaks only.

Hard rules:
- ${dataContextRule}
- Do NOT copy phrases from priorCategoryBodies or priorCategoryExcerpts.
- Sleeve identity: ${String(normalizedKind)} â€” lead with categoryLogicRule + topInstruments from the payload; thesis must differ from other sleeves.
- Tone: concise, tactical, institutional desk â€” no retail hype.`
    : `You are an institutional strategist producing one WEEKLY FUNDAMENTAL ANALYSIS for a SINGLE category.
Return JSON ONLY with keys: weeklyOverview, previousWeekLabel, detailedAnalysis, keyDrivers, forwardOutlook.

previousWeekLabel: short bracket label for the PRIOR Monâ€“Fri window (from desk context), e.g. format like "3rd ${ND} 7th February 2026" using facts only.

weeklyOverview: week summary and major themes for THIS category (strategic, not session scalping).
detailedAnalysis: multi-paragraph string (use \\n\\n between paragraphs) with cross-asset links where the fact pack supports them.
keyDrivers: economic data, central banks, earnings/flows as relevant to THIS category â€” prose paragraphs only, no bullet syntax.
forwardOutlook: what to watch next week; risks and catalysts from calendar/riskRadar in the pack.

Forbidden in ALL string values: hashtags, asterisks, markdown, hyphen bullet lines. Plain paragraphs only.

Hard rules:
- Analyze the NEW week ahead; ${dataContextRule}
- weeklyReference is alignment context only â€” do not paste it.
- No duplicated phrasing from priorCategoryExcerpts.
- Sleeve ${String(normalizedKind)} must differ from other sleeves; use categoryLogicRule + topInstruments.`;

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
        'Rewrite using the SAME JSON keys and plain-text rules. Fix every thin field in validationFeedback. Keep facts from the pack only; do not invent prices or percentages not in liveQuotes, symbolHeadlines, headlines, calendar, or llmDataSupplement.',
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
  const deskTitle =
    normalizedPeriod === 'daily'
      ? formatDailySampleTitle(deskDateYmd, timeZone)
      : formatWeeklySampleTitle(deskDateYmd, timeZone);
  const categoryDisplayName = BRIEF_KIND_LABELS[normalizedKind] || deskCategoryDisplayName(normalizedKind);
  const body =
    normalizedPeriod === 'daily'
      ? renderCategoryDailyBrief({ categoryDisplayName, deskTitle, parsed: parsedForUse })
      : renderCategoryWeeklyBrief({ categoryDisplayName, deskTitle, parsed: parsedForUse });
  const renderedValidation = validateRenderedSampleBody(body, normalizedPeriod, expectedAssets);
  if (!renderedValidation.ok) return { ok: false, error: renderedValidation.reasons.join(','), parsed: parsedForUse, body };
  return {
    ok: true,
    title: `${categoryDisplayName} ${ND} ${deskTitle}`,
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

function validateOneSectionBody(sectionKey, bodyText) {
  const b = String(bodyText || '').trim();
  if (b.length < 72) return { ok: false, reason: 'thin' };
  if (BANNED_PHRASES_RE.test(b)) return { ok: false, reason: 'banned' };
  if (GENERIC_INSTRUMENT_SCAFFOLD_RE.test(b)) return { ok: false, reason: 'scaffold' };
  if (NUMBERED_SCENARIO_RE.test(b)) return { ok: false, reason: 'scenario_framing' };
  if (GENERIC_BOILERPLATE_RE.test(b)) return { ok: false, reason: 'boilerplate' };
  return { ok: true };
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
      + 'Do not enumerate a watchlist, do not use one-paragraph-per-symbol structure, do not fabricate parallel â€œtemplatesâ€ across names.',
  };
}

function fallbackSectionBodyByKey(sectionKey, heading, factPack) {
  const label = factPack.briefKindLabel || 'Desk';
  const drivers = (factPack.keyDrivers || []).slice(0, 5).map(packDriverLine).filter(Boolean).join(' Â· ');
  const cross = (factPack.crossAssetSignals || []).slice(0, 4).map(packSignalLine).filter(Boolean).join(' Â· ');
  const quotes = (factPack.liveQuotes || [])
    .map((q) => `${q.symbol}${q.last != null ? ` ${q.last}` : ''}${q.changePct != null ? ` (${q.changePct}%)` : ''}`)
    .join(' Â· ');
  const cal = (factPack.calendar || [])
    .slice(0, 4)
    .map((c) => c.event)
    .filter(Boolean)
    .join(' Â· ');
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
    market_behaviour: `${label} tape: ${pulse ? `${pulse} tone.` : 'Two-way liquidity.'} ${factPack.traderFocus?.length ? `Focus: ${normaliseArray(factPack.traderFocus.map((x) => (typeof x === 'string' ? x : x.title || ''))).slice(0, 3).join(' Â· ')}.` : ''}`,
    what_matters_next: `${label}: next catalysts: ${cal || 'Use calendar rows in the pack for timing; name specific releases.'} ${quotes ? `Context: ${quotes.slice(0, 180)}.` : ''}`,
    trader_takeaway: `${label} takeaway: lean with ${drivers ? drivers.split(' Â· ')[0] : 'the dominant macro pulse'}; reassess if the tape contradicts that read. ${quotes ? `Lead context: ${quotes.split(' Â· ')[0] || 'from spot snapshot'}.` : ''}`,
    weekly_overview: `Weekly ${label}: ${drivers ? drivers.slice(0, 280) : baseCtx} ${cross ? `Cross-asset: ${cross.slice(0, 200)}.` : ''}`,
    macro_theme: `Macro theme for ${label}: ${drivers || cross || 'Policy, growth, and inflation path.'}`,
    cross_asset_breakdown: `${label} weekly cross-asset: ${cross || 'Leadership vs laggards across linked markets.'}`,
    structural_shift: `${label} structure: ${pulse || 'No single dominant break'}; ${drivers ? `Watch ${drivers.slice(0, 200)}` : 'track breadth and correlation.'}.`,
    key_events_recap: `Week in ${label}: ${cal || 'Key prints in calendar above.'} ${drivers ? `Drivers: ${drivers.slice(0, 240)}.` : ''}`,
    forward_outlook: `Forward for ${label}: ${cal ? `Next focus: ${cal}.` : 'Event path from calendar.'} ${cross ? cross.slice(0, 200) : ''}`,
    strategic_takeaway: `Strategic stance for ${label}: ${drivers ? drivers.split(' Â· ')[0] : 'Stay with confirmed macro'}; risk scales with event density.`,
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
      'Return JSON only: {"body":"string"} â€” one prose section, 2â€“5 short paragraphs max, plain prose only. '
      + 'Inside body: use sentence case (never ALL CAPS). No asterisks, no hyphen bullets, no em/en dashes as separators (use commas and periods). '
      + 'No markdown headings inside body.',
    bannedSubstrings: factPack.bannedPhrases || BANNED_PHRASES,
    rewriteNote:
      uniquenessRetry || validationFix
        ? hasLlmSup
          ? 'Prior attempt failed validation: change wording; use factPack plus llmDataSupplement when needed â€” still no URLs.'
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
              + 'Tone: clean, sharp, narrative flow like a professional desk note â€” no checklist voice, no filler, no symmetrical bullet patterns. '
              + 'FORBIDDEN anywhere in body: numbered scenarios (Scenario 1/2/3), pathway labels, "catalyst trigger", "invalidation", "position sizing", '
              + '"base and surprise", playbook templates, or one-paragraph-per-ticker blocks. '
              + 'No sources, URLs, or citations. '
              + STRUCTURED_DATA_FIRST_RULE
              + ' If factPack.llmDataSupplement is non-null, it is backup desk synthesis when live price feeds were thin â€” use it only together with factPack; prefer agreement with liveQuotes/headlines when both exist. '
              + 'Obey bannedSubstrings exactly (no substring matches in body). '
              + 'Typography: sentence case only in body; never ALL CAPS blocks. Do not use *, -, â€”, or â€“ as punctuation or bullets; use commas and full stops. '
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
  const label =
    BRIEF_KIND_LABELS[normalizedKind] ||
    deskCategoryDisplayName(canonicalDeskCategoryKind(normalizedKind)) ||
    'Desk';
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
 * Parse automation run_key for reserveRun reshape logic.
 * - `auto-brief:daily:2026-04-13:stocks` (legacy sleeve slug)
 * - `aura-institutional:daily-wfa:aura_institutional_daily_forex:2026-04-13`
 * - `aura-institutional:wfa:aura_institutional_weekly_forex:2026-04-13`
 */
function parseAutoBriefRunKey(runKey) {
  const s = String(runKey || '');
  const m = s.match(/^auto-brief:(daily|weekly):(\d{4}-\d{2}-\d{2}):([^:]+)$/);
  if (m) return { period: m[1], deskDate: m[2], briefKind: String(m[3] || '').toLowerCase() };
  const d = s.match(/^aura-institutional:daily-wfa:([^:]+):(\d{4}-\d{2}-\d{2})$/);
  if (d) return { period: 'daily', deskDate: d[2], briefKind: String(d[1] || '').toLowerCase() };
  const w = s.match(/^aura-institutional:wfa:([^:]+):(\d{4}-\d{2}-\d{2})$/);
  if (w) return { period: 'weekly', deskDate: w[2], briefKind: String(w[1] || '').toLowerCase() };
  return null;
}

/**
 * True when a stored category brief predates the PDF-aligned renderers (missing required ## sections).
 * Used to retire legacy "Market Context" / section-lock bodies without manual DB deletes.
 */
function categoryStoredBodyNeedsPdfReshape(bodyText, normalizedPeriod) {
  const text = String(bodyText || '');
  if (!text.trim()) return true;
  const isWeekly = normalizedPeriod === 'weekly';
  if (!isWeekly) {
    if (/\n##\s+GLOBAL\s+GEOPOLITICAL\s+ENVIRONMENT\s*\n/i.test(text)) return false;
    if (
      /\n##\s+Macro intro and structural flow\s*\n/i.test(text) &&
      /\n##\s+Overall daily structure\s*\n/i.test(text)
    ) {
      return false;
    }
    if (/^##\s*MARKET CONTEXT\s*$/im.test(text)) return true;
    if (/^##\s*CROSS-ASSET FLOW\s*$/im.test(text)) return true;
    return true;
  }
  // Institutional weekly WFA stored body (markdown headings from assembleWeeklyWfaPlain).
  if (
    /\n##\s+Overview\s*\n/i.test(text) &&
    /\n##\s+Summary for last week\s*\n/i.test(text) &&
    /\n##\s+What matters this week structurally\s*\n/i.test(text) &&
    /\n##\s+Scenario framework\s*\n/i.test(text)
  ) {
    return false;
  }
  // Legacy weekly markers (older automation templates).
  if (
    /\n##\s+OVERVIEW\s*\n/i.test(text) &&
    /\n##\s+SUMMARY FOR LAST WEEK\b/m.test(text) &&
    /\n##\s+WHAT\s+MATTERS\s+THIS\s+WEEK\s+STRUCTURALLY\s*\n/i.test(text) &&
    /\n##\s+SESSION-BY-SESSION\s+WATCH\s*\n/i.test(text)
  ) {
    return false;
  }
  if (/^##\s*Overview\s*$/im.test(text)) return true;
  if (/^##\s*WEEKLY MACRO THEME\s*$/im.test(text)) return true;
  return true;
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
          'SELECT id, file_data FROM trader_deck_briefs WHERE id = ? LIMIT 1',
          [briefId]
        );
        const br = briefRows?.[0];
        if (!br?.id) {
          await executeQuery(
            `UPDATE trader_deck_brief_runs
             SET status = 'started', brief_id = NULL, error_message = 'recovered_missing_brief_row', updated_at = CURRENT_TIMESTAMP
             WHERE run_key = ?`,
            [runKey]
          );
          return true;
        }

        const rk = parseAutoBriefRunKey(runKey);
        const rawText = Buffer.isBuffer(br.file_data) ? br.file_data.toString('utf8') : String(br.file_data || '');
        const institutionalSleeve =
          rk &&
          (isInstitutionalDailyWfaKind(rk.briefKind) || isInstitutionalWeeklyWfaKind(rk.briefKind));
        const legacyDeskCategory = rk && isDeskAutomationCategoryKind(rk.briefKind);
        if (
          rk &&
          (institutionalSleeve || legacyDeskCategory) &&
          categoryStoredBodyNeedsPdfReshape(rawText, rk.period)
        ) {
          console.info('[brief-gen] replacing legacy category brief â€” PDF template markers missing', {
            runKey,
            briefId,
            deskDate: rk.deskDate,
            briefKind: rk.briefKind,
          });
          await executeQuery('DELETE FROM trader_deck_briefs WHERE id = ?', [briefId]);
          await executeQuery(
            `UPDATE trader_deck_brief_runs
             SET status = 'started', brief_id = NULL, error_message = 'pdf_template_upgrade', updated_at = CURRENT_TIMESTAMP
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
  mimeType = 'text/markdown; charset=utf-8',
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
  const briefVersion = await getNextBriefVersion({ period: normalizedPeriod, date: safeDate, briefKind: 'general' });
  const [result] = await executeQuery(
    `INSERT INTO trader_deck_briefs (date, period, title, file_url, mime_type, file_data, brief_kind, brief_version)
     VALUES (?, ?, ?, NULL, 'text/plain; charset=utf-8', ?, 'general', ?)`,
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
  // Legacy DB templates: {dateLong} may still include a weekday, duplicating {weekday} (e.g. "Monday Monday, 13 Aprilâ€¦").
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
    console.warn('[brief-gen] run ledger present but no brief row â€” resetting lock for retry', {
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
      const innerTitle =
        normalizedPeriod === 'daily'
          ? formatDailySampleTitle(date, timeZone)
          : formatWeeklySampleTitle(date, timeZone);
      const fbParsed =
        normalizedPeriod === 'daily'
          ? buildPdfFallbackDailyParsed(factPack, selectedTop5)
          : buildPdfFallbackWeeklyParsed(factPack, selectedTop5, date, timeZone);
      title = `${BRIEF_KIND_LABELS[normalizedKind]} - ${innerTitle}`;
      body =
        normalizedPeriod === 'daily'
          ? renderCategoryDailyBrief({ title: innerTitle, parsed: fbParsed, runDate, timeZone })
          : renderCategoryWeeklyBrief({ title: innerTitle, parsed: fbParsed });
      validation = {
        ok: true,
        reasons: [],
        mode: 'pdf-fallback-factpack',
      };
      console.info('[brief-gen] saved PDF-template brief from desk API fact pack (structured JSON path unavailable)', {
        category: normalizedKind,
        date,
      });
    }
    if (body && Array.isArray(contextBodies) && contextBodies.length > 0) {
      let maxSim = 0;
      for (const prior of contextBodies) {
        maxSim = Math.max(maxSim, similarityScore(body, String(prior || '')));
      }
      if (maxSim > 0.42) {
        console.warn('[brief-gen] elevated lexical overlap vs prior sleeves (same desk date)', {
          briefKind: normalizedKind,
          maxSimilarity: Number(maxSim.toFixed(3)),
          priorsCompared: contextBodies.length,
        });
      }
    }
    if (body) body = diversifyBody(body);
    const generationMeta = {
      generatedAt: new Date().toISOString(),
      topInstruments: selectedTop5,
      instrumentScores: (selection.scoreRows || []).map((r) => ({ symbol: r.symbol, score: r.score, breakdown: r.breakdown })),
      partialDataMode,
      validationOk: validation.ok,
      validationReasons: validation.ok ? [] : validation.reasons,
      generationMode: validation.mode || 'sample-structured',
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
      '[brief-gen] quote cache is empty â€” configure TWELVE_DATA_API_KEY and/or valid FMP_API_KEY and FINNHUB_API_KEY (403 usually means invalid key or plan).'
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
      const variants = legacyAliasesForCanonical(k);
      const ph = variants.map(() => '?').join(',');
      const [r] = await executeQuery(
        `SELECT id FROM trader_deck_briefs WHERE date = ? AND period = ? AND LOWER(brief_kind) IN (${ph}) LIMIT 1`,
        [date, normalizedPeriod, ...variants.map((x) => String(x).toLowerCase())]
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
  console.info('[brief-gen] missing category briefs â€” backfill', {
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
  const seeded = await loadExistingCategoryBodiesForDeskDate(date, normalizedPeriod);
  const existingBodies = seeded.bodies.slice();
  const existingExcerpts = seeded.excerpts.slice();
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
  fastPreview = false,
  previewBriefKind = 'stocks',
}) {
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const template = templateText
    ? parseTemplateFromText(templateText, normalizedPeriod)
    : await getTemplate(normalizedPeriod);
  const { market, econ, news } = await getSharedBriefInputs(normalizedPeriod, date);
  const previewKind = normalizeBriefKind(previewBriefKind || 'stocks');
  const quoteSymbols = fastPreview
    ? getUniverseSymbols(previewKind).slice(0, 36)
    : collectAllAutomationUniverseSymbols();
  const qc = await buildQuoteCacheForSymbols(quoteSymbols, fetchAutomationQuoteWithFallback);
  const sel = await scoreAndSelectTopInstruments({
    briefKind: previewKind,
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
    briefKind: previewKind,
    topInstruments: previewTop,
    liveQuotes,
    instrumentScoreRows: sel.scoreRows,
    quoteCache: qc,
  });
  if (
    !fastPreview &&
    needsLlmDataSupplement(qc, econ, news) &&
    isTraderDeskAutomationConfigured()
  ) {
    const llmSup = await fetchLlmBriefDataSupplementGlobal({
      period: normalizedPeriod,
      dateStr: date,
      timeZone,
      market,
      econ,
      news,
      symbolSample: fastPreview ? quoteSymbols : collectAllAutomationUniverseSymbols(),
    });
    if (llmSup) factPack.llmDataSupplement = llmSup;
  }
  const runJs = jsDateFromDeskYmd(date, timeZone);
  const innerTitle =
    normalizedPeriod === 'daily'
      ? formatDailySampleTitle(date, timeZone)
      : formatWeeklySampleTitle(date, timeZone);
  const fbParsed =
    normalizedPeriod === 'daily'
      ? buildPdfFallbackDailyParsed(factPack, previewTop)
      : buildPdfFallbackWeeklyParsed(factPack, previewTop, date, timeZone);
  const ND = '\u2013';
  const cat = BRIEF_KIND_LABELS[previewKind] || BRIEF_KIND_LABELS.stocks;
  const title = stripSources(`${cat} ${ND} ${innerTitle}`);
  let body =
    normalizedPeriod === 'daily'
      ? renderCategoryDailyBrief({
          categoryDisplayName: cat,
          deskTitle: innerTitle,
          parsed: fbParsed,
        })
      : renderCategoryWeeklyBrief({ categoryDisplayName: cat, deskTitle: innerTitle, parsed: fbParsed });
  body = diversifyBody(stripSources(polishBriefMarkdown(body)));
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
  /** ~UK cash equity close: prefetch research for the next calendar sessionâ€™s brief (stored under tomorrowâ€™s date). */
  return hh === 22 && mm < 20;
}

/**
 * Distinct canonical category brief rows for this desk date (aura_institutional_* only).
 */
async function countCanonicalIntelBriefRows(period, dateYmd) {
  const p = normalizePeriod(period);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || ''))) return 0;
  const kinds = p === 'weekly' ? [...INSTITUTIONAL_WEEKLY_WFA_KINDS] : [...INSTITUTIONAL_DAILY_WFA_KINDS];
  const lower = kinds.map((k) => String(k).toLowerCase());
  const ph = lower.map(() => '?').join(',');
  try {
    const [rows] = await executeQuery(
      `SELECT COUNT(DISTINCT LOWER(brief_kind)) AS n FROM trader_deck_briefs
       WHERE date = ? AND period = ? AND LOWER(brief_kind) IN (${ph})`,
      [dateYmd, p, ...lower]
    );
    return Number(rows?.[0]?.n || 0);
  } catch (_) {
    return 0;
  }
}

/**
 * Throttled catch-up when the intel pack is still incomplete (missed narrow cron, partial failure, or cold start).
 * Called from cron only â€” avoids hammering APIs every 5 minutes when healthy.
 */
async function shouldRunIntelPackCatchUp({ now = new Date(), period, timeZone = 'Europe/London' } = {}) {
  if (!isTraderDeskAutomationConfigured()) return false;
  const normalizedPeriod = normalizePeriod(period);
  const deskYmd = normalizeOutlookDate(normalizedPeriod, toYmdInTz(now, timeZone));
  const n = await countCanonicalIntelBriefRows(normalizedPeriod, deskYmd);
  if (n >= expectedIntelAutomationRowCount(normalizedPeriod)) return false;

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
  /** Weekly: retry Monâ€“Thu morning after Monday 00:00 generation window. */
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
   * Daily category pack: Monâ€“Sat only, full midnight hour Europe/London (00:00â€“00:59).
   * Weekly WFA pack: Monday 00:00 hour (week-ending storage key unchanged).
   */
  if (normalizedPeriod === 'daily') {
    if (hh !== 0) return false;
    return (
      wd.startsWith('mon') ||
      wd.startsWith('tue') ||
      wd.startsWith('wed') ||
      wd.startsWith('thu') ||
      wd.startsWith('fri') ||
      wd.startsWith('sat')
    );
  }
  return wd.startsWith('mon') && hh === 0;
}

function getInstitutionalBriefDeps() {
  return {
    executeQuery,
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

async function generateAndStoreSundayMarketOpenBriefOnly(opts) {
  return sundayMarketOpenBrief.generateAndStoreSundayMarketOpenBrief(getInstitutionalBriefDeps(), opts);
}

function shouldRunSundayMarketOpenWindow(opts) {
  return sundayMarketOpenBrief.shouldRunSundayMarketOpenWindow(opts);
}

/** Legacy cron hook: per-instrument OpenAI layer removed â€” briefs are narrative sections only. */
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
  generateAndStoreSundayMarketOpenBriefOnly,
  shouldRunSundayMarketOpenWindow,
  generatePreviewBrief,
  publishManualBrief,
  prefetchInstrumentResearchForDaily,
  shouldRunWindow,
  shouldRunIntelPackCatchUp,
  countCanonicalIntelBriefRows,
  shouldPrefetchInstrumentResearchWindow,
  isTraderDeskAutomationConfigured,
  stripSources,
  assertNoSources,
  _test: {
    shouldRunWindow,
    shouldRunIntelPackCatchUp,
    countCanonicalIntelBriefRows,
    shouldPrefetchInstrumentResearchWindow,
    shouldRunSundayMarketOpenWindow,
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
