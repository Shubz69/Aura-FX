/**
 * Aura FX institutional AI brief.
 * Daily: seven parallel PDF-structured daily briefs (Forex … Stocks), prose only.
 * Weekly: seven parallel PDF-structured fundamental analyses (Forex … Stocks), prose only.
 */

const { INSTITUTIONAL_WEEKLY_WFA_KINDS, INSTITUTIONAL_DAILY_WFA_KINDS } = require('../deskBriefKinds');
const weeklyWfaPdfBrief = require('./weeklyWfaPdfBrief');
const dailyBriefPdfBrief = require('./dailyBriefPdfBrief');
const {
  buildMacroSummaryLines,
  scoreAndSelectTopInstruments,
  collectAllAutomationUniverseSymbols,
  getUniverseSymbols,
  headlinesForSymbol,
  categoryWritingMandate,
  CATEGORY_INTELLIGENCE_DIRECTIVES,
} = require('./briefInstrumentUniverse');
const { parseJsonFromLlmText, normalizeChatCompletionContent } = require('./institutionalLlmJsonParse');

/** When `1`, run WFA sleeves one after another (clearer logs; backfill script sets this by default). */
function institutionalWfaSleevesSequential() {
  return String(process.env.INSTITUTIONAL_WFA_SEQUENTIAL || '').trim() === '1';
}

/** Large JSON + reasoning models often exceed 180s. Set INSTITUTIONAL_PERPLEXITY_TIMEOUT_MS (60000–600000). */
function institutionalPerplexityTimeoutMs() {
  const n = Number.parseInt(String(process.env.INSTITUTIONAL_PERPLEXITY_TIMEOUT_MS || '').trim(), 10);
  if (Number.isFinite(n) && n >= 60000) return Math.min(600000, n);
  return 300000;
}

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
  briefKindForMacro = null,
}) {
  const macroKind =
    briefKindForMacro ||
    (period === 'weekly' ? 'aura_institutional_weekly' : 'aura_institutional_daily');
  const macroSummary = buildMacroSummaryLines(market, macroKind, period);
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

async function callOpenAIJson(systemPrompt, userObj, getAutomationModel, options = {}) {
  const apiKey = String(process.env.PERPLEXITY_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'no_perplexity_key' };
  const maxTokens = options.maxTokens ?? 10000;
  const timeoutMs = options.timeoutMs ?? 120000;
  const temperature = options.temperature ?? 0.28;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const hbMs = Number(options.heartbeatMs) || 0;
  let hb = null;
  if (hbMs > 0) {
    const label = String(options.heartbeatLabel || '[perplexity]').trim() || '[perplexity]';
    hb = setInterval(() => {
      console.log(label, 'still waiting on Perplexity (large JSON — often 1–3+ min)…');
    }, hbMs);
    if (typeof hb.unref === 'function') hb.unref();
  }
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
        // Perplexity chat/completions accepts `text` or `json_schema` only — `json_object` returns HTTP 400.
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
    if (hb) clearInterval(hb);
  }
}

function wfaNarrativeHint(briefKindSlug, factPack) {
  const seed = `${briefKindSlug}|${factPack?.briefDateYmd || ''}|${factPack?.weekAheadRangeLabel || ''}`;
  const h = [...seed].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const hints = [
    'Force each instrument block to cite at least one transmission chain through oil, Treasury yields, or USD liquidity unless factPack contradicts.',
    'Keep the scenario pair distinct: continuation assumes regime persistence in the dominant macro driver; reversal assumes a clean break.',
    'Week structure must read as Monday through Friday narrative momentum, not disconnected fragments.',
  ];
  return hints[Math.abs(h) % hints.length];
}

