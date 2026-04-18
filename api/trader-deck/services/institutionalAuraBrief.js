/**
 * Aura FX institutional AI brief.
 * Daily: unified desk note (macro + eight sections, prose only).
 * Weekly: unified fundamental analysis (overview → conditional framework → recap → cross-asset → asset deep dives → forward look, prose only).
 */

const { buildMacroSummaryLines } = require('./briefInstrumentUniverse');

/** Core Aura brief sleeve — order fixed for validation (default generation). */
const INSTITUTIONAL_INSTRUMENTS = [
  { id: 'XAUUSD', label: 'XAU/USD' },
  { id: 'US30', label: 'US30' },
  { id: 'NAS100', label: 'NASDAQ / US100' },
  { id: 'WTI', label: 'OIL (WTI)' },
  { id: 'GBPUSD', label: 'GBP/USD' },
  { id: 'EURUSD', label: 'EUR/USD' },
  { id: 'USDJPY', label: 'USD/JPY' },
  { id: 'USDCHF', label: 'USD/CHF' },
  { id: 'CADJPY', label: 'CAD/JPY' },
  { id: 'EURCHF', label: 'EUR/CHF' },
  { id: 'GBPJPY', label: 'GBP/JPY' },
];

/** Optional pairs — enable with env AURA_BRIEF_INCLUDE_OPTIONAL_PAIRS=true (same quote pipeline IDs must exist in cache). */
const OPTIONAL_INSTITUTIONAL_INSTRUMENTS = [
  { id: 'XAUEUR', label: 'XAU/EUR' },
  { id: 'XAUGBP', label: 'XAU/GBP' },
  { id: 'XAUAUD', label: 'XAU/AUD' },
  { id: 'EURGBP', label: 'EUR/GBP' },
  { id: 'USDCAD', label: 'USD/CAD' },
  { id: 'BTCJPY', label: 'BTC/JPY' },
];

function getInstitutionalInstrumentUniverse() {
  const on = String(process.env.AURA_BRIEF_INCLUDE_OPTIONAL_PAIRS || '').toLowerCase();
  if (on === 'true' || on === '1' || on === 'yes') {
    return [...INSTITUTIONAL_INSTRUMENTS, ...OPTIONAL_INSTITUTIONAL_INSTRUMENTS];
  }
  return INSTITUTIONAL_INSTRUMENTS;
}

const GENERIC_FAIL_RE =
  /\bit is important to note\b|\bin conclusion\b|\bmoving forward\b|\bas an ai\b|\bi cannot\b|\bleverage appropriate\b|\bstay nimble\b|\bremain cautious\b|chatgpt|as a language model/i;

const BANNED_SHALLOW_RE =
  /\b(mixed sentiment|watch (?:the )?data|reassess if invalidated|monitor (?:closely )?for|markets will be watching)\b/i;

/** Weak hedging / filler — reject in weekly QC. */
const HEDGE_WEAK_RE =
  /\b(could possibly|might potentially|may perhaps|could perhaps|might conceivably|perhaps possibly)\b/i;

function goldWhyMeansTooLazy(why, means) {
  const t = `${why}\n${means}`;
  const low = t.toLowerCase();
  if (!/\bsafe[\s-]?haven\b/.test(low)) return false;
  const hasMacro =
    /\byield|treasury|real rate|dxy|dollar|\busd\b|oil|wti|\bcru(de)?\b|inflation|fed\b/.test(low);
  return !hasMacro;
}

function addDaysYmd(ymdStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymdStr || ''))) return ymdStr;
  const d = new Date(`${ymdStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function weekdayShortInTz(ymdStr, timeZone) {
  const d = new Date(`${ymdStr}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
}

function weekdayIndexFromShort(s) {
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[String(s || '').slice(0, 3)] ?? 0;
}

/** Next Mon and Fri (5-day window) for “this trading week” from run date in TZ. */
function upcomingMonFriYmd(runDate, timeZone) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(runDate);
  const wi = weekdayIndexFromShort(weekdayShortInTz(ymd, timeZone));
  const daysToMon = wi === 0 ? 1 : (8 - wi) % 7;
  const monYmd = addDaysYmd(ymd, daysToMon);
  const friYmd = addDaysYmd(monYmd, 4);
  return { monYmd, friYmd };
}

function previousWeekMonFriYmd(monYmd) {
  const prevMon = addDaysYmd(monYmd, -7);
  const prevFri = addDaysYmd(monYmd, -3);
  return { prevMon, prevFri };
}

function ordinalDay(n) {
  const v = Number(n);
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

function formatRangeOrdinal(ymdStart, ymdEnd, timeZone) {
  const d1 = new Date(`${ymdStart}T12:00:00.000Z`);
  const d2 = new Date(`${ymdEnd}T12:00:00.000Z`);
  const m1 = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone }).format(d1);
  const m2 = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone }).format(d2);
  const day1 = ordinalDay(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(d1));
  const day2 = ordinalDay(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(d2));
  if (m1 === m2) return `${day1} – ${day2} ${m1}`;
  return `${day1} ${m1.split(' ')[0]} – ${day2} ${m2}`;
}

