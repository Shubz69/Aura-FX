'use strict';

/**
 * Weekly Fundamental Analysis — PDF-aligned structure per category (eight parallel sleeves).
 * Stored body is Markdown: assembler adds headings; model may use "- " list lines inside JSON strings.
 */

const GENERIC_FAIL_RE =
  /\bit is important to note\b|\bas an ai\b|\bchatgpt\b/i;

function normalizeAssembledProse(s) {
  return String(s || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** Remove bold/italic markers from LLM prose; keep # headings from assembleWeeklyWfaPlain. */
function stripWfaUiArtifacts(body) {
  let t = String(body || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
  t = t.replace(/ \u002d /g, ', ');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/** Category display name for section headers (ALL CAPS in output). */
const WFA_KIND_TO_HEADER = Object.freeze({
  aura_institutional_weekly_forex: 'FOREX',
  aura_institutional_weekly_crypto: 'CRYPTO',
  aura_institutional_weekly_commodities: 'COMMODITIES',
  aura_institutional_weekly_etfs: 'ETFs',
  aura_institutional_weekly_stocks: 'STOCKS',
  aura_institutional_weekly_indices: 'INDICES',
  aura_institutional_weekly_bonds: 'BONDS',
  aura_institutional_weekly_futures: 'FUTURES',
});

function weeklyWfaSystemPrompt(categoryHeader) {
  return `You are an institutional strategist producing WEEKLY FUNDAMENTAL ANALYSIS scoped to ONE category only: ${categoryHeader}.

Hard rules:
- Voice: declaratory, causal macro reasoning; no retail fluff.
- Use ONLY the supplied factPack (quotes, headlines, calendar, macro lines). If a data field is thin, say so plainly and rely on coherent inference from known drivers (no invented economic prints).
- Output JSON ONLY with this exact schema (no other keys):

{
  "overview": string,
  "summaryForLastWeek": string,
  "instruments": [
    {
      "symbol": string,
      "label": string,
      "whatHappened": string,
      "whyMacroLinkage": string,
      "whatItMeans": string
    }
  ],
  "whatMattersStructurally": string,
  "earlyWeekMonTue": string,
  "midweekWed": string,
  "endWeekThuFri": string,
  "forwardOutlook": string,
  "weekConclusion": string,
  "scenarioContinuation": string,
  "scenarioReversal": string
}

Content requirements:

overview: Multiple paragraphs. Must explicitly name the week type using one of these exact phrases somewhere: "confirmation week", "reaction week", or "transition week". Frame whether the dominant risk is continuation or reversal (macro positioning). Include as integrated prose that oil is the anchor for cross-asset conditions, Treasury yields are the amplifier of repricing, and scheduled data prints are the catalyst.

summaryForLastWeek: Structural repricing narrative only — not a news chronology. What changed, why it mattered, how markets repriced.

instruments: EXACTLY five entries with FIVE DISTINCT symbols (no duplicate tickers). Rank by factPack.topFiveInstruments order. Each instrument must include mechanistic WHY tied to macro (rates, USD, liquidity, earnings, supply, curve) appropriate to ${categoryHeader}. Do not paste the same macro paragraph for two different symbols.

whatMattersStructurally: Drivers across oil, yields, data releases, positioning; possible outcomes in prose.

earlyWeekMonTue: Early week (Mon–Tue) drivers and tone in one substantial paragraph.

midweekWed: Midweek (Wed) dynamics in one substantial paragraph.

endWeekThuFri: End of week (Thu–Fri) catalyst timing and positioning in one substantial paragraph.

forwardOutlook: What confirms the dominant read and what invalidates it structurally.

weekConclusion: Tie conclusions back through oil, yields, USD and liquidity conditions.

scenarioContinuation AND scenarioReversal: Each is one substantial paragraph (two scenarios total).

Formatting inside strings: you may use Markdown bullet lists (each line starting with "- " followed by text) when enumerating parallel drivers or tickers.

Forbidden in all strings: hashtags, asterisks, markdown headings (# through ######), numbered lists (line-leading "1.", "2."), line-leading "* " bullets. Do not emit the ASCII hyphen minus as a sentence dash; use commas or sentence breaks instead where possible.
FORBIDDEN phrasing patterns: ${String(GENERIC_FAIL_RE)}`;
}

function validateWeeklyWfaPayload(parsed, briefKind) {
  void briefKind;
  const reasons = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, reasons: ['no_payload'] };

  const ov = String(parsed.overview || '').trim();
  if (ov.length < 280) reasons.push('overview_thin');
  const wt =
    /\bconfirmation week\b|\breaction week\b|\btransition week\b/i.test(ov);
  const contRev = /\bcontinuation\b|\breversal\b/i.test(ov);
  const anchorPack =
    /\boil\b/i.test(ov) &&
    /\byields?\b|\brate\b|\bcu?rve\b|\btreasur/i.test(ov) &&
    /\bcatalyst|\bdata\b|\bcalendar\b|\brelease\b|\bprint\b/i.test(ov);
  if (!wt) reasons.push('overview_week_type_missing');
  if (!contRev) reasons.push('overview_cont_rev_missing');
  if (!anchorPack) reasons.push('overview_anchor_pack_missing');

  const sr = String(parsed.summaryForLastWeek || '').trim();
  if (sr.length < 360) reasons.push('summary_thin');

  const arr = Array.isArray(parsed.instruments) ? parsed.instruments : [];
  if (arr.length !== 5) reasons.push('instruments_not_five');
  const symNorm = arr.map((r) => String((r || {}).symbol || '').toUpperCase().trim()).filter(Boolean);
  if (symNorm.length !== new Set(symNorm).size) reasons.push('instruments_duplicate_symbol');

  for (let i = 0; i < arr.length; i += 1) {
    const row = arr[i] || {};
    if (String(row.symbol || '').trim().length < 2) reasons.push(`instr_symbol_${i}`);
    if (String(row.whatHappened || '').trim().length < 80) reasons.push(`instr_what_${i}`);
    if (String(row.whyMacroLinkage || '').trim().length < 120) reasons.push(`instr_why_${i}`);
    if (String(row.whatItMeans || '').trim().length < 80) reasons.push(`instr_mean_${i}`);
  }

  const wms = String(parsed.whatMattersStructurally || '').trim();
  if (wms.length < 280) reasons.push('structural_thin');

  const ew = String(parsed.earlyWeekMonTue || '').trim();
  const mw = String(parsed.midweekWed || '').trim();
  const ed = String(parsed.endWeekThuFri || '').trim();
  if (ew.length < 140) reasons.push('early_week_thin');
  if (mw.length < 120) reasons.push('midweek_thin');
  if (ed.length < 140) reasons.push('end_week_thin');

  const fo = String(parsed.forwardOutlook || '').trim();
  if (fo.length < 200) reasons.push('forward_thin');

  const wc = String(parsed.weekConclusion || '').trim();
  if (wc.length < 200) reasons.push('conclusion_thin');

  const sc = String(parsed.scenarioContinuation || '').trim();
  const sr2 = String(parsed.scenarioReversal || '').trim();
  if (sc.length < 160 || sr2.length < 160) reasons.push('scenario_thin');

  const blobAll = JSON.stringify(parsed);
  if (GENERIC_FAIL_RE.test(blobAll)) reasons.push('banned_voice');

  return { ok: reasons.length === 0, reasons };
}

function assembleWeeklyWfaPlain({
  titleLine,
  authorLine,
  metaDateYmd,
  weekRangeLabel,
  briefKind,
  parsedIn,
}) {
  const catHeader = WFA_KIND_TO_HEADER[briefKind] || 'CATEGORY';
  const p = { ...parsedIn };
  const fields = [
    'overview',
    'summaryForLastWeek',
    'whatMattersStructurally',
    'earlyWeekMonTue',
    'midweekWed',
    'endWeekThuFri',
    'forwardOutlook',
    'weekConclusion',
    'scenarioContinuation',
    'scenarioReversal',
  ];
  for (const k of fields) {
    p[k] = normalizeAssembledProse(p[k]);
  }

  const instPre = Array.isArray(p.instruments) ? p.instruments : [];
  for (const row of instPre) {
    for (const ik of ['whatHappened', 'whyMacroLinkage', 'whatItMeans']) {
      if (row && row[ik] != null) row[ik] = normalizeAssembledProse(row[ik]);
    }
  }

  const lines = [];
  lines.push(`# ${String(titleLine || '').trim()}`);
  lines.push('');
  lines.push(String(authorLine || '').trim());
  lines.push('');
  lines.push(`_Week ${String(weekRangeLabel || '').trim()}_`);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(p.overview);
  lines.push('');
  lines.push('## Summary for last week');
  lines.push('');
  lines.push(p.summaryForLastWeek);
  lines.push('');
  lines.push(`## ${catHeader} — top five instruments`);
  lines.push('');
  const inst = Array.isArray(p.instruments) ? p.instruments : [];
  for (const row of inst) {
    const sym = String(row.symbol || '').toUpperCase().trim();
    const lab = String(row.label || sym || 'Instrument').trim();
    lines.push(`### ${sym || lab}`);
    lines.push('');
    lines.push('#### What happened');
    lines.push('');
    lines.push(String(row.whatHappened || '').trim());
    lines.push('');
    lines.push('#### Macro linkage');
    lines.push('');
    lines.push(String(row.whyMacroLinkage || '').trim());
    lines.push('');
    lines.push('#### What it means');
    lines.push('');
    lines.push(String(row.whatItMeans || '').trim());
    lines.push('');
  }
  lines.push('## What matters this week structurally');
  lines.push('');
  lines.push(p.whatMattersStructurally);
  lines.push('');
  lines.push('## Week structure');
  lines.push('');
  lines.push('### Early week (Mon–Tue)');
  lines.push('');
  lines.push(p.earlyWeekMonTue);
  lines.push('');
  lines.push('### Midweek (Wed)');
  lines.push('');
  lines.push(p.midweekWed);
  lines.push('');
  lines.push('### End of week (Thu–Fri)');
  lines.push('');
  lines.push(p.endWeekThuFri);
  lines.push('');
  lines.push('## Forward outlook');
  lines.push('');
  lines.push(p.forwardOutlook);
  lines.push('');
  lines.push('## Week conclusion');
  lines.push('');
  lines.push(p.weekConclusion);
  lines.push('');
  lines.push('## Scenario framework');
  lines.push('');
  lines.push('### Continuation scenario');
  lines.push('');
  lines.push(p.scenarioContinuation);
  lines.push('');
  lines.push('### Reversal scenario');
  lines.push('');
  lines.push(p.scenarioReversal);
  lines.push('');
  lines.push(String(authorLine || '').trim());
  return stripWfaUiArtifacts(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

module.exports = {
  weeklyWfaSystemPrompt,
  validateWeeklyWfaPayload,
  assembleWeeklyWfaPlain,
  stripWfaUiArtifacts,
  WFA_KIND_TO_HEADER,
};
