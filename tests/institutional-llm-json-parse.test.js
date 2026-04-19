'use strict';

const assert = require('assert');
const { parseJsonFromLlmText, normalizeChatCompletionContent } = require('../api/trader-deck/services/institutionalLlmJsonParse');

const wrapped =
  '<think>\nThe user wants JSON only.\n</think>\n\n' +
  '```json\n' +
  '{"dayWeekPositionAndData":"dw","macroIntroStructuralFlow":"mf","macroBackdropGoingIntoToday":"mb",' +
  '"marketThemesDominatingToday":"mt","instruments":[' +
  '{"symbol":"A"},{"symbol":"B"},{"symbol":"C"},{"symbol":"D"},{"symbol":"E"}],' +
  '"scenarioInflationPersistence":"si","scenarioGrowthModeration":"sg","scenarioNeutralConsolidation":"sn"}\n' +
  '```';

const parsed = parseJsonFromLlmText(wrapped);
assert.strictEqual(parsed.dayWeekPositionAndData, 'dw');
assert.strictEqual(parsed.macroIntroStructuralFlow, 'mf');

const unclosed =
  '<think>\nPartial reasoning without a closing tag.\n\n' +
  '{"dayWeekPositionAndData":"u","macroIntroStructuralFlow":"u","macroBackdropGoingIntoToday":"u",' +
  '"marketThemesDominatingToday":"u","instruments":[' +
  '{"symbol":"A"},{"symbol":"B"},{"symbol":"C"},{"symbol":"D"},{"symbol":"E"}],' +
  '"scenarioInflationPersistence":"u","scenarioGrowthModeration":"u","scenarioNeutralConsolidation":"u"}';
const parsed2 = parseJsonFromLlmText(unclosed);
assert.strictEqual(parsed2.dayWeekPositionAndData, 'u');

const decoyBrace =
  'Here is a tiny example {"x":1} before the real payload.\n' +
  '{"dayWeekPositionAndData":"' +
  'x'.repeat(230) +
  '","macroIntroStructuralFlow":"' +
  'y'.repeat(400) +
  ' oil inflation yield dollar equity gold","macroBackdropGoingIntoToday":"' +
  'z'.repeat(300) +
  '","marketThemesDominatingToday":"' +
  't'.repeat(270) +
  '","instruments":[{"symbol":"EURUSD","whatHappening":"' +
  'a'.repeat(80) +
  '","whyHappening":"' +
  'b'.repeat(130) +
  '","whatItMeans":"' +
  'c'.repeat(80) +
  '","technicalStructure":"' +
  'd'.repeat(90) +
  '","sessionAsia":"' +
  'e'.repeat(70) +
  '","sessionLondon":"' +
  'f'.repeat(70) +
  '","sessionNewYork":"' +
  'g'.repeat(70) +
  '","overallBias":"' +
  'h'.repeat(50) +
  '"},{"symbol":"GBPUSD","whatHappening":"' +
  'a'.repeat(80) +
  '","whyHappening":"' +
  'b'.repeat(130) +
  '","whatItMeans":"' +
  'c'.repeat(80) +
  '","technicalStructure":"' +
  'd'.repeat(90) +
  '","sessionAsia":"' +
  'e'.repeat(70) +
  '","sessionLondon":"' +
  'f'.repeat(70) +
  '","sessionNewYork":"' +
  'g'.repeat(70) +
  '","overallBias":"' +
  'h'.repeat(50) +
  '"},{"symbol":"USDJPY","whatHappening":"' +
  'a'.repeat(80) +
  '","whyHappening":"' +
  'b'.repeat(130) +
  '","whatItMeans":"' +
  'c'.repeat(80) +
  '","technicalStructure":"' +
  'd'.repeat(90) +
  '","sessionAsia":"' +
  'e'.repeat(70) +
  '","sessionLondon":"' +
  'f'.repeat(70) +
  '","sessionNewYork":"' +
  'g'.repeat(70) +
  '","overallBias":"' +
  'h'.repeat(50) +
  '"},{"symbol":"USDCHF","whatHappening":"' +
  'a'.repeat(80) +
  '","whyHappening":"' +
  'b'.repeat(130) +
  '","whatItMeans":"' +
  'c'.repeat(80) +
  '","technicalStructure":"' +
  'd'.repeat(90) +
  '","sessionAsia":"' +
  'e'.repeat(70) +
  '","sessionLondon":"' +
  'f'.repeat(70) +
  '","sessionNewYork":"' +
  'g'.repeat(70) +
  '","overallBias":"' +
  'h'.repeat(50) +
  '"},{"symbol":"AUDUSD","whatHappening":"' +
  'a'.repeat(80) +
  '","whyHappening":"' +
  'b'.repeat(130) +
  '","whatItMeans":"' +
  'c'.repeat(80) +
  '","technicalStructure":"' +
  'd'.repeat(90) +
  '","sessionAsia":"' +
  'e'.repeat(70) +
  '","sessionLondon":"' +
  'f'.repeat(70) +
  '","sessionNewYork":"' +
  'g'.repeat(70) +
  '","overallBias":"' +
  'h'.repeat(50) +
  '"}],"scenarioInflationPersistence":"' +
  'i'.repeat(150) +
  '","scenarioGrowthModeration":"' +
  'j'.repeat(150) +
  '","scenarioNeutralConsolidation":"' +
  'k'.repeat(150) +
  '"}';
const parsed3 = parseJsonFromLlmText(decoyBrace);
assert.ok(parsed3.instruments && parsed3.instruments.length === 5);

const arr = normalizeChatCompletionContent([{ type: 'text', text: '  hi  ' }]);
assert.strictEqual(arr, 'hi');

console.log('OK institutional-llm-json-parse');
