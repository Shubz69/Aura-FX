'use strict';

/**
 * Sunday Market Open Brief — single institutional explainer for the week open (London Sunday).
 * Stored as brief_kind aura_sunday_market_open, period daily, date = calendar Sunday (Europe/London).
 */

const SUNDAY_MARKET_OPEN_BRIEF_KIND = 'aura_sunday_market_open';
const { parseJsonFromLlmText, normalizeChatCompletionContent } = require('./institutionalLlmJsonParse');

const GENERIC_FAIL_RE =
  /\bit is important to note\b|\bas an ai\b|\bchatgpt\b|\baccording to reports\b/i;

/** Core cross-asset quotes for transmission context (facts only in factPack). */
const SUNDAY_OPEN_QUOTE_SYMBOLS = [
  'USOIL',
  'US10Y',
  'XAUUSD',
  'EURUSD',
  'USDJPY',
  'US500',
  'NAS100',
];

function ordinalDay(n) {
  const v = Number(n);
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}ST`;
  if (j === 2 && k !== 12) return `${v}ND`;
  if (j === 3 && k !== 13) return `${v}RD`;
  return `${v}TH`;
}

/** Title line: SUNDAY MARKET OPEN BRIEF – 13TH APRIL 2026 */
function formatSundayMarketOpenTitle(runDate, timeZone) {
  const ND = '\u2013';
  const dayNum = Number(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(runDate));
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone }).format(runDate);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(runDate);
  return `SUNDAY MARKET OPEN BRIEF ${ND} ${ordinalDay(dayNum)} ${month.toUpperCase()} ${year}`;
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

function stripSundayArtifacts(body) {
  let t = String(body || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/ \u002d /g, ', ');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function sundayOpenSystemPrompt() {
  return `You are the head of macro strategy writing the SUNDAY MARKET OPEN BRIEF for institutional traders.

Mission: Explain ONLY the highest-impact developments from the prior week and weekend that change how the coming week opens. Treat items as roughly high importance only — omit tactical noise and low-impact trivia.

Hard rules:
- Tone: sovereign wealth fund / global macro desk — causal chains, regime logic, positioning and liquidity. NOT wire-service recap.
- Fact anchors: Use ONLY supplied factPack (news sample, headlines, macro lines, calendars, quoted instruments). Do not invent specific prints or meetings not implied by factPack.
- Across ALL narrative prose you MUST weave market transmission consistently: crude oil as the anchor for inflation and geopolitical risk optics, sovereign yields as the amplifier of repricing and duration stress, gold as the hedge asset against real-rate and tail outcomes, USD as both funding and yield-driver. Embed this naturally in paragraphs, never as a bullet-style checklist.

REQUIRED: After the main opening and top events, you MUST include plain-prose digest paragraphs for ALL EIGHT asset sleeves in one combined brief (not separate documents): Forex, Crypto, Commodities, ETFs, Stocks, Indices, Bonds, Futures. Each sleeve paragraph must explain what matters at this open for that sleeve using factPack (news and macro context). Do not duplicate the same sentence across sleeves; each sleeve needs a distinct transmission angle.

Return JSON ONLY with this schema (exact keys):

{
  "mainOpeningHeadline": string,
  "mainOpeningBody": string,
  "topEvents": [
    {
      "headline": string,
      "whatHappened": string,
      "whyItHappened": string,
      "whatChangesStructurally": string,
      "howMarketsInterpret": string
    }
  ],
  "digestForex": string,
  "digestCrypto": string,
  "digestCommodities": string,
  "digestEtfs": string,
  "digestStocks": string,
  "digestIndices": string,
  "digestBonds": string,
  "digestFutures": string,
  "sessionAsia": string,
  "sessionLondon": string,
  "sessionNewYork": string,
  "scenarioBaseCase": string,
  "scenarioEscalation": string,
  "scenarioContainment": string,
  "finalSection": string
}

