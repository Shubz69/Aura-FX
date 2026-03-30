/**
 * Aura FX institutional AI brief — single daily / weekly house brief with mandatory structure,
 * fixed instrument sleeve, session biases (London / New York), and QC before publish.
 */

const { buildMacroSummaryLines } = require('./briefInstrumentUniverse');

/** Canonical IDs for quotes (internal) → display labels in output */
const INSTITUTIONAL_INSTRUMENTS = [
  { id: 'XAUUSD', label: 'XAU/USD' },
  { id: 'US30', label: 'US30' },
  { id: 'NAS100', label: 'NASDAQ (US100)' },
  { id: 'WTI', label: 'OIL' },
  { id: 'GBPUSD', label: 'GBP/USD' },
  { id: 'EURUSD', label: 'EUR/USD' },
  { id: 'USDJPY', label: 'USD/JPY' },
  { id: 'USDCHF', label: 'USD/CHF' },
  { id: 'CADJPY', label: 'CAD/JPY' },
  { id: 'EURCHF', label: 'EUR/CHF' },
  { id: 'GBPJPY', label: 'GBP/JPY' },
];

const GENERIC_FAIL_RE =
  /\bit is important to note\b|\bin conclusion\b|\bmoving forward\b|\bas an ai\b|\bi cannot\b|\bleverage appropriate\b|\bstay nimble\b|\bremain cautious\b|chatgpt|as a language model/i;

const BIAS_RE = /\b(bullish|bearish|neutral)\b/i;

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

function buildInstitutionalFactPack({ period, market, econ, news, quoteCache }) {
  const macroSummary = buildMacroSummaryLines(market, 'general', period);
  const drivers = (market.keyDrivers || []).slice(0, 10).map(packDriverLine).filter(Boolean);
  const cross = (market.crossAssetSignals || []).slice(0, 10).map(packSignalLine).filter(Boolean);
  const quotes = INSTITUTIONAL_INSTRUMENTS.map(({ id }) => {
    const q = quoteCache && quoteCache.get ? quoteCache.get(id) : null;
    return {
      id,
      last: q?.c != null ? q.c : null,
      changePct: q?.dp != null ? Math.round(q.dp * 100) / 100 : null,
    };
  });
  const calHigh = (econ || [])
    .filter((e) => /\b(high|red)\b/i.test(String(e.impact || '')))
    .slice(0, 14)
    .map((e) => ({
      currency: e.currency || '',
      event: e.event || '',
      impact: e.impact || '',
      time: e.time || '',
    }));
  const calNear = (econ || []).slice(0, 22).map((e) => ({
    currency: e.currency || '',
    event: e.event || '',
    impact: e.impact || '',
    time: e.time || '',
  }));
  return {
    period,
    marketRegime: market.marketRegime || null,
    marketPulse: market.marketPulse || null,
    macroSummary,
    keyDrivers: drivers,
    crossAssetSignals: cross,
    traderFocus: (market.traderFocus || []).slice(0, 8),
    riskRadar: (market.riskRadar || []).slice(0, 8),
    calendarHighImpact: calHigh,
    calendarUpcoming: calNear,
    headlines: (news || []).slice(0, 24),
    liveQuotesByInstrument: quotes,
    updatedAt: new Date().toISOString(),
  };
}

function formatBriefTitleDaily(now, timeZone) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(now);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(now);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(now);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(now);
  return `DAILY MARKET BRIEF – ${weekday.toUpperCase()}, ${day} ${month.toUpperCase()} ${year}`;
}

function formatBriefTitleWeekly(now, timeZone) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(now);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(now);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(now);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(now);
  return `WEEKLY MARKET BRIEF – ${weekday.toUpperCase()}, ${day} ${month.toUpperCase()} ${year}`;
}

