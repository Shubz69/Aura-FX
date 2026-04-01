/**
 * Aura FX institutional AI brief — manual-brief structure (depth, flow, sections).
 * Template: Aura daily/weekly PDFs (Key Events → Fundamentals → Technical → Trades; weekly recap/outlook/weekend).
 * Multi-phase OpenAI generation + strict QC; chunked instruments to stay within output limits.
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

const BIAS_RE = /\b(bullish|bearish|neutral)\b/i;

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
  const macroSummary = buildMacroSummaryLines(market, 'general', period);
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

  return {
    period,
    briefDateYmd,
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

function formatDailyHeaderTitle(runDate, timeZone) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(runDate);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(runDate);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(runDate);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(runDate);
  return `DAILY MARKET BRIEF – ${weekday}, ${day} ${month} ${year}`;
}

function formatWeeklyHeaderTitle(weekRangeLabel) {
  return `WEEKLY MARKET BRIEF – ${String(weekRangeLabel || '').trim()}`;
}

function tokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && w.length > 3)
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

function keyEventsCompositeText(p1) {
  return (Array.isArray(p1.keyEvents) ? p1.keyEvents : [])
    .map((e) =>
      [e.eventName, e.whatItMeasures, e.whyTradersCare, e.marketsAffected, e.currencyRegion].filter(Boolean).join(' ')
    )
    .join('\n');
}

function fundamentalsCompositeSnippet(blocks, perSlice = 140) {
  return blocks
    .map((b) => {
      const lp = String(b.londonParagraph || '').slice(0, perSlice);
      const np = String(b.newYorkParagraph || '').slice(0, perSlice);
      return `${lp} ${np}`;
    })
    .join('\n');
}

/** Omit Global macro H2 when thin or largely redundant vs key events / per-instrument text. */
function shouldIncludeGlobalMacroSection(p1, blocks) {
  const oc = String(p1.openingContext || '').trim();
  const mt = String(p1.marketThemesToday || '').trim();
  const macro = `${oc}\n${mt}`;
  if (macro.length < 520) return false;
  const ke = keyEventsCompositeText(p1);
  if (ke.length > 120 && similarityScore(ke, macro) > 0.44) return false;
  const fund = fundamentalsCompositeSnippet(blocks, 160);
  if (fund.length > 200 && similarityScore(macro, fund) > 0.36) return false;
  return true;
}

function dailyEmphasisHint(briefDateYmd) {
  const ymd = String(briefDateYmd || '2000-01-01');
  const h = [...ymd].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const hints = [
    'Lead from factPack headlines and keyDrivers first; foreground USD/yields only when the pack clearly makes them today’s main transmission.',
    'Prioritise cross-asset and commodity linkages (energy, gold, equities) over generic FX carry unless the calendar/drivers justify it.',
    'Foreground session liquidity and event-risk timing (London vs New York) instead of recycling the same broad macro labels.',
    'Anchor on idiosyncratic catalysts in calendarToday where they exist; do not default every opening to “risk sentiment” framing.',
  ];
  return hints[Math.abs(h) % hints.length];
}

function weeklyNarrativeHint(weekAheadRangeLabel) {
  const s = String(weekAheadRangeLabel || 'week');
  const h = [...s].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const hints = [
    'Vary sentence openings and causal framing across sections so the week does not read as one repeated template.',
    'Make explicit handoffs: summary sets facts, “How things turned out” explains mechanisms, potential section stresses what is still live.',
    'Surface at least one concrete risk scenario (policy, data surprise, or geopolitical) before the weekend section.',
  ];
  return hints[Math.abs(h) % hints.length];
}

