/**
 * Strip model-internal text (chain-of-thought, XML-ish markers) from Trader Desk UI.
 * Shared by Node API (require) and React (import). CommonJS for api/trader-deck compatibility.
 */

'use strict';

const PAIRED_INTERNAL =
  /<(?:think|thinking|thought|reasoning|analysis|reflect|reflection|tool_call|plan|scratchpad|chain_of_thought|output|system|assistant|user|redacted_thinking|redacted_reasoning)(?:\s[^>]*)?>[\s\S]*?<\/(?:think|thinking|thought|reasoning|analysis|reflect|reflection|tool_call|plan|scratchpad|chain_of_thought|output|system|assistant|user|redacted_thinking|redacted_reasoning)>/gi;

/** Models vary: `<think>` … `</think>`, mismatched closes, etc. */
const COMMON_WRAPPERS = [
  new RegExp('<think[\\s\\S]*?<\\/think>', 'gi'),
  new RegExp('<thinking>[\\s\\S]*?<\\/thinking>', 'gi'),
  new RegExp('<think>[\\s\\S]*?<\\/think>', 'gi'),
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<analysis>[\s\S]*?<\/analysis>/gi,
];

function stripModelInternalExposition(text) {
  if (text == null || typeof text !== 'string') return '';
  let s = text;
  for (let i = 0; i < 20; i++) {
    const before = s;
    s = s.replace(PAIRED_INTERNAL, '');
    for (const re of COMMON_WRAPPERS) {
      s = s.replace(re, '');
    }
    if (s === before) break;
  }
  s = s.replace(
    /<(think|thinking|thought|reasoning|analysis|redacted_thinking|redacted_reasoning|scratchpad)(?:\s[^>]*)?>[\s\S]*$/i,
    ''
  );
  const leakAt = (() => {
    const needles = ['\u003c' + 'thinking', '\u003c' + 'think'];
    let best = -1;
    for (const n of needles) {
      const i = s.indexOf(n);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    return best;
  })();
  if (leakAt >= 0) s = s.slice(0, leakAt).trim();
  return s.replace(/\s{2,}/g, ' ').trim();
}

function sanitizeTraderDeskPayloadDeep(value, depth = 0) {
  if (depth > 18) return value;
  if (typeof value === 'string') return stripModelInternalExposition(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeTraderDeskPayloadDeep(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = sanitizeTraderDeskPayloadDeep(value[k], depth + 1);
    }
    return out;
  }
  return value;
}

function sanitizeAiTradingPriorities(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((x) => stripModelInternalExposition(String(x || '')))
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeAiDeskPayloadFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const brief = stripModelInternalExposition(
    typeof payload.aiSessionBrief === 'string' ? payload.aiSessionBrief : ''
  );
  const pri = sanitizeAiTradingPriorities(
    Array.isArray(payload.aiTradingPriorities) ? payload.aiTradingPriorities : []
  );
  return sanitizeTraderDeskPayloadDeep({
    ...payload,
    aiSessionBrief: brief,
    aiTradingPriorities: pri,
  });
}

module.exports = {
  stripModelInternalExposition,
  sanitizeAiTradingPriorities,
  sanitizeAiDeskPayloadFields,
  sanitizeTraderDeskPayloadDeep,
};