function assembleDailyMarkdown(title, dateYmd, payload) {
  const lines = [];
  lines.push(title);
  lines.push('');
  lines.push('Period: Daily');
  lines.push(`Date: ${dateYmd}`);
  lines.push('Category: General Market Brief');
  lines.push('');
  lines.push('### 1. MARKET CONTEXT (MACRO OVERVIEW)');
  lines.push(String(payload.marketContextMacro || '').trim());
  lines.push('');
  lines.push('### 2. CROSS-ASSET FLOW');
  lines.push(String(payload.crossAssetFlow || '').trim());
  lines.push('');
  lines.push('### 3. KEY DRIVERS');
  const kd = Array.isArray(payload.keyDrivers) ? payload.keyDrivers.slice(0, 4) : [];
  kd.forEach((b) => lines.push(`- ${String(b).trim()}`));
  lines.push('');
  lines.push('### 4. MARKET BEHAVIOUR INSIGHT');
  lines.push(String(payload.marketBehaviourInsight || '').trim());
  lines.push('');
  lines.push('### 5. WHAT MATTERS NEXT');
  const wmn = Array.isArray(payload.whatMattersNext) ? payload.whatMattersNext : [];
  wmn.forEach((b) => lines.push(`- ${String(b).trim()}`));
  lines.push('');
  lines.push('### 6. TRADER TAKEAWAY');
  lines.push(String(payload.traderTakeaway || '').trim());
  lines.push('');
  lines.push('### INSTRUMENT BREAKDOWN');
  const inst = Array.isArray(payload.instruments) ? payload.instruments : [];
  for (const row of inst) {
    const label = String(row.label || row.id || '').trim();
    lines.push('');
    lines.push(`[${label}]`);
    lines.push('');
    lines.push(`London Session Bias: ${String(row.londonSessionBias || '').trim()}`);
    lines.push(`→ ${String(row.londonWhy || '').trim()}`);
    lines.push('');
    lines.push(`New York Session Bias: ${String(row.newYorkSessionBias || '').trim()}`);
    lines.push(`→ ${String(row.newYorkWhy || '').trim()}`);
    lines.push('');
    lines.push(`Technical — Trend: ${String(row.trend || '').trim()}`);
    lines.push(`Support: ${String(row.support || '').trim()}`);
    lines.push(`Resistance: ${String(row.resistance || '').trim()}`);
    lines.push(`Bias: ${String(row.technicalBias || row.bias || '').trim()}`);
    const ti = row.tradeIdeas;
    if (ti && typeof ti === 'object' && (ti.highConfidence === true || ti.include === true)) {
      lines.push('');
      lines.push('Trade ideas (high confidence only):');
      if (ti.buy && typeof ti.buy === 'object') {
        lines.push(
          `Buy: Entry ${ti.buy.entry || '—'} | Stop ${ti.buy.stopLoss || ti.buy.stop || '—'} | TP ${ti.buy.takeProfit || ti.buy.tp || '—'}`
        );
      }
      if (ti.sell && typeof ti.sell === 'object') {
        lines.push(
          `Sell: Entry ${ti.sell.entry || '—'} | Stop ${ti.sell.stopLoss || ti.sell.stop || '—'} | TP ${ti.sell.takeProfit || ti.sell.tp || '—'}`
        );
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function assembleWeeklyMarkdown(title, dateYmd, payload) {
  const lines = [];
  lines.push(title);
  lines.push('');
  lines.push('Period: Weekly');
  lines.push(`Date: ${dateYmd}`);
  lines.push('Category: General Market Brief');
  lines.push('');
  lines.push('### 1. PREVIOUS WEEK RECAP');
  lines.push(String(payload.previousWeekRecap || '').trim());
  lines.push('');
  lines.push('### 2. WHAT ACTUALLY HAPPENED');
  lines.push(String(payload.whatActuallyHappened || '').trim());
  lines.push('');
  lines.push('### 3. THIS WEEK OUTLOOK');
  lines.push(String(payload.thisWeekOutlook || '').trim());
  lines.push('');
  lines.push('### 4. KEY EVENTS CALENDAR');
  const cal = Array.isArray(payload.keyEventsCalendar) ? payload.keyEventsCalendar : [];
  cal.forEach((b) => lines.push(`- ${String(b).trim()}`));
  lines.push('');
  lines.push('### 5. WEEKEND DEVELOPMENTS');
  lines.push(String(payload.weekendDevelopments || '').trim());
  lines.push('');
  lines.push('### INSTRUMENT LENS (WEEK AHEAD)');
  const inst = Array.isArray(payload.instrumentsWeekAhead) ? payload.instrumentsWeekAhead : [];
  for (const row of inst) {
    const label = String(row.label || '').trim();
    lines.push('');
    lines.push(`[${label}]`);
    lines.push(String(row.outlook || '').trim());
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function validateDailyPayload(p) {
  const reasons = [];
  if (!p || typeof p !== 'object') return { ok: false, reasons: ['empty_payload'] };
  const mc = String(p.marketContextMacro || '').trim();
  if (mc.length < 120) reasons.push('market_context_thin');
  const macroDims = [
    /\b(yield|bond|treasury|10y|rate)\b/i,
    /\b(usd|dxy|dollar)\b/i,
    /\b(oil|wti|crude|energy)\b/i,
    /\b(equity|equities|index|s\s*&\s*p|nasdaq|risk\s*on|risk\s*off)\b/i,
    /\binflation\b/i,
  ];
  if (macroDims.filter((re) => re.test(mc)).length < 2) reasons.push('market_context_macro_depth');
  const xf = String(p.crossAssetFlow || '').trim();
  if (xf.length < 100) reasons.push('cross_asset_thin');
  const kd = Array.isArray(p.keyDrivers) ? p.keyDrivers : [];
  if (kd.length < 2 || kd.length > 4) reasons.push('key_drivers_count');
  const beh = String(p.marketBehaviourInsight || '').trim();
  if (beh.length < 80) reasons.push('behaviour_thin');
  const tt = String(p.traderTakeaway || '').trim();
  if (tt.length < 80) reasons.push('takeaway_thin');
  if (GENERIC_FAIL_RE.test(`${mc}\n${xf}\n${beh}\n${tt}`)) reasons.push('generic_voice');

  const inst = Array.isArray(p.instruments) ? p.instruments : [];
  if (inst.length !== INSTITUTIONAL_INSTRUMENTS.length) reasons.push('instruments_count');
  for (let i = 0; i < INSTITUTIONAL_INSTRUMENTS.length; i += 1) {
    const expectId = INSTITUTIONAL_INSTRUMENTS[i].id;
    const row = inst[i];
    if (!row || String(row.id || '').toUpperCase() !== expectId) {
      reasons.push(`instrument_order_${expectId}`);
      break;
    }
    if (!BIAS_RE.test(String(row.londonSessionBias || ''))) reasons.push(`london_bias_${expectId}`);
    if (!BIAS_RE.test(String(row.newYorkSessionBias || ''))) reasons.push(`ny_bias_${expectId}`);
    const whyL = String(row.londonWhy || '').trim();
    const whyN = String(row.newYorkWhy || '').trim();
    if (whyL.length < 40 || whyN.length < 40) reasons.push(`session_why_thin_${expectId}`);
    if (String(row.trend || '').length < 15) reasons.push(`trend_thin_${expectId}`);
  }
  return { ok: reasons.length === 0, reasons };
}

function validateWeeklyPayload(p) {
  const reasons = [];
  if (!p || typeof p !== 'object') return { ok: false, reasons: ['empty_payload'] };
  for (const k of ['previousWeekRecap', 'whatActuallyHappened', 'thisWeekOutlook', 'weekendDevelopments']) {
    if (String(p[k] || '').trim().length < 100) reasons.push(`weekly_thin_${k}`);
  }
  const cal = Array.isArray(p.keyEventsCalendar) ? p.keyEventsCalendar : [];
  if (cal.length < 2) reasons.push('weekly_calendar_bullets');
  const inst = Array.isArray(p.instrumentsWeekAhead) ? p.instrumentsWeekAhead : [];
  if (inst.length !== INSTITUTIONAL_INSTRUMENTS.length) reasons.push('weekly_instruments_count');
  else {
    for (let i = 0; i < INSTITUTIONAL_INSTRUMENTS.length; i += 1) {
      const expectId = INSTITUTIONAL_INSTRUMENTS[i].id;
      const row = inst[i];
      if (!row || String(row.id || '').toUpperCase() !== expectId) {
        reasons.push(`weekly_instrument_order_${expectId}`);
        break;
      }
      if (String(row.outlook || '').trim().length < 50) reasons.push(`weekly_outlook_thin_${expectId}`);
    }
  }
  if (GENERIC_FAIL_RE.test(JSON.stringify(p))) reasons.push('generic_voice');
  return { ok: reasons.length === 0, reasons };
}

async function callOpenAIJson(systemPrompt, userObj, getAutomationModel) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'no_openai_key' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getAutomationModel(),
        temperature: 0.25,
        max_tokens: 7500,
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
    return { ok: false, error: e.message || 'openai_error' };
  }
}

const DAILY_SYSTEM = `You are the head of macro strategy at an institutional FX/multi-asset desk (Aura FX house style).
You write concise, causal, desk-ready prose — never generic AI filler, never disclaimers, never "as an AI".
You ONLY use the JSON factPack provided; do not invent data releases or prices.
Output valid JSON only matching the schema in the user message.

DAILY STRUCTURE (all required):
- marketContextMacro: ONE short paragraph (NOT bullets). Must state market regime (risk-on / risk-off / mixed), bond yields direction, USD, inflation expectations, oil, equity sentiment — as cause → effect chain.
- crossAssetFlow: ONE short paragraph linking equities, bonds, USD, gold, crypto, oil — how money rotates (not isolated sentences per asset).
- keyDrivers: array of 2 to 4 bullet strings only — real drivers: central banks, major data, geopolitics, liquidity.
- marketBehaviourInsight: ONE paragraph — tape tone (trend/choppy/volatile), what traders should expect, what to avoid (trader warning voice).
- whatMattersNext: array of bullets — high-impact calendar items, speeches, data (use factPack.calendar).
- traderTakeaway: ONE sharp paragraph — focus, lean/bias, what invalidates the read.
- instruments: array of exactly 11 objects in ORDER: XAUUSD, US30, NAS100, WTI, GBPUSD, EURUSD, USDJPY, USDCHF, CADJPY, EURCHF, GBPJPY.
  Each object: id (exact), label (exact display), londonSessionBias (Bullish|Bearish|Neutral), londonWhy (macro + London session logic),
  newYorkSessionBias (Bullish|Bearish|Neutral), newYorkWhy (data + USD flows), trend, support, resistance, technicalBias,
  tradeIdeas: null OR { "highConfidence": true, "buy": {"entry","stopLoss","takeProfit"}, "sell": {"entry","stopLoss","takeProfit"} } only if genuinely high conviction.

Session biases may differ between London and New York when justified by the pack.`;

const WEEKLY_SYSTEM = `You are the head of macro strategy at an institutional FX/multi-asset desk (Aura FX house style).
Use only the factPack — no invention. Output valid JSON only.

Required fields:
- previousWeekRecap: deep but concise paragraph.
- whatActuallyHappened: longer breakdown of what repriced and why (macro-linked).
- thisWeekOutlook: narrative including implications for the listed instruments (may use sub-bullets inside the string).
- keyEventsCalendar: array of bullet strings (high-impact items from calendar).
- weekendDevelopments: paragraph (use headlines + calendar; if none, state "No major weekend headline stack in feed — monitor Sunday open liquidity.").
- instrumentsWeekAhead: REQUIRED array of exactly 11 objects in this order: XAUUSD, US30, NAS100, WTI, GBPUSD, EURUSD, USDJPY, USDCHF, CADJPY, EURCHF, GBPJPY — each { "id": "XAUUSD", "label": "XAU/USD", "outlook": "2-4 sentences macro-linked week ahead" }.`;

async function generateDailyPayload(factPack, getAutomationModel, fixReasons = null) {
  const schemaHint = {
    marketContextMacro: 'string',
    crossAssetFlow: 'string',
    keyDrivers: ['string'],
    marketBehaviourInsight: 'string',
    whatMattersNext: ['string'],
    traderTakeaway: 'string',
    instruments: INSTITUTIONAL_INSTRUMENTS.map(({ id, label }) => ({
      id,
      label,
      londonSessionBias: 'Bullish|Bearish|Neutral',
      londonWhy: 'string',
      newYorkSessionBias: 'Bullish|Bearish|Neutral',
      newYorkWhy: 'string',
      trend: 'string',
      support: 'string',
      resistance: 'string',
      technicalBias: 'string',
      tradeIdeas: 'object|null',
    })),
  };
  const userObj = {
    task: 'Generate the daily institutional brief JSON.',
    factPack,
    jsonSchema: schemaHint,
    fixNote: fixReasons ? `Prior rejection reasons: ${fixReasons.join('; ')}. Fix all.` : null,
  };
  const r = await callOpenAIJson(DAILY_SYSTEM, userObj, getAutomationModel);
  return r;
}

async function generateWeeklyPayload(factPack, getAutomationModel, fixReasons = null) {
  const userObj = {
    task: 'Generate the weekly institutional brief JSON.',
    factPack,
    instrumentOrder: INSTITUTIONAL_INSTRUMENTS,
    fixNote: fixReasons ? `Prior rejection: ${fixReasons.join('; ')}` : null,
  };
  const r = await callOpenAIJson(WEEKLY_SYSTEM, userObj, getAutomationModel);
  return r;
}

/**
 * @param {object} deps - injected from autoBriefGenerator (avoids circular require)
 */
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
    const [market, econ, news] = await Promise.all([
      runEngine({ timeframe: normalizedPeriod, date }),
      fetchEconomicCalendarInline(),
      fetchUnifiedNewsSample(),
    ]);
    const symbols = INSTITUTIONAL_INSTRUMENTS.map((x) => x.id);
    const quoteCache = await buildQuoteCacheForSymbols(symbols, fetchAutomationQuoteWithFallback);
    const factPack = buildInstitutionalFactPack({
      period: normalizedPeriod,
      market,
      econ,
      news,
      quoteCache,
    });

    let payload = null;
    let lastReasons = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const fix = attempt > 0 ? lastReasons : null;
      const gen = isWeekly
        ? await generateWeeklyPayload(factPack, getAutomationModel, fix)
        : await generateDailyPayload(factPack, getAutomationModel, fix);
      if (!gen.ok || !gen.parsed) {
        lastReasons = [`openai_${gen.error || 'parse'}`];
        continue;
      }
      const v = isWeekly ? validateWeeklyPayload(gen.parsed) : validateDailyPayload(gen.parsed);
      if (v.ok) {
        payload = gen.parsed;
        break;
      }
      lastReasons = v.reasons;
    }

    if (!payload) {
      throw new Error(`Institutional brief QC failed: ${lastReasons.join(', ')}`);
    }

    const title = isWeekly
      ? formatBriefTitleWeekly(runDate, timeZone)
      : formatBriefTitleDaily(runDate, timeZone);
    let body = isWeekly
      ? assembleWeeklyMarkdown(title, date, payload)
      : assembleDailyMarkdown(title, date, payload);
    body = stripSources(body);
    assertNoSources(body);

    const saved = await publishAutoBrief({
      period: normalizedPeriod,
      date,
      title: title.slice(0, 255),
      body,
      briefKind,
      generationMeta: {
        engine: 'institutional_aura_v1',
        qcOk: true,
        factPackUpdatedAt: factPack.updatedAt,
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
  generateAndStoreInstitutionalBrief,
  validateDailyPayload,
  assembleDailyMarkdown,
  _test: { buildInstitutionalFactPack, validateWeeklyPayload },
};
