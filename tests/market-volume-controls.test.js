/**
 * Market / TwelveData volume controls (TTLs, no extra api_usage on default chart path).
 * Run: node tests/market-volume-controls.test.js
 */
const assert = require('assert');
const chartHistory = require('../api/market/chart-history');
const snapshot = require('../api/markets/snapshot');

function test(name, fn) {
  try {
    fn();
    // eslint-disable-next-line no-console
    console.log(`ok: ${name}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`FAIL: ${name}`, e);
    process.exitCode = 1;
  }
}

test('intraday 1m chart TTL is at least 60s', () => {
  const ttl = chartHistory.ttlByIntervalMs('1', '1M');
  assert.ok(ttl >= 60_000, `got ${ttl}`);
});

test('intraday 15m chart TTL is 60–120s band', () => {
  const ttl = chartHistory.ttlByIntervalMs('15', '3M');
  assert.ok(ttl >= 60_000 && ttl <= 120_000, `got ${ttl}`);
});

test('daily 1D long-range TTL is at least 15 minutes', () => {
  const ttl = chartHistory.ttlByIntervalMs('1D', '5Y');
  assert.ok(ttl >= 15 * 60_000, `got ${ttl}`);
});

test('snapshot route reports cache TTL >= 15s', () => {
  const d = snapshot.getSnapshotRouteDiagnostics();
  assert.ok(d.cacheTtlMs >= 15_000, JSON.stringify(d));
});
