/**
 * Trader Desk bot guardrail tests.
 * Run: node tests/auto-trader-desk-bot.test.js
 */
const { _test } = require('../api/trader-deck/services/autoBriefGenerator');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function run() {
  const sanitized = _test.sanitizeOutlookPayload({
    marketRegime: { currentRegime: 'Rate Sensitivity - Reuters' },
    keyDrivers: ['USD strength according to Reuters', 'Bond yields rising'],
    crossAssetSignals: ['Stocks softening'],
    marketChangesToday: ['Oil supported via headlines'],
    traderFocus: ['Reduce risk'],
    riskRadar: ['Event risk'],
    marketPulse: { score: 52, label: 'MIXED' },
  });

  const blob = JSON.stringify(sanitized);
  assert(!/Reuters/i.test(blob), 'sanitizer should remove source references');
  assert(!/according to/i.test(blob), 'sanitizer should remove attribution phrases');

  _test.validateOutlookPayload({
    marketRegime: { currentRegime: 'Rate Sensitivity' },
    marketPulse: { score: 50, label: 'MIXED' },
    keyDrivers: ['x'],
    crossAssetSignals: ['x'],
    marketChangesToday: ['x'],
    traderFocus: ['x'],
    riskRadar: ['x'],
  });

  let threw = false;
  try {
    _test.validateOutlookPayload({ marketRegime: {}, marketPulse: {} });
  } catch (_) {
    threw = true;
  }
  assert(threw, 'validator should throw when required arrays are missing');

  const stocksTop5 = _test.top5ForBriefKind('stocks');
  assert(stocksTop5.includes('AAPL') && stocksTop5.length === 5, 'stocks category should expose top-5 instruments');
  const fxTop5 = _test.top5ForBriefKind('forex');
  assert(fxTop5.includes('EURUSD') && fxTop5.length === 5, 'forex category should expose top-5 instruments');
  assert(
    _test.containsBoilerplate('Liquidity is patchy — stay nimble into the print.'),
    'boilerplate detector should catch a banned phrase from the list'
  );
  const diversified = _test.diversifyBody('Base brief body\n\n\n\nMore text');
  assert(!/\n{3,}/.test(diversified), 'diversifyBody should collapse excessive blank lines');
  assert(diversified.includes('Base brief body') && diversified.includes('More text'), 'diversifyBody should preserve body text');

  // Daily automation: every calendar day 00:00–00:09 London (including Saturday).
  const satMidnightLondon = new Date('2026-04-10T23:03:00.000Z'); // 2026-04-11 Sat 00:03 BST
  assert(
    _test.shouldRunWindow({ now: satMidnightLondon, period: 'daily', timeZone: 'Europe/London' }),
    'daily shouldRunWindow should be true on Saturday 00:03 London'
  );
  const fri2350London = new Date('2026-04-10T22:50:00.000Z'); // Fri 23:50 BST
  assert(
    !_test.shouldRunWindow({ now: fri2350London, period: 'daily', timeZone: 'Europe/London' }),
    'daily shouldRunWindow should be false outside 00:00–00:09 London'
  );
  const sunWeekly = new Date('2026-04-12T17:05:00.000Z'); // Sun 18:05 BST
  assert(
    _test.shouldRunWindow({ now: sunWeekly, period: 'weekly', timeZone: 'Europe/London' }),
    'weekly shouldRunWindow should be true Sunday 18:05 London'
  );

  console.log('OK auto-trader-desk-bot tests');
}

run();
