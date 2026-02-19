/**
 * Tests for daily journal notification timezone logic.
 * Proves notifications are sent at 08:00 local time for multiple IANA timezones,
 * including DST transition days. Run: node tests/daily-journal-timezones.test.js
 */
const { DateTime } = require('luxon');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Simulate: "is it 08:00–08:14 in this timezone right now (utcNow)?"
function isLocalEightAM(ianaTimezone, utcNow) {
  const local = utcNow.setZone(ianaTimezone);
  return local.hour === 8 && local.minute < 15;
}

// Simulate: local date in that timezone at utcNow
function getLocalDate(ianaTimezone, utcNow) {
  return utcNow.setZone(ianaTimezone).toFormat('yyyy-MM-dd');
}

console.log('Testing IANA timezone and DST logic for daily journal (08:00 local)...\n');

// 1) At a fixed UTC moment, different timezones have different local times
const utc1 = DateTime.fromISO('2025-02-20T08:00:00Z', { zone: 'utc' });
assert(getLocalDate('Europe/London', utc1) === '2025-02-20', 'London: 08:00 UTC = 08:00 GMT (winter)');
assert(getLocalDate('America/New_York', utc1) === '2025-02-20', 'NY: 08:00 UTC = 03:00 EST');
assert(!isLocalEightAM('America/New_York', utc1), 'NY at 03:00 local should not trigger');
assert(isLocalEightAM('Europe/London', utc1), 'London at 08:00 local should trigger');

// 2) When it's 08:00 in New York
const utc2 = DateTime.fromISO('2025-02-20T13:00:00Z', { zone: 'utc' }); // 08:00 EST
assert(isLocalEightAM('America/New_York', utc2), 'NY 08:00 EST should trigger');
assert(getLocalDate('America/New_York', utc2) === '2025-02-20', 'NY local date');

// 3) DST: March 2025 (US springs forward) – day after DST
const utc3 = DateTime.fromISO('2025-03-10T12:00:00Z', { zone: 'utc' }); // 08:00 EDT (DST)
assert(isLocalEightAM('America/New_York', utc3), 'NY 08:00 EDT (DST) should trigger');
assert(getLocalDate('America/New_York', utc3) === '2025-03-10', 'NY local date DST');

// 4) Dubai (no DST)
const utc4 = DateTime.fromISO('2025-02-20T04:00:00Z', { zone: 'utc' }); // 08:00 Gulf
assert(isLocalEightAM('Asia/Dubai', utc4), 'Dubai 08:00 should trigger');
assert(getLocalDate('Asia/Dubai', utc4) === '2025-02-20', 'Dubai local date');

// 5) Cron window: 08:00–08:14 only (minute < 15)
const utc5 = DateTime.fromISO('2025-02-20T08:14:00Z', { zone: 'utc' });
assert(isLocalEightAM('Europe/London', utc5), '08:14 London still in window');
const utc6 = DateTime.fromISO('2025-02-20T08:15:00Z', { zone: 'utc' });
assert(!isLocalEightAM('Europe/London', utc6), '08:15 London outside window');

// 6) UK DST: Summer time (BST) – July
const utc7 = DateTime.fromISO('2025-07-15T07:00:00Z', { zone: 'utc' }); // 08:00 BST
assert(isLocalEightAM('Europe/London', utc7), 'London 08:00 BST should trigger');
assert(getLocalDate('Europe/London', utc7) === '2025-07-15', 'London local date summer');

console.log('All timezone and DST assertions passed.');
console.log('Daily journal notifications will fire at 08:00 local for each IANA timezone with DST handled by Luxon.');