function firstWordsNorm(s, wordCount) {
  const w = String(s || '')
    .trim()
    .split(/\s+/)
    .slice(0, wordCount);
  return w
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countPrefixCollisions(blocks, field, wordCount, thresholdCount) {
  const map = new Map();
  for (const row of blocks) {
    const fp = firstWordsNorm(row[field], wordCount);
    if (fp.length < 18) continue;
    map.set(fp, (map.get(fp) || 0) + 1);
  }
  for (const c of map.values()) {
    if (c >= thresholdCount) return true;
  }
  return false;
}

/** Reject robotic reuse of openings / templates / clichés across instruments (triggers regen). */
function validateDailyInstrumentLanguageDiversity(blocks, universe = INSTITUTIONAL_INSTRUMENTS) {
  const reasons = [];
  const n = blocks.length;
  if (n < 4) return { ok: true, reasons };

  const thresholdCount = Math.max(4, Math.ceil(n * 0.38));

  if (countPrefixCollisions(blocks, 'londonParagraph', 8, thresholdCount)) {
    reasons.push('instrument_repeat_london_openings');
  }
  if (countPrefixCollisions(blocks, 'newYorkParagraph', 8, thresholdCount)) {
    reasons.push('instrument_repeat_ny_openings');
  }

  const londonTemplateRes = [
    /^in the london session\b/i,
    /^during the london session\b/i,
    /^as london\b/i,
    /^london (?:opens|traders)\b/i,
  ];
  const nyTemplateRes = [/^in new york\b/i, /^the new york session\b/i, /^during the new york session\b/i, /^for new york\b/i];
  let templL = 0;
  let templN = 0;
  for (const row of blocks) {
    const lp = String(row.londonParagraph || '');
    const np = String(row.newYorkParagraph || '');
    if (londonTemplateRes.some((re) => re.test(lp))) templL += 1;
    if (nyTemplateRes.some((re) => re.test(np))) templN += 1;
  }
  if (templL >= Math.ceil(n * 0.55)) reasons.push('instrument_template_london_phrasing');
  if (templN >= Math.ceil(n * 0.55)) reasons.push('instrument_template_ny_phrasing');

  const clichéRe =
    /\b(real yields|risk sentiment|risk appetite|dollar strength|usd strength|fed (?:policy|speak)|treasury yields?|yield curve)\b/gi;
  let heavyClichéInstruments = 0;
  for (const row of blocks) {
    const blob = `${String(row.londonParagraph || '')}\n${String(row.newYorkParagraph || '')}`;
    const hits = blob.match(clichéRe) || [];
    if (hits.length >= 3) heavyClichéInstruments += 1;
  }
  if (heavyClichéInstruments >= Math.ceil(n * 0.7)) {
    reasons.push('instrument_overlapping_causal_clichés');
  }

  for (const row of blocks) {
    const lp = String(row.londonParagraph || '').trim();
    const np = String(row.newYorkParagraph || '').trim();
    if (lp.length > 160 && np.length > 160 && similarityScore(lp, np) >= 0.45) {
      reasons.push(`lon_ny_too_similar_${row.id}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
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

const DAILY_PART1_SYSTEM = `You are a senior Aura FX market strategist writing the OPENING of the house daily brief.
Voice: institutional desk, causal chains, zero chatbot filler. Use ONLY factPack data — do not invent releases.
Return JSON only.

Use briefMeta when present:
- briefMeta.emphasisHint: rotate how you open themes day-to-day (do not sound identical to a generic template).
- briefMeta.denseCalendar / veryDenseCalendar: when true, Key events must read like a trader briefing — not a glossary.

Required JSON keys:
- keyEvents: array of objects for TODAY's calendar (use factPack.calendarToday). Each object MUST have:
  eventName, currencyRegion, whatItMeasures, whyTradersCare, marketsAffected (all non-empty strings).
  Per-event depth scales with the calendar:
  - Normal day: 2–5 sentences total across the five fields (not one-word stubs).
  - denseCalendar (many releases): at least ~4–7 sentences worth per high-impact row — spell out what the release measures, why it matters *now*, which assets are most exposed, and what a material beat vs miss could imply for rates, FX, gold, indices, or oil as appropriate.
  - veryDenseCalendar: prioritise the top-tier items with full trader-note detail; shorter rows only where clearly low impact.
  If calendarToday is empty, return 1–2 objects explaining that the feed is thin and what to monitor instead (still fill all fields meaningfully).
- openingContext: string. Substantive macro/geopolitical/cross-asset backdrop when it adds information beyond the calendar and beyond what per-instrument sections will repeat. If the session is light and this would only parrot key events, keep it to 1 short paragraph (the pipeline may omit the visible Global macro section).
- marketThemesToday: string. Interconnected themes (not a bullet list). Same rule: depth when additive; trim if it would duplicate key events or generic USD/yields/risk boilerplate unless factPack drivers/calendar truly centre those channels today.

The saved brief may show openingContext + marketThemesToday only under "## Global macro and geopolitical environment" when they are non-redundant and sufficiently substantive — otherwise that heading is omitted. Still return both keys always.

FORBIDDEN in all text: "mixed sentiment", "watch the data", "reassess if invalidated", "as an AI", generic disclaimers, scenario numbering, playbook jargon.`;

const DAILY_PART2_SYSTEM = `You are a senior Aura FX strategist. Write FUNDAMENTALS + TECHNICAL + TRADE SCENARIOS for EACH listed instrument ONLY.
Use factPack (quotes, calendar, drivers, headlines). No invented data.

Anti-repetition (strict):
- Each instrument must foreground its own drivers (XAU vs indices vs WTI vs each FX cross). Correlated pairs may reference shared themes from different angles — never the same opening clause or causal chain copy-pasted across symbols.
- londonParagraph and newYorkParagraph must not be template clones: different sentence structures, different entry points (London: liquidity, Europe, local data; New York: US prints, curve, risk closure, commodity settlement). At least half the sentences in NY should not mirror London ordering.
- Vary openings across the sleeve: do not start 8+ instruments with the same first 6–8 words in London (or in New York).
- Gold, indices, oil, and FX must use distinct vocabulary; avoid running the identical "yields / dollar / risk sentiment" paragraph across unrelated instruments unless factPack forces it for that symbol.

Return JSON: { "blocks": [ ... ] } where each block matches one instrument spec in user message.

Each block fields:
- id, label (exactly as given)
- londonSessionBias, londonParagraph (full paragraph, min ~180 chars, macro + London session logic)
- newYorkSessionBias, newYorkParagraph (full paragraph; genuinely different read from London, not a light edit)
- trend (clear, not vague)
- support, resistance (numeric or explicit level strings consistent with last price in factPack when possible)
- technicalBias (Bullish/Bearish/Neutral)
- technicalNote: one paragraph on structure/momentum/zones
- trades: object with london: { sell: {entry,stopLoss,takeProfit}|null, buy: {...}|null }, newYork: { sell, buy } — use null for a leg if not justified; do not fabricate tight noise trades.

Use briefMeta.emphasisHint when present to bias which transmission channels you stress for this run.

FORBIDDEN: shallow one-liners, identical paragraphs across instruments, banned shallow phrases from Part1 system.`;

const WEEKLY_PART1_SYSTEM = `You are a senior Aura FX strategist. Weekly brief Part 1. JSON only. factPack only.

Narrative: one continuous house report. Use narrativeHint when present — vary phrasing, avoid blocky repetition, and make sections feel connected.

Keys:
- summaryPreviousWeek: string, 3–6 paragraphs: what happened last week across assets (previousWeekRangeLabel, headlines, drivers). End with a natural bridge toward interpretation (without inventing a separate section).
- howThingsTurnedOut: array of { id, label, fundamentalOverview, marketImpact } for EVERY instrument in instrumentOrder (exact count and order). fundamentalOverview = why drivers played out; marketImpact = price/action read. Each field 2–4 sentences minimum, unique content — not the same macro sentence with the symbol swapped.`;

const WEEKLY_PART2_SYSTEM = `You are a senior Aura FX strategist. Weekly brief Part 2. JSON only. factPack only.

Narrative: continues Part 1 as one report. Use narrativeHint when present. Sections should flow: what matters this week → scheduled risks → weekend overhang.

Keys:
- potentialThisWeek: array of { id, label, fundamentalFactors, potentialImpact } for EVERY instrument in instrumentOrder (exact count and order).
- importantNewsByDay: object with capitalised keys exactly "Monday","Tuesday",...,"Sunday" (omit empty days). Each value is an array of substantive strings from calendarWeekAhead/headlines — not single-word stubs.
- weekendAndOutlook: string, 3–5 paragraphs: what changed over the weekend, what is still live, where the asymmetric risks are for the week open (from headlines; if thin, say so plainly).

Each potentialThisWeek entry: fundamentalFactors and potentialImpact are 2+ sentences each, instrument-specific, not copy-pasted across the list.`;

function instrumentSpecsForPrompt(slice) {
  return slice.map(({ id, label }) => ({ id, label }));
}

async function generateDailyPart1(factPack, getAutomationModel, fixNote) {
  const calendarToday = Array.isArray(factPack.calendarToday) ? factPack.calendarToday : [];
  const n = calendarToday.length;
  return callOpenAIJson(
    DAILY_PART1_SYSTEM,
    {
      task: 'Daily brief part 1',
      factPack,
      briefMeta: {
        calendarEventCount: n,
        denseCalendar: n >= 8,
        veryDenseCalendar: n >= 12,
        emphasisHint: dailyEmphasisHint(factPack.briefDateYmd),
      },
      fixNote: fixNote || null,
    },
    getAutomationModel,
    { maxTokens: 6000, temperature: 0.3 }
  );
}

async function generateDailyPart2(factPack, slice, getAutomationModel, fixNote) {
  return callOpenAIJson(
    DAILY_PART2_SYSTEM,
    {
      task: 'Daily brief part 2 — instrument blocks',
      instruments: instrumentSpecsForPrompt(slice),
      factPack,
      briefMeta: {
        emphasisHint: dailyEmphasisHint(factPack.briefDateYmd),
      },
      fixNote: fixNote || null,
    },
    getAutomationModel,
    { maxTokens: 8000, temperature: 0.32 }
  );
}

async function generateWeeklyPart1(factPack, instrumentUniverse, getAutomationModel, fixNote) {
  return callOpenAIJson(
    WEEKLY_PART1_SYSTEM,
    {
      task: 'Weekly part 1',
      instrumentOrder: instrumentUniverse,
      factPack,
      narrativeHint: weeklyNarrativeHint(factPack.weekAheadRangeLabel),
      fixNote: fixNote || null,
    },
    getAutomationModel,
    { maxTokens: 8000, temperature: 0.3 }
  );
}

async function generateWeeklyPart2(factPack, instrumentUniverse, getAutomationModel, fixNote) {
  return callOpenAIJson(
    WEEKLY_PART2_SYSTEM,
    {
      task: 'Weekly part 2',
      instrumentOrder: instrumentUniverse,
      factPack,
      narrativeHint: weeklyNarrativeHint(factPack.weekAheadRangeLabel),
      fixNote: fixNote || null,
    },
    getAutomationModel,
    { maxTokens: 8000, temperature: 0.3 }
  );
}

function mergeDailyBlocks(blockLists) {
  const blocks = [];
  for (const part of blockLists) {
    const arr = part && Array.isArray(part.blocks) ? part.blocks : [];
    for (const b of arr) blocks.push(b);
  }
  return blocks;
}

function validateDailyMerged(p1, blocks, universe = INSTITUTIONAL_INSTRUMENTS) {
  const reasons = [];
  if (!p1 || typeof p1 !== 'object') return { ok: false, reasons: ['no_part1'] };
  const ke = Array.isArray(p1.keyEvents) ? p1.keyEvents : [];
  if (ke.length < 1) reasons.push('key_events_empty');
  const keCount = ke.length;
  const minKeBlob = keCount >= 12 ? 165 : keCount >= 8 ? 118 : 80;
  for (let i = 0; i < ke.length; i += 1) {
    const e = ke[i] || {};
    const blob = `${e.eventName || ''} ${e.whatItMeasures || ''} ${e.whyTradersCare || ''}`;
    if (blob.trim().length < minKeBlob) reasons.push(`key_event_thin_${i}`);
  }

  if (blocks.length !== universe.length) reasons.push(`blocks_count_${blocks.length}`);

  const paras = [];
  for (let i = 0; i < universe.length; i += 1) {
    const expect = universe[i];
    const row = blocks[i];
    if (!row || String(row.id || '').toUpperCase() !== expect.id) {
      reasons.push(`block_order_${expect.id}`);
      break;
    }
    if (!BIAS_RE.test(String(row.londonSessionBias || ''))) reasons.push(`lon_bias_${expect.id}`);
    if (!BIAS_RE.test(String(row.newYorkSessionBias || ''))) reasons.push(`ny_bias_${expect.id}`);
    const lp = String(row.londonParagraph || '').trim();
    const np = String(row.newYorkParagraph || '').trim();
    if (lp.length < 140 || np.length < 140) reasons.push(`fund_para_thin_${expect.id}`);
    if (String(row.trend || '').length < 20) reasons.push(`trend_thin_${expect.id}`);
    if (String(row.support || '').length < 2 || String(row.resistance || '').length < 2) reasons.push(`levels_thin_${expect.id}`);
    if (!BIAS_RE.test(String(row.technicalBias || ''))) reasons.push(`tech_bias_${expect.id}`);
    if (String(row.technicalNote || '').trim().length < 80) reasons.push(`tech_note_thin_${expect.id}`);
    paras.push(lp, np, String(row.technicalNote || ''));
    if (GENERIC_FAIL_RE.test(`${lp}\n${np}`) || BANNED_SHALLOW_RE.test(`${lp}\n${np}`)) reasons.push(`banned_voice_${expect.id}`);
  }

  const oc = String(p1.openingContext || '').trim();
  const mt = String(p1.marketThemesToday || '').trim();
  const includeGlobalMacro = shouldIncludeGlobalMacroSection(p1, blocks);
  if (includeGlobalMacro) {
    if (oc.length < 400) reasons.push('opening_thin');
    if (mt.length < 280) reasons.push('themes_thin');
  } else if (oc.length < 90 || mt.length < 75) {
    reasons.push('macro_stub_too_thin_when_section_omitted');
  }
  if (GENERIC_FAIL_RE.test(`${oc}\n${mt}`) || BANNED_SHALLOW_RE.test(`${oc}\n${mt}`)) reasons.push('banned_voice_opening');

  const div = validateDailyInstrumentLanguageDiversity(blocks, universe);
  reasons.push(...div.reasons);

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = `${blocks[i].londonParagraph || ''} ${blocks[i].newYorkParagraph || ''}`;
      const b = `${blocks[j].londonParagraph || ''} ${blocks[j].newYorkParagraph || ''}`;
      if (a.length > 120 && b.length > 120 && similarityScore(a, b) >= 0.56) {
        reasons.push(`duplicate_fundamentals_${blocks[i].id}_${blocks[j].id}`);
        return { ok: false, reasons };
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function validateWeeklyMerged(w1, w2, universe = INSTITUTIONAL_INSTRUMENTS) {
  const reasons = [];
  if (!w1 || !w2) return { ok: false, reasons: ['weekly_parts'] };
  if (String(w1.summaryPreviousWeek || '').trim().length < 350) reasons.push('weekly_summary_thin');
  const ht = Array.isArray(w1.howThingsTurnedOut) ? w1.howThingsTurnedOut : [];
  if (ht.length !== universe.length) reasons.push('weekly_how_count');
  const pt = Array.isArray(w2.potentialThisWeek) ? w2.potentialThisWeek : [];
  if (pt.length !== universe.length) reasons.push('weekly_potential_count');
  const byDay = w2.importantNewsByDay && typeof w2.importantNewsByDay === 'object' ? w2.importantNewsByDay : {};
  let calendarBulletCount = 0;
  for (const v of Object.values(byDay)) {
    if (Array.isArray(v)) calendarBulletCount += v.filter((x) => String(x || '').trim().length > 8).length;
  }
  if (calendarBulletCount < 2) reasons.push('weekly_calendar_sparse');
  if (String(w2.weekendAndOutlook || '').trim().length < 280) reasons.push('weekend_thin');

  for (let i = 0; i < universe.length; i += 1) {
    const id = universe[i].id;
    const h = ht[i];
    if (!h || String(h.id || '').toUpperCase() !== id) {
      reasons.push(`weekly_how_order_${id}`);
      break;
    }
    if (String(h.fundamentalOverview || '').length < 100 || String(h.marketImpact || '').length < 100) {
      reasons.push(`weekly_how_thin_${id}`);
    }
    const p = pt[i];
    if (!p || String(p.id || '').toUpperCase() !== id) {
      reasons.push(`weekly_pot_order_${id}`);
      break;
    }
    if (String(p.fundamentalFactors || '').length < 100 || String(p.potentialImpact || '').length < 100) {
      reasons.push(`weekly_pot_thin_${id}`);
    }
  }
  if (GENERIC_FAIL_RE.test(JSON.stringify(w1)) || BANNED_SHALLOW_RE.test(JSON.stringify(w2))) reasons.push('weekly_banned');
  return { ok: reasons.length === 0, reasons };
}

/** Visible H2 order + H3 counts — Aura brief identity (not content QA). */
function validateDailyMarkdownFormat(md, universe = INSTITUTIONAL_INSTRUMENTS) {
  const issues = [];
  const text = String(md || '');
  if (!/^#\s+DAILY MARKET BRIEF\b/im.test(text)) issues.push('format_missing_h1_daily');

  const h2Re = /^##\s+(.+)$/gm;
  const h2Titles = [];
  let m;
  while ((m = h2Re.exec(text)) !== null) {
    h2Titles.push(String(m[1] || '').trim());
  }

  let hi = 0;
  if (!h2Titles[hi] || !/^Key events on\b/i.test(h2Titles[hi])) {
    issues.push(`format_h2_key_events_got_${(h2Titles[hi] || 'none').slice(0, 48)}`);
  } else {
    hi += 1;
    if (h2Titles[hi] && /^Global macro and geopolitical environment$/i.test(h2Titles[hi])) {
      hi += 1;
    }
    if (!h2Titles[hi] || !/^Fundamental analysis$/i.test(h2Titles[hi])) {
      issues.push(`format_h2_fundamental_got_${(h2Titles[hi] || 'none').slice(0, 48)}`);
    } else {
      hi += 1;
      if (!h2Titles[hi] || !/^Technical analysis$/i.test(h2Titles[hi])) {
        issues.push(`format_h2_technical_got_${(h2Titles[hi] || 'none').slice(0, 48)}`);
      } else {
        hi += 1;
        if (!h2Titles[hi] || !/^Trades$/i.test(h2Titles[hi])) {
          issues.push(`format_h2_trades_got_${(h2Titles[hi] || 'none').slice(0, 48)}`);
        }
      }
    }
  }

  const fund = text.split(/^##\s+Fundamental analysis\s*$/im)[1]?.split(/^##\s+Technical analysis\s*$/im)[0] || '';
  const tech = text.split(/^##\s+Technical analysis\s*$/im)[1]?.split(/^##\s+Trades\s*$/im)[0] || '';
  let tradeRest = text.split(/^##\s+Trades\s*$/im)[1] || '';
  tradeRest = tradeRest.split(/\n---\n\n\*End of brief/)[0] || tradeRest.split(/\*End of brief/)[0] || tradeRest;

  const n = universe.length;
  const h3f = (fund.match(/^###\s+/gm) || []).length;
  const h3t = (tech.match(/^###\s+/gm) || []).length;
  const h3tr = (tradeRest.match(/^###\s+/gm) || []).length;
  if (h3f !== n) issues.push(`format_fund_h3_${h3f}_need_${n}`);
  if (h3t !== n) issues.push(`format_tech_h3_${h3t}_need_${n}`);
  if (h3tr !== n) issues.push(`format_trades_h3_${h3tr}_need_${n}`);

  const tradeBlocks = tradeRest.split(/^###\s+/m).slice(1);
  if (tradeBlocks.length !== n) {
    issues.push('format_trades_block_split');
  } else {
    for (let i = 0; i < tradeBlocks.length; i += 1) {
      const tb = tradeBlocks[i];
      if (!/\bLondon session\b/i.test(tb) || !/\bNew York session\b/i.test(tb)) {
        issues.push(`format_trades_sessions_${i}`);
        break;
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function validateWeeklyMarkdownFormat(md, universe = INSTITUTIONAL_INSTRUMENTS) {
  const issues = [];
  const text = String(md || '');
  if (!/^#\s+WEEKLY MARKET BRIEF\b/im.test(text)) issues.push('format_missing_h1_weekly');

  const h2Re = /^##\s+(.+)$/gm;
  const h2Titles = [];
  let m;
  while ((m = h2Re.exec(text)) !== null) {
    h2Titles.push(String(m[1] || '').trim());
  }

  const expect = [
    /^Summary for the previous week$/i,
    /^How things turned out$/i,
    /^The potential for this week$/i,
    /^Important news this week$/i,
    /^What'?s happened over the weekend\??$/i,
  ];
  if (h2Titles.length < expect.length) issues.push(`format_weekly_h2_count_${h2Titles.length}`);
  for (let i = 0; i < expect.length; i += 1) {
    if (!h2Titles[i] || !expect[i].test(h2Titles[i])) {
      issues.push(`format_weekly_h2_order_${i}_got_${(h2Titles[i] || 'none').slice(0, 48)}`);
      break;
    }
  }

  const n = universe.length;
  const how = text.split(/^##\s+How things turned out\s*$/im)[1]?.split(/^##\s+The potential for this week\s*$/im)[0] || '';
  const pot = text.split(/^##\s+The potential for this week\s*$/im)[1]?.split(/^##\s+Important news this week\s*$/im)[0] || '';
  const h3how = (how.match(/^###\s+/gm) || []).length;
  const h3pot = (pot.match(/^###\s+/gm) || []).length;
  if (h3how !== n) issues.push(`format_weekly_how_h3_${h3how}_need_${n}`);
  if (h3pot !== n) issues.push(`format_weekly_pot_h3_${h3pot}_need_${n}`);

  return { ok: issues.length === 0, issues };
}

/** titleLine = plain text without leading # (used for DB title + H1). */
function assembleDailyMarkdown(titleLine, dateYmd, dayLongLabel, part1, blocks, includeGlobalMacroSection = true) {
  const lines = [];
  lines.push(`# ${titleLine.trim()}`);
  lines.push('');
  lines.push('By Aura FX AI');
  lines.push('');
  lines.push('Period: daily');
  lines.push(`Date: ${dateYmd}`);
  lines.push('Category: General Market Brief');
  lines.push('');
  lines.push(`## Key events on ${dayLongLabel}`);
  lines.push('');
  for (const e of part1.keyEvents || []) {
    lines.push(`### ${String(e.eventName || 'Event').trim()}`);
    lines.push('');
    lines.push(`**Currency / region:** ${String(e.currencyRegion || '').trim()}`);
    lines.push('');
    lines.push(`**What it measures:** ${String(e.whatItMeasures || '').trim()}`);
    lines.push('');
    lines.push(`**Why traders care:** ${String(e.whyTradersCare || '').trim()}`);
    lines.push('');
    lines.push(`**Markets affected:** ${String(e.marketsAffected || '').trim()}`);
    lines.push('');
  }
  lines.push('');
  if (includeGlobalMacroSection) {
    lines.push('## Global macro and geopolitical environment');
    lines.push('');
    lines.push(String(part1.openingContext || '').trim());
    lines.push('');
    lines.push(String(part1.marketThemesToday || '').trim());
    lines.push('');
  }
  lines.push('## Fundamental analysis');
  lines.push('');
  for (const row of blocks) {
    const label = String(row.label || row.id || '').trim();
    lines.push(`### ${label}`);
    lines.push('');
    lines.push(`**London Session Bias:** ${String(row.londonSessionBias || '').trim()}`);
    lines.push('');
    lines.push(String(row.londonParagraph || '').trim());
    lines.push('');
    lines.push(`**New York Session Bias:** ${String(row.newYorkSessionBias || '').trim()}`);
    lines.push('');
    lines.push(String(row.newYorkParagraph || '').trim());
    lines.push('');
  }
  lines.push('## Technical analysis');
  lines.push('');
  for (const row of blocks) {
    const label = String(row.label || row.id || '').trim();
    lines.push(`### ${label}`);
    lines.push('');
    lines.push(`**Trend:** ${String(row.trend || '').trim()}`);
    lines.push('');
    lines.push(`**Support:** ${String(row.support || '').trim()}`);
    lines.push('');
    lines.push(`**Resistance:** ${String(row.resistance || '').trim()}`);
    lines.push('');
    lines.push(`**Bias:** ${String(row.technicalBias || '').trim()}`);
    lines.push('');
    lines.push(String(row.technicalNote || '').trim());
    lines.push('');
  }
  lines.push('## Trades');
  lines.push('');
  for (const row of blocks) {
    const label = String(row.label || row.id || '').trim();
    lines.push(`### ${label}`);
    lines.push('');
    const fmtLeg = (name, leg) => {
      if (!leg || typeof leg !== 'object') return;
      const e = leg.entry != null ? String(leg.entry) : '—';
      const s = leg.stopLoss != null ? String(leg.stopLoss) : leg.stop != null ? String(leg.stop) : '—';
      const t = leg.takeProfit != null ? String(leg.takeProfit) : leg.tp != null ? String(leg.tp) : '—';
      lines.push(`**${name}**`);
      lines.push('');
      lines.push(`- Entry: ${e}`);
      lines.push(`- Stop loss: ${s}`);
      lines.push(`- Take profit: ${t}`);
      lines.push('');
    };
    const tr = row.trades && typeof row.trades === 'object' ? row.trades : {};
    const lon = tr.london && typeof tr.london === 'object' ? tr.london : {};
    const ny = tr.newYork && typeof tr.newYork === 'object' ? tr.newYork : {};
    lines.push('#### London session');
    lines.push('');
    fmtLeg('Sell trade', lon.sell);
    fmtLeg('Buy trade', lon.buy);
    lines.push('#### New York session');
    lines.push('');
    fmtLeg('Sell trade', ny.sell);
    fmtLeg('Buy trade', ny.buy);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('*End of brief — saved to Trader Deck for this date. Regenerate from admin/cron replaces the stored version.*');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function assembleWeeklyMarkdown(titleLinePlain, dateYmd, weekRangeLabel, w1, w2) {
  const lines = [];
  lines.push(`# ${String(titleLinePlain || '').trim()}`);
  lines.push('');
  lines.push('By Aura FX AI');
  lines.push('');
  lines.push('Period: weekly');
  lines.push(`Date: ${dateYmd}`);
  lines.push(`Week Range: ${weekRangeLabel}`);
  lines.push('Category: Weekly General Market Brief');
  lines.push('');
  lines.push('## Summary for the previous week');
  lines.push('');
  lines.push(String(w1.summaryPreviousWeek || '').trim());
  lines.push('');
  lines.push('## How things turned out');
  lines.push('');
  for (const h of w1.howThingsTurnedOut || []) {
    lines.push(`### ${String(h.label || h.id || '').trim()}`);
    lines.push('');
    lines.push(`**Fundamental overview:** ${String(h.fundamentalOverview || '').trim()}`);
    lines.push('');
    lines.push(`**Market impact:** ${String(h.marketImpact || '').trim()}`);
    lines.push('');
  }
  lines.push('## The potential for this week');
  lines.push('');
  for (const p of w2.potentialThisWeek || []) {
    lines.push(`### ${String(p.label || p.id || '').trim()}`);
    lines.push('');
    lines.push(`**Fundamental factors:** ${String(p.fundamentalFactors || '').trim()}`);
    lines.push('');
    lines.push(`**Potential impact:** ${String(p.potentialImpact || '').trim()}`);
    lines.push('');
  }
  lines.push('## Important news this week');
  lines.push('');
  const byDay = w2.importantNewsByDay && typeof w2.importantNewsByDay === 'object' ? w2.importantNewsByDay : {};
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of dayOrder) {
    const arr =
      byDay[day]
      || byDay[day.toLowerCase()]
      || byDay[day.slice(0, 3)]
      || byDay[day.slice(0, 3).toLowerCase()];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    lines.push(`### ${day}`);
    lines.push('');
    arr.forEach((x) => lines.push(`- ${String(x).trim()}`));
    lines.push('');
  }
  lines.push("## What's happened over the weekend?");
  lines.push('');
  lines.push(String(w2.weekendAndOutlook || '').trim());
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*End of weekly brief — saved to Trader Deck. Regenerate replaces the stored version for this week key.*');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
      const dayLong = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone,
      }).format(runDate);
      let p1 = null;
      let b1 = null;
      let b2 = null;
      const mid = Math.ceil(instrumentUniverse.length / 2);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const fix = attempt > 0 ? lastReasons : null;
        const r1 = await generateDailyPart1(factPack, getAutomationModel, fix);
        if (!r1.ok || !r1.parsed) {
          lastReasons = [`part1_${r1.error || 'fail'}`];
          continue;
        }
        p1 = r1.parsed;
        const sliceA = instrumentUniverse.slice(0, mid);
        const sliceB = instrumentUniverse.slice(mid);
        const r2a = await generateDailyPart2(factPack, sliceA, getAutomationModel, fix);
        const r2b = await generateDailyPart2(factPack, sliceB, getAutomationModel, fix);
        if (!r2a.ok || !r2a.parsed || !r2b.ok || !r2b.parsed) {
      lastReasons = ['part2_perplexity_fail'];
          continue;
        }
        b1 = r2a.parsed;
        b2 = r2b.parsed;
        const blocks = mergeDailyBlocks([b1, b2]);
        const v = validateDailyMerged(p1, blocks, instrumentUniverse);
        if (!v.ok) {
          lastReasons = v.reasons;
          continue;
        }
        const titleLine = formatDailyHeaderTitle(runDate, timeZone);
        const includeGlobalMacroSection = shouldIncludeGlobalMacroSection(p1, blocks);
        const assembled = assembleDailyMarkdown(
          titleLine,
          briefDateYmd,
          dayLong,
          p1,
          blocks,
          includeGlobalMacroSection
        );
        const fmt = validateDailyMarkdownFormat(assembled, instrumentUniverse);
        if (!fmt.ok) {
          lastReasons = fmt.issues.map((x) => `mdfmt_${x}`);
          continue;
        }
        body = assembled;
        structuredBrief = {
          version: 2,
          part1: p1,
          blocks,
          includeGlobalMacroSection,
        };
        break;
      }
      if (!body) {
        throw new Error(`Institutional daily QC failed: ${lastReasons.join(', ')}`);
      }
    } else {
      let w1 = null;
      let w2 = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const fix = attempt > 0 ? lastReasons : null;
        const r1 = await generateWeeklyPart1(factPack, instrumentUniverse, getAutomationModel, fix);
        const r2 = await generateWeeklyPart2(factPack, instrumentUniverse, getAutomationModel, fix);
        if (!r1.ok || !r1.parsed || !r2.ok || !r2.parsed) {
      lastReasons = [`weekly_perplexity_${r1.error || ''}_${r2.error || ''}`];
          continue;
        }
        w1 = r1.parsed;
        w2 = r2.parsed;
        const v = validateWeeklyMerged(w1, w2, instrumentUniverse);
        if (!v.ok) {
          lastReasons = v.reasons;
          continue;
        }
        const titleLine = formatWeeklyHeaderTitle(factPack.weekAheadRangeLabel);
        const assembled = assembleWeeklyMarkdown(titleLine, date, factPack.weekAheadRangeLabel, w1, w2);
        const fmt = validateWeeklyMarkdownFormat(assembled, instrumentUniverse);
        if (!fmt.ok) {
          lastReasons = fmt.issues.map((x) => `mdfmt_${x}`);
          continue;
        }
        body = assembled;
        structuredBrief = { version: 2, weeklyPart1: w1, weeklyPart2: w2 };
        break;
      }
      if (!body) {
        throw new Error(`Institutional weekly QC failed: ${lastReasons.join(', ')}`);
      }
    }

    body = stripSources(body);
    assertNoSources(body);
    const postFmt = isWeekly
      ? validateWeeklyMarkdownFormat(body, instrumentUniverse)
      : validateDailyMarkdownFormat(body, instrumentUniverse);
    if (!postFmt.ok) {
      throw new Error(`Institutional brief markdown format failed post-sanitize: ${postFmt.issues.join(', ')}`);
    }

    const saved = await publishAutoBrief({
      period: normalizedPeriod,
      date,
      title: (isWeekly ? formatWeeklyHeaderTitle(factPack.weekAheadRangeLabel) : formatDailyHeaderTitle(runDate, timeZone)).slice(
        0,
        255
      ),
      body,
      briefKind,
      mimeType: 'text/markdown; charset=utf-8',
      generationMeta: {
        engine: 'institutional_aura_manual_structure_v4',
        qcOk: true,
        factPackUpdatedAt: factPack.updatedAt,
        structuredBrief,
        includeGlobalMacroSection: structuredBrief?.includeGlobalMacroSection ?? null,
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
  getInstitutionalInstrumentUniverse,
  generateAndStoreInstitutionalBrief,
  validateDailyMerged,
  validateDailyMarkdownFormat,
  validateWeeklyMarkdownFormat,
  assembleDailyMarkdown,
  _test: {
    buildInstitutionalFactPack,
    validateWeeklyMerged,
    upcomingMonFriYmd,
    filterCalendarForBriefDate,
    shouldIncludeGlobalMacroSection,
    validateDailyInstrumentLanguageDiversity,
    validateDailyMerged,
  },
};