async function fetchEconomicCalendarInline() {
  try {
    const mod = require('../economic-calendar');
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
      json: (payload) => {
        response = payload;
        return payload;
      },
      end: () => {},
    };
    await mod(req, res);
    return Array.isArray(response?.events) ? response.events : [];
  } catch (_) {
    return [];
  }
}

function eventYmd(e) {
  const raw = e.date || e.time || e.datetime || '';
  const s = String(raw).trim();
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** Prefer rows that fall on the brief calendar day (London date string). */
function filterCalendarForBriefDate(econ, briefDateYmd) {
  if (!briefDateYmd || !Array.isArray(econ)) return econ || [];
  const matched = econ.filter((e) => {
    const y = eventYmd(e);
    return y === briefDateYmd;
  });
  return matched.length > 0 ? matched : econ;
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

function buildInstitutionalFactPack({
  period,
  market,
  econ,
  news,
  quoteCache,
  briefDateYmd,
  timeZone,
  runDate,
  instrumentUniverse = INSTITUTIONAL_INSTRUMENTS,
}) {
  const macroSummary = buildMacroSummaryLines(
    market,
    period === 'weekly' ? 'aura_institutional_weekly' : 'aura_institutional_daily',
    period
  );
  const drivers = (market.keyDrivers || []).slice(0, 12).map(packDriverLine).filter(Boolean);
  const cross = (market.crossAssetSignals || []).slice(0, 12).map(packSignalLine).filter(Boolean);
  const quotes = instrumentUniverse.map(({ id }) => {
    const q = quoteCache && quoteCache.get ? quoteCache.get(id) : null;
    return {
      id,
      last: q?.c != null ? q.c : null,
      changePct: q?.dp != null ? Math.round(q.dp * 100) / 100 : null,
      high: q?.h != null ? q.h : null,
      low: q?.l != null ? q.l : null,
    };
  });
  const dayRows = filterCalendarForBriefDate(econ, briefDateYmd);
  const calendarToday = dayRows.slice(0, 28).map((e) => ({
    currency: e.currency || e.country || '',
    event: e.event || e.title || '',
    impact: e.impact || '',
    time: e.time || '',
    date: eventYmd(e) || briefDateYmd,
    actual: e.actual != null ? String(e.actual) : '',
    forecast: e.forecast != null ? String(e.forecast) : '',
    previous: e.previous != null ? String(e.previous) : '',
  }));
  const calendarWeekAhead = (econ || []).slice(0, 45).map((e) => ({
    currency: e.currency || e.country || '',
    event: e.event || e.title || '',
    impact: e.impact || '',
    time: e.time || '',
    date: eventYmd(e),
  }));

  const { monYmd, friYmd } = upcomingMonFriYmd(runDate || new Date(), timeZone || 'Europe/London');
  const { prevMon, prevFri } = previousWeekMonFriYmd(monYmd);
  const tz = timeZone || 'Europe/London';
  const wdShort = weekdayShortInTz(briefDateYmd, tz);
  const wi = weekdayIndexFromShort(wdShort);
  let tradingWeekPhase = 'midweek';
  if (wi === 1 || wi === 2) tradingWeekPhase = 'early-week';
  else if (wi === 3) tradingWeekPhase = 'midweek';
  else if (wi === 4 || wi === 5) tradingWeekPhase = 'late-week';
  else tradingWeekPhase = 'outside-core-session';
  const tradingWeekMeta = {
    weekdayShort: wdShort,
    weekdayLong: new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: tz }).format(
      new Date(`${briefDateYmd}T12:00:00.000Z`)
    ),
    isoWeekdayIndex: wi,
    tradingWeekPhase,
  };

  return {
    period,
    briefDateYmd,
    tradingWeekMeta,
    weekAheadRangeLabel: formatRangeOrdinal(monYmd, friYmd, timeZone || 'Europe/London'),
    previousWeekRangeLabel: formatRangeOrdinal(prevMon, prevFri, timeZone || 'Europe/London'),
    marketRegime: market.marketRegime || null,
    marketPulse: market.marketPulse || null,
    macroSummary,
    keyDrivers: drivers,
    crossAssetSignals: cross,
    traderFocus: (market.traderFocus || []).slice(0, 10),
    riskRadar: (market.riskRadar || []).slice(0, 10),
    calendarToday,
    calendarWeekAhead,
    headlines: (news || []).slice(0, 30),
    liveQuotesByInstrument: quotes,
    updatedAt: new Date().toISOString(),
  };
}

/** Matches Trader Desk PDF line: "Daily Brief – Thursday 5th March 2026" (en dash). */
function formatDailyBriefTitle(runDate, timeZone) {
  const ND = '\u2013';
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(runDate);
  const dayNum = Number(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(runDate));
  const dayOrd = ordinalDay(dayNum);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(runDate);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(runDate);
  return `Daily Brief ${ND} ${weekday} ${dayOrd} ${month} ${year}`;
}

