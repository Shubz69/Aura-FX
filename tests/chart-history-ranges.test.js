/**
 * Chart interval vs range (TradingView-style): Yahoo/Twelve param planning.
 * Run: node tests/chart-history-ranges.test.js
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
  toBeGreaterThanOrEqual: (n) => {
    if (actual < n) throw new Error(`Expected >= ${n}, got ${actual}`);
  },
  toBeGreaterThan: (n) => {
    if (actual <= n) throw new Error(`Expected > ${n}, got ${actual}`);
  },
});

console.log('\nchart-history Yahoo range params (1m respects visible 1D vs 1W)');
it('1m + 1D uses Yahoo range 1d', () => {
  const y = chartHistory.yahooRangeParams({ interval: '1', range: '1D' });
  expect(y.interval).toBe('1m');
  expect(y.range).toBe('1d');
});
it('1m + 1W uses Yahoo range 5d', () => {
  const y = chartHistory.yahooRangeParams({ interval: '1', range: '1W' });
  expect(y.interval).toBe('1m');
  expect(y.range).toBe('5d');
});

console.log('\nchart-history Twelve outputsize (dense history for 1Y)');
it('1h + 1Y requests large Twelve outputsize', () => {
  const t = chartHistory.twelveDataParams({ interval: '60', range: '1Y', from: null, to: null });
  expect(t.outputsize).toBeGreaterThanOrEqual(600);
});
it('4h + 3M requests substantial Twelve outputsize', () => {
  const t = chartHistory.twelveDataParams({ interval: '240', range: '3M', from: null, to: null });
  expect(t.interval).toBe('4h');
  expect(t.outputsize).toBeGreaterThanOrEqual(200);
});

console.log('\nchart-history min bars wanted');
it('computeMinBarsWanted 15m 1W is meaningful', () => {
  const n = chartHistory.computeMinBarsWanted('15', '1W');
  expect(n).toBeGreaterThanOrEqual(80);
});
it('computeMinBarsWanted 1d 1Y is meaningful', () => {
  const n = chartHistory.computeMinBarsWanted('1D', '1Y');
  expect(n).toBeGreaterThanOrEqual(40);
});
it('long ranges want more bars than short ranges (1h 6M > 1h 1M)', () => {
  const short = chartHistory.computeMinBarsWanted('60', '1M');
  const long = chartHistory.computeMinBarsWanted('60', '6M');
  expect(long).toBeGreaterThan(short);
});
it('long ranges want more bars than short ranges (4h 1Y > 4h 1M)', () => {
  const short = chartHistory.computeMinBarsWanted('240', '1M');
  const long = chartHistory.computeMinBarsWanted('240', '1Y');
  expect(long).toBeGreaterThan(short);
});

console.log('\nchart-history provider plan (Yahoo when shallow; Twelve when deep intraday)');
it('prefers Yahoo for 60 + 1W', () => {
  const p = chartHistory.providerPlan({ interval: '60', range: '1W', from: null, to: null });
  expect(p.prefer).toBe('yahoo');
});
it('prefers Twelve for 15 + 1M', () => {
  const p = chartHistory.providerPlan({ interval: '15', range: '1M', from: null, to: null });
  expect(p.prefer).toBe('twelvedata');
});
it('prefers Twelve for 60 + 1Y', () => {
  const p = chartHistory.providerPlan({ interval: '60', range: '1Y', from: null, to: null });
  expect(p.prefer).toBe('twelvedata');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
