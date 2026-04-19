'use strict';

/**
 * Parse JSON from Perplexity chat completions when models wrap or prefix output
 * (e.g. sonar-reasoning-pro with <think>…</…> before `{…}`).
 */

function normalizeChatCompletionContent(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((p) => (typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
  }
  return String(raw || '').trim();
}

function stripLlmReasoningNoise(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
  s = s.replace(/<redacted_[a-z0-9_-]+>[\s\S]*?<\/redacted_[a-z0-9_-]+>/gi, '');
  s = s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  s = s.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  s = s.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  // Unclosed `<…>`: peel leading XML-like opens (reasoning models).
  for (let k = 0; k < 8 && s.startsWith('<'); k += 1) {
    const gt = s.indexOf('>');
    if (gt < 0) break;
    s = s.slice(gt + 1).trim();
  }
  const i = s.indexOf('{');
  if (i > 0) s = s.slice(i);
  return s.trim();
}

function extractBalancedJsonObject(input) {
  const s = String(input || '');
  const start = s.indexOf('{');
  if (start < 0) return s;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

/** When prose/thinking contains `{` before the real payload, find institutional root objects. */
const INSTITUTIONAL_JSON_KEY_ANCHORS = [
  '"dayWeekPositionAndData"',
  '"macroIntroStructuralFlow"',
  '"summaryForLastWeek"',
];

function looksLikeDailyInstitutionalPayload(o) {
  return (
    o &&
    typeof o === 'object' &&
    'dayWeekPositionAndData' in o &&
    Array.isArray(o.instruments) &&
    o.instruments.length === 5
  );
}

function looksLikeWeeklyInstitutionalPayload(o) {
  return (
    o &&
    typeof o === 'object' &&
    'overview' in o &&
    Array.isArray(o.instruments) &&
    o.instruments.length === 5
  );
}

function isPlausibleInstitutionalPayload(o) {
  return looksLikeDailyInstitutionalPayload(o) || looksLikeWeeklyInstitutionalPayload(o);
}

function tryParseJsonCandidates(strs) {
  let lastErr = null;
  for (const raw of strs) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const candidates = [s, s.replace(/,\s*([}\]])/g, '$1')];
    for (const c of candidates) {
      try {
        return { ok: true, parsed: JSON.parse(c) };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  return { ok: false, error: lastErr };
}

function extractRootJsonByAnchors(source) {
  const s = String(source || '');
  let lastErr = null;
  for (const needle of INSTITUTIONAL_JSON_KEY_ANCHORS) {
    const p = s.indexOf(needle);
    if (p < 0) continue;
    const start = s.lastIndexOf('{', p);
    if (start < 0) continue;
    const chunk = extractBalancedJsonObject(s.slice(start));
    const r = tryParseJsonCandidates([chunk]);
    if (r.ok) return { ok: true, parsed: r.parsed };
    lastErr = r.error;
  }
  return { ok: false, error: lastErr };
}

function parseJsonFromLlmText(text) {
  const full = String(text || '');
  const cleaned = stripLlmReasoningNoise(full);
  const balanced = extractBalancedJsonObject(cleaned);
  const primary = tryParseJsonCandidates([balanced]);
  if (primary.ok && isPlausibleInstitutionalPayload(primary.parsed)) return primary.parsed;

  const anchored = extractRootJsonByAnchors(full);
  if (anchored.ok) return anchored.parsed;
  const anchored2 = extractRootJsonByAnchors(cleaned);
  if (anchored2.ok) return anchored2.parsed;

  if (primary.ok) return primary.parsed;

  throw primary.error || anchored.error || anchored2.error || new Error('invalid_json');
}

module.exports = {
  normalizeChatCompletionContent,
  stripLlmReasoningNoise,
  extractBalancedJsonObject,
  parseJsonFromLlmText,
  isPlausibleInstitutionalPayload,
};