/** Matches PDF title: WEEKLY FUNDAMENTAL ANALYSIS – (2nd – 6th March 2026). */
function formatWeeklyFundamentalTitle(weekRangeLabel) {
  const ND = '\u2013';
  const r = String(weekRangeLabel || '').trim();
  return `WEEKLY FUNDAMENTAL ANALYSIS ${ND} (${r})`;
}

function unifiedWeeklyBriefHint(factPack) {
  const s = `${factPack?.previousWeekRangeLabel || ''}|${factPack?.weekAheadRangeLabel || ''}`;
  const h = [...s].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const hints = [
    'Treat oil as common anchor, Treasury yields as amplifier, payroll or top-tier US data as catalyst where the calendar supports it — say so in transmission language, not labels only.',
    'Force each asset sleeve’s WHY block to reconnect to oil, yields, or USD funding at least once unless factPack contradicts.',
    'Keep conditional scenarios mutually distinct: continuation vs reversal vs break must reference different risk states.',
  ];
  return hints[Math.abs(h) % hints.length];
}

function unifiedDailyBriefHint(factPack) {
  const seed = `${factPack?.briefDateYmd || ''}|${factPack?.weekAheadRangeLabel || ''}`;
  const h = [...seed].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const hints = [
    'Foreground explicit transmission chains (energy, inflation expectations, front-end yields, USD, cross-asset risk proxies) rather than disconnected headlines.',
    'Treat the piece as one continuous desk note: macro narrative must hand off cleanly into the eight asset sleeves.',
    'Anchor forward risk in calendarToday / calendarWeekAhead + positioning logic — interpretation, not a pasted economic calendar.',
  ];
  return hints[Math.abs(h) % hints.length];
}

async function callOpenAIJson(systemPrompt, userObj, getAutomationModel, options = {}) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'no_perplexity_key' };
  const maxTokens = options.maxTokens ?? 10000;
  const timeoutMs = options.timeoutMs ?? 120000;
  const temperature = options.temperature ?? 0.28;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userObj) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: 'empty_completion' };
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { ok: true, parsed };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e.message || 'perplexity_error' };
  }
}

const UNIFIED_DAILY_SYSTEM = `You are a senior Aura FX institutional desk strategist producing ONE unified daily house note for traders.
Voice: sober institution; causal reasoning; positioning-aware; zero chatbot filler.
Use ONLY factPack data as factual anchors — do not invent scheduled releases or prints that are not supported by calendarToday/calendarWeekAhead/headlines/drivers.

Return JSON only with exactly these keys (all strings, prose paragraphs only):
- dayContextIntro: 2–4 paragraphs. STATE where we are in the trading week using factPack.tradingWeekMeta (phase, weekday). Frame macro POSITIONING for this session (e.g. post-CPI digestion, pre-major payroll risk, midweek liquidity, month-end flows) using calendarWeekAhead/calendarToday — institutional framing, NOT a headline recap.
- macroNarrative: 4–8 paragraphs. CORE ENGINE. Explain current macro state; inflation / yields / oil interactions; positioning behaviour. Include at least one explicit causal chain in prose (conceptually: oil ↔ inflation expectations ↔ yields ↔ USD ↔ equities/gold — vary wording and ordering to fit factPack).
- transitionStatement: 1 paragraph that bridges macro narrative into the sectional body (you may use "Today therefore revolves around…" as a pattern but vary phrasing).
- globalGeopoliticalEnvironment: persistent vs escalating risk; energy/security implications where relevant — analysis, not headline regurgitation.
- equities: reaction to yields/rates; risk appetite vs quality; positioning sensitivity using factPack context.
- forexUsd: yield-driven USD logic; dollar strength/weakness as price of money / funding, not slogans.
- commodities: oil as anchor; gold as reaction asset to real yields and USD — tied to factPack.liveQuotesByInstrument where helpful.
- fixedIncome: yield direction and curve interpretation (what repricing implies for risk assets).
- crypto: risk-proxy / liquidity-beta behaviour — not boosterism.
- marketSentiment: positioning and risk tone from an institutional lens — NOT retail sentiment clichés.
- keyEventsForwardLook: what matters next — INTERPRETATION tied to calendarWeekAhead/calendarToday (not a bullet calendar dump).

Formatting rules (strict):
- Every value must be plain prose: NO markdown headings, NO bullet lists, NO numbered lists, NO line-leading "- ", "* ", or "1." patterns.
- Separate paragraphs with blank lines inside a JSON string using \\n\\n where needed.

Use briefMeta.narrativeHint when present to vary emphasis day-to-day.

FORBIDDEN across all strings: "mixed sentiment", "watch the data", "reassess if invalidated", "as an AI", generic disclaimers, scenario numbering, playbook jargon.`;

const WEEKLY_ASSET_SLEEVES = ['GOLD', 'EQUITIES', 'USD', 'OIL', 'YIELDS'];

