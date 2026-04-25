/**
 * 4H aggregation from 1h bars (UTC buckets).
 * Run: node tests/chart-history-aggregate.test.js
 */

const { aggregateHourlyToFourHour, fourHourBucketStart } = require('../api/market/chart-history.js');

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
});

console.log('\nchart-history 4H aggregation');

it('fourHourBucketStart aligns to UTC 4h grid', () => {
  const base = 1440000000;
  expect(fourHourBucketStart(base)).toBe(base);
  expect(fourHourBucketStart(base + 3600)).toBe(base);
  expect(fourHourBucketStart(base + 4 * 3600)).toBe(base + 4 * 3600);
});

it('four consecutive 1h bars in same bucket produce one 4H OHLC', () => {
  const bucket = 1440000000;
  const hourly = [
    { time: bucket, open: 100, high: 105, low: 99, close: 102 },
    { time: bucket + 3600, open: 102, high: 108, low: 101, close: 104 },
    { time: bucket + 7200, open: 104, high: 106, low: 103, close: 105 },
    { time: bucket + 10800, open: 105, high: 110, low: 104, close: 109 },
  ];
  const out = aggregateHourlyToFourHour(hourly);
  expect(out.length).toBe(1);
  const b = out[0];
  expect(b.time).toBe(bucket);
  expect(b.open).toBe(100);
  expect(b.close).toBe(109);
  expect(b.high).toBe(110);
  expect(b.low).toBe(99);
});

it('sorts out-of-order hours before aggregating', () => {
  const bucket = 1700000000;
  const bucketStart = fourHourBucketStart(bucket);
  const hourly = [
    { time: bucketStart + 7200, open: 2, high: 2, low: 2, close: 2 },
    { time: bucketStart, open: 1, high: 5, low: 1, close: 3 },
    { time: bucketStart + 3600, open: 3, high: 4, low: 2, close: 2 },
  ];
  const out = aggregateHourlyToFourHour(hourly);
  expect(out.length).toBe(1);
  expect(out[0].open).toBe(1);
  expect(out[0].close).toBe(2);
  expect(out[0].high).toBe(5);
  expect(out[0].low).toBe(1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