async function weeklyWfaPackAlreadyComplete(executeQuery, deskDate) {
  if (!executeQuery || !/^\d{4}-\d{2}-\d{2}$/.test(String(deskDate || ''))) return false;
  const ph = INSTITUTIONAL_WEEKLY_WFA_KINDS.map(() => '?').join(',');
  const [rows] = await executeQuery(
    `SELECT brief_kind FROM trader_deck_briefs WHERE period = 'weekly' AND date = ? AND brief_kind IN (${ph})`,
    [deskDate, ...INSTITUTIONAL_WEEKLY_WFA_KINDS]
  );
  const have = new Set((rows || []).map((r) => String(r.brief_kind).toLowerCase()));
  return INSTITUTIONAL_WEEKLY_WFA_KINDS.every((k) => have.has(String(k).toLowerCase()));
}

function collectWeeklyWfaQuoteSymbols() {
  const out = new Set(collectAllAutomationUniverseSymbols());
  for (const kind of INSTITUTIONAL_WEEKLY_WFA_KINDS) {
    getUniverseSymbols(kind).forEach((s) => out.add(String(s).toUpperCase()));
  }
  return [...out];
}

async function generateOneWeeklyWfaCategory(deps, shared, briefKindSlug) {
  const {
    reserveRun,
    finalizeRun,
    publishAutoBrief,
    stripSources,
    assertNoSources,
    getAutomationModel,
  } = deps;
  const {
    market,
    econ,
    news,
    quoteCache,
    baseFactPack,
    briefDateYmd,
    date,
    titleLine,
    authorLine,
  } = shared;

  const runKey = `aura-institutional:wfa:${briefKindSlug}:${date}`;
  const reserved = await reserveRun(runKey, 'weekly', date);
  if (!reserved) {
    return { briefKind: briefKindSlug, skipped: true, reason: 'already-generated', runKey };
  }

  try {
    const selection = await scoreAndSelectTopInstruments({
      briefKind: briefKindSlug,
      period: 'weekly',
      quoteCache,
      headlines: news,
      calendarRows: econ,
      market,
      logPrefix: '[inst-wfa]',
    });

    const categoryHeader = weeklyWfaPdfBrief.WFA_KIND_TO_HEADER[briefKindSlug];
    const topFiveInstruments = selection.scoreRows.map((r) => {
      const symU = String(r.symbol).toUpperCase();
      const q = quoteCache?.get ? quoteCache.get(symU) : null;
      return {
        symbol: symU,
        selectionScore: r.score,
        selectionBreakdown: r.breakdown,
        last: q?.c != null ? q.c : null,
        changePct: q?.dp != null ? Math.round(q.dp * 100) / 100 : null,
        headlines: headlinesForSymbol(symU, news).slice(0, 6),
      };
    });

    const factPack = {
      ...baseFactPack,
      briefKindSlug,
      categoryHeader,
      categoryMandate: categoryWritingMandate(briefKindSlug, 'weekly'),
      categoryDirective: CATEGORY_INTELLIGENCE_DIRECTIVES[briefKindSlug] || '',
      topFiveInstruments,
    };

    const systemPrompt = weeklyWfaPdfBrief.weeklyWfaSystemPrompt(categoryHeader);
    let parsed = null;
    let lastReasons = [];

    const weeklyModelLabel = typeof getAutomationModel === 'function' ? String(getAutomationModel() || '').trim() : '';
    const wSleeveIdx = INSTITUTIONAL_WEEKLY_WFA_KINDS.indexOf(briefKindSlug);
    const wSleeveFrac = wSleeveIdx >= 0 ? `${wSleeveIdx + 1}/${INSTITUTIONAL_WEEKLY_WFA_KINDS.length}` : '?/?';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fix = attempt > 0 ? lastReasons : null;
      console.log(
        '[inst-wfa] perplexity',
        `sleeve ${wSleeveFrac}`,
        briefKindSlug,
        date,
        `attempt ${attempt + 1}/3`,
        `model=${weeklyModelLabel || '(default)'} · heartbeat every 30s while waiting`
      );
      const rs = await callOpenAIJson(
        systemPrompt,
        {
          task: `Weekly fundamental analysis JSON for ${categoryHeader}.`,
          factPack,
          briefMeta: {
            narrativeHint: wfaNarrativeHint(briefKindSlug, factPack),
          },
          fixNote: fix,
        },
        getAutomationModel,
        {
          maxTokens: 12000,
          temperature: 0.26,
          timeoutMs: institutionalPerplexityTimeoutMs(),
          heartbeatMs: 30000,
          heartbeatLabel: `[inst-wfa] ${briefKindSlug}`,
        }
      );
      if (!rs.ok || !rs.parsed) {
        lastReasons = [`llm_${rs.error || 'fail'}`];
        console.warn('[inst-wfa] perplexity', briefKindSlug, `attempt ${attempt + 1} fail`, String(rs.error || '').slice(0, 220));
        continue;
      }
      const v = weeklyWfaPdfBrief.validateWeeklyWfaPayload(rs.parsed, briefKindSlug);
      if (!v.ok) {
        lastReasons = v.reasons;
        console.warn('[inst-wfa] perplexity', briefKindSlug, `attempt ${attempt + 1} QC`, (v.reasons || []).slice(0, 2).join('; '));
        continue;
      }
      parsed = rs.parsed;
      console.log('[inst-wfa] perplexity', briefKindSlug, `attempt ${attempt + 1} ok (QC passed)`);
      break;
    }

    if (!parsed) {
      throw new Error(`Weekly WFA QC failed (${briefKindSlug}): ${lastReasons.join(', ')}`);
    }

    let body = weeklyWfaPdfBrief.assembleWeeklyWfaPlain({
      titleLine,
      authorLine,
      metaDateYmd: briefDateYmd,
      weekRangeLabel: baseFactPack.weekAheadRangeLabel,
      briefKind: briefKindSlug,
      parsedIn: parsed,
    });

    body = stripSources(body);
    body = String(body || '')
      .replace(/^[ \t]*(-\s*){3,}[ \t]*$/gm, '')
      .replace(/^[ \t]*---[ \t]*.*[ \t]*---[ \t]*$/gm, '')
      .trim();
    assertNoSources(body);

    const saved = await publishAutoBrief({
      period: 'weekly',
      date,
      title: titleLine.slice(0, 255),
      body,
      briefKind: briefKindSlug,
      mimeType: 'text/plain; charset=utf-8',
      generationMeta: {
        engine: 'institutional_aura_weekly_wfa_v1',
        qcOk: true,
        wfaKind: briefKindSlug,
        factPackUpdatedAt: baseFactPack.updatedAt,
        structuredBrief: { version: 6, weeklyWfa: parsed },
      },
    });

    await finalizeRun(runKey, 'success', saved.insertId, null);
    return {
      success: true,
      briefKind: briefKindSlug,
      briefId: saved.insertId,
      briefVersion: saved.briefVersion,
      runKey,
    };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'weekly wfa failed').slice(0, 255));
    return {
      success: false,
      briefKind: briefKindSlug,
      error: err.message || 'weekly wfa failed',
      runKey,
    };
  }
}