const UNIFIED_WEEKLY_SYSTEM = `You are a senior Aura FX institutional desk strategist writing ONE weekly fundamental analysis for traders.
Mandatory voice: declarative and confident; state mechanisms plainly. Fact-anchored from factPack only — do not invent prints or events absent from headlines/calendar/liveQuotesByInstrument/drivers.

Return JSON ONLY with exactly this shape:
{
  "overview": string (multiple paragraphs).
    MUST explicitly classify the coming week type as ONE of these phrases verbatim somewhere: "confirmation week", "reaction week", or "transition week" — justify in prose why that label fits.
    MUST pose the regime question in substance: whether this is peak escalation OR the start of a new regime (use that tension in your own words).
    MUST frame transmission using the ideas: crude oil anchors risk and inflation optics, Treasury yields amplify repricing of policy and duration, payroll or top-tier US labour data acts as catalyst when calendarWeekAhead supports it — integrate as analysis, not as a labeled list.

  "conditionalFramework": {
    "scenarios": [ string, string, string ]
  }
    The three strings are the continuation / reversal / break scenarios (distinct outcomes). BEFORE them in assembly the document will include the signature lead sentence exactly: Week will determine whether:
    Write each scenario as a full declarative clause or sentence completing that idea (what continues, what reverses, what breaks).

  "priorWeekRecap": string (multiple paragraphs).
    Structural narrative of the PRIOR window (previousWeekRangeLabel): NOT a chronological headline list.
    Cover what changed structurally, geopolitical overlay, how markets reacted, and interpretation — causally linked.

  "keyMarketReactions": string (multiple paragraphs).
    Dense read of how risk assets, USD, oil, gold, and rates behaved and why — paragraph prose only (this replaces bullet-style "reactions").

  "crossAssetLinkage": string (multiple paragraphs).
    Explicitly tie conditions back through oil, yields, and USD as the spine; show how each sleeve fed the others last week and into the week ahead.

  "assetDeepDives": [
    { "sleeve": "GOLD", "whatHappened": string, "whyItHappened": string, "whatItMeans": string },
    { "sleeve": "EQUITIES", ... },
    { "sleeve": "USD", ... },
    { "sleeve": "OIL", ... },
    { "sleeve": "YIELDS", ... }
  ]
    Exact order and sleeve spellings as above. Each block MUST use institutional macro linkage in WHY — reject lazy safe-haven boilerplate for gold (do not explain moves only as "safe haven demand"). Each WHAT IT MEANS states positioning and invalidation logic in firm language.

  "forwardLook": string (multiple paragraphs).
    What the next week depends on; what confirms vs invalidates current positioning; tie to calendarWeekAhead when material.

Formatting rules (strict):
- All strings are plain prose paragraphs separated by \\n\\n where needed inside JSON.
- NO markdown, NO bullet symbols, NO numbered lists, NO line-leading "- ", "* ", or "1." patterns.
- NO asterisk emphasis, NO hash headings inside strings.

Use briefMeta.narrativeHint when present.

FORBIDDEN across all text: hedging stacks ("could possibly", "might potentially"), chatbot filler, generic "mixed sentiment", shallow safe-haven-only gold stories, scenario numbering labels like "Scenario 1:".`;

const UNIFIED_SECTION_TITLES = [
  'GLOBAL GEOPOLITICAL ENVIRONMENT',
  'EQUITIES',
  'FOREX (USD FOCUS)',
  'COMMODITIES',
  'FIXED INCOME',
  'CRYPTO',
  'MARKET SENTIMENT',
  'KEY EVENT / FORWARD LOOK',
];

function looksLikeListSyntax(s) {
  const t = String(s || '');
  return /(^|\n)\s*[-*]\s+\S/.test(t) || /(^|\n)\s*\d+[.)]\s+\S/.test(t);
}

function sanitizeProseField(s) {
  return String(s || '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*]\s+(?=\S)/, '')
        .replace(/^\s*\d+[.)]\s+(?=\S)/, '')
        .trimEnd()
    )
    .join('\n')
    .trim();
}

function sanitizeUnifiedDoc(md) {
  return String(md || '')
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      if (/^[-*]\s+\S/.test(t)) return line.replace(/^\s*[-*]\s+/, '').trimEnd();
      if (/^\d+[.)]\s+\S/.test(t)) return line.replace(/^\s*\d+[.)]\s+/, '').trimEnd();
      return line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateUnifiedDaily(parsed) {
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['no_payload'] };

  const keys = [
    'dayContextIntro',
    'macroNarrative',
    'transitionStatement',
    'globalGeopoliticalEnvironment',
    'equities',
    'forexUsd',
    'commodities',
    'fixedIncome',
    'crypto',
    'marketSentiment',
    'keyEventsForwardLook',
  ];
  for (const k of keys) {
    const v = String(parsed[k] || '').trim();
    if (!v) reasons.push(`missing_${k}`);
  }

  const minLens = {
    dayContextIntro: 260,
    macroNarrative: 780,
    transitionStatement: 55,
    globalGeopoliticalEnvironment: 220,
    equities: 220,
    forexUsd: 220,
    commodities: 220,
    fixedIncome: 220,
    crypto: 180,
    marketSentiment: 220,
    keyEventsForwardLook: 220,
  };
  for (const [k, min] of Object.entries(minLens)) {
    const v = String(parsed[k] || '').trim();
    if (v.length > 0 && v.length < min) reasons.push(`thin_${k}`);
  }

  for (const k of keys) {
    if (looksLikeListSyntax(parsed[k])) reasons.push(`list_syntax_${k}`);
  }

  const blob = JSON.stringify(parsed);
  if (GENERIC_FAIL_RE.test(blob) || BANNED_SHALLOW_RE.test(blob)) reasons.push('banned_voice');

  return { ok: reasons.length === 0, reasons };
}

