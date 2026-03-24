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

  console.log('OK auto-trader-desk-bot tests');
}

run();