async function generateAndStoreWeeklyWfaPack(deps, { runDate, timeZone, date, normalizedPeriod }) {
  const {
    executeQuery,
    assertAutomationModelConfigured,
    ensureAutomationTables,
    toYmdInTz,
    runEngine,
    fetchUnifiedNewsSample,
    buildQuoteCacheForSymbols,
    fetchAutomationQuoteWithFallback,
  } = deps;

  assertAutomationModelConfigured();
  await ensureAutomationTables();

  if (await weeklyWfaPackAlreadyComplete(executeQuery, date)) {
    return {
      success: true,
      skipped: true,
      reason: 'weekly-wfa-complete',
      period: normalizedPeriod,
      date,
    };
  }

  const briefDateYmd = toYmdInTz(runDate, timeZone);
  const [market, econ, news] = await Promise.all([
    runEngine({ timeframe: normalizedPeriod, date }),
    fetchEconomicCalendarInline(),
    fetchUnifiedNewsSample(),
  ]);

  const symbols = collectWeeklyWfaQuoteSymbols();
  const quoteCache = await buildQuoteCacheForSymbols(symbols, fetchAutomationQuoteWithFallback);
  const instrumentUniverse = symbols.map((id) => ({ id }));

  const baseFactPack = buildInstitutionalFactPack({
    period: normalizedPeriod,
    market,
    econ,
    news,
    quoteCache,
    briefDateYmd,
    timeZone,
    runDate,
    instrumentUniverse,
    briefKindForMacro: 'aura_institutional_weekly',
  });

  const titleLine = formatWeeklyFundamentalTitle(baseFactPack.weekAheadRangeLabel);
  const authorLine = String(process.env.AURA_INSTITUTIONAL_AUTHOR || 'By AURA TERMINAL').trim();

  const shared = {
    market,
    econ,
    news,
    quoteCache,
    baseFactPack,
    briefDateYmd,
    date,
    titleLine,
    authorLine,
  };

  let results;
  if (institutionalWfaSleevesSequential()) {
    console.log('[inst-wfa] sequential sleeves', date);
    results = [];
    for (let i = 0; i < INSTITUTIONAL_WEEKLY_WFA_KINDS.length; i++) {
      const k = INSTITUTIONAL_WEEKLY_WFA_KINDS[i];
      console.log('[inst-wfa] sleeve →', `${i + 1}/${INSTITUTIONAL_WEEKLY_WFA_KINDS.length}`, k);
      results.push(await generateOneWeeklyWfaCategory(deps, shared, k));
      const r = results[results.length - 1];
      if (r.skipped) console.log('[inst-wfa] sleeve done (skip)', k, r.reason || '');
      else if (r.success === false) console.error('[inst-wfa] sleeve done (fail)', k, String(r.error || '').slice(0, 200));
      else console.log('[inst-wfa] sleeve done (ok)', k);
    }
  } else {
    console.log('[inst-wfa] parallel sleeves ×8 — console may stay quiet for several minutes');
    results = await Promise.all(
      INSTITUTIONAL_WEEKLY_WFA_KINDS.map((k) => generateOneWeeklyWfaCategory(deps, shared, k))
    );
  }

  const failed = results.filter((r) => !r.skipped && r.success === false);
  if (failed.length) {
    return {
      success: false,
      period: normalizedPeriod,
      date,
      briefKind: 'aura_institutional_weekly_wfa_bundle',
      error: failed.map((f) => `${f.briefKind}:${f.error || 'fail'}`).join('; '),
      results,
    };
  }

  return {
    success: true,
    period: normalizedPeriod,
    date,
    briefKind: 'aura_institutional_weekly_wfa_bundle',
    results,
  };
}

