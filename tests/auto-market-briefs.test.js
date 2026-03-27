/**
 * Automated market briefs regression tests.
 * Run: node tests/auto-market-briefs.test.js
 */
const { _test: autoTest } = require('../api/trader-deck/services/autoBriefGenerator');
const { parseTemplateFromText } = require('../api/trader-deck/services/briefTemplateService');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function run() {
  const sanitized = autoTest.stripSources(
    'Market is moving.\nSource: Reuters\nhttps://example.com\nFocus on USD momentum.'
  );
  assert(!/Source:/i.test(sanitized), 'source labels must be removed');
  assert(!/https?:\/\//i.test(sanitized), 'URLs must be removed');
  assert(/USD momentum/i.test(sanitized), 'non-source lines should remain');

  let threw = false;
  try {
    autoTest.assertNoSources('Source: Bloomberg');
  } catch (_) {
    threw = true;
  }
  assert(threw, 'assertNoSources should throw on source markers');

  const dueDaily = autoTest.shouldRunWindow({
    now: new Date('2026-03-24T00:05:00+00:00'),
    period: 'daily',
    timeZone: 'Europe/London',
  });
  assert(dueDaily === true, 'daily should run during 00:00-00:19 London window');

  const notDueDaily = autoTest.shouldRunWindow({
    now: new Date('2026-03-24T05:40:00+00:00'),
    period: 'daily',
    timeZone: 'Europe/London',
  });
  assert(notDueDaily === false, 'daily should not run outside window');

  const prefetchDue = autoTest.shouldPrefetchInstrumentResearchWindow({
    now: new Date('2026-03-24T22:05:00+00:00'),
    period: 'daily',
    timeZone: 'Europe/London',
  });
  assert(prefetchDue === true, 'prefetch should run during ~22:00 London window');

  const dueWeekly = autoTest.shouldRunWindow({
    now: new Date('2026-03-29T18:05:00+01:00'),
    period: 'weekly',
    timeZone: 'Europe/London',
  });
  assert(dueWeekly === true, 'weekly should run Sunday 18:00-18:14 London window');

  const parsed = parseTemplateFromText(
    [
      'Market Context',
      'Instrument Outlook',
      'Session Focus',
      'Risk Radar',
      'Execution Notes',
      'Instruments: EURUSD, GBPUSD, USDJPY, XAUUSD',
    ].join('\n'),
    'daily'
  );
  assert(Array.isArray(parsed.sections) && parsed.sections.length >= 3, 'template should parse section headings');
  assert(parsed.instruments.includes('EURUSD'), 'template should extract instruments');

  const kinds = autoTest.orderedBriefKinds();
  assert(Array.isArray(kinds) && kinds.length === 9, 'should expose 9 brief kinds');
  assert(kinds[0] === 'general' && kinds[8] === 'etfs', 'brief kind ordering should be stable');
  for (const kind of kinds) {
    const top5 = autoTest.top5ForBriefKind(kind);
    assert(Array.isArray(top5) && top5.length === 5, `top 5 instruments must exist for ${kind}`);
  }
  assert(new Set(kinds).size === 9, 'brief kinds should be unique');
  const normalizedUnknown = autoTest.normalizeBriefKind('not-a-kind');
  assert(normalizedUnknown === 'general', 'unknown brief kind should normalize to general');
  const dailyFxFramework = autoTest.frameworkHeadings('daily', 'forex', []);
  const weeklyFxFramework = autoTest.frameworkHeadings('weekly', 'forex', []);
  assert(Array.isArray(dailyFxFramework) && dailyFxFramework.length >= 5, 'daily category framework should exist');
  assert(Array.isArray(weeklyFxFramework) && weeklyFxFramework.length >= 5, 'weekly category framework should exist');
  assert(
    dailyFxFramework.map((x) => x.heading).join('|') !== weeklyFxFramework.map((x) => x.heading).join('|'),
    'daily and weekly framework headings should differ'
  );
  const simLow = autoTest.similarityScore('Forex session map with rate divergence', 'Bond curve repricing and duration hedge');
  const simHigh = autoTest.similarityScore('risk sentiment and liquidity regime', 'risk sentiment and liquidity regime conditions');
  assert(simLow < simHigh, 'similarity scoring should rank related texts higher');

  console.log('OK auto-market-brief tests');
}

run();
