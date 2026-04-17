/**
 * Strip model-internal text (chain-of-thought, XML-ish markers) from strings shown on Trader Desk.
 * Shared by Node API (require) and React (import). Uses CommonJS for compatibility with api/trader-deck.
 */

'use strict';

const PAIRED_INTERNAL =
  /<(?:think|thinking|thought|reasoning|analysis|reflect|reflection|tool_call|plan|scratchpad|chain_of_thought|output|system|assistant|user|redacted_thinking|redacted_reasoning)(?:\s[^>]*)?>[\s\S]*?<\/(?:think|thinking|thought|reasoning|analysis|reflect|reflection|tool_call|plan|scratchpad|chain_of_thought|output|system|assistant|user|redacted_thinking|redacted_reasoning)>/gi;

/** Built with RegExp() where angle brackets confuse editors. */
const COMMON_WRAPPERS = [
  new RegExp('<think>[\\s\\S]*?<\\/redacted_thinking>', 'gi'),
  new RegExp('<thinking>[\\s\\S]*?<\\/thinking>', 'gi'),
  new RegExp('<think>[\\s\\S]*?<\\/think>', 'gi'),
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<analysis>[\s\S]*?<\/analysis>/gi,
];

function stripModelInternalExposition(text) {
  if (text == null || typeof text !== 'string') return '';
  let s = text;
  for (let i = 0; i < 16; i++) {
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
  return s.replace(/\s{2,}/g, ' ').trim();
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
  return {
    ...payload,
    aiSessionBrief: brief,
    aiTradingPriorities: pri,
  };
}

module.exports = {
  stripModelInternalExposition,
  sanitizeAiTradingPriorities,
  sanitizeAiDeskPayloadFields,
};
