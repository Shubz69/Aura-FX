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
  // Unclosed `<redacted_…>` (no `</…>`): drop leading tag opens until we see text or `{`.
  for (let k = 0; k < 4 && s.startsWith('<'); k += 1) {
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

function parseJsonFromLlmText(text) {
  const cleaned = stripLlmReasoningNoise(text);
  const balanced = extractBalancedJsonObject(cleaned);
  const attempts = [balanced, balanced.replace(/,\s*([}\]])/g, '$1')];
  let lastErr = null;
  for (const c of attempts) {
    try {
      return JSON.parse(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('invalid_json');
}

module.exports = {
  normalizeChatCompletionContent,
  stripLlmReasoningNoise,
  extractBalancedJsonObject,
  parseJsonFromLlmText,
};