function dailyNarrativeHint(briefKindSlug, factPack) {
  const seed = `${briefKindSlug}|${factPack?.briefDateYmd || ''}`;
  const h = [...seed].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  const hints = [
    'Force instrument-level WHY through oil, inflation, Treasury yields, USD funding, and gold where the pack supports it.',
    'Session bias blocks must read as Asia vs London vs New York liquidity and event overlap, not three identical paragraphs.',
    'Overall Daily Structure scenarios must stay distinct: inflation persistence, growth moderation, neutral consolidation.',
  ];
  return hints[Math.abs(h) % hints.length];
}

async function dailyWfaPackAlreadyComplete(executeQuery, deskDate) {
  if (!executeQuery || !/^\d{4}-\d{2}-\d{2}$/.test(String(deskDate || ''))) return false;
  const ph = INSTITUTIONAL_DAILY_WFA_KINDS.map(() => '?').join(',');
  const [rows] = await executeQuery(
    `SELECT brief_kind FROM trader_deck_briefs WHERE period = 'daily' AND date = ? AND brief_kind IN (${ph})`,
    [deskDate, ...INSTITUTIONAL_DAILY_WFA_KINDS]
  );
  const have = new Set((rows || []).map((r) => String(r.brief_kind).toLowerCase()));
  return INSTITUTIONAL_DAILY_WFA_KINDS.every((k) => have.has(String(k).toLowerCase()));
}

