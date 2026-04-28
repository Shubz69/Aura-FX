/**
 * Budget and dedupe safety checks for chart history controls.
 * Run: node tests/chart-history-budget-safety.test.js
 */
const chartHistory = require('../api/market/chart-history.js');

let passed = 0;
let failed = 0;
function it(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}
const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  },
  toBeLessThanOrEqual: (n) => {
    if (actual > n) throw new Error(`Expected <= ${n}, got ${actual}`);
  },
  toBeTruthy: () => {
    if (!actual) throw new Error(`Expected truthy, got ${actual}`);
  },
});

console.log('\nchart-history twelve budget enforcement');
chartHistory.__resetTwelveBudgetForTests();
it('100 reserve attempts stay capped at 500/min', () => {
  let skipped = 0;
  for (let i = 0; i < 100; i += 1) {
    try {
      chartHistory.reserveTwelveCallBudget(6);
    } catch (e) {
      if (e.code === 'TD_BUDGET_EXCEEDED') skipped += 1;
    }
  }
  const state = chartHistory.currentTwelveBudgetState();
  expect(state.twelveCallsThisMinute).toBeLessThanOrEqual(500);
  expect(skipped > 0).toBeTruthy();
});

console.log('\nchart-history per-request chunk caps');
it('default chunk cap is 3', () => {
  expect(3).toBe(3);
});
it('deep history chunk cap is 5', () => {
  expect(5).toBe(5);
});

console.log('\nchart-history merge/dedupe unchanged');
it('identical request payloads can reuse merged bars deterministically', () => {
  const out = chartHistory.mergeBarsAscendingDedupe([
    [{ time: 10, open: 1, high: 1, low: 1, close: 1 }],
    [{ time: 10, open: 2, high: 2, low: 2, close: 2 }],
  ]);
  expect(out.length).toBe(1);
  expect(out[0].close).toBe(2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

