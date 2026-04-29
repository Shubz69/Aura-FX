'use strict';

const manager = require('../api/market-data/twelveWsManager');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function resetState() {
  manager._internals.symbolState.clear();
  manager._internals.quotes.clear();
}

function test(name, fn) {
  try {
    resetState();
    fn();
    console.log(`  ✅ ${name}`);
    return true;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    return false;
  }
}

console.log('\ntwelve WS manager subscription behavior');
let passed = 0;
let failed = 0;

if (
  test('100 viewers same symbol -> one active subscription', () => {
    for (let i = 0; i < 100; i += 1) {
      manager.subscribeSymbols(['EURUSD']);
    }
    const diag = manager.snapshotDiagnostics();
    const entry = manager._internals.symbolState.get('EURUSD');
    expect(diag.twelveWsActiveSubscriptions === 1, `expected 1 active subscription, got ${diag.twelveWsActiveSubscriptions}`);
    expect(entry && entry.refs === 100, `expected refs=100, got ${entry ? entry.refs : 'missing'}`);
  })
) {
  passed += 1;
} else {
  failed += 1;
}

if (
  test('WS active subscriptions stay capped at 450', () => {
    const syms = [];
    for (let i = 0; i < 600; i += 1) syms.push(`FX${i}USD`);
    manager.subscribeSymbols(syms);
    const diag = manager.snapshotDiagnostics();
    expect(diag.twelveWsActiveSubscriptions <= 450, `expected <=450 subscriptions, got ${diag.twelveWsActiveSubscriptions}`);
  })
) {
  passed += 1;
} else {
  failed += 1;
}

if (
  test('releasing symbols allows prune of idle refs', () => {
    manager.subscribeSymbols(['EURUSD']);
    manager.releaseSymbols(['EURUSD']);
    const entry = manager._internals.symbolState.get('EURUSD');
    expect(entry, 'symbol should still exist before prune');
    entry.lastTouched = Date.now() - (10 * 60 * 1000);
    manager._internals.pruneIdleSubscriptions();
    expect(!manager._internals.symbolState.has('EURUSD'), 'symbol should be removed after idle prune');
  })
) {
  passed += 1;
} else {
  failed += 1;
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