function collectDailyWfaQuoteSymbols() {
  const out = new Set(collectAllAutomationUniverseSymbols());
  for (const kind of INSTITUTIONAL_DAILY_WFA_KINDS) {
    getUniverseSymbols(kind).forEach((s) => out.add(String(s).toUpperCase()));
  }
  return [...out];
}

async function generateOneDailyWfaCategory(deps, shared, briefKindSlug) {
  const {
    reserveRun,
    finalizeRun,
    publishAutoBrief,
    stripSources,
    assertNoSources,
    getAutomationModel,
  } = deps;
  const {
    market,
    econ,
    news,
    quoteCache,
    baseFactPack,
    briefDateYmd,
    date,
    runDate,
    timeZone,
    titleLine,
    authorLine,
  } = shared;

  const runKey = `aura-institutional:daily-wfa:${briefKindSlug}:${date}`;
  const reserved = await reserveRun(runKey, 'daily', date);
  if (!reserved) {
    return { briefKind: briefKindSlug, skipped: true, reason: 'already-generated', runKey };
  }

  try {
    const selection = await scoreAndSelectTopInstruments({
      briefKind: briefKindSlug,
      period: 'daily',
      quoteCache,
      headlines: news,
      calendarRows: econ,
      market,
      logPrefix: '[inst-daily-pdf]',
    });

    const categoryHeader = dailyBriefPdfBrief.DAILY_KIND_TO_HEADER[briefKindSlug];
    const topFiveInstruments = selection.scoreRows.map((r) => {
      const symU = String(r.symbol).toUpperCase();
      const q = quoteCache?.get ? quoteCache.get(symU) : null;
      return {
        symbol: symU,
        selectionScore: r.score,
        selectionBreakdown: r.breakdown,
        last: q?.c != null ? q.c : null,
        changePct: q?.dp != null ? Math.round(q.dp * 100) / 100 : null,
        headlines: headlinesForSymbol(symU, news).slice(0, 6),
      };
    });

    const factPack = {
      ...baseFactPack,
      briefKindSlug,
      categoryHeader,
      categoryMandate: categoryWritingMandate(briefKindSlug, 'daily'),
      categoryDirective: CATEGORY_INTELLIGENCE_DIRECTIVES[briefKindSlug] || '',
      topFiveInstruments,
    };

    const weekdayLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(runDate);
    const weekdayHeading = weekdayLong.toUpperCase();
    const systemPrompt = dailyBriefPdfBrief.dailyPdfSystemPrompt(categoryHeader, weekdayLong);
    let parsed = null;
    let lastReasons = [];

    const modelLabel = typeof getAutomationModel === 'function' ? String(getAutomationModel() || '').trim() : '';
    const sleeveIdx = INSTITUTIONAL_DAILY_WFA_KINDS.indexOf(briefKindSlug);
    const sleeveFrac = sleeveIdx >= 0 ? `${sleeveIdx + 1}/${INSTITUTIONAL_DAILY_WFA_KINDS.length}` : '?/?';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fix = attempt > 0 ? lastReasons : null;
      console.log(
        '[inst-daily-pdf] perplexity',
        `sleeve ${sleeveFrac}`,
        briefKindSlug,
        date,
        `attempt ${attempt + 1}/3`,
        `model=${modelLabel || '(default)'} · one HTTP call (not "N briefs saved yet"); heartbeat every 30s while waiting`
      );
      const rs = await callOpenAIJson(
        systemPrompt,
        {
          task: `Daily Brief PDF JSON for ${categoryHeader}.`,
          factPack,
          briefMeta: {
            narrativeHint: dailyNarrativeHint(briefKindSlug, factPack),
          },
          fixNote: fix,
        },
        getAutomationModel,
        {
          maxTokens: 16000,
          temperature: 0.27,
          timeoutMs: institutionalPerplexityTimeoutMs(),
          heartbeatMs: 30000,
          heartbeatLabel: `[inst-daily-pdf] ${briefKindSlug}`,
        }
      );
      if (!rs.ok || !rs.parsed) {
        lastReasons = [`llm_${rs.error || 'fail'}`];
        console.warn('[inst-daily-pdf] perplexity', briefKindSlug, `attempt ${attempt + 1} fail`, String(rs.error || '').slice(0, 220));
        continue;
      }
      const v = dailyBriefPdfBrief.validateDailyPdfPayload(rs.parsed, briefKindSlug);
      if (!v.ok) {
        lastReasons = v.reasons;
        console.warn('[inst-daily-pdf] perplexity', briefKindSlug, `attempt ${attempt + 1} QC`, (v.reasons || []).slice(0, 2).join('; '));
        continue;
      }
      parsed = rs.parsed;
      console.log('[inst-daily-pdf] perplexity', briefKindSlug, `attempt ${attempt + 1} ok (QC passed)`);
      break;
    }

    if (!parsed) {
      throw new Error(`Daily PDF brief QC failed (${briefKindSlug}): ${lastReasons.join(', ')}`);
    }

    let body = dailyBriefPdfBrief.assembleDailyBriefPlain({
      titleLine,
      authorLine,
      metaDateYmd: briefDateYmd,
      briefKind: briefKindSlug,
      weekdayHeading,
      parsedIn: parsed,
    });

    body = stripSources(body);
    body = String(body || '')
      .replace(/^[ \t]*(-\s*){3,}[ \t]*$/gm, '')
      .replace(/^[ \t]*---[ \t]*.*[ \t]*---[ \t]*$/gm, '')
      .trim();
    assertNoSources(body);

    const saved = await publishAutoBrief({
      period: 'daily',
      date,
      title: titleLine.slice(0, 255),
      body,
      briefKind: briefKindSlug,
      mimeType: 'text/plain; charset=utf-8',
      generationMeta: {
        engine: 'institutional_aura_daily_pdf_v1',
        qcOk: true,
        dailyPdfKind: briefKindSlug,
        factPackUpdatedAt: baseFactPack.updatedAt,
        structuredBrief: { version: 7, dailyPdf: parsed },
      },
    });

    await finalizeRun(runKey, 'success', saved.insertId, null);
    return {
      success: true,
      briefKind: briefKindSlug,
      briefId: saved.insertId,
      briefVersion: saved.briefVersion,
      runKey,
    };
  } catch (err) {
    await finalizeRun(runKey, 'failed', null, (err.message || 'daily pdf brief failed').slice(0, 255));
    return {
      success: false,
      briefKind: briefKindSlug,
      error: err.message || 'daily pdf brief failed',
      runKey,
    };
  }
}

