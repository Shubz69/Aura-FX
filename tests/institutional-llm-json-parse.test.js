'use strict';

const assert = require('assert');
const { parseJsonFromLlmText, normalizeChatCompletionContent } = require('../api/trader-deck/services/institutionalLlmJsonParse');

const wrapped =
  '<think>\nThe user wants JSON only.\n</think>\n\n' +
  '```json\n' +
  '{"marketContext":"ctx","keyDevelopments":"kd","marketImpact":"mi","keyLevelsMetrics":"kl"}\n' +
  '```';

const parsed = parseJsonFromLlmText(wrapped);
assert.strictEqual(parsed.marketContext, 'ctx');
assert.strictEqual(parsed.keyDevelopments, 'kd');

const unclosed =
  '<think>\nPartial reasoning without a closing tag.\n\n' +
  '{"marketContext":"u","keyDevelopments":"u","marketImpact":"u","keyLevelsMetrics":"u"}';
const parsed2 = parseJsonFromLlmText(unclosed);
assert.strictEqual(parsed2.marketContext, 'u');

const arr = normalizeChatCompletionContent([{ type: 'text', text: '  hi  ' }]);
assert.strictEqual(arr, 'hi');

console.log('OK institutional-llm-json-parse');
