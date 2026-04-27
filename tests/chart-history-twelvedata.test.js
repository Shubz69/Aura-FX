/**
 * Twelve Data provider behavior checks.
 * Run: node tests/chart-history-twelvedata.test.js
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
  toBeTruthy: () => {
    if (!actual) throw new Error(`Expected truthy, got ${actual}`);
  },
});

console.log('\nchart-history Twelve time_series params');
it('maps 1m -> 1min and uses UTC timezone for intraday', () => {
  const t = chartHistory.twelveDataParams({ interval: '1', range: '1D', from: null, to: null });
  expect(t.interval).toBe('1min');
  const p = chartHistory.buildTwelveTimeSeriesParams({
    symbol: 'EUR/USD',
    interval: t.interval,
    outputsize: t.outputsize,
    from: null,
    to: null,
    apikey: 'k',
    timezone: 'UTC',
  });
  expect(p.interval).toBe('1min');
  expect(p.order).toBe('ASC');
  expect(p.format).toBe('JSON');
  expect(p.timezone).toBe('UTC');
});

it('maps 15m -> 15min', () => {
  const t = chartHistory.twelveDataParams({ interval: '15', range: '1M', from: null, to: null });
  expect(t.interval).toBe('15min');
});

it('maps 1h -> 1h', () => {
  const t = chartHistory.twelveDataParams({ interval: '60', range: '3M', from: null, to: null });
  expect(t.interval).toBe('1h');
});

it('maps 4h -> 4h', () => {
  const t = chartHistory.twelveDataParams({ interval: '240', range: '1Y', from: null, to: null });
  expect(t.interval).toBe('4h');
});

it('maps 1d -> 1day', () => {
  const t = chartHistory.twelveDataParams({ interval: '1D', range: '1Y', from: null, to: null });
  expect(t.interval).toBe('1day');
});

console.log('\nchart-history Twelve outputsize and backtesting dates');
it('deep intraday requests outputsize near provider cap', () => {
  const t = chartHistory.twelveDataParams({ interval: '60', range: '1Y', from: null, to: null });
  expect(t.outputsize).toBeGreaterThanOrEqual(3000);
});
it('long range outputsize exceeds short range outputsize (1h 1Y > 1h 1W)', () => {
  const short = chartHistory.twelveDataParams({ interval: '60', range: '1W', from: null, to: null });
  const long = chartHistory.twelveDataParams({ interval: '60', range: '1Y', from: null, to: null });
  expect(long.outputsize).toBeGreaterThan(short.outputsize);
});

it('builds start_date/end_date for from/to', () => {
  const from = 1710000000;
  const to = 1715000000;
  const p = chartHistory.buildTwelveTimeSeriesParams({
    symbol: 'EUR/USD',
    interval: '1h',
    outputsize: 5000,
    from,
    to,
    apikey: 'k',
    timezone: 'UTC',
  });
  expect(Boolean(p.start_date)).toBeTruthy();
  expect(Boolean(p.end_date)).toBeTruthy();
});

console.log('\nchart-history symbol formatting for providers');
it('formats FX canonical for Twelve and Yahoo independently', () => {
  expect(chartHistory.twelveDataSymbolForCanonical('EURUSD')).toBe('EUR/USD');
  const m = chartHistory.resolveChartYahooSymbol('EURUSD');
  expect(m.yahoo).toBe('EURUSD=X');
});

it('formats crypto canonical for Twelve with slash pair', () => {
  const s = chartHistory.twelveDataSymbolForCanonical('BTCUSD');
  expect(s).toBe('BTC/USD');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