Formatting inside strings:
- mainOpeningHeadline and each topEvents[].headline MUST read like striking ALL CAPS wire-style headlines (letters mostly uppercase), strong and explanatory with no emoji and no hashtags.
- Plain prose paragraphs only inside JSON strings; separate paragraphs with \\n\\n where needed.
- Forbidden: hashtags, asterisk emphasis, markdown headings, bullet lists, numbered lists, leading "- ", "* ", "1.". Do not use ASCII hyphen minus as a decorative dash between words; prefer commas.

FORBIDDEN voice: chatbot filler, hedging stacks, generic "risk on risk off". ${String(GENERIC_FAIL_RE)}`;
}

function headlineLooksLikeCaps(s) {
  const t = String(s || '').trim();
  if (t.length < 12) return false;
  const letters = t.replace(/[^a-z]/gi, '');
  if (!letters.length) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.62;
}

function validateSundayOpenPayload(parsed) {
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['no_payload'] };

  const mh = String(parsed.mainOpeningHeadline || '').trim();
  const mb = String(parsed.mainOpeningBody || '').trim();
  if (!mh || !headlineLooksLikeCaps(mh)) reasons.push('main_headline_weak');
  if (mb.length < 420) reasons.push('main_body_thin');

  const blobMain = `${mh}\n${mb}`;
  if (!/\boil\b|\bcrud|\bwti\b|\bbrent\b/i.test(blobMain)) reasons.push('missing_oil_anchor');
  if (!/\byield|\btreasur|\brate\b|\bcurve\b/i.test(blobMain)) reasons.push('missing_yield_theme');
  if (!/\busd\b|\bdollar\b/i.test(blobMain)) reasons.push('missing_usd_theme');

  const events = Array.isArray(parsed.topEvents) ? parsed.topEvents : [];
  if (events.length < 5 || events.length > 10) reasons.push('top_events_count');

  for (let i = 0; i < events.length; i += 1) {
    const e = events[i] || {};
    const h = String(e.headline || '').trim();
    const a = String(e.whatHappened || '').trim();
    const b = String(e.whyItHappened || '').trim();
    const c = String(e.whatChangesStructurally || '').trim();
    const d = String(e.howMarketsInterpret || '').trim();
    if (!h || !headlineLooksLikeCaps(h)) reasons.push(`event_head_${i}`);
    if (a.length < 140) reasons.push(`event_what_${i}`);
    if (b.length < 140) reasons.push(`event_why_${i}`);
    if (c.length < 140) reasons.push(`event_struct_${i}`);
    if (d.length < 140) reasons.push(`event_interp_${i}`);
  }

  const sa = String(parsed.sessionAsia || '').trim();
  const sl = String(parsed.sessionLondon || '').trim();
  const sn = String(parsed.sessionNewYork || '').trim();
  if (sa.length < 200 || sl.length < 200 || sn.length < 200) reasons.push('session_thin');

  const scenarios = ['scenarioBaseCase', 'scenarioEscalation', 'scenarioContainment'];
  for (const k of scenarios) {
    if (String(parsed[k] || '').trim().length < 160) reasons.push(`${k}_thin`);
  }

  const fin = String(parsed.finalSection || '').trim();
  if (fin.length < 280) reasons.push('final_thin');

  const digestKeys = ['digestForex', 'digestCrypto', 'digestCommodities', 'digestEtfs', 'digestStocks', 'digestIndices', 'digestBonds', 'digestFutures'];
  for (const key of digestKeys) {
    const t = String(parsed[key] || '').trim();
    if (t.length < 220) reasons.push(`${key}_thin`);
  }

  if (GENERIC_FAIL_RE.test(JSON.stringify(parsed))) reasons.push('banned_voice');

  return { ok: reasons.length === 0, reasons };
}

function assembleSundayMarketOpenPlain({ titleLine, authorLine, metaDateYmd, parsedIn }) {
  const p = { ...parsedIn };
  p.mainOpeningHeadline = sanitizeProseField(p.mainOpeningHeadline);
  p.mainOpeningBody = sanitizeProseField(p.mainOpeningBody);
  p.sessionAsia = sanitizeProseField(p.sessionAsia);
  p.sessionLondon = sanitizeProseField(p.sessionLondon);
  p.sessionNewYork = sanitizeProseField(p.sessionNewYork);
  p.scenarioBaseCase = sanitizeProseField(p.scenarioBaseCase);
  p.scenarioEscalation = sanitizeProseField(p.scenarioEscalation);
  p.scenarioContainment = sanitizeProseField(p.scenarioContainment);
  p.finalSection = sanitizeProseField(p.finalSection);

  const digestLabels = [
    ['digestForex', 'FOREX'],
    ['digestCrypto', 'CRYPTO'],
    ['digestCommodities', 'COMMODITIES'],
    ['digestEtfs', 'ETFs'],
    ['digestStocks', 'STOCKS'],
    ['digestIndices', 'INDICES'],
    ['digestBonds', 'BONDS'],
    ['digestFutures', 'FUTURES'],
  ];
  for (const [k, label] of digestLabels) {
    p[k] = sanitizeProseField(p[k]);
  }

  const events = Array.isArray(p.topEvents) ? p.topEvents : [];
  const cleanedEvents = events.map((e) => ({
    headline: sanitizeProseField(e.headline),
    whatHappened: sanitizeProseField(e.whatHappened),
    whyItHappened: sanitizeProseField(e.whyItHappened),
    whatChangesStructurally: sanitizeProseField(e.whatChangesStructurally),
    howMarketsInterpret: sanitizeProseField(e.howMarketsInterpret),
  }));

  const lines = [];
  lines.push(String(titleLine || '').trim());
  lines.push('');
  lines.push(String(authorLine || '').trim());
  lines.push('');
  lines.push('Period: daily');
  lines.push(`Date: ${metaDateYmd}`);
  lines.push(`Brief kind: ${SUNDAY_MARKET_OPEN_BRIEF_KIND}`);
  lines.push('');
  lines.push(String(p.mainOpeningHeadline || '').trim());
  lines.push('');
  lines.push(p.mainOpeningBody);
  lines.push('');

  for (const ev of cleanedEvents) {
    lines.push(String(ev.headline || '').trim());
    lines.push('');
    lines.push(ev.whatHappened);
    lines.push('');
    lines.push(ev.whyItHappened);
    lines.push('');
    lines.push(ev.whatChangesStructurally);
    lines.push('');
    lines.push(ev.howMarketsInterpret);
    lines.push('');
  }

  lines.push('EIGHT-CATEGORY OPEN DIGEST');
  lines.push('');
  for (const [k, label] of digestLabels) {
    lines.push(label);
    lines.push('');
    lines.push(String(p[k] || '').trim());
    lines.push('');
  }

  lines.push('SESSION OUTLOOK');
  lines.push('');
  lines.push('ASIA SESSION');
  lines.push('');
  lines.push(p.sessionAsia);
  lines.push('');
  lines.push('LONDON SESSION');
  lines.push('');
  lines.push(p.sessionLondon);
  lines.push('');
  lines.push('NEW YORK SESSION');
  lines.push('');
  lines.push(p.sessionNewYork);
  lines.push('');
  lines.push('OVERALL MARKET STRUCTURE');
  lines.push('');
  lines.push('Base case scenario');
  lines.push('');
  lines.push(p.scenarioBaseCase);
  lines.push('');
  lines.push('Escalation scenario');
  lines.push('');
  lines.push(p.scenarioEscalation);
  lines.push('');
  lines.push('Containment scenario');
  lines.push('');
  lines.push(p.scenarioContainment);
  lines.push('');
  lines.push('WHAT MATTERS AT THIS OPEN');
  lines.push('');
  lines.push(p.finalSection);
  lines.push('');
  lines.push('End of Sunday Market Open brief. Saved to Trader Deck.');
  lines.push('');
  lines.push(String(authorLine || '').trim());

  return stripSundayArtifacts(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
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

async function callOpenAIJson(systemPrompt, userObj, getAutomationModel, options = {}) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'no_perplexity_key' };
  const maxTokens = options.maxTokens ?? 14000;
  const timeoutMs = options.timeoutMs ?? 180000;
  const temperature = options.temperature ?? 0.26;
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
        // Perplexity chat/completions: omit invalid `json_object` response_format (API returns 400).
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userObj) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        error: `http_${res.status}:${String(errBody).slice(0, 400)}`,
      };
    }
    const json = await res.json();
    const text = normalizeChatCompletionContent(json.choices?.[0]?.message?.content);
    if (!text) return { ok: false, error: 'empty_completion' };
    let parsed;
    try {
      parsed = parseJsonFromLlmText(text);
    } catch (parseErr) {
      return { ok: false, error: parseErr.message || 'invalid_json' };
    }
    return { ok: true, parsed };
  } catch (e) {
    return { ok: false, error: e.message || 'perplexity_error' };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAndStoreSundayMarketOpenBrief(deps, { runDate = new Date(), timeZone = 'Europe/London' }) {
  const {
    assertAutomationModelConfigured,
    ensureAutomationTables,
    reserveRun,
    finalizeRun,
    publishAutoBrief,
    stripSources,
    assertNoSources,
    getAutomationModel,
    toYmdInTz,
    runEngine,
    fetchUnifiedNewsSample,
    buildQuoteCacheForSymbols,
    fetchAutomationQuoteWithFallback,
  } = deps;

  assertAutomationModelConfigured();
  await ensureAutomationTables();

  const briefDateYmd = toYmdInTz(runDate, timeZone);
  const runKey = `aura-sunday-market-open:${briefDateYmd}`;

  const reserved = await reserveRun(runKey, 'daily', briefDateYmd);
  if (!reserved) {
    return {
      success: true,
      skipped: true,
      reason: 'already-generated',
      runKey,
      date: briefDateYmd,
      briefKind: SUNDAY_MARKET_OPEN_BRIEF_KIND,
    };
  }

  try {
    const inst = require('./institutionalAuraBrief');
    const { buildInstitutionalFactPack } = inst._test;
    const { getInstitutionalInstrumentUniverse } = inst;
    const instrumentUniverse = [...new Set([...SUNDAY_OPEN_QUOTE_SYMBOLS, ...getInstitutionalInstrumentUniverse().map((x) => x.id)])].map(
      (id) => ({ id })
    );
    const symbols = instrumentUniverse.map((x) => x.id);

    const [market, econ, news] = await Promise.all([
      runEngine({ timeframe: 'daily', date: briefDateYmd }),
      fetchEconomicCalendarInline(),
      fetchUnifiedNewsSample(),
    ]);

    const quoteCache = await buildQuoteCacheForSymbols(symbols, fetchAutomationQuoteWithFallback);

    const basePack = buildInstitutionalFactPack({
      period: 'daily',
      market,
      econ,
      news,
      quoteCache,
      briefDateYmd,
      timeZone,
      runDate,
      instrumentUniverse,
      briefKindForMacro: 'aura_institutional_daily',
    });

    const weekendNewsContext = {
      headlineSample: (news || []).slice(0, 40),
      macroSummary: basePack.macroSummary,
      calendarWeekAhead: basePack.calendarWeekAhead,
      calendarToday: basePack.calendarToday,
      tradingWeekMeta: basePack.tradingWeekMeta,
      liveQuotesByInstrument: basePack.liveQuotesByInstrument,
      horizonNote:
        'Scope: Sunday open lens — judge only developments that materially reset Asia–London–New York liquidity and tail pricing into the new week.',
    };

    const factPack = {
      ...weekendNewsContext,
      sundayBriefMandate:
        'Include five to ten topEvents maximum. Each must justify 10/10 importance for cross-asset repricing.',
    };

    const systemPrompt = sundayOpenSystemPrompt();
    let parsed = null;
    let lastReasons = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fix = attempt > 0 ? lastReasons : null;
      const rs = await callOpenAIJson(
        systemPrompt,
        {
          task: 'Sunday Market Open Brief — JSON only',
          factPack,
          fixNote: fix,
        },
        getAutomationModel,
        { maxTokens: 16000, temperature: 0.26, timeoutMs: 200000 }
      );
      if (!rs.ok || !rs.parsed) {
        lastReasons = [`llm_${rs.error || 'fail'}`];
        continue;
      }
      const v = validateSundayOpenPayload(rs.parsed);
      if (!v.ok) {
        lastReasons = v.reasons;
        continue;
      }
      parsed = rs.parsed;
      break;
    }

    if (!parsed) {
      throw new Error(`Sunday Market Open QC failed: ${lastReasons.join(', ')}`);
    }

    const titleLine = formatSundayMarketOpenTitle(runDate, timeZone);
    const authorLine = String(process.env.AURA_INSTITUTIONAL_AUTHOR || 'By AURA TERMINAL™').trim();

    let body = assembleSundayMarketOpenPlain({
      titleLine,
      authorLine,
      metaDateYmd: briefDateYmd,
      parsedIn: parsed,
    });

    body = stripSources(body);
    body = String(body || '')
      .replace(/^[ \t]*(-\s*){3,}[ \t]*$/gm, '')
      .trim();
    assertNoSources(body);

    const saved = await publishAutoBrief({
      period: 'daily',
      date: briefDateYmd,
      title: titleLine.slice(0, 255),
      body,
      briefKind: SUNDAY_MARKET_OPEN_BRIEF_KIND,
      mimeType: 'text/plain; charset=utf-8',
      generationMeta: {
        engine: 'sunday_market_open_v1',
        qcOk: true,
        factPackUpdatedAt: basePack.updatedAt,
        structuredBrief: { version: 2, sundayOpen: parsed },
      },
    });

    await finalizeRun(runKey, 'success', saved.insertId, null);

    return {
      success: true,
      briefId: saved.insertId,
      briefVersion: saved.briefVersion,
      runKey,
      date: briefDateYmd,
      briefKind: SUNDAY_MARKET_OPEN_BRIEF_KIND,
    };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'sunday open brief failed').slice(0, 255));
    return {
      success: false,
      runKey,
      date: briefDateYmd,
      briefKind: SUNDAY_MARKET_OPEN_BRIEF_KIND,
      error: err.message || 'sunday open brief failed',
    };
  }
}

/**
 * Default: Sunday 21:00 London full hour (one hour before typical 22:00 FX week reopen).
 * Override hour with env SUNDAY_OPEN_BRIEF_HOUR_LONDON (0–23).
 */
function shouldRunSundayMarketOpenWindow({
  now = new Date(),
  timeZone = 'Europe/London',
} = {}) {
  const hourEnv = Number(process.env.SUNDAY_OPEN_BRIEF_HOUR_LONDON);
  const targetHour = Number.isFinite(hourEnv) && hourEnv >= 0 && hourEnv <= 23 ? hourEnv : 21;

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
  return wd.startsWith('sun') && hh === targetHour && mm < 59;
}

module.exports = {
  SUNDAY_MARKET_OPEN_BRIEF_KIND,
  formatSundayMarketOpenTitle,
  sundayOpenSystemPrompt,
  validateSundayOpenPayload,
  assembleSundayMarketOpenPlain,
  generateAndStoreSundayMarketOpenBrief,
  shouldRunSundayMarketOpenWindow,
};