async function generateAndStoreDailyWfaPack(deps, { runDate, timeZone, date, normalizedPeriod }) {
  const {
    executeQuery,
    assertAutomationModelConfigured,
    ensureAutomationTables,
    toYmdInTz,
    runEngine,
    fetchUnifiedNewsSample,
    buildQuoteCacheForSymbols,
    fetchAutomationQuoteWithFallback,
  } = deps;

  assertAutomationModelConfigured();
  await ensureAutomationTables();

  if (await dailyWfaPackAlreadyComplete(executeQuery, date)) {
    return {
      success: true,
      skipped: true,
      reason: 'daily-wfa-complete',
      period: normalizedPeriod,
      date,
    };
  }

  const briefDateYmd = toYmdInTz(runDate, timeZone);
  const [market, econ, news] = await Promise.all([
    runEngine({ timeframe: normalizedPeriod, date }),
    fetchEconomicCalendarInline(),
    fetchUnifiedNewsSample(),
  ]);

  const symbols = collectDailyWfaQuoteSymbols();
  const quoteCache = await buildQuoteCacheForSymbols(symbols, fetchAutomationQuoteWithFallback);
  const instrumentUniverse = symbols.map((id) => ({ id }));

  const baseFactPack = buildInstitutionalFactPack({
    period: normalizedPeriod,
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

  const titleLine = formatDailyBriefTitle(runDate, timeZone);
  const authorLine = String(process.env.AURA_INSTITUTIONAL_AUTHOR || 'By AURA TERMINAL').trim();

  const shared = {
    market,
    econ,
    news,
    quoteCache,
    baseFactPack,
    briefDateYmd,
    date,
    runDate,
    timeZone,
    titleLine,
    authorLine,
  };

  let results;
  if (institutionalWfaSleevesSequential()) {
    console.log('[inst-daily-pdf] sequential sleeves', date);
    results = [];
    for (let i = 0; i < INSTITUTIONAL_DAILY_WFA_KINDS.length; i++) {
      const k = INSTITUTIONAL_DAILY_WFA_KINDS[i];
      console.log('[inst-daily-pdf] sleeve →', `${i + 1}/${INSTITUTIONAL_DAILY_WFA_KINDS.length}`, k);
      results.push(await generateOneDailyWfaCategory(deps, shared, k));
      const r = results[results.length - 1];
      if (r.skipped) console.log('[inst-daily-pdf] sleeve done (skip)', k, r.reason || '');
      else if (r.success === false) console.error('[inst-daily-pdf] sleeve done (fail)', k, String(r.error || '').slice(0, 200));
      else console.log('[inst-daily-pdf] sleeve done (ok)', k);
    }
  } else {
    console.log('[inst-daily-pdf] parallel sleeves ×8 — console may stay quiet for several minutes');
    results = await Promise.all(
      INSTITUTIONAL_DAILY_WFA_KINDS.map((k) => generateOneDailyWfaCategory(deps, shared, k))
    );
  }

  const failed = results.filter((r) => !r.skipped && r.success === false);
  if (failed.length) {
    return {
      success: false,
      period: normalizedPeriod,
      date,
      briefKind: 'aura_institutional_daily_wfa_bundle',
      error: failed.map((f) => `${f.briefKind}:${f.error || 'fail'}`).join('; '),
      results,
    };
  }

  return {
    success: true,
    period: normalizedPeriod,
    date,
    briefKind: 'aura_institutional_daily_wfa_bundle',
    results,
  };
}

async function generateAndStoreInstitutionalBrief(deps, { period, runDate = new Date(), timeZone = 'Europe/London' }) {
  const { assertAutomationModelConfigured, ensureAutomationTables, normalizeOutlookDate, normalizePeriod, toYmdInTz } =
    deps;

  assertAutomationModelConfigured();
  await ensureAutomationTables();
  const normalizedPeriod = normalizePeriod(period);
  const date = normalizeOutlookDate(normalizedPeriod, toYmdInTz(runDate, timeZone));

  if (normalizedPeriod === 'weekly') {
    return generateAndStoreWeeklyWfaPack(deps, { runDate, timeZone, date, normalizedPeriod });
  }

  return generateAndStoreDailyWfaPack(deps, { runDate, timeZone, date, normalizedPeriod });
}

module.exports = {
  INSTITUTIONAL_INSTRUMENTS,
  OPTIONAL_INSTITUTIONAL_INSTRUMENTS,
  getInstitutionalInstrumentUniverse,
  generateAndStoreInstitutionalBrief,
  formatDailyBriefTitle,
  formatWeeklyFundamentalTitle,
  _test: {
    buildInstitutionalFactPack,
    upcomingMonFriYmd,
    filterCalendarForBriefDate,
  },
};