function assembleUnifiedDailyPlain(titleLine, authorLine, dateYmd, parsedIn) {
  const p = { ...parsedIn };
  const keys = [
    'dayContextIntro',
    'macroNarrative',
    'transitionStatement',
    'globalGeopoliticalEnvironment',
    'equities',
    'forexUsd',
    'commodities',
    'fixedIncome',
    'crypto',
    'marketSentiment',
    'keyEventsForwardLook',
  ];
  for (const k of keys) {
    p[k] = sanitizeProseField(p[k]);
  }

  const pushSection = (lines, title, body) => {
    lines.push(title);
    lines.push('');
    lines.push(String(body || '').trim());
    lines.push('');
  };

  const lines = [];
  lines.push(String(titleLine || '').trim());
  lines.push('');
  lines.push(String(authorLine || '').trim());
  lines.push('');
  lines.push('Period: daily');
  lines.push(`Date: ${dateYmd}`);
  lines.push('Category: Aura FX Institutional Daily');
  lines.push('');
  lines.push(p.dayContextIntro);
  lines.push('');
  lines.push(p.macroNarrative);
  lines.push('');
  lines.push(p.transitionStatement);
  lines.push('');
  pushSection(lines, UNIFIED_SECTION_TITLES[0], p.globalGeopoliticalEnvironment);
  pushSection(lines, UNIFIED_SECTION_TITLES[1], p.equities);
  pushSection(lines, UNIFIED_SECTION_TITLES[2], p.forexUsd);
  pushSection(lines, UNIFIED_SECTION_TITLES[3], p.commodities);
  pushSection(lines, UNIFIED_SECTION_TITLES[4], p.fixedIncome);
  pushSection(lines, UNIFIED_SECTION_TITLES[5], p.crypto);
  pushSection(lines, UNIFIED_SECTION_TITLES[6], p.marketSentiment);
  pushSection(lines, UNIFIED_SECTION_TITLES[7], p.keyEventsForwardLook);

  lines.push('');
  lines.push(
    '*End of brief — saved to Trader Deck for this date. Regenerate from admin/cron replaces the stored version.*'
  );
  lines.push('');
  lines.push(String(authorLine || '').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function validateUnifiedDailyBody(text) {
  const issues = [];
  const t = String(text || '');
  if (!/^Daily Brief\s+[\u2013-]/im.test(t)) issues.push('format_missing_title_daily');
  let pos = 0;
  for (const title of UNIFIED_SECTION_TITLES) {
    const i = t.indexOf(title, pos);
    if (i === -1) issues.push(`format_missing_section_${title.replace(/\s+/g, '_')}`);
    else pos = i + title.length;
  }
  return { ok: issues.length === 0, issues };
}

/** Visible section order in weekly body (excludes title block). */
const WEEKLY_ORDERED_BODY_MARKERS = [
  'OVERVIEW',
  'CONDITIONAL FRAMEWORK',
  'PRIOR WEEK RECAP',
  'KEY MARKET REACTIONS',
  'CROSS ASSET LINKAGE',
  ...WEEKLY_ASSET_SLEEVES,
  'FORWARD LOOK',
];

function stripMarkdownLike(s) {
  return String(s || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

function sanitizeWeeklyUnifiedDoc(text) {
  let t = String(text || '');
  t = t
    .split('\n')
    .map((line) => {
      const tr = line.trimStart();
      if (/^[-*]\s+\S/.test(tr)) return line.replace(/^\s*[-*]\s+/, '').trimEnd();
      if (/^\d+[.)]\s+\S/.test(tr)) return line.replace(/^\s*\d+[.)]\s+/, '').trimEnd();
      return stripMarkdownLike(line);
    })
    .join('\n');
  t = stripMarkdownLike(t);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function overviewPassesQC(s) {
  const t = String(s || '').toLowerCase();
  const weekType =
    /\bconfirmation week\b/.test(t) || /\breaction week\b/.test(t) || /\btransition week\b/.test(t);
  const regimeQ =
    /peak escalation|start of (?:a )?new regime|escalation or|regime shift|regime change/.test(t);
  return weekType && regimeQ && String(s || '').trim().length >= 320;
}

function validateUnifiedWeekly(parsed) {
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['no_weekly_payload'] };

  const ov = String(parsed.overview || '').trim();
  if (!ov) reasons.push('missing_overview');
  else if (!overviewPassesQC(ov)) reasons.push('overview_framework_thin');

  const cf = parsed.conditionalFramework;
  if (!cf || typeof cf !== 'object') {
    reasons.push('missing_conditional_framework');
  } else {
    const sc = Array.isArray(cf.scenarios) ? cf.scenarios : [];
    if (sc.length !== 3) reasons.push('conditional_scenarios_count');
    for (let i = 0; i < sc.length; i += 1) {
      if (String(sc[i] || '').trim().length < 48) reasons.push(`conditional_scenario_thin_${i}`);
    }
  }

  const pr = String(parsed.priorWeekRecap || '').trim();
  if (pr.length < 420) reasons.push('prior_week_thin');

  const km = String(parsed.keyMarketReactions || '').trim();
  if (km.length < 280) reasons.push('key_reactions_thin');

  const ca = String(parsed.crossAssetLinkage || '').trim();
  if (ca.length < 380) reasons.push('cross_asset_thin');

  const dives = Array.isArray(parsed.assetDeepDives) ? parsed.assetDeepDives : [];
  if (dives.length !== WEEKLY_ASSET_SLEEVES.length) reasons.push('asset_dives_count');
  for (let i = 0; i < WEEKLY_ASSET_SLEEVES.length; i += 1) {
    const expect = WEEKLY_ASSET_SLEEVES[i];
    const row = dives[i];
    if (!row || String(row.sleeve || '').toUpperCase() !== expect) {
      reasons.push(`asset_order_${expect}`);
      break;
    }
    const a = String(row.whatHappened || '').trim();
    const b = String(row.whyItHappened || '').trim();
    const c = String(row.whatItMeans || '').trim();
    if (a.length < 120 || b.length < 160 || c.length < 120) reasons.push(`asset_thin_${expect}`);
    if (expect === 'GOLD' && goldWhyMeansTooLazy(b, c)) reasons.push('weak_gold_cliche');
  }

  const fl = String(parsed.forwardLook || '').trim();
  if (fl.length < 380) reasons.push('forward_thin');

  const blob = JSON.stringify(parsed);
  if (GENERIC_FAIL_RE.test(blob) || BANNED_SHALLOW_RE.test(blob)) reasons.push('weekly_banned_voice');
  if (HEDGE_WEAK_RE.test(blob)) reasons.push('weekly_hedge_weak');

  const checkFields = [
    ov,
    pr,
    km,
    ca,
    fl,
    ...(cf && Array.isArray(cf.scenarios) ? cf.scenarios : []),
    ...dives.map((d) => `${d.whatHappened}\n${d.whyItHappened}\n${d.whatItMeans}`),
  ];
  for (let i = 0; i < checkFields.length; i += 1) {
    if (looksLikeListSyntax(checkFields[i])) reasons.push(`list_syntax_weekly_${i}`);
  }

  return { ok: reasons.length === 0, reasons };
}

function assembleWeeklyUnifiedPlain(titleLine, authorLine, dateYmd, weekRangeLabel, parsedIn) {
  const p = { ...parsedIn };
  p.overview = sanitizeProseField(p.overview);
  p.priorWeekRecap = sanitizeProseField(p.priorWeekRecap);
  p.keyMarketReactions = sanitizeProseField(p.keyMarketReactions);
  p.crossAssetLinkage = sanitizeProseField(p.crossAssetLinkage);
  p.forwardLook = sanitizeProseField(p.forwardLook);
  const cf = p.conditionalFramework && typeof p.conditionalFramework === 'object' ? p.conditionalFramework : {};
  const scenarios = Array.isArray(cf.scenarios) ? cf.scenarios.map((x) => sanitizeProseField(x)) : [];
  const dives = Array.isArray(p.assetDeepDives) ? p.assetDeepDives : [];

  const lines = [];
  lines.push(String(titleLine || '').trim());
  lines.push('');
  lines.push(String(authorLine || '').trim());
  lines.push('');
  lines.push('Period: weekly');
  lines.push(`Date: ${dateYmd}`);
  lines.push(`Week range: ${String(weekRangeLabel || '').trim()}`);
  lines.push('Category: Aura FX Institutional Weekly');
  lines.push('');
  lines.push('OVERVIEW');
  lines.push('');
  lines.push(p.overview);
  lines.push('');
  lines.push('CONDITIONAL FRAMEWORK');
  lines.push('');
  lines.push('Week will determine whether:');
  lines.push('');
  for (const s of scenarios) {
    lines.push(String(s || '').trim());
    lines.push('');
  }
  lines.push('PRIOR WEEK RECAP');
  lines.push('');
  lines.push(p.priorWeekRecap);
  lines.push('');
  lines.push('KEY MARKET REACTIONS');
  lines.push('');
  lines.push(p.keyMarketReactions);
  lines.push('');
  lines.push('CROSS ASSET LINKAGE');
  lines.push('');
  lines.push(p.crossAssetLinkage);
  lines.push('');

  for (let ai = 0; ai < WEEKLY_ASSET_SLEEVES.length; ai += 1) {
    const spec = WEEKLY_ASSET_SLEEVES[ai];
    const row = dives[ai] || {};
    lines.push(spec);
    lines.push('');
    lines.push('WHAT HAPPENED');
    lines.push('');
    lines.push(sanitizeProseField(row.whatHappened));
    lines.push('');
    lines.push('WHY IT HAPPENED');
    lines.push('');
    lines.push(sanitizeProseField(row.whyItHappened));
    lines.push('');
    lines.push('WHAT IT MEANS');
    lines.push('');
    lines.push(sanitizeProseField(row.whatItMeans));
    lines.push('');
  }

  lines.push('FORWARD LOOK');
  lines.push('');
  lines.push(p.forwardLook);
  lines.push('');
  lines.push('End of weekly brief. Saved to Trader Deck. Regenerate replaces the stored version for this week key.');
  lines.push('');
  lines.push(String(authorLine || '').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function validateWeeklyUnifiedBody(text) {
  const issues = [];
  const raw = String(text || '');
  if (!/^WEEKLY FUNDAMENTAL ANALYSIS\s+[\u2013-]/im.test(raw)) issues.push('format_missing_weekly_title');
  if (!/\bWeek will determine whether:/i.test(raw)) issues.push('format_missing_conditional_lead');

  /** Leading newline so every section title matches as \\nTITLE\\n (avoids USD inside prose). */
  const t = `\n${raw}`;
  let pos = 0;
  for (const title of WEEKLY_ORDERED_BODY_MARKERS) {
    const needle = `\n${title}\n`;
    const i = t.indexOf(needle, pos);
    if (i === -1) issues.push(`format_missing_${title.replace(/\s+/g, '_')}`);
    else pos = i + needle.length;
  }

  const needTriple =
    (raw.match(/\bWHAT HAPPENED\b/g) || []).length >= 5 &&
    (raw.match(/\bWHY IT HAPPENED\b/g) || []).length >= 5 &&
    (raw.match(/\bWHAT IT MEANS\b/g) || []).length >= 5;
  if (!needTriple) issues.push('format_missing_asset_subheads');

  return { ok: issues.length === 0, issues };
}

async function generateUnifiedWeeklyBrief(factPack, getAutomationModel, fixNote) {
  return callOpenAIJson(
    UNIFIED_WEEKLY_SYSTEM,
    {
      task: 'Unified institutional weekly fundamental analysis — single JSON payload',
      factPack,
      assetSleeves: WEEKLY_ASSET_SLEEVES,
      briefMeta: {
        narrativeHint: unifiedWeeklyBriefHint(factPack),
      },
      fixNote: fixNote || null,
    },
    getAutomationModel,
    { maxTokens: 16000, temperature: 0.26, timeoutMs: 180000 }
  );
}

async function generateUnifiedDailyBrief(factPack, getAutomationModel, fixNote) {
  const calendarToday = Array.isArray(factPack.calendarToday) ? factPack.calendarToday : [];
  return callOpenAIJson(
    UNIFIED_DAILY_SYSTEM,
    {
      task: 'Unified institutional daily desk brief — single JSON payload',
      factPack,
      briefMeta: {
        calendarEventCount: calendarToday.length,
        denseCalendar: calendarToday.length >= 8,
        narrativeHint: unifiedDailyBriefHint(factPack),
      },
      fixNote: fixNote || null,
    },
    getAutomationModel,
    { maxTokens: 14000, temperature: 0.28 }
  );
}

async function generateAndStoreInstitutionalBrief(deps, { period, runDate = new Date(), timeZone = 'Europe/London' }) {
  const {
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
  } = deps;

  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const isWeekly = normalizedPeriod === 'weekly';
  const briefKind = isWeekly ? 'aura_institutional_weekly' : 'aura_institutional_daily';
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));
  const runKey = `aura-institutional:${normalizedPeriod}:${date}`;

  const reserved = await reserveRun(runKey, normalizedPeriod, date);
  if (!reserved) {
    return { success: true, skipped: true, reason: 'already-generated', runKey, period: normalizedPeriod, date, briefKind };
  }

  try {
    const briefDateYmd = toYmdInTz(runDate, timeZone);
    const [market, econ, news] = await Promise.all([
      runEngine({ timeframe: normalizedPeriod, date }),
      fetchEconomicCalendarInline(),
      fetchUnifiedNewsSample(),
    ]);
    const instrumentUniverse = getInstitutionalInstrumentUniverse();
    const symbols = instrumentUniverse.map((x) => x.id);
    const quoteCache = await buildQuoteCacheForSymbols(symbols, fetchAutomationQuoteWithFallback);
    const factPack = buildInstitutionalFactPack({
      period: normalizedPeriod,
      market,
      econ,
      news,
      quoteCache,
      briefDateYmd,
      timeZone,
      runDate,
      instrumentUniverse,
    });

    let body = '';
    let structuredBrief = null;
    let lastReasons = [];

    if (!isWeekly) {
      let unified = null;
      const authorLine = String(process.env.AURA_INSTITUTIONAL_AUTHOR || 'By AURA TERMINAL').trim();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const fix = attempt > 0 ? lastReasons : null;
        const rs = await generateUnifiedDailyBrief(factPack, getAutomationModel, fix);
        if (!rs.ok || !rs.parsed) {
          lastReasons = [`unified_${rs.error || 'fail'}`];
          continue;
        }
        unified = rs.parsed;
        const v = validateUnifiedDaily(unified);
        if (!v.ok) {
          lastReasons = v.reasons;
          continue;
        }
        const titleLine = formatDailyBriefTitle(runDate, timeZone);
        let assembled = assembleUnifiedDailyPlain(titleLine, authorLine, briefDateYmd, unified);
        assembled = sanitizeUnifiedDoc(assembled);
        const fmt = validateUnifiedDailyBody(assembled);
        if (!fmt.ok) {
          lastReasons = fmt.issues.map((x) => `fmt_${x}`);
          continue;
        }
        body = assembled;
        structuredBrief = { version: 3, unified };
        break;
      }
      if (!body) {
        throw new Error(`Institutional daily QC failed: ${lastReasons.join(', ')}`);
      }
    } else {
      let weeklyUnified = null;
      const authorLine = String(process.env.AURA_INSTITUTIONAL_AUTHOR || 'By AURA TERMINAL').trim();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const fix = attempt > 0 ? lastReasons : null;
        const rw = await generateUnifiedWeeklyBrief(factPack, getAutomationModel, fix);
        if (!rw.ok || !rw.parsed) {
          lastReasons = [`weekly_unified_${rw.error || 'fail'}`];
          continue;
        }
        weeklyUnified = rw.parsed;
        const v = validateUnifiedWeekly(weeklyUnified);
        if (!v.ok) {
          lastReasons = v.reasons;
          continue;
        }
        const titleLine = formatWeeklyFundamentalTitle(factPack.weekAheadRangeLabel);
        let assembled = assembleWeeklyUnifiedPlain(
          titleLine,
          authorLine,
          briefDateYmd,
          factPack.weekAheadRangeLabel,
          weeklyUnified
        );
        assembled = sanitizeWeeklyUnifiedDoc(assembled);
        const fmt = validateWeeklyUnifiedBody(assembled);
        if (!fmt.ok) {
          lastReasons = fmt.issues.map((x) => `fmt_${x}`);
          continue;
        }
        body = assembled;
        structuredBrief = { version: 4, unifiedWeekly: weeklyUnified };
        break;
      }
      if (!body) {
        throw new Error(`Institutional weekly QC failed: ${lastReasons.join(', ')}`);
      }
    }

    body = stripSources(body);
    // Remove Markdown horizontal rules / leaked separator markers.
    body = String(body || '')
      .replace(/^[ \t]*(-\s*){3,}[ \t]*$/gm, '')
      .replace(/^[ \t]*---[ \t]*.*[ \t]*---[ \t]*$/gm, '')
      .trim();
    assertNoSources(body);
    const postFmt = isWeekly ? validateWeeklyUnifiedBody(body) : validateUnifiedDailyBody(body);
    if (!postFmt.ok) {
      throw new Error(
        `Institutional brief format failed post-sanitize: ${(postFmt.issues || []).join(', ')}`
      );
    }

    const saved = await publishAutoBrief({
      period: normalizedPeriod,
      date,
      title: (isWeekly ? formatWeeklyFundamentalTitle(factPack.weekAheadRangeLabel) : formatDailyBriefTitle(runDate, timeZone)).slice(
        0,
        255
      ),
      body,
      briefKind,
      mimeType: 'text/markdown; charset=utf-8',
      generationMeta: {
        engine: isWeekly ? 'institutional_aura_unified_weekly_v1' : 'institutional_aura_unified_daily_v1',
        qcOk: true,
        factPackUpdatedAt: factPack.updatedAt,
        structuredBrief,
      },
    });
    await finalizeRun(runKey, 'success', saved.insertId, null);
    return {
      success: true,
      briefId: saved.insertId,
      briefVersion: saved.briefVersion,
      runKey,
      period: normalizedPeriod,
      date,
      briefKind,
    };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'institutional brief failed').slice(0, 255));
    return {
      success: false,
      runKey,
      period: normalizedPeriod,
      date,
      briefKind,
      error: err.message || 'institutional brief failed',
    };
  }
}

module.exports = {
  INSTITUTIONAL_INSTRUMENTS,
  OPTIONAL_INSTITUTIONAL_INSTRUMENTS,
  WEEKLY_ASSET_SLEEVES,
  getInstitutionalInstrumentUniverse,
  generateAndStoreInstitutionalBrief,
  formatWeeklyFundamentalTitle,
  validateUnifiedWeekly,
  validateWeeklyUnifiedBody,
  assembleWeeklyUnifiedPlain,
  validateUnifiedDaily,
  validateUnifiedDailyBody,
  assembleUnifiedDailyPlain,
  _test: {
    buildInstitutionalFactPack,
    upcomingMonFriYmd,
    filterCalendarForBriefDate,
    validateUnifiedDaily,
    validateUnifiedDailyBody,
    validateUnifiedWeekly,
    validateWeeklyUnifiedBody,
  },
};
