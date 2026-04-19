/**
 * Offline QA checks (no OpenAI): weekly WFA + daily PDF validators.
 * Run: node api/trader-deck/services/institutionalAuraBrief.selftest.js
 */

/* eslint-disable no-console */
const assert = require('assert');
const {
  INSTITUTIONAL_INSTRUMENTS,
  formatWeeklyFundamentalTitle,
  formatDailyBriefTitle,
  _test: t,
} = require('./institutionalAuraBrief');
const weeklyWfaPdfBrief = require('./weeklyWfaPdfBrief');
const dailyBriefPdfBrief = require('./dailyBriefPdfBrief');

function mk(len) {
  return `x`.repeat(Math.max(len, 20));
}

function mkDailyInstr(sym) {
  return {
    symbol: sym,
    label: sym,
    whatHappening: mk(90),
    whyHappening: `${mk(130)} Link to oil, Treasury yields, USD funding, and inflation as relevant.`,
    whatItMeans: mk(90),
    technicalStructure: mk(100),
    sessionAsia: mk(70),
    sessionLondon: mk(70),
    sessionNewYork: mk(70),
    overallBias: mk(50),
  };
}

function mkWeeklyInstr(sym) {
  return {
    symbol: sym,
    label: sym,
    whatHappened: mk(100),
    whyMacroLinkage: `${mk(130)} Oil, yields, USD transmission as required by QC.`,
    whatItMeans: mk(100),
  };
}

function sampleWeeklyWfaPayload() {
  const ovTail =
    ' confirmation week framing whether this is continuation or reversal. Oil is the anchor, Treasury yields amplify repricing, and labour data remain the catalyst when scheduled.';
  return {
    overview: `${mk(300)}${ovTail}`,
    summaryForLastWeek: mk(400),
    instruments: [
      mkWeeklyInstr('EURUSD'),
      mkWeeklyInstr('GBPUSD'),
      mkWeeklyInstr('USDJPY'),
      mkWeeklyInstr('AUDUSD'),
      mkWeeklyInstr('USDCHF'),
    ],
    whatMattersStructurally: mk(320),
    earlyWeekMonTue: mk(200),
    midweekWed: mk(180),
    endWeekThuFri: mk(200),
    forwardOutlook: mk(220),
    weekConclusion: mk(220),
    scenarioContinuation: mk(180),
    scenarioReversal: mk(180),
  };
}

function sampleDailyPdfPayload() {
  const chain =
    ' Oil moves shape inflation expectations. Inflation prints feed bond yields. Yields drive USD and equity duration. USD and real yields reposition gold.';
  return {
    dayWeekPositionAndData: mk(240),
    macroIntroStructuralFlow: `${mk(400)}${chain}`,
    macroBackdropGoingIntoToday: mk(300),
    marketThemesDominatingToday: mk(280),
    instruments: [
      mkDailyInstr('EURUSD'),
      mkDailyInstr('GBPUSD'),
      mkDailyInstr('USDJPY'),
      mkDailyInstr('AUDUSD'),
      mkDailyInstr('USDCHF'),
    ],
    scenarioInflationPersistence: mk(160),
    scenarioGrowthModeration: mk(160),
    scenarioNeutralConsolidation: mk(160),
  };
}

function run() {
  const fp = t.buildInstitutionalFactPack({
    period: 'daily',
    market: {},
    econ: [],
    news: [],
    quoteCache: new Map(),
    briefDateYmd: '2026-03-30',
    timeZone: 'Europe/London',
    runDate: new Date('2026-03-30T12:00:00Z'),
    instrumentUniverse: INSTITUTIONAL_INSTRUMENTS,
  });
  assert.ok(fp.tradingWeekMeta && fp.tradingWeekMeta.weekdayLong, 'tradingWeekMeta present');

  const wk = sampleWeeklyWfaPayload();
  const vw = weeklyWfaPdfBrief.validateWeeklyWfaPayload(wk, 'aura_institutional_weekly_forex');
  assert.strictEqual(vw.ok, true, `weekly WFA QC: ${vw.reasons}`);

  const weekTitle = formatWeeklyFundamentalTitle('2nd – 6th March 2026');
  assert.ok(/^WEEKLY FUNDAMENTAL ANALYSIS\s+[\u2013-]\s*\(/i.test(weekTitle), 'weekly title shape');

  const dailyTitle = formatDailyBriefTitle(new Date('2026-03-30T12:00:00Z'), 'Europe/London');
  assert.ok(/^Daily Brief\s+[\u2013-]/i.test(dailyTitle), 'daily title shape');

  const dp = sampleDailyPdfPayload();
  const vd = dailyBriefPdfBrief.validateDailyPdfPayload(dp, 'aura_institutional_daily_forex');
  assert.strictEqual(vd.ok, true, `daily PDF QC: ${vd.reasons}`);

  const assembled = dailyBriefPdfBrief.assembleDailyBriefPlain({
    titleLine: dailyTitle,
    authorLine: 'By AURA TERMINAL',
    metaDateYmd: '2026-03-30',
    briefKind: 'aura_institutional_daily_forex',
    weekdayHeading: 'MONDAY',
    parsedIn: dp,
  });
  assert.ok(/\n##\s+Macro intro and structural flow\s*\n/i.test(assembled), 'daily body macro section');
  assert.ok(/\n##\s+Overall daily structure\s*\n/i.test(assembled), 'daily overall structure');

  const wkAssembled = weeklyWfaPdfBrief.assembleWeeklyWfaPlain({
    titleLine: weekTitle,
    authorLine: 'By AURA TERMINAL',
    metaDateYmd: '2026-03-30',
    weekRangeLabel: '2nd – 6th March 2026',
    briefKind: 'aura_institutional_weekly_forex',
    parsedIn: wk,
  });
  assert.ok(/\n##\s+Overview\s*\n/i.test(wkAssembled), 'weekly overview heading');
  assert.ok(/\n##\s+Scenario framework\s*\n/i.test(wkAssembled), 'weekly scenario heading');

  console.log('institutionalAuraBrief.selftest: all assertions passed.');
}

run();
