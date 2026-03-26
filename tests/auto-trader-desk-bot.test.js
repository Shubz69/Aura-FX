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
    _test.containsBoilerplate('Maintain a bias only when momentum aligns with session flow'),
    'boilerplate detector should catch repeated template phrase'
  );
  const diversified = _test.diversifyBody('Base brief body', {
    briefKind: 'forex',
    period: 'daily',
    topInstruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF'],
  });
  assert(/Uniqueness Guardrails/.test(diversified), 'diversifyBody should append uniqueness section');

  console.log('OK auto-trader-desk-bot tests');
}

run();
