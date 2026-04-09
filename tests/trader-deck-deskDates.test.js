/**
 * Desk calendar helpers (api/trader-deck/deskDates.js)
 * Run: node tests/trader-deck-deskDates.test.js
 */
const assert = require('assert');
const {
  isLondonWeekendYmd,
  priorLondonWeekdayYmd,
  getWeekEndingSundayUtcYmd,
  getTraderDeckIntelStorageYmd,
} = require('../api/trader-deck/deskDates');

function test(name, fn) {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`, e.message);
    process.exitCode = 1;
  }
}

test('London weekend — Saturday 2026-04-11', () => {
  assert.strictEqual(isLondonWeekendYmd('2026-04-11'), true);
});

test('London weekday — Friday 2026-04-10', () => {
  assert.strictEqual(isLondonWeekendYmd('2026-04-10'), false);
});

test('prior weekday from Saturday → Friday', () => {
  assert.strictEqual(priorLondonWeekdayYmd('2026-04-11'), '2026-04-10');
});

test('prior weekday from Sunday → Friday (skips Sat)', () => {
  assert.strictEqual(priorLondonWeekdayYmd('2026-04-12'), '2026-04-10');
});

test('week-ending Sunday UTC — mid-week', () => {
  assert.strictEqual(getWeekEndingSundayUtcYmd('2026-04-09'), '2026-04-12');
});

test('weekly storage key helper', () => {
  assert.strictEqual(getTraderDeckIntelStorageYmd('2026-04-09', 'weekly'), '2026-04-12');
  assert.strictEqual(getTraderDeckIntelStorageYmd('2026-04-09', 'daily'), '2026-04-09');
});

if (process.exitCode) process.exit(1);
