/**
 * Offline QA checks (no OpenAI): unified daily / weekly validators.
 * Run: node api/trader-deck/services/institutionalAuraBrief.selftest.js
 */

/* eslint-disable no-console */
const assert = require('assert');
const {
  INSTITUTIONAL_INSTRUMENTS,
  validateUnifiedDaily,
  validateUnifiedDailyBody,
  assembleUnifiedDailyPlain,
  validateUnifiedWeekly,
  validateWeeklyUnifiedBody,
  assembleWeeklyUnifiedPlain,
  WEEKLY_ASSET_SLEEVES,
  formatWeeklyFundamentalTitle,
  _test: t,
} = require('./institutionalAuraBrief');

function mk(len) {
  return `x`.repeat(Math.max(len, 20));
}

function sampleDailyPayload() {
  return {
    dayContextIntro: `${mk(320)}`,
    macroNarrative: `${mk(900)}`,
    transitionStatement: `${mk(80)}`,
    globalGeopoliticalEnvironment: `${mk(260)}`,
    equities: `${mk(260)}`,
    forexUsd: `${mk(260)}`,
    commodities: `${mk(260)}`,
    fixedIncome: `${mk(260)}`,
    crypto: `${mk(200)}`,
    marketSentiment: `${mk(260)}`,
    keyEventsForwardLook: `${mk(260)}`,
  };
}

function assetDive(spec) {
  return {
    sleeve: spec,
    whatHappened: `${mk(160)}`,
    whyItHappened: `${mk(220)} Gold repriced as real yields and the dollar moved; oil volatility fed inflation breakevens.`,
    whatItMeans: `${mk(160)}`,
  };
}

function sampleWeeklyPayload() {
  return {
    overview: `This is a confirmation week for the desk. The live question is whether we are at peak escalation or at the start of a new regime. Oil anchors the inflation risk basket, Treasury yields amplify duration trades, and payroll remains the catalyst when it lands. ${mk(200)}`,
    conditionalFramework: {
      scenarios: [
        `${mk(60)} risk assets continue to trend`,
        `${mk(60)} the dollar reverses its pivot`,
        `${mk(60)} oil breaks the range that held pricing`,
      ],
    },
    priorWeekRecap: `${mk(450)}`,
    keyMarketReactions: `${mk(320)}`,
    crossAssetLinkage: `${mk(400)}`,
    assetDeepDives: WEEKLY_ASSET_SLEEVES.map((s) => assetDive(s)),
    forwardLook: `${mk(400)}`,
  };
}

function run() {
  const okDaily = sampleDailyPayload();
  const vd = validateUnifiedDaily(okDaily);
  assert.strictEqual(vd.ok, true, `daily QC: ${vd.reasons}`);

  const dailyMd = assembleUnifiedDailyPlain(
    'Daily Brief – Monday 30th March 2026',
    'By AURA TERMINAL',
    '2026-03-30',
    okDaily
  );
  assert.strictEqual(validateUnifiedDailyBody(dailyMd).ok, true, validateUnifiedDailyBody(dailyMd).issues);

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

  const wk = sampleWeeklyPayload();
  const vw = validateUnifiedWeekly(wk);
  assert.strictEqual(vw.ok, true, `weekly QC: ${vw.reasons}`);

  const weekTitle = formatWeeklyFundamentalTitle('2nd – 6th March 2026');
  assert.ok(/^WEEKLY FUNDAMENTAL ANALYSIS\s+[\u2013-]\s*\(/i.test(weekTitle), 'weekly title shape');

  const weeklyMd = assembleWeeklyUnifiedPlain(
    weekTitle,
    'By AURA TERMINAL',
    '2026-03-09',
    '2nd – 6th March 2026',
    wk
  );
  const wf = validateWeeklyUnifiedBody(weeklyMd);
  assert.strictEqual(wf.ok, true, `weekly body: ${wf.issues}`);

  console.log('institutionalAuraBrief.selftest: all assertions passed.');
}

run();
