'use strict';

/**
 * Institutional Daily Brief — PDF-aligned structure per category (eight parallel sleeves).
 * Stored body is Markdown: assembler adds #/##/###; model may use "- " list lines inside JSON strings.
 */

const GENERIC_FAIL_RE =
  /\bit is important to note\b|\bas an ai\b|\bchatgpt\b/i;

/** Trim line ends only — preserves Markdown list lines from the model inside JSON strings. */
function normalizeAssembledProse(s) {
  return String(s || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function stripDailyPdfArtifacts(body) {
  let t = String(body || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
  // Do not strip Markdown headings: assembleDailyBriefPlain emits # / ## / ### for preview layout.
  t = t.replace(/ \u002d /g, ', ');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const DAILY_KIND_TO_HEADER = Object.freeze({
  aura_institutional_daily_forex: 'FOREX',
  aura_institutional_daily_crypto: 'CRYPTO',
  aura_institutional_daily_commodities: 'COMMODITIES',
  aura_institutional_daily_etfs: 'ETFs',
  aura_institutional_daily_stocks: 'STOCKS',
  aura_institutional_daily_indices: 'INDICES',
  aura_institutional_daily_bonds: 'BONDS',
  aura_institutional_daily_futures: 'FUTURES',
});

function dailyPdfSystemPrompt(categoryHeader, weekdayLong) {
  const w = String(weekdayLong || '').trim();
  return `You are an institutional strategist producing ONE Daily Brief scoped to a single category: ${categoryHeader}.

Hard rules:
Voice: declaratory, causal macro reasoning; positioning-aware; no retail filler.
Use ONLY the supplied factPack for factual anchors (quotes, headlines, calendar, macro summary, tradingWeekMeta). If a field is thin, say so plainly; do not invent scheduled prints absent from the calendar.

Output JSON ONLY with this exact schema (no other keys):

{
  "dayWeekPositionAndData": string,
  "macroIntroStructuralFlow": string,
  "macroBackdropGoingIntoToday": string,
  "marketThemesDominatingToday": string,
  "instruments": [
    {
      "symbol": string,
      "label": string,
      "whatHappening": string,
      "whyHappening": string,
      "whatItMeans": string,
      "technicalStructure": string,
      "sessionAsia": string,
      "sessionLondon": string,
      "sessionNewYork": string,
      "overallBias": string
    }
  ],
  "scenarioInflationPersistence": string,
  "scenarioGrowthModeration": string,
  "scenarioNeutralConsolidation": string
}

Content requirements:

dayWeekPositionAndData: One substantial paragraph placing this session (${w}) within the trading week. Reference positioning (early/mid/late week), liquidity, and upcoming or same-day catalysts grounded in factPack.calendarToday and calendarWeekAhead where present.

macroIntroStructuralFlow: Explain in clear prose the transmission chain the desk uses: how oil influences inflation expectations, how inflation influences bond yields, how yields influence USD and equities, how USD and yields influence gold. Then state what markets are doing today through that lens using factPack.

macroBackdropGoingIntoToday: What has already been priced earlier in the week, what focus is now, what today’s key drivers are (${w}), anchored to calendar and tape facts.

marketThemesDominatingToday: Paragraphs covering yield sensitivity, oil influence, positioning into the next catalyst, and cross-asset relationships.

instruments: EXACTLY five objects, in factPack.topFiveInstruments order, with FIVE DISTINCT symbols (no duplicate tickers). Each instrument block must present a different thesis; do not repeat the same macro explanation across symbols. Each block must tie WHY to macro (oil, yields, USD, inflation, liquidity, earnings where relevant for ${categoryHeader}). technicalStructure is one coherent paragraph on structure (levels, ranges, volatility tone) without invented precise levels unless inferable from factPack. sessionAsia, sessionLondon, sessionNewYork are each one paragraph for session bias. overallBias is exactly one clear sentence.

scenarioInflationPersistence, scenarioGrowthModeration, scenarioNeutralConsolidation: Each is a scenario paragraph under Overall Daily Structure (distinct regimes).

Formatting inside strings: you may use Markdown bullet lists (each line starting with "- " followed by text) when enumerating parallel drivers, tickers, or session notes. Prefer short bullets over one giant sentence when listing three or more comparable items.

Forbidden in all strings: hashtags, asterisks, markdown headings (# through ######), numbered lists (line-leading "1.", "2."), line-leading "* " bullets. Do not use the ASCII hyphen minus as a decorative dash inside sentences; use commas or full stops.
FORBIDDEN phrasing patterns: ${String(GENERIC_FAIL_RE)}`;
}

function macroChainPresent(s) {
  const t = String(s || '').toLowerCase();
  const oil = /\boil\b|\bcrude\b|\bwti\b|\bbrent\b/.test(t);
  const inf = /\binflation\b|\bcpi\b|\bpce\b|\bbreakeven\b|\bexpectations?\b/.test(t);
  const yld = /\byield\b|\bbond\b|\btreasur|\brate\b|\bcurve\b/.test(t);
  const usd = /\busd\b|\bdollar\b|\bdxy\b/.test(t);
  const eq = /\bequit|\bindex|\bs&p|\bnasdaq\b|\brisk asset/.test(t);
  const au = /\bgold\b|\bxau\b|\bbullion\b/.test(t);
  const hits = [oil, inf, yld, usd].filter(Boolean).length;
  return hits >= 3 && (eq || au);
}

function validateDailyPdfPayload(parsed, briefKind) {
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['no_payload'] };

  const dw = String(parsed.dayWeekPositionAndData || '').trim();
  if (dw.length < 220) reasons.push('day_week_thin');

  const macro = String(parsed.macroIntroStructuralFlow || '').trim();
  if (macro.length < 380) reasons.push('macro_intro_thin');
  if (!macroChainPresent(macro)) reasons.push('macro_chain_thin');

  const backdrop = String(parsed.macroBackdropGoingIntoToday || '').trim();
  if (backdrop.length < 280) reasons.push('backdrop_thin');

  const themes = String(parsed.marketThemesDominatingToday || '').trim();
  if (themes.length < 260) reasons.push('themes_thin');

  const arr = Array.isArray(parsed.instruments) ? parsed.instruments : [];
  if (arr.length !== 5) reasons.push('instruments_not_five');
  const symNorm = arr.map((r) => String((r || {}).symbol || '').toUpperCase().trim()).filter(Boolean);
  if (symNorm.length !== new Set(symNorm).size) reasons.push('instruments_duplicate_symbol');

  for (let i = 0; i < arr.length; i += 1) {
    const row = arr[i] || {};
    const blob = `${row.whatHappening || ''}${row.whyHappening || ''}${row.whatItMeans || ''}`;
    if (String(row.symbol || '').trim().length < 2) reasons.push(`instr_symbol_${i}`);
    if (String(row.whatHappening || '').trim().length < 70) reasons.push(`instr_what_${i}`);
    if (String(row.whyHappening || '').trim().length < 120) reasons.push(`instr_why_${i}`);
    if (String(row.whatItMeans || '').trim().length < 70) reasons.push(`instr_mean_${i}`);
    if (String(row.technicalStructure || '').trim().length < 80) reasons.push(`instr_tech_${i}`);
    if (String(row.sessionAsia || '').trim().length < 60) reasons.push(`instr_asia_${i}`);
    if (String(row.sessionLondon || '').trim().length < 60) reasons.push(`instr_lon_${i}`);
    if (String(row.sessionNewYork || '').trim().length < 60) reasons.push(`instr_ny_${i}`);
    if (String(row.overallBias || '').trim().length < 40) reasons.push(`instr_bias_${i}`);
  }

  const si = String(parsed.scenarioInflationPersistence || '').trim();
  const sg = String(parsed.scenarioGrowthModeration || '').trim();
  const sn = String(parsed.scenarioNeutralConsolidation || '').trim();
  if (si.length < 140 || sg.length < 140 || sn.length < 140) reasons.push('scenario_thin');

  const blobAll = JSON.stringify(parsed);
  if (GENERIC_FAIL_RE.test(blobAll)) reasons.push('banned_voice');

  return { ok: reasons.length === 0, reasons };
}

function assembleDailyBriefPlain({
  titleLine,
  authorLine,
  metaDateYmd,
  briefKind,
  weekdayHeading,
  parsedIn,
}) {
  const catHeader = DAILY_KIND_TO_HEADER[briefKind] || 'CATEGORY';
  const wh = String(weekdayHeading || '').trim().toUpperCase();
  const p = { ...parsedIn };
  const topFields = [
    'dayWeekPositionAndData',
    'macroIntroStructuralFlow',
    'macroBackdropGoingIntoToday',
    'marketThemesDominatingToday',
    'scenarioInflationPersistence',
    'scenarioGrowthModeration',
    'scenarioNeutralConsolidation',
  ];
  for (const k of topFields) {
    p[k] = normalizeAssembledProse(p[k]);
  }

  const inst = Array.isArray(p.instruments) ? p.instruments : [];
  for (const row of inst) {
    const keys = [
      'whatHappening',
      'whyHappening',
      'whatItMeans',
      'technicalStructure',
      'sessionAsia',
      'sessionLondon',
      'sessionNewYork',
      'overallBias',
    ];
    for (const k of keys) {
      if (row[k] != null) row[k] = normalizeAssembledProse(row[k]);
    }
  }

  const ND = '\u2013';
  const lines = [];
  // Markdown body: ReactMarkdown in MI preview renders headings and paragraph spacing (Word-like).
  lines.push(`# ${String(titleLine || '').trim()}`);
  lines.push('');
  lines.push(String(authorLine || '').trim());
  lines.push('');
  lines.push(`## Day position — ${wh}`);
  lines.push('');
  lines.push(p.dayWeekPositionAndData);
  lines.push('');
  lines.push('## Macro intro and structural flow');
  lines.push('');
  lines.push(p.macroIntroStructuralFlow);
  lines.push('');
  lines.push(`## Macro backdrop going into ${wh}`);
  lines.push('');
  lines.push(p.macroBackdropGoingIntoToday);
  lines.push('');
  lines.push('## Market themes dominating today');
  lines.push('');
  lines.push(p.marketThemesDominatingToday);
  lines.push('');
  lines.push(`## ${catHeader} ${ND} top five instruments`);
  lines.push('');

  for (const row of inst) {
    const sym = String(row.symbol || '').toUpperCase().trim();
    const lab = String(row.label || sym || 'Instrument').trim();
    const head = sym || lab;
    lines.push(`### ${head}`);
    lines.push('');
    lines.push('#### What is happening');
    lines.push('');
    lines.push(String(row.whatHappening || '').trim());
    lines.push('');
    lines.push('#### Why it is happening');
    lines.push('');
    lines.push(String(row.whyHappening || '').trim());
    lines.push('');
    lines.push('#### What it means');
    lines.push('');
    lines.push(String(row.whatItMeans || '').trim());
    lines.push('');
    lines.push('#### Technical structure');
    lines.push('');
    lines.push(String(row.technicalStructure || '').trim());
    lines.push('');
    lines.push('#### Session bias');
    lines.push('');
    lines.push('##### Asia');
    lines.push('');
    lines.push(String(row.sessionAsia || '').trim());
    lines.push('');
    lines.push('##### London');
    lines.push('');
    lines.push(String(row.sessionLondon || '').trim());
    lines.push('');
    lines.push('##### New York');
    lines.push('');
    lines.push(String(row.sessionNewYork || '').trim());
    lines.push('');
    lines.push('##### Overall bias');
    lines.push('');
    lines.push(String(row.overallBias || '').trim());
    lines.push('');
  }

  lines.push('## Overall daily structure');
  lines.push('');
  lines.push('### Inflation persistence scenario');
  lines.push('');
  lines.push(p.scenarioInflationPersistence);
  lines.push('');
  lines.push('### Growth moderation scenario');
  lines.push('');
  lines.push(p.scenarioGrowthModeration);
  lines.push('');
  lines.push('### Neutral consolidation scenario');
  lines.push('');
  lines.push(p.scenarioNeutralConsolidation);
  lines.push('');
  lines.push(String(authorLine || '').trim());
  return stripDailyPdfArtifacts(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

module.exports = {
  dailyPdfSystemPrompt,
  validateDailyPdfPayload,
  assembleDailyBriefPlain,
  stripDailyPdfArtifacts,
  DAILY_KIND_TO_HEADER,
};
