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
    now: new Date('2026-03-24T06:05:00+00:00'),
    period: 'daily',
    timeZone: 'Europe/London',
  });
  assert(dueDaily === true, 'daily should run during 06:00-06:14 London window');

  const notDueDaily = autoTest.shouldRunWindow({
    now: new Date('2026-03-24T05:40:00+00:00'),
    period: 'daily',
    timeZone: 'Europe/London',
  });
  assert(notDueDaily === false, 'daily should not run outside window');

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

  console.log('OK auto-market-brief tests');
}

run();
